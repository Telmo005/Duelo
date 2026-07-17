import { NextResponse } from "next/server";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchFixtureResult } from "@/lib/sportsData";
import { broadcastFeedEvent } from "@/lib/realtime";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";

const GRACE_WINDOW_MS = 72 * 60 * 60 * 1000; // SETL-04: void if no result 72h after kickoff

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

  return NextResponse.json({ processed: results.length, results });
}
