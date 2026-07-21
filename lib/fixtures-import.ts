import { db } from "@/db";
import { matches } from "@/db/schema";
import { isNotNull } from "drizzle-orm";
import { apiFootballFetch } from "@/lib/apiFootballClient";

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

type RawFixture = {
  fixture?: { id?: number; date?: string };
  teams?: { home?: { name?: string; logo?: string }; away?: { name?: string; logo?: string } };
};

export type ImportResult = {
  checked: number;
  inserted: number;
  updated: number;
  /** Per-league failures (e.g. "API plan doesn't cover this season") —
   *  collected rather than thrown so one league's failure doesn't stop the
   *  others from importing. */
  errors: string[];
};

/** Flip to true once the API-Football account is upgraded to a plan that
 *  covers the current season (Free is capped to 2022-2024). Until then this
 *  function is guaranteed to fail for all 3 leagues on every call — letting
 *  it run anyway would still burn 3 real requests from the shared daily
 *  quota (see lib/apiFootballClient.ts) for zero benefit, which is exactly
 *  what it was silently doing before this guard existed. If a cron-job.org
 *  schedule still pings /api/cron/import-fixtures while this is false,
 *  that's a free, harmless no-op — no API-Football call happens at all. */
const CURRENT_SEASON_PLAN_ACTIVE: boolean = false;

/**
 * Imports upcoming fixtures for the leagues above into `matches`, idempotent
 * per external_id (API-Football's fixture id) via ON CONFLICT — a re-run
 * only refreshes kickoff time/team names for a fixture already on file
 * (e.g. a postponement), never touches match_status/result_* so it can
 * never clobber a match settlement already recorded.
 *
 * Requires an API-Football plan that includes the current season — see
 * CURRENT_SEASON_PLAN_ACTIVE above.
 */
export async function importUpcomingFixtures(windowDays = 14): Promise<ImportResult> {
  if (!CURRENT_SEASON_PLAN_ACTIVE) {
    return {
      checked: 0,
      inserted: 0,
      updated: 0,
      errors: ["Importação automática desligada — o plano Free da API-Football não cobre a época atual. Usa \"Adicionar jogo\" manualmente."],
    };
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
      const { body, error } = await apiFootballFetch<{ response?: RawFixture[] }>(
        `/fixtures?league=${league.id}&season=${season}&from=${from}&to=${to}`
      );

      if (error) {
        errors.push(`${league.name}: ${error}`);
        continue;
      }

      for (const fx of body?.response ?? []) {
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
            homeLogoUrl: fx.teams?.home?.logo ?? null,
            awayLogoUrl: fx.teams?.away?.logo ?? null,
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
