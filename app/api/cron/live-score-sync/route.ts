import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { logError } from "@/lib/errorLog";
import { runLiveScoreAutoSync } from "@/lib/liveScoreSync";

/**
 * Automates the admin's "Atualizar jogos ao vivo" button while any match is
 * live — see runLiveScoreAutoSync for the exact gating (nothing live /
 * too-soon / vendor-reported quota reserve). Safe to schedule frequently
 * (every 5 minutes): most ticks are a couple of cheap DB reads and nothing
 * else — API-Football is only ever hit when there's genuinely a match live,
 * enough time has passed since the last real poll, and there's daily quota
 * to spare, and that one hit (live=all) refreshes every tracked live match
 * at once regardless of how many are actually in play. This is deliberately
 * NOT the polling pattern 0028_match_live_lifecycle.sql moved away from —
 * that one hit the API on every tick for every match; this one hits it only
 * when it's actually useful, coalesced into a single request, throttled
 * against the real remaining daily budget.
 *
 * Add to the external cron-job.org schedule (same pattern as the other
 * /api/cron/* routes) every 5 minutes, GET, with
 * `Authorization: Bearer $CRON_SECRET`. (Supersedes the old
 * /api/cron/live-score-checkpoints path — if that was already configured
 * there, repoint it to this URL instead of adding a second entry.)
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
