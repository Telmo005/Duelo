"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/adminAudit";
import { db } from "@/db";
import { matches, bets } from "@/db/schema";
import { eq } from "drizzle-orm";
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
  // Checkbox inputs only appear in FormData when checked — fd.get() returns
  // "on" then, or null when unchecked (never a "true"/"false" string).
  isElimination: z.union([z.literal("on"), z.boolean()]).nullish().transform((v) => v === "on" || v === true),
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
    isElimination: parsed.data.isElimination,
  });

  await logAdminAction(
    admin.id,
    "add_match",
    null,
    `Jogo adicionado manualmente: ${parsed.data.home} vs ${parsed.data.away} (${parsed.data.league})${parsed.data.isElimination ? " — eliminação" : ""}`
  );

  revalidatePath("/admin/matches");
  revalidatePath("/bets/new");
  revalidatePath("/");
  return {};
}

/**
 * Corrects a match already in the catalogue — team names, league, or
 * kickoff time (the "eu enganei-me na hora" case). Only while it's still
 * 'scheduled': once settled/voided the match is part of a closed financial
 * record, so it shouldn't be rewritten after the fact. Unlike delete, this
 * is allowed even if bets already exist against the match — fixing a wrong
 * kickoff time is exactly the situation where someone may have already bet
 * on it.
 */
export async function updateMatchAction(matchId: string, input: Record<string, unknown>): Promise<ActionResult> {
  const admin = await requireAdmin();

  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match) return { error: "Jogo não encontrado." };
  if (match.matchStatus !== "scheduled") {
    return { error: "Este jogo já foi liquidado/anulado e não pode ser editado." };
  }

  const parsed = addMatchSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const [homeLogoUrl, awayLogoUrl] = await Promise.all([
    parsed.data.homeLogoUrl || (parsed.data.home !== match.home ? fetchTeamLogo(parsed.data.home) : match.homeLogoUrl),
    parsed.data.awayLogoUrl || (parsed.data.away !== match.away ? fetchTeamLogo(parsed.data.away) : match.awayLogoUrl),
  ]);

  await db
    .update(matches)
    .set({
      home: parsed.data.home,
      away: parsed.data.away,
      league: parsed.data.league,
      kickoffAt: parsed.data.kickoffAt,
      homeLogoUrl: homeLogoUrl || null,
      awayLogoUrl: awayLogoUrl || null,
      isElimination: parsed.data.isElimination,
    })
    .where(eq(matches.id, matchId));

  await logAdminAction(
    admin.id,
    "edit_match",
    null,
    `Jogo editado: ${match.home} vs ${match.away} → ${parsed.data.home} vs ${parsed.data.away}, ${new Date(parsed.data.kickoffAt).toLocaleString("pt")}`
  );

  revalidatePath("/admin/matches");
  revalidatePath("/bets/new");
  revalidatePath("/");
  return {};
}

/**
 * Removes a match from the catalogue. Only safe while nothing references
 * it yet — bets.match_id and platform_ledger.match_id are both foreign
 * keys with no ON DELETE CASCADE (supabase/migrations/0002_bets.sql,
 * 0003_settlement.sql), so the database itself refuses to delete a match
 * any bet was ever created against. That's the real safety net; the
 * up-front check here just turns the raw FK-violation error into a
 * friendly message instead of a stack trace.
 */
export async function deleteMatchAction(matchId: string): Promise<ActionResult> {
  const admin = await requireAdmin();

  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match) return { error: "Jogo não encontrado." };

  const [existingBet] = await db.select({ id: bets.id }).from(bets).where(eq(bets.matchId, matchId)).limit(1);
  if (existingBet) {
    return { error: "Este jogo já tem apostas associadas — não pode ser removido do catálogo." };
  }

  await db.delete(matches).where(eq(matches.id, matchId));

  await logAdminAction(admin.id, "delete_match", null, `Jogo removido: ${match.home} vs ${match.away} (${match.league})`);

  revalidatePath("/admin/matches");
  revalidatePath("/bets/new");
  revalidatePath("/");
  return {};
}

const liveScoreSchema = z.object({
  homeGoals: z.coerce.number().int().min(0, "Golos não podem ser negativos").max(50),
  awayGoals: z.coerce.number().int().min(0, "Golos não podem ser negativos").max(50),
  minute: z.coerce.number().int().min(0).max(150).optional(),
});

/**
 * Updates the DISPLAY-ONLY live score (matches.live_*) as a match
 * progresses — completely separate from settlement. Liquidar (see
 * lib/actions/settlement.ts::settleMatchAction) is the only action that
 * writes result_home/result_away and pays out; this one never touches
 * either, so an admin can update the score every time a team scores
 * without triggering any payment, and only run Liquidar once at full time.
 * The fallback for matches with no automated live-score feed (no
 * external_id) — API-linked ones already get this from the
 * update-live-scores cron.
 */
export async function updateLiveScoreAction(matchId: string, input: Record<string, unknown>): Promise<ActionResult> {
  const admin = await requireAdmin();

  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match) return { error: "Jogo não encontrado." };
  if (match.matchStatus !== "scheduled") {
    return { error: "Este jogo já foi liquidado/anulado — o placar ao vivo já não é relevante." };
  }

  const parsed = liveScoreSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  await db
    .update(matches)
    .set({
      liveHome: parsed.data.homeGoals,
      liveAway: parsed.data.awayGoals,
      liveMinute: parsed.data.minute ?? null,
      liveUpdatedAt: new Date(),
    })
    .where(eq(matches.id, matchId));

  revalidatePath("/admin/matches");
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
