import { db } from "@/db";
import { matches, profiles, notifications, liveSyncState } from "@/db/schema";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { fetchLiveFixtures, fetchFixtureById, type FixtureUpdate } from "@/lib/sportsData";
import { createServiceClient } from "@/lib/supabase/server";
import { broadcastFeedEvent } from "@/lib/realtime";
import { logError } from "@/lib/errorLog";

/** Shared write path for every live-score writer (manual form, per-match
 *  API-refresh, bulk API-refresh, and the automatic sync below) — same
 *  anchor/pause semantics everywhere (migration 0029): a minute resets
 *  live_minute_anchor_at to now() so the displayed clock keeps ticking up
 *  from whatever was just entered, unless `paused` is true (half-time/
 *  injury break/finished), in which case it freezes exactly at `minute`
 *  until resumed. football-data.org never provides a minute (see
 *  FixtureUpdate.minute in lib/sportsData.ts) — passing null here is what
 *  makes the UI fall back to the kickoff-time-derived clock, unchanged
 *  behaviour from before this vendor switch. Not a Server Action itself —
 *  lives outside lib/actions so the cron route can call it without going
 *  through the requireAdmin-gated action wrappers. */
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

/** Only a genuinely-played-to-completion result is safe to auto-settle with
 *  a score — POSTPONED/CANCELLED have no valid score at all (they need
 *  Adiado/Abandonado — a refund — not Liquidar), and AWARDED is an
 *  administrative decision left for manual review. Deliberately narrower
 *  than FINISHED_STATUS_CODES in lib/sportsData.ts, which only had to
 *  decide "should the clock stop", a much lower-stakes question than
 *  "should real money move". football-data.org reports extra-time/
 *  penalties results under the same FINISHED status (see score.duration),
 *  so there's no separate AET/PEN code to add here. */
const AUTO_SETTLE_STATUS_CODES = new Set(["FINISHED"]);

async function notifyAdmins(type: string, title: string, body: string, link: string) {
  const admins = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.isAdmin, true));
  if (admins.length === 0) return;
  await db.insert(notifications).values(admins.map((a) => ({ userId: a.id, type, title, body, link })));
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
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
    // "already processed" specifically means a concurrent caller (e.g. an
    // admin's manual refresh landing the same instant as this automatic
    // tick) won the row lock first and settled it correctly — proven safe
    // under a real concurrent race (both calls hit bet_settle_match at
    // once; the DB row lock let exactly one through, this is the other).
    // Not a real failure, so no false-alarm "liquidação falhou" notification
    // for something that actually succeeded seconds earlier.
    if (error.message.includes("already processed")) {
      return { settled: false, settleError: error.message };
    }
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
    `${match.home} vs ${match.away}: ${live.homeGoals}-${live.awayGoals} — confirmado duas vezes pela API, pagamentos processados.`,
    "/admin/matches"
  );
  return { settled: true };
}

/**
 * Fetches every fixture currently live across every competition this token
 * can see in ONE request (fetchLiveFixtures — football-data.org's
 * status=LIVE filter, i.e. IN_PLAY or PAUSED only) and writes it through to
 * every tracked 'live'/'needs_review' match linked to the vendor. Shared
 * core behind both the admin's "Atualizar jogos ao vivo" button
 * (refreshAllLiveMatchesAction) and the automatic sync cron
 * (runLiveScoreAutoSync).
 *
 * status=LIVE structurally EXCLUDES FINISHED — the instant a match's real
 * status flips to FINISHED it drops out of that filter entirely (confirmed
 * against the live API before this fix), so a tracked match not found in
 * the LIVE map is not necessarily "the vendor has nothing to say" — it's
 * very often exactly the tick where the match just ended. Falling back to a
 * single-fixture lookup (fetchFixtureById) for each such match is what makes
 * attemptAutoSettleIfConfirmed ever actually see a FINISHED status through
 * this path at all — without it, the LIVE-only request would never
 * transition a match out of 'live'/'needs_review' automatically, silently
 * defeating the whole point of automatic settlement (it would still fall
 * back fine to the admin's manual per-match button, just never on its own).
 * Extra cost is one request per match that just dropped off the live list —
 * negligible given AUTO_SYNC_ELIGIBLE_MINUTES keeps the tracked set tiny.
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
    let live = liveByExternalId.get(match.externalId!);

    // Not in the LIVE map — could genuinely be "vendor has nothing yet", but
    // is very often "just finished" (see doc comment above). One targeted
    // lookup settles which, at the cost of a single extra request.
    if (!live || live.homeGoals == null || live.awayGoals == null) {
      const fallback = await fetchFixtureById(match.externalId!);
      if (fallback.error) {
        // Swallowed into "missing" below either way (never blocks the rest
        // of the batch), but logged so a real recurring cause (bad
        // external_id, vendor hiccup) is visible on /admin/errors instead
        // of silently looking identical to "vendor genuinely has nothing
        // yet" forever.
        await logError("live_score_sync_fallback", new Error(fallback.error), { matchId: match.id, externalId: match.externalId });
      }
      live = fallback.data;
    }

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

/** Matches older than this (real time since kickoff) stop being considered
 *  for automatic syncing at all, even if still 'live'/'needs_review' — the
 *  safety net against a match that never comes back in a live query
 *  (suspended, or a finished match nobody's liquidated yet) causing every
 *  single cron tick to spend a request forever. 90 regulation minutes + a
 *  generous stoppage/extra-time/half-time buffer; past this, the admin's
 *  manual buttons take over. */
