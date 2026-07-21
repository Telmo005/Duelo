import { db } from "@/db";
import { matches, profiles, notifications, liveSyncState } from "@/db/schema";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { fetchLiveFixtures, type FixtureUpdate } from "@/lib/sportsData";
import { getKnownRemainingQuota, isSameUtcDay } from "@/lib/apiFootballClient";
import { createServiceClient } from "@/lib/supabase/server";
import { broadcastFeedEvent } from "@/lib/realtime";
import { logError } from "@/lib/errorLog";
import { MOZAMBIQUE_TIMEZONE } from "@/lib/format";

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
 * and the automatic sync cron (runLiveScoreAutoSync) — same single-request
 * cost either way, only the trigger differs. Also the place
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

/** Matches older than this (real time since kickoff) stop being considered
 *  for automatic syncing at all, even if still 'live'/'needs_review' — the
 *  safety net against a match that never comes back in live=all (SUSP, or a
 *  finished match nobody's liquidated yet) causing every single cron tick
 *  to spend a request forever. 90 regulation minutes + a generous
 *  stoppage/extra-time/half-time buffer; past this, the admin's manual
 *  buttons take over. */
const AUTO_SYNC_ELIGIBLE_MINUTES = 150;

/** Baseline interval between automatic polls while at least one match is
 *  live — catches a goal within roughly this long, not just at 45'/90'. */
const PEAK_INTERVAL_MINUTES = 5;

/** 00:00–09:00 Mozambique time is when this platform sees the least
 *  activity (explicit product decision, not a guess) — polling less often
 *  during that window trades a bit of freshness nobody's watching for
 *  meaningfully more daily quota headroom for the hours that matter. */
const OFF_PEAK_INTERVAL_MINUTES = 15;
const OFF_PEAK_START_HOUR = 0;
const OFF_PEAK_END_HOUR = 9;

/** Hard floor left unspent no matter how much a live match "wants" another
 *  poll — reserved for the admin's own manual buttons (per-match refresh,
 *  bulk refresh, team/fixture search) so automatic polling can never eat
 *  the entire daily budget and leave nothing for a human to use. Crossing
 *  this stops automatic polling completely for the rest of the day (see
 *  quotaBackoffMultiplier below for the gradual slowdown BEFORE this
 *  point). */
const QUOTA_SAFETY_RESERVE = 15;

/** Soft warning zone above the hard reserve: instead of polling at full
 *  speed right up until the reserve and then slamming to a stop, the
 *  interval stretches progressively as the known remaining quota gets
 *  closer to QUOTA_SAFETY_RESERVE — graceful degradation instead of a
 *  cliff. Both thresholds are counts of requests remaining today, not
 *  percentages: at the default 100/day plan that's "quota getting tight"
 *  and "quota very tight" in absolute, easy-to-reason-about terms. */
const QUOTA_CAUTION_REMAINING = 50;
const QUOTA_WARNING_REMAINING = 30;

/** How much to stretch the normal interval by, based on the last known
 *  remaining quota. Unknown (no reading yet today) is treated as
 *  "comfortable" — the very next real API call refreshes it with the true
 *  number regardless, so there's nothing to be cautious about yet. */
function quotaBackoffMultiplier(remaining: number | null): number {
  if (remaining == null) return 1;
  if (remaining <= QUOTA_WARNING_REMAINING) return 4;
  if (remaining <= QUOTA_CAUTION_REMAINING) return 2;
  return 1;
}

function currentMozambiqueHour(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: MOZAMBIQUE_TIMEZONE }).formatToParts(now);
  const hourPart = parts.find((p) => p.type === "hour")?.value ?? "12";
  // Some locales render midnight as "24" rather than "0" — normalize.
  return Number(hourPart) % 24;
}

function requiredIntervalMinutes(now: Date): number {
  const hour = currentMozambiqueHour(now);
  const isOffPeak = hour >= OFF_PEAK_START_HOUR && hour < OFF_PEAK_END_HOUR;
  return isOffPeak ? OFF_PEAK_INTERVAL_MINUTES : PEAK_INTERVAL_MINUTES;
}

async function getSyncState() {
  const [row] = await db.select().from(liveSyncState).where(eq(liveSyncState.id, 1)).limit(1);
  return row ?? null;
}

