import { NextResponse } from "next/server";
import { importUpcomingFixtures } from "@/lib/fixtures-import";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { logError } from "@/lib/errorLog";

/**
 * Imports upcoming fixtures for the covered European leagues (Premier
 * League/La Liga/Champions League) from football-data.org — see
 * lib/fixtures-import.ts. Same Vercel Cron / CRON_SECRET pattern as the
 * other cron routes. Unlike the previous vendor (API-Football Free, which
 * flatly refused current-season fixtures), this actually works on the free
 * plan — verified directly before switching.
 *
 * Local dev: `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/import-fixtures`
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await importUpcomingFixtures();
    return NextResponse.json(result);
  } catch (err) {
    await logError("cron_import_fixtures", err, { stage: "top_level" });
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