const AUTO_SYNC_ELIGIBLE_MINUTES = 150;

/** Minimum real time between automatic polls while at least one match is
 *  live. football-data.org has no daily cap (just 10 requests/minute, a
 *  rolling window) — a flat interval well under that is all the protection
 *  needed; none of the tiered quota backoff or off-peak-hours slowdown the
 *  old (API-Football) vendor required still applies, since there's no
 *  daily budget left to protect. Tune the external cron-job.org schedule
 *  down to match this if faster real-world freshness is ever wanted — this
 *  is just the floor, not a target. */
const MIN_POLL_INTERVAL_SECONDS = 60;

async function getSyncState() {
  const [row] = await db.select().from(liveSyncState).where(eq(liveSyncState.id, 1)).limit(1);
  return row ?? null;
}

/**
 * Runs syncLiveMatchesFromApi() ONLY if there's real work to do AND it's
 * actually time to do it — never on a bare timer, safe to call every
 * minute from the cron (each tick is one cheap DB read otherwise). Gates on
 * two things:
 *
 *  1. At least one tracked 'live'/'needs_review' match, linked to the
 *     vendor, still within AUTO_SYNC_ELIGIBLE_MINUTES of its kickoff —
 *     otherwise there's nothing worth polling for at all.
 *  2. At least MIN_POLL_INTERVAL_SECONDS has passed since the last actual
 *     poll. Read from live_sync_state.last_synced_at, not derived from any
 *     one match, so overlapping matches never cause back-to-back polls a
 *     second apart.
 *
 * One hit refreshes every tracked live match at once, however many are
 * actually in play — the cost scales with how many total minutes something
 * is live somewhere, not with match count, which is what makes frequent
 * polling cheap regardless of vendor.
 */
export async function runLiveScoreAutoSync(): Promise<LiveSyncResult & { triggered: boolean; skippedReason?: string }> {
  const tracked = await db
    .select({ kickoffAt: matches.kickoffAt })
    .from(matches)
    .where(and(inArray(matches.matchStatus, ["live", "needs_review"]), isNotNull(matches.externalId)));

  const now = new Date();
  const nowMs = now.getTime();
  const hasEligibleLiveMatch = tracked.some((m) => {
    const elapsedMinutes = (nowMs - new Date(m.kickoffAt).getTime()) / 60_000;
    return elapsedMinutes >= 0 && elapsedMinutes <= AUTO_SYNC_ELIGIBLE_MINUTES;
  });
  if (!hasEligibleLiveMatch) return { triggered: false, updated: 0, missing: [], skippedReason: "nothing live" };

  const state = await getSyncState();

  const requiredGapMs = MIN_POLL_INTERVAL_SECONDS * 1000;
  if (state?.lastSyncedAt && nowMs - new Date(state.lastSyncedAt).getTime() < requiredGapMs) {
    return { triggered: false, updated: 0, missing: [], skippedReason: "too soon" };
  }

  await db.update(liveSyncState).set({ lastSyncedAt: now }).where(eq(liveSyncState.id, 1));

  const result = await syncLiveMatchesFromApi();

  // Fires when the vendor is unreachable/rejecting every call (suspended
  // account, revoked token, outage) — a "go check things" alert, not the
  // old "slow down, budget's tight" one (that concept doesn't exist for
  // this vendor). Once-per-day dedup so a prolonged outage doesn't spam.
  // Never blocks settlement/wallet correctness either way (see
  // attemptAutoSettleIfConfirmed — no data in means no action, never a
  // wrong one), but the admin should still know live scores have stopped
  // updating at all.
  if (result.error) {
    const alreadyNotifiedToday =
      state?.apiErrorNotifiedAt != null && isSameUtcDay(new Date(state.apiErrorNotifiedAt), now);
    if (!alreadyNotifiedToday) {
      const reason = result.error.replace(/\.+$/, "");
      await notifyAdmins(
        "sports_api_error",
        "football-data.org não está a responder",
        `A atualização automática do placar ao vivo está a falhar: ${reason}. Os jogos não estão a atualizar sozinhos. Nada foi pago incorretamente (sem dados = sem ação).`,
        "/admin/matches"
      );
      await db.update(liveSyncState).set({ apiErrorNotifiedAt: now }).where(eq(liveSyncState.id, 1));
    }
  }

  return { triggered: true, ...result };
}
