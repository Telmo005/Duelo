import { NextResponse } from "next/server";
import { importUpcomingFixtures } from "@/lib/fixtures-import";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";

/**
 * Imports upcoming fixtures for the covered European leagues — see
 * lib/fixtures-import.ts. Same Vercel Cron / CRON_SECRET pattern as the
 * other cron routes.
 *
 * Currently a no-op in practice: the configured API-Football key is on the
 * Free plan, which doesn't cover the current season at all. Wire this up
 * once the account is upgraded (Pro tier, ~$19/mo) — the code is ready and
 * will start populating `matches` automatically the moment the API stops
 * rejecting the season. Until then, use the manual "Adicionar jogo" form in
 * /admin/matches.
 *
 * Local dev: `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/import-fixtures`
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await importUpcomingFixtures();
  return NextResponse.json(result);
}
