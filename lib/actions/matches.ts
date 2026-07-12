"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/adminAudit";
import { db } from "@/db";
import { matches } from "@/db/schema";
import { fetchTeamLogo, searchTeams, type TeamSearchResult } from "@/lib/sportsData";
import { importUpcomingFixtures, type ImportResult } from "@/lib/fixtures-import";

type ActionResult = { error?: string };

const addMatchSchema = z.object({
  home: z.string().trim().min(1, "Indica a equipa da casa").max(100),
  away: z.string().trim().min(1, "Indica a equipa visitante").max(100),
  league: z.string().trim().min(1, "Indica a liga/competição").max(100),
  kickoffAt: z.coerce.date().refine((d) => d.getTime() > Date.now(), { message: "O jogo tem de estar no futuro" }),
  // Set when the admin picked a team from the search picker — skips the
  // name-guessing fetchTeamLogo fallback below, since we already have the
  // exact crest for the exact team they chose.
  homeLogoUrl: z.string().url().optional().or(z.literal("")),
  awayLogoUrl: z.string().url().optional().or(z.literal("")),
});

/** Search-as-you-type backing the "pesquisar equipa" picker in the add-match
 *  form (components/admin/team-search-picker.tsx). Admin-gated like every
 *  other matches action, even though it's read-only, to keep API-Football
 *  quota usage (100 req/day on Free) restricted to trusted callers. */
export async function searchTeamsAction(query: string): Promise<TeamSearchResult[]> {
  await requireAdmin();
  return searchTeams(query);
}

/**
 * Manual fixture entry. This is the fallback for leagues no automated feed
 * covers (Moçambola — no vendor confirmed to cover it) and, until
 * API-Football is upgraded off its Free plan (which blocks every current
 * season outright — see lib/fixtures-import.ts), the ONLY source of real
 * matches at all. Crest logos are best-effort via the same team-name search
 * settlement already uses; a miss just leaves the placeholder shield, never
 * blocks creating the match.
 */
export async function addMatchAction(input: Record<string, unknown>): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = addMatchSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const [homeLogoUrl, awayLogoUrl] = await Promise.all([
    parsed.data.homeLogoUrl || fetchTeamLogo(parsed.data.home),
    parsed.data.awayLogoUrl || fetchTeamLogo(parsed.data.away),
  ]);

  await db.insert(matches).values({
    home: parsed.data.home,
    away: parsed.data.away,
    league: parsed.data.league,
    kickoffAt: parsed.data.kickoffAt,
    homeLogoUrl: homeLogoUrl || null,
    awayLogoUrl: awayLogoUrl || null,
  });

  await logAdminAction(
    admin.id,
    "add_match",
    null,
    `Jogo adicionado manualmente: ${parsed.data.home} vs ${parsed.data.away} (${parsed.data.league})`
  );

  revalidatePath("/admin/matches");
  revalidatePath("/bets/new");
  revalidatePath("/");
  return {};
}

/** Manual trigger for importUpcomingFixtures() — lets an admin test/force an
 *  import pass (e.g. right after upgrading the API-Football plan) without
 *  waiting for the next cron tick. */
export async function importFixturesAction(): Promise<ImportResult> {
  const admin = await requireAdmin();

  const result = await importUpcomingFixtures();

  if (result.inserted > 0 || result.updated > 0) {
    await logAdminAction(
      admin.id,
      "import_fixtures",
      null,
      `${result.inserted} jogo(s) importado(s), ${result.updated} atualizado(s) (${result.checked} verificados)`
    );
    revalidatePath("/admin/matches");
    revalidatePath("/bets/new");
    revalidatePath("/");
  }

  return result;
}
