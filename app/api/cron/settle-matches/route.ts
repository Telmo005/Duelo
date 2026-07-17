import { NextResponse } from "next/server";
import { db } from "@/db";
import { matches, bets } from "@/db/schema";
import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchFixtureResult } from "@/lib/sportsData";
import { broadcastFeedEvent } from "@/lib/realtime";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";

const GRACE_WINDOW_MS = 72 * 60 * 60 * 1000; // SETL-04: void if no result 72h after kickoff

// A football match is over well before this, but 90 min from kickoff is the
// same "has this match's live window ended" line the feed itself uses (see
// LIVE_FRESHNESS_MS in lib/bets.ts) — reusing it here means a manually-typed
// fixture (no external_id) only becomes a close candidate once nobody would
// reasonably expect it to still be in progress.
const NO_BETS_GRACE_MS = 90 * 60 * 1000;

/**
 * Fetches the official result for every scheduled, API-linked match past
 * kickoff and settles or voids it accordingly (SETL-01..04). Matches
 * without an external_id (manually seeded fixtures) are skipped — nothing
 * to look up. Wired to Vercel Cron (see vercel.json); protected the same
 * way as /api/cron/refund-expired-bets.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const candidates = await db
    .select()
    .from(matches)
    .where(and(eq(matches.matchStatus, "scheduled"), isNotNull(matches.externalId), lt(matches.kickoffAt, new Date())));

  const service = createServiceClient();
  const results: Array<{ matchId: string; action: string; detail?: string }> = [];

  for (const match of candidates) {
    try {
      const result = await fetchFixtureResult(match.externalId!);

      if (result.status === "finished") {
        const { data, error } = await service.rpc("bet_settle_match", {
          p_match_id: match.id,
          p_result_home: result.homeGoals,
          p_result_away: result.awayGoals,
        });
        if (error) throw error;
        await broadcastFeedEvent({ type: "bets_settled", matchId: match.id });
        results.push({ matchId: match.id, action: "settled", detail: `${data} bet(s)` });
        continue;
      }

      if (result.status === "postponed" || result.status === "abandoned") {
        const { data, error } = await service.rpc("bet_void_match", { p_match_id: match.id, p_status: result.status });
        if (error) throw error;
        await broadcastFeedEvent({ type: "bets_voided", matchId: match.id });
        results.push({ matchId: match.id, action: "voided", detail: `${data} bet(s)` });
        continue;
      }

      // Still in progress / not started / unknown — check the grace window.
      const pastGraceWindow = Date.now() - match.kickoffAt.getTime() > GRACE_WINDOW_MS;
      if (pastGraceWindow) {
        const { data, error } = await service.rpc("bet_void_match", { p_match_id: match.id, p_status: "abandoned" });
        if (error) throw error;
        await broadcastFeedEvent({ type: "bets_voided", matchId: match.id });
        results.push({ matchId: match.id, action: "voided_grace_window", detail: `${data} bet(s)` });
      } else {
        results.push({ matchId: match.id, action: "skipped_not_final", detail: result.status });
      }
    } catch (err) {
      results.push({ matchId: match.id, action: "error", detail: err instanceof Error ? err.message : String(err) });
    }
  }

  // Manually-typed fixtures (no external_id — the SETL-01 fallback for
  // leagues with no automated feed, e.g. Moçambola) never go through the
  // loop above, so they'd otherwise sit in the admin's "Por liquidar"
  // worklist forever even when literally nobody bet on them. Nothing to
  // settle in that case — close it automatically. One that DID get a bet
  // still needs a human to type in the real result, exactly as before.
  const emptyCandidates = await db
    .select({ id: matches.id })
    .from(matches)
    .where(
      and(
        eq(matches.matchStatus, "scheduled"),
        isNull(matches.externalId),
        lt(matches.kickoffAt, new Date(Date.now() - NO_BETS_GRACE_MS))
      )
    );

  for (const match of emptyCandidates) {
    const [existingBet] = await db.select({ id: bets.id }).from(bets).where(eq(bets.matchId, match.id)).limit(1);
    if (existingBet) continue;

    const { data: closed, error } = await service.rpc("match_close_if_empty", { p_match_id: match.id });
    if (error) {
      results.push({ matchId: match.id, action: "error", detail: error.message });
    } else if (closed) {
      results.push({ matchId: match.id, action: "closed_no_bets" });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
