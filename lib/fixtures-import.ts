import { db } from "@/db";
import { matches } from "@/db/schema";
import { isNotNull } from "drizzle-orm";
import { footballDataFetch } from "@/lib/footballDataClient";
import { toExternalId, FOOTBALL_DATA_COMPETITIONS } from "@/lib/sportsData";

/** Every competition this token can see gets auto-imported daily — not
 *  just a hand-picked few. Moçambola stays 100% manual regardless — no
 *  vendor has ever confirmed covering it. Same 13 competitions verified
 *  directly against football-data.org before the vendor migration; unlike
 *  the previous vendor (API-Football Free), this one actually returns
 *  current-season fixtures on the free plan. */
const LEAGUES = FOOTBALL_DATA_COMPETITIONS;

/**
 * 13 sequential requests (one per league) land well within the same
 * 60-second window — reliably enough over the vendor's 10-requests/minute
 * limit that whichever competitions sit LAST in a fixed list order would
 * systematically 429 on every single run, forever, never actually getting
 * imported (same root cause fixed for the admin fixture picker, see
 * searchFixturesInRange in lib/sportsData.ts — but a fixed per-request
 * delay isn't safe here: 13 competitions × even a few seconds each risks
 * exceeding Vercel's serverless function duration limit on this project's
 * plan, see git history on vercel.json/Hobby-plan cron limits, turning a
 * rate-limit inconvenience into an outright killed function).
 *
 * Instead, rotate which competition starts the list each day (by day-of-
 * epoch modulo the list length) — whichever ~3 land last and risk a 429
 * changes daily, so every competition gets its turn near the front of the
 * queue (and a clean import) at least once every 13 days, rather than the
 * same 2-3 competitions being permanently starved. A day or two of import
 * staleness for a fixture calendar is a total non-issue — nothing here is
 * time-critical the way live scores are.
 */
function rotatedLeagues(): (typeof LEAGUES)[number][] {
  const dayIndex = Math.floor(Date.now() / 86_400_000) % LEAGUES.length;
  return [...LEAGUES.slice(dayIndex), ...LEAGUES.slice(0, dayIndex)];
}

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
 * Imports upcoming fixtures for every covered competition into `matches`,
 * idempotent per external_id (prefixed football-data.org match id, see
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

  for (const league of rotatedLeagues()) {
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
