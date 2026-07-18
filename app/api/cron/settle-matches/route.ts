import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { logError } from "@/lib/errorLog";

/**
 * Advances every match's lifecycle purely by kickoff time — scheduled→live
 * at kickoff, live→closed (no 'matched' bets) or live→needs_review (has
 * 'matched' bets, admin notified) 90 minutes later. See
 * supabase/migrations/0028_match_live_lifecycle.sql for the full state
 * machine and why this no longer calls the sports-data API at all: polling
 * api-sports.io per candidate match here (and in the now-retired
 * update-live-scores cron) was exhausting the Free-plan quota in production
 * (repeated 429s), stalling every match — real or test — behind the same
 * rate limit. Result entry is manual now (see lib/actions/settlement.ts
 * settleMatchAction), triggered by the admin notification
 * match_advance_lifecycle sends itself; the live scoreboard is manual too
 * (lib/actions/matches.ts updateLiveScoreAction).
 *
 * Wired to the same external cron-job.org schedule this route already had
 * (kept the path so nothing needs reconfiguring there) — protected the same
 * way as the other crons via CRON_SECRET.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc("match_advance_lifecycle");

  if (error) {
    await logError("cron_settle_matches", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = Array.isArray(data) ? data[0] : data;
  return NextResponse.json(result ?? { to_live: 0, to_closed: 0, to_needs_review: 0 });
}
