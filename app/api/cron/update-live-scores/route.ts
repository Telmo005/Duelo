import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { fetchFixtureLive } from "@/lib/sportsData";

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
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
