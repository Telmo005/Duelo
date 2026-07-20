import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { logError } from "@/lib/errorLog";
import { runLiveScoreCheckpointSync } from "@/lib/liveScoreSync";

/**
 * Automates the admin's "Atualizar jogos ao vivo" button at the three
 * moments a football score actually changes meaningfully: kickoff, half-time
 * (45'), full-time (90') — see runLiveScoreCheckpointSync for the exact
 * crossing logic. Safe to schedule frequently (every 5-10 minutes is fine):
 * checking whether a checkpoint is due is a plain DB read, zero API cost:
 * API-Football is only ever hit when at least one tracked match has
 * genuinely just crossed one, and that one hit (live=all) refreshes every
 * tracked live match at once, not just the one that triggered it. This is
 * deliberately NOT the polling pattern 0028_match_live_lifecycle.sql moved
 * away from — that one hit the API on every tick for every match; this one
 * hits it only on real checkpoints, coalesced into a single request.
 *
 * Add to the same external cron-job.org schedule as the other /api/cron/*
 * routes, every 5-10 minutes, with `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runLiveScoreCheckpointSync();
    if (result.error) {
      await logError("cron_live_score_checkpoints", new Error(result.error));
    }
    return NextResponse.json(result);
  } catch (err) {
    await logError("cron_live_score_checkpoints", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
