import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { logError } from "@/lib/errorLog";
import { runLiveScoreAutoSync } from "@/lib/liveScoreSync";

/**
 * Automates the admin's "Atualizar jogos ao vivo" button while any match is
 * live — see runLiveScoreAutoSync for the exact gating (nothing live /
 * too-soon). Safe to schedule frequently: most ticks are one cheap DB read
 * and nothing else — football-data.org is only ever hit when there's
 * genuinely a match live AND enough time has passed since the last real
 * poll, and that one hit refreshes every tracked live match at once
 * regardless of how many are actually in play. This is deliberately NOT the
 * polling pattern 0028_match_live_lifecycle.sql moved away from (that one
 * hit the API on every tick for every match) — this one hits it only when
 * it's actually useful, coalesced into a single request. Unlike the
 * previous vendor (API-Football, daily quota), this vendor's only limit is
 * 10 requests/minute with no daily cap, so there's no budget-conservation
 * logic left to explain here beyond the flat MIN_POLL_INTERVAL_SECONDS
 * floor in lib/liveScoreSync.ts.
 *
 * Add to the external cron-job.org schedule (same pattern as the other
 * /api/cron/* routes), GET, with `Authorization: Bearer $CRON_SECRET`.
 * Every 1-5 minutes is all fine now — feel free to tighten it from
 * whatever it's currently set to for faster real-world freshness, since
 * there's no daily budget being protected anymore.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runLiveScoreAutoSync();
    if (result.error) {
      await logError("cron_live_score_sync", new Error(result.error));
    }
    return NextResponse.json(result);
  } catch (err) {
    await logError("cron_live_score_sync", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
