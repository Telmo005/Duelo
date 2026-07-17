import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { fetchFixtureLive } from "@/lib/sportsData";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { logError } from "@/lib/errorLog";

/**
 * Polls API-Football for the live score + minute of every in-play,
 * API-linked fixture and writes it to matches.live_* for the feed
 * scoreboard. Runs far more often than settle-matches (see vercel.json)
 * because scores change fast.
 *
 * Deliberately does NOT touch match_status — settlement (bet_settle_match)
 * requires match_status = 'scheduled', so keeping live data in its own
 * columns means the poller and the settler never step on each other. The
 * live_* writes use raw parameterised SQL rather than the Drizzle `matches`
 * schema so the app keeps working even before migration 0007 is applied
 * (the columns just won't exist yet; the UPDATE is a no-op target then).
 *
 * Protected the same way as the other crons: Vercel sends
 * `Authorization: Bearer ${CRON_SECRET}`. Locally, call it by hand:
 *   curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/update-live-scores
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return await updateLiveScores();
  } catch (err) {
    // Per-fixture fetch failures are expected/transient (API hiccups) and
    // already surfaced in the response body below without needing a durable
    // record for every one — this only catches the whole cron dying (e.g.
    // the initial matches query itself failing).
    await logError("cron_update_live_scores", err, { stage: "top_level" });
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

async function updateLiveScores() {
  const candidates = await db
    .select({ id: matches.id, externalId: matches.externalId })
    .from(matches)
    .where(and(eq(matches.matchStatus, "scheduled"), isNotNull(matches.externalId), lt(matches.kickoffAt, new Date())));

  const results: Array<{ matchId: string; action: string; detail?: string }> = [];

  for (const match of candidates) {
    try {
      const live = await fetchFixtureLive(match.externalId!);
      if (live.state === "live") {
        await db.execute(sql`
          update public.matches
             set live_home = ${live.homeGoals},
                 live_away = ${live.awayGoals},
                 live_minute = ${live.minute},
                 live_updated_at = now()
           where id = ${match.id}
        `);
        results.push({ matchId: match.id, action: "updated", detail: `${live.homeGoals}-${live.awayGoals} ${live.minute ?? "?"}'` });
      } else {
        results.push({ matchId: match.id, action: "skipped", detail: live.short });
      }
    } catch (err) {
      results.push({ matchId: match.id, action: "error", detail: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