/**
 * Runs syncLiveMatchesFromApi() ONLY if there's real work to do AND it's
 * actually time to do it — never on a bare timer, safe to call every few
 * minutes from the cron (each tick is a couple of cheap DB reads, no API
 * call by itself). Gates on three independent things, all of which must
 * allow it:
 *
 *  1. At least one tracked 'live'/'needs_review' match, linked to the API,
 *     still within AUTO_SYNC_ELIGIBLE_MINUTES of its kickoff — otherwise
 *     there's nothing worth polling for at all.
 *  2. Enough real time has passed since the last actual poll — the base
 *     interval (5 min normally, 15 during Mozambique's 00:00–09:00
 *     off-peak window), stretched by quotaBackoffMultiplier as the known
 *     remaining quota gets tight. Read from live_sync_state.last_synced_at,
 *     not derived from any one match, so overlapping matches never cause
 *     back-to-back polls seconds apart.
 *  3. The vendor's own last-reported quota (x-ratelimit-requests-remaining,
 *     persisted by every apiFootballFetch call — see
 *     lib/apiFootballClient.ts) still has room above QUOTA_SAFETY_RESERVE —
 *     an absolute floor, never crossed regardless of how the interval was
 *     stretched leading up to it. Unknown (never read yet, or stale from a
 *     previous day) is treated as "assume there's room" — the very next
 *     call will refresh it with the real number regardless.
 *
 * One hit (live=all) refreshes every tracked live match at once, however
 * many matches are actually in play — that's what makes frequent polling
 * affordable on a 100/day quota at all (see the budget math worked out with
 * the product owner before this was built): the cost scales with how many
 * total minutes something is live somewhere, not with match count.
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
  // Read once, used for both the hard-stop check and the graceful-backoff
  // multiplier below — one read, two decisions.
  const knownRemaining = await getKnownRemainingQuota();

  if (knownRemaining != null && knownRemaining <= QUOTA_SAFETY_RESERVE) {
    const alreadyNotifiedToday =
      state?.quotaExhaustedNotifiedAt != null && isSameUtcDay(new Date(state.quotaExhaustedNotifiedAt), now);
    if (!alreadyNotifiedToday) {
      await notifyAdmins(
        "quota_exhausted",
        "Quota da API-Football quase esgotada",
        `Restam ${knownRemaining} pedidos hoje — a atualização automática do placar ao vivo pausou até amanhã para deixar margem para uso manual. Usa "Última atualização" com cuidado.`,
        "/admin/matches"
      );
      await db.update(liveSyncState).set({ quotaExhaustedNotifiedAt: now }).where(eq(liveSyncState.id, 1));
    }
    return { triggered: false, updated: 0, missing: [], skippedReason: "quota reserve" };
  }

  const multiplier = quotaBackoffMultiplier(knownRemaining);
  const requiredGapMs = requiredIntervalMinutes(now) * multiplier * 60_000;
  if (state?.lastSyncedAt && nowMs - new Date(state.lastSyncedAt).getTime() < requiredGapMs) {
    return {
      triggered: false,
      updated: 0,
      missing: [],
      skippedReason: multiplier > 1 ? `too soon (quota caution, ${multiplier}x interval)` : "too soon",
    };
  }

  await db.update(liveSyncState).set({ lastSyncedAt: now }).where(eq(liveSyncState.id, 1));

  const result = await syncLiveMatchesFromApi();

  // Distinct from the quota-reserve notification above: this fires when the
  // API itself is unreachable/rejecting every call (suspended account,
  // revoked key, vendor outage) — a "go check the dashboard" alert, not a
  // "slow down" one. Same once-per-day dedup pattern. Never blocks
  // settlement/wallet correctness either way (see attemptAutoSettleIfConfirmed
  // — no data in means no action, never a wrong one), but the admin should
  // still know live scores have stopped updating at all.
  if (result.error) {
    const alreadyNotifiedToday =
      state?.apiErrorNotifiedAt != null && isSameUtcDay(new Date(state.apiErrorNotifiedAt), now);
    if (!alreadyNotifiedToday) {
      const reason = result.error.replace(/\.+$/, "");
      await notifyAdmins(
        "api_football_error",
        "API-Football não está a responder",
        `A atualização automática do placar ao vivo está a falhar: ${reason}. Os jogos não estão a atualizar sozinhos — confere https://dashboard.api-football.com. Nada foi pago incorretamente (sem dados = sem ação).`,
        "/admin/matches"
      );
      await db.update(liveSyncState).set({ apiErrorNotifiedAt: now }).where(eq(liveSyncState.id, 1));
    }
  }

  return { triggered: true, ...result };
}
