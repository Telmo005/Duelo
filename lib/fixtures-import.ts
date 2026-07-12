import { db } from "@/db";
import { matches } from "@/db/schema";
import { isNotNull } from "drizzle-orm";

/**
 * Leagues this product covers per CLAUDE.md (Moçambola is deliberately
 * excluded — no vendor confirmed to cover it; see the manual "Adicionar
 * jogo" admin form for that league instead). API-Football league IDs are
 * stable/well-known values from their own directory.
 */
const LEAGUES = [
  { id: 39, name: "Premier League" },
  { id: 140, name: "La Liga" },
  { id: 2, name: "Champions League" },
] as const;

/** European club seasons run Aug(year)–May(year+1) and API-Football labels
 *  a season by the year it starts. From July onward we're already into (or
 *  about to start) the new season; before that we're still in the one that
 *  started the previous calendar year. */
function currentSeasonYear(): number {
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  return month >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

export type ImportResult = {
  checked: number;
  inserted: number;
  updated: number;
  /** Per-league failures (e.g. "API plan doesn't cover this season") —
   *  collected rather than thrown so one league's failure doesn't stop the
   *  others from importing. */
  errors: string[];
};

/**
 * Imports upcoming fixtures for the leagues above into `matches`, idempotent
 * per external_id (API-Football's fixture id) via ON CONFLICT — a re-run
 * only refreshes kickoff time/team names for a fixture already on file
 * (e.g. a postponement), never touches match_status/result_* so it can
 * never clobber a match settlement already recorded.
 *
 * Requires an API-Football plan that includes the current season — the
 * Free plan does not (it's capped to 2022-2024), so this will return every
 * league in `errors` and import nothing until the account is upgraded. That
 * failure is expected and non-fatal; callers (the cron route, the manual
 * admin trigger) surface `errors` rather than treating it as a crash.
 */
export async function importUpcomingFixtures(windowDays = 14): Promise<ImportResult> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return { checked: 0, inserted: 0, updated: 0, errors: ["API_FOOTBALL_KEY não está configurada"] };
  }

  const season = currentSeasonYear();
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + windowDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const existingRows = await db
    .select({ externalId: matches.externalId })
    .from(matches)
    .where(isNotNull(matches.externalId));
  const existingIds = new Set(existingRows.map((r) => r.externalId));

  let checked = 0;
  let inserted = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const league of LEAGUES) {
    try {
      const res = await fetch(
        `https://v3.football.api-sports.io/fixtures?league=${league.id}&season=${season}&from=${from}&to=${to}`,
        { headers: { "x-apisports-key": apiKey }, cache: "no-store" }
      );

      if (!res.ok) {
        errors.push(`${league.name}: HTTP ${res.status}`);
        continue;
      }

      const body = await res.json();
      if (body.errors && Object.keys(body.errors).length > 0) {
        errors.push(`${league.name}: ${JSON.stringify(body.errors)}`);
        continue;
      }

      for (const fx of body.response ?? []) {
        const externalId: string | undefined = fx?.fixture?.id != null ? String(fx.fixture.id) : undefined;
        const home: string | undefined = fx?.teams?.home?.name;
        const away: string | undefined = fx?.teams?.away?.name;
        const dateStr: string | undefined = fx?.fixture?.date;
        if (!externalId || !home || !away || !dateStr) continue;

        checked++;
        const kickoffAt = new Date(dateStr);
        const wasExisting = existingIds.has(externalId);

        await db
          .insert(matches)
          .values({
            home,
            away,
            league: league.name,
            kickoffAt,
            externalId,
            homeLogoUrl: fx.teams.home.logo ?? null,
            awayLogoUrl: fx.teams.away.logo ?? null,
          })
          .onConflictDoUpdate({
            target: matches.externalId,
            set: { kickoffAt, home, away },
          });

        if (wasExisting) updated++;
        else inserted++;
      }
    } catch (err) {
      errors.push(`${league.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { checked, inserted, updated, errors };
}
