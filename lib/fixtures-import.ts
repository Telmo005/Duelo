import { db } from "@/db";
import { matches } from "@/db/schema";
import { isNotNull } from "drizzle-orm";
import { footballDataFetch } from "@/lib/footballDataClient";
import { toExternalId } from "@/lib/sportsData";

/** The 3 leagues this product automatically imports (per CLAUDE.md;
 *  Moçambola stays 100% manual — no vendor has ever confirmed covering
 *  it). Same competitions verified directly against football-data.org
 *  before this migration — unlike the previous vendor (API-Football Free),
 *  this one actually returns current-season fixtures on the free plan. */
const LEAGUES = [
  { code: "PL", name: "Premier League" },
  { code: "PD", name: "La Liga" },
  { code: "CL", name: "UEFA Champions League" },
] as const;

const ELIMINATION_STAGES = new Set(["FINAL", "THIRD_PLACE_PLAYOFF"]);

type RawFixture = {
  id?: number;
  utcDate?: string;
  stage?: string;
  homeTeam?: { name?: string; crest?: string };
  awayTeam?: { name?: string; crest?: string };
};

export type ImportResult = {
  checked: number;
  inserted: number;
  updated: number;
  /** Per-league failures — collected rather than thrown so one league's
   *  failure doesn't stop the others from importing. */
  errors: string[];
};

/**
 * Imports upcoming fixtures for the leagues above into `matches`, idempotent
 * per external_id (prefixed football-data.org match id, see
 * lib/sportsData.ts toExternalId) via ON CONFLICT — a re-run only refreshes
 * kickoff time/team names for a fixture already on file (e.g. a
 * postponement), never touches match_status/result_* so it can never
 * clobber a match settlement already recorded.
 */
export async function importUpcomingFixtures(windowDays = 14): Promise<ImportResult> {
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
      const { body, error } = await footballDataFetch<{ matches?: RawFixture[] }>(
        `/competitions/${league.code}/matches?dateFrom=${from}&dateTo=${to}`
      );

      if (error) {
        errors.push(`${league.name}: ${error}`);
        continue;
      }

      for (const fx of body?.matches ?? []) {
        const home = fx.homeTeam?.name;
        const away = fx.awayTeam?.name;
        if (fx.id == null || !home || !away || !fx.utcDate) continue;

        checked++;
        const externalId = toExternalId(fx.id);
        const kickoffAt = new Date(fx.utcDate);
        const wasExisting = existingIds.has(externalId);

        await db
          .insert(matches)
          .values({
            home,
            away,
            league: league.name,
            kickoffAt,
            externalId,
            homeLogoUrl: fx.homeTeam?.crest ?? null,
            awayLogoUrl: fx.awayTeam?.crest ?? null,
            isElimination: fx.stage != null && ELIMINATION_STAGES.has(fx.stage.toUpperCase()),
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
