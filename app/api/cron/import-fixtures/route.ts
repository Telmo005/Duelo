import { NextResponse } from "next/server";
import { importUpcomingFixtures } from "@/lib/fixtures-import";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { logError } from "@/lib/errorLog";

/**
 * Imports upcoming fixtures for the covered European leagues — see
 * lib/fixtures-import.ts. Same Vercel Cron / CRON_SECRET pattern as the
 * other cron routes.
 *
 * Guaranteed no-op right now: importUpcomingFixtures short-circuits before
 * calling the API at all while lib/fixtures-import.ts's
 * CURRENT_SEASON_PLAN_ACTIVE is false (Free plan doesn't cover the current
 * season) — a real request here used to burn 3 of the shared daily quota
 * for a rejection every time this fired, whether or not anyone was
 * watching. Flip that flag once the account is upgraded (Pro tier,
 * ~$19/mo) — the rest of the code is ready and will start populating
 * `matches` automatically. Until then, use the manual "Adicionar jogo" form
 * in /admin/matches.
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
