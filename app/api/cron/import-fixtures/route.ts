import { NextResponse } from "next/server";
import { importUpcomingFixtures } from "@/lib/fixtures-import";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { logError } from "@/lib/errorLog";

/**
 * Imports upcoming fixtures for every covered competition (see
 * FOOTBALL_DATA_COMPETITIONS in lib/sportsData.ts — all 13, not just the
 * original 3) from football-data.org — see lib/fixtures-import.ts. Same
 * Vercel Cron / CRON_SECRET pattern as the other cron routes. Unlike the
 * previous vendor (API-Football Free, which flatly refused current-season
 * fixtures), this actually works on the free plan — verified directly
 * before switching.
 *
 * Local dev: `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/import-fixtures`
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await importUpcomingFixtures();
    // importUpcomingFixtures collects per-league failures (mostly the
    // vendor's 10-req/min limit — see rotatedLeagues) into result.errors
    // instead of throwing, so one league's 429 never stops the rest from
    // importing. But that also meant these failures were previously
    // invisible anywhere in the app — a league silently missing every real
    // fixture for days looked identical to "no fixtures published yet" from
    // the outside. Log them (one combined entry per run, not one per
    // league — this can legitimately be several most days) so a pattern
    // shows up in /admin/errors instead of only in the raw cron response.
    if (result.errors.length > 0) {
      await logError("cron_import_fixtures", result.errors.join("; "), { errors: result.errors });
    }
    return NextResponse.json(result);
  } catch (err) {
    await logError("cron_import_fixtures", err, { stage: "top_level" });
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
