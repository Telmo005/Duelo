import { db } from "@/db";
import { matches, profiles, notifications } from "@/db/schema";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { fetchLiveFixtures, type FixtureUpdate } from "@/lib/sportsData";
import { createServiceClient } from "@/lib/supabase/server";
import { broadcastFeedEvent } from "@/lib/realtime";
import { logError } from "@/lib/errorLog";

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

/** Only a genuinely-played-to-completion result (regulation, extra time, or
 *  penalties) is safe to auto-settle with a score — PST/CANC/ABD have no
 *  valid score at all (they need Adiado/Abandonado — a refund — not
 *  Liquidar), and AWD/WO are administrative decisions rare/ambiguous enough
 *  to leave for manual review. Deliberately narrower than
 *  FINISHED_STATUS_CODES in lib/sportsData.ts, which only had to decide
 *  "should the clock stop", a much lower-stakes question than "should real
 *  money move". */
const AUTO_SETTLE_STATUS_CODES = new Set(["FT", "AET", "PEN"]);

async function notifyAdmins(type: string, title: string, body: string, link: string) {
  const admins = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.isAdmin, true));
  if (admins.length === 0) return;
  await db.insert(notifications).values(admins.map((a) => ({ userId: a.id, type, title, body, link })));
}

/**
 * The safety net requested explicitly: auto-liquidar is only allowed to run
 * after the API has reported the SAME final score on two separate checks —
 * never on the first sighting. `match` holds whatever was already on file
 * BEFORE this sync call (so the caller must invoke this before overwriting
 * the row with writeLiveScore); `live` is what was just fetched. If the API
 * flips to a different score between reads (a correction), that's treated
 * as a brand new candidate needing its own two confirmations, not trusted
 * immediately — protects against a single bad/premature API read directly
 * paying out real money on a wrong result.
 */
export type AutoSettleOutcome = { settled: boolean; settleError?: string };

export async function attemptAutoSettleIfConfirmed(
  match: { id: string; home: string; away: string; liveHome: number | null; liveAway: number | null; liveStatusCode: string | null },
  live: FixtureUpdate
): Promise<AutoSettleOutcome> {
  if (!AUTO_SETTLE_STATUS_CODES.has(live.statusCode)) return { settled: false };
  if (live.homeGoals == null || live.awayGoals == null) return { settled: false };

  const previouslyConfirmedSameScore =
    match.liveStatusCode != null &&
    AUTO_SETTLE_STATUS_CODES.has(match.liveStatusCode) &&
    match.liveHome === live.homeGoals &&
    match.liveAway === live.awayGoals;

  if (!previouslyConfirmedSameScore) return { settled: false }; // first sighting — wait for reconfirmation next cycle

  const service = createServiceClient();
  const { error } = await service.rpc("bet_settle_match", {
    p_match_id: match.id,
    p_result_home: live.homeGoals,
    p_result_away: live.awayGoals,
  });

  if (error) {
    await logError("auto_settle_match", error, { matchId: match.id, homeGoals: live.homeGoals, awayGoals: live.awayGoals });
    await notifyAdmins(
      "auto_settle_failed",
      "Liquidação automática falhou",
      `${match.home} vs ${match.away} (${live.homeGoals}-${live.awayGoals}) — a API confirmou o resultado duas vezes mas a liquidação falhou: ${error.message}. Liquida manualmente.`,
      "/admin/matches"
    );
    return { settled: false, settleError: error.message };
  }

  await broadcastFeedEvent({ type: "bets_settled", matchId: match.id });
  await notifyAdmins(
    "match_auto_settled",
    "Jogo liquidado automaticamente",
    `${match.home} vs ${match.away}: ${live.homeGoals}-${live.awayGoals} — confirmado duas vezes pela API-Football, pagamentos processados.`,
    "/admin/matches"
  );
  return { settled: true };
}

/**
 * Fetches every fixture currently live worldwide in ONE request
 * (fetchLiveFixtures — live=all) and writes it through to every tracked
 * 'live'/'needs_review' match linked to the API. Shared core behind both
 * the admin's "Atualizar jogos ao vivo" button (refreshAllLiveMatchesAction)
 * and the automatic checkpoint cron (runLiveScoreCheckpointSync) — same
 * single-request cost either way, only the trigger differs. Also the place
 * auto-settlement is attempted (attemptAutoSettleIfConfirmed) for every
 * match whose result the API has now confirmed twice in a row.
 */
export async function syncLiveMatchesFromApi(): Promise<LiveSyncResult> {
  const tracked = await db
    .select({
      id: matches.id,
      home: matches.home,
      away: matches.away,
      externalId: matches.externalId,
      liveHome: matches.liveHome,
      liveAway: matches.liveAway,
      liveStatusCode: matches.liveStatusCode,
    })
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
    // Must run BEFORE writeLiveScore — it compares against what was on file
    // prior to this fetch to tell "confirmed twice" from "first sighting".
    await attemptAutoSettleIfConfirmed(match, live);
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
 * Runs syncLiveMatchesFromApi() ONLY if there's real work to do — never on a
 * bare timer. Two conditions trigger it: (1) at least one tracked match has
 * just crossed a checkpoint (kicked off, or reached 45'/90') since the last
 * time we fetched its minute, or (2) a match is sitting on a first-sighted
 * finished score awaiting its reconfirmation read (see
 * attemptAutoSettleIfConfirmed) — without this second condition, a match
 * that first shows FT exactly at the 90' checkpoint would never get the
 * second read it needs to actually auto-settle, since 90' is the last fixed
 * checkpoint. Backs the automatic checkpoint cron
 * (app/api/cron/live-score-checkpoints): call this as often as you like
 * (every tick is a cheap DB read, no API call) — the API is only ever hit
 * when there's real work to do, and one hit refreshes every tracked live
 * match at once regardless of how many triggered it.
 */
export async function runLiveScoreCheckpointSync(): Promise<LiveSyncResult & { triggered: boolean }> {
  const tracked = await db
    .select({ kickoffAt: matches.kickoffAt, liveMinute: matches.liveMinute, liveStatusCode: matches.liveStatusCode })
    .from(matches)
    .where(and(inArray(matches.matchStatus, ["live", "needs_review"]), isNotNull(matches.externalId)));

  const now = Date.now();
  const dueForCheckpoint = tracked.some((m) => {
    const elapsedMinutes = (now - new Date(m.kickoffAt).getTime()) / 60_000;
    if (elapsedMinutes < 0 || elapsedMinutes > CHECKPOINT_ELIGIBLE_MINUTES) return false;
    if (m.liveStatusCode != null && AUTO_SETTLE_STATUS_CODES.has(m.liveStatusCode)) return true; // awaiting reconfirmation
    const lastKnownMinute = m.liveMinute ?? -1;
    return CHECKPOINT_MINUTES.some((checkpoint) => lastKnownMinute < checkpoint && elapsedMinutes >= checkpoint);
  });

  if (!dueForCheckpoint) return { triggered: false, updated: 0, missing: [] };

  const result = await syncLiveMatchesFromApi();
  return { triggered: true, ...result };
}
