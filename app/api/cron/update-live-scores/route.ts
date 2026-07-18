import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { and, asc, eq, gt, inArray, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { matches, bets } from "@/db/schema";
import { fetchFixtureLive } from "@/lib/sportsData";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { logError } from "@/lib/errorLog";

// Bounds how many API-Football requests a single tick can make. Polling
// every scheduled/live match unconditionally is what exhausted the
// Free-plan quota in production (see 0028_match_live_lifecycle.sql) — capping
// per run, on top of only polling matches someone actually has money on
// (see the `matched` bet filter below), keeps this cron's worst case small
// and predictable regardless of how many fixtures are in the catalogue.
const MAX_PER_RUN = 15;

/**
 * Polls API-Football for the live score + minute of in-play, API-linked
 * fixtures that someone actually has a real (matched) bet on, and writes it
 * to matches.live_* for the feed scoreboard. Purely cosmetic — never touches
 * match_status or drives settlement (that's match_advance_lifecycle now, see
 * 0028_match_live_lifecycle.sql). The live_* writes use raw parameterised
 * SQL rather than the Drizzle `matches` schema so the app keeps working even
 * before migration 0007 is applied (the columns just won't exist yet; the
 * UPDATE is a no-op target then).
 *
 * Protected the same way as the other crons: an external scheduler
 * (cron-job.org) sends `Authorization: Bearer ${CRON_SECRET}`. Locally, call
 * it by hand:
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
  // Inner join on a 'matched' bet: only poll fixtures someone actually has
  // real money on — a match can have several matched bets, so dedupe below
  // rather than filtering with an aggregate.
  const rows = await db
    .select({ id: matches.id, externalId: matches.externalId })
    .from(matches)
    .innerJoin(bets, and(eq(bets.matchId, matches.id), eq(bets.status, "matched")))
    .where(
      and(
        inArray(matches.matchStatus, ["scheduled", "live"]),
        isNotNull(matches.externalId),
        lte(matches.kickoffAt, new Date()),
        // Only bother polling within match_advance_lifecycle's 90-minute
        // live window — no point burning a request on something that's
        // about to flip to needs_review anyway.
        gt(matches.kickoffAt, new Date(Date.now() - 90 * 60 * 1000))
      )
    )
    .orderBy(asc(matches.kickoffAt));

  const seen = new Set<string>();
  const candidates: { id: string; externalId: string | null }[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    candidates.push(row);
    if (candidates.length >= MAX_PER_RUN) break;
  }

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
      const message = err instanceof Error ? err.message : String(err);
      results.push({ matchId: match.id, action: "error", detail: message });
      // A 429 means every further request this tick will fail the same way
      // — stop immediately instead of burning the rest of the batch (and
      // logging a wall of identical errors) on a quota that's already gone.
      if (message.includes("429")) break;
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
