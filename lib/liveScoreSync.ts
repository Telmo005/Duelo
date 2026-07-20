import { db } from "@/db";
import { matches } from "@/db/schema";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { fetchLiveFixtures } from "@/lib/sportsData";

/** Shared write path for every live-score writer (manual form, per-match
 *  API-refresh, bulk API-refresh, and the checkpoint cron below) — same
 *  anchor/pause semantics everywhere (migration 0029): a minute resets
 *  live_minute_anchor_at to now() so the displayed clock keeps ticking up
 *  from whatever was just entered, unless `paused` is true (half-time/
 *  injury break/finished), in which case it freezes exactly at `minute`
 *  until resumed. Not a Server Action itself — lives outside lib/actions so
 *  the checkpoint cron route can call it without going through the
 *  requireAdmin-gated action wrappers. */
export async function writeLiveScore(
  matchId: string,
  homeGoals: number,
  awayGoals: number,
  minute: number | null,
  paused: boolean,
  statusCode: string | null
) {
  const hasMinute = minute != null;
  await db
    .update(matches)
    .set({
      liveHome: homeGoals,
      liveAway: awayGoals,
      liveMinute: minute ?? null,
      liveMinuteAnchorAt: hasMinute ? new Date() : null,
      livePaused: hasMinute ? paused : false,
      liveStatusCode: statusCode,
      liveUpdatedAt: new Date(),
    })
    .where(eq(matches.id, matchId));
}

export type LiveSyncResult = { updated: number; missing: string[]; error?: string };

/**
 * Fetches every fixture currently live worldwide in ONE request
 * (fetchLiveFixtures — live=all) and writes it through to every tracked
 * 'live'/'needs_review' match linked to the API. Shared core behind both
 * the admin's "Atualizar jogos ao vivo" button (refreshAllLiveMatchesAction)
 * and the automatic checkpoint cron (runLiveScoreCheckpointSync) — same
 * single-request cost either way, only the trigger differs.
 */
export async function syncLiveMatchesFromApi(): Promise<LiveSyncResult> {
  const tracked = await db
    .select({ id: matches.id, home: matches.home, away: matches.away, externalId: matches.externalId })
    .from(matches)
    .where(and(inArray(matches.matchStatus, ["live", "needs_review"]), isNotNull(matches.externalId)));

  if (tracked.length === 0) {
    return { updated: 0, missing: [], error: "Não há jogos ao vivo ligados à API para atualizar." };
  }

  const { data: liveByExternalId, error } = await fetchLiveFixtures();
  if (error) return { updated: 0, missing: [], error: `Falha ao consultar a API: ${error}` };
  if (!liveByExternalId) return { updated: 0, missing: [], error: "Sem dados da API." };

  let updated = 0;
  const missing: string[] = [];

  for (const match of tracked) {
    const live = liveByExternalId.get(match.externalId!);
    if (!live || live.homeGoals == null || live.awayGoals == null) {
      missing.push(`${match.home} vs ${match.away}`);
      continue;
    }
    await writeLiveScore(match.id, live.homeGoals, live.awayGoals, live.minute, live.paused, live.statusCode);
    updated++;
  }

  return { updated, missing };
}

/** Kickoff, half-time, full-time — the three moments a football score
 *  actually needs a fresh read. Purely local math (kickoff time + whatever
 *  minute we last fetched), zero API cost to evaluate every cron tick. */
const CHECKPOINT_MINUTES = [0, 45, 90];

/** Matches older than this (real time since kickoff) stop being considered
 *  for automatic checkpoint syncing at all, even if a checkpoint condition
 *  is still (or again) true — the safety net against a match that never
 *  comes back in live=all (SUSP, or a finished match nobody's liquidated
 *  yet) causing every single cron tick to re-trigger a sync forever. 90
 *  regulation minutes + a generous stoppage/extra-time/half-time buffer;
 *  past this, the admin's manual buttons take over. */
const CHECKPOINT_ELIGIBLE_MINUTES = 150;

/**
 * Runs syncLiveMatchesFromApi() ONLY if at least one tracked live match has
 * just crossed a checkpoint (kicked off, or reached 45'/90') since the last
 * time we actually fetched its minute — never on a bare timer. Backs the
 * automatic checkpoint cron (app/api/cron/live-score-checkpoints): call this
 * as often as you like (every tick is a cheap DB read, no API call) — the
 * API is only ever hit when there's real work to do, and one hit refreshes
 * every tracked live match at once regardless of how many crossed a
 * checkpoint in the same tick.
 */
export async function runLiveScoreCheckpointSync(): Promise<LiveSyncResult & { triggered: boolean }> {
  const tracked = await db
    .select({ kickoffAt: matches.kickoffAt, liveMinute: matches.liveMinute })
    .from(matches)
    .where(and(inArray(matches.matchStatus, ["live", "needs_review"]), isNotNull(matches.externalId)));

  const now = Date.now();
  const dueForCheckpoint = tracked.some((m) => {
    const elapsedMinutes = (now - new Date(m.kickoffAt).getTime()) / 60_000;
    if (elapsedMinutes < 0 || elapsedMinutes > CHECKPOINT_ELIGIBLE_MINUTES) return false;
    const lastKnownMinute = m.liveMinute ?? -1;
    return CHECKPOINT_MINUTES.some((checkpoint) => lastKnownMinute < checkpoint && elapsedMinutes >= checkpoint);
  });

  if (!dueForCheckpoint) return { triggered: false, updated: 0, missing: [] };

  const result = await syncLiveMatchesFromApi();
  return { triggered: true, ...result };
}
