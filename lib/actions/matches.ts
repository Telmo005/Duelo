"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/adminAudit";
import { db } from "@/db";
import { matches, bets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fetchTeamLogo, searchTeams, searchFixturesByDate, type TeamSearchResult, type FixtureSearchResult } from "@/lib/sportsData";
import { importUpcomingFixtures, type ImportResult } from "@/lib/fixtures-import";

type ActionResult = { error?: string };

const matchFieldsSchema = z.object({
  home: z.string().trim().min(1, "Indica a equipa da casa").max(100),
  away: z.string().trim().min(1, "Indica a equipa visitante").max(100),
  league: z.string().trim().min(1, "Indica a liga/competição").max(100),
  kickoffAt: z.coerce.date(),
  // Set when the admin picked a team from the search picker — skips the
  // name-guessing fetchTeamLogo fallback below, since we already have the
  // exact crest for the exact team they chose.
  homeLogoUrl: z.string().url().optional().or(z.literal("")),
  awayLogoUrl: z.string().url().optional().or(z.literal("")),
  // Checkbox inputs only appear in FormData when checked — fd.get() returns
  // "on" then, or null when unchecked (never a "true"/"false" string).
  isElimination: z.union([z.literal("on"), z.boolean()]).nullish().transform((v) => v === "on" || v === true),
});

// Creating a match always requires a future kickoff — nothing to bet on
// otherwise. Editing (updateMatchSchema below) deliberately allows a past
// kickoff too, since a 'live'/'needs_review' match (already past its
// original kickoff) still needs to be editable for typo fixes.
const addMatchSchema = matchFieldsSchema.extend({
  kickoffAt: z.coerce.date().refine((d) => d.getTime() > Date.now(), { message: "O jogo tem de estar no futuro" }),
});
const updateMatchSchema = matchFieldsSchema;

/** Search-as-you-type backing the "pesquisar equipa" picker in the add-match
 *  form (components/admin/team-search-picker.tsx). Admin-gated like every
 *  other matches action, even though it's read-only, to keep API-Football
 *  quota usage (100 req/day on Free) restricted to trusted callers. */
export async function searchTeamsAction(query: string): Promise<TeamSearchResult[]> {
  await requireAdmin();
  return searchTeams(query);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Backs the "Procurar jogo real" picker in the add-match form — see
 *  searchFixturesByDate for why this only works ~3 days out on the Free
 *  plan. Admin-gated for the same reason searchTeamsAction is: keeps quota
 *  usage (100 req/day) restricted to trusted callers. */
export async function searchFixturesAction(date: string): Promise<{ fixtures: FixtureSearchResult[]; error?: string }> {
  await requireAdmin();
  if (!DATE_RE.test(date)) return { fixtures: [], error: "Data inválida" };
  return searchFixturesByDate(date);
}

const bulkFixtureSchema = z.object({
  externalId: z.string().trim().min(1),
  home: z.string().trim().min(1).max(100),
  away: z.string().trim().min(1).max(100),
  league: z.string().trim().min(1).max(100),
  leagueId: z.number().optional(),
  country: z.string().nullable().optional(),
  kickoffAtIso: z.coerce.date(),
  homeLogoUrl: z.string().url().nullable().optional(),
  awayLogoUrl: z.string().url().nullable().optional(),
  // Derived from the API round name (searchFixturesByDate) — true only for
  // rounds that always produce a decisive result (a final), never guessed
  // for two-legged rounds. Defaults to false so an older client payload
  // missing the field never silently blocks a legitimate draw.
  isElimination: z.boolean().optional().default(false),
});

// Must stay comfortably above RESULTS_CAP in fixture-search-picker.tsx (150)
// — that's the most fixtures "Selecionar todos" can ever hand this action in
// one request, and this cap rejecting the whole batch below that number is
// exactly what silently zeroed out a real bulk-add attempt (150 selected,
// this used to cap at 100 with no partial insert — nothing landed at all).
const MAX_BULK_FIXTURES = 200;

/**
 * Bulk version of addMatchAction, backing the multi-select "Procurar jogo
 * real" picker (components/admin/fixture-search-picker.tsx) — an admin
 * ticks N fixtures from a day's list and adds them all in one request
 * instead of one form submission per match. Every row keeps its `externalId`
 * mainly for provenance/dedup — lifecycle/settlement is purely time-based
 * and doesn't care whether it's set (see 0028_match_live_lifecycle.sql); the
 * live scoreboard is manual admin input for every match now, API-linked or
 * not (see updateLiveScoreAction). Idempotent via onConflictDoNothing on
 * externalId, so re-adding an already-picked fixture
 * (e.g. the admin re-runs a search overlapping a previous one) is a no-op,
 * not a duplicate or a clobber of settlement state already recorded against
 * it.
 */
export async function addFixturesBulkAction(input: unknown[]): Promise<{ added: number; skipped: number; error?: string }> {
  const admin = await requireAdmin();

  if (!Array.isArray(input) || input.length === 0) {
    return { added: 0, skipped: 0, error: "Nenhum jogo selecionado" };
  }
  if (input.length > MAX_BULK_FIXTURES) {
    return { added: 0, skipped: 0, error: `Seleciona no máximo ${MAX_BULK_FIXTURES} jogos de cada vez` };
  }

  const valid = input
    .map((item) => bulkFixtureSchema.safeParse(item))
    .filter((r) => r.success && r.data.kickoffAtIso.getTime() > Date.now())
    .map((r) => (r as { success: true; data: z.infer<typeof bulkFixtureSchema> }).data);

  if (valid.length === 0) {
    return { added: 0, skipped: input.length, error: "Nenhum jogo válido para adicionar" };
  }

  const rows = valid.map((fx) => ({
    externalId: fx.externalId,
    home: fx.home,
    away: fx.away,
    league: fx.league,
    leagueId: fx.leagueId ?? null,
    country: fx.country ?? null,
    kickoffAt: fx.kickoffAtIso,
    homeLogoUrl: fx.homeLogoUrl || null,
    awayLogoUrl: fx.awayLogoUrl || null,
    isElimination: fx.isElimination,
  }));

  const inserted = await db.insert(matches).values(rows).onConflictDoNothing({ target: matches.externalId }).returning({ id: matches.id });

  const skipped = input.length - inserted.length;

  if (inserted.length > 0) {
    await logAdminAction(
      admin.id,
      "add_match",
      null,
      `${inserted.length} jogo(s) importados em lote via seleção manual${skipped > 0 ? ` (${skipped} ignorado(s) — já existentes ou inválidos)` : ""}`
    );
    revalidatePath("/admin/matches");
    revalidatePath("/bets/new");
    revalidatePath("/");
  }

  return { added: inserted.length, skipped };
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

const EDITABLE_STATUSES = new Set(["scheduled", "live", "needs_review"]);

/**
 * Corrects a match already in the catalogue — team names, league, or
 * kickoff time (the "eu enganei-me na hora" case). Allowed while the match
 * is still 'scheduled', 'live', or 'needs_review' (see
 * 0028_match_live_lifecycle.sql) — once settled/voided/closed the match is
 * part of a closed financial record, so it shouldn't be rewritten after the
 * fact. Editing the kickoff time while 'live'/'needs_review' is exactly how
 * an admin pushes back match_advance_lifecycle's 90-minute clock for a real
 * match that kicked off late. Unlike delete, this is allowed even if bets
 * already exist against the match — fixing a wrong kickoff time is exactly
 * the situation where someone may have already bet on it.
 */
export async function updateMatchAction(matchId: string, input: Record<string, unknown>): Promise<ActionResult> {
  const admin = await requireAdmin();

  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match) return { error: "Jogo não encontrado." };
  if (!EDITABLE_STATUSES.has(match.matchStatus)) {
    return { error: "Este jogo já foi liquidado/anulado/fechado e não pode ser editado." };
  }

  const parsed = updateMatchSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const [homeLogoUrl, awayLogoUrl] = await Promise.all([
    parsed.data.homeLogoUrl || (parsed.data.home !== match.home ? fetchTeamLogo(parsed.data.home) : match.homeLogoUrl),
    parsed.data.awayLogoUrl || (parsed.data.away !== match.away ? fetchTeamLogo(parsed.data.away) : match.awayLogoUrl),
  ]);

  // Pushing the kickoff back into the future (the "jogo real atrasou" case)
  // resets the match to 'scheduled' so match_advance_lifecycle re-evaluates
  // it fresh from the new time, instead of staying stuck 'live'/'needs_review'
  // against a kickoff that's no longer in the past. Conversely, correcting a
  // still-scheduled match's kickoff into the past (typo fix) flips it
  // straight to 'live' rather than waiting for the next cron tick.
  const kickoffInFuture = parsed.data.kickoffAt.getTime() > Date.now();
  const nextStatus = kickoffInFuture ? "scheduled" : match.matchStatus === "scheduled" ? "live" : match.matchStatus;

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
      matchStatus: nextStatus,
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
 * either, so an admin can update the score every time a team scores without
 * triggering any payment, and only run Liquidar once at full time. The sole
 * source for every match now, API-linked or not — there is no polling cron
 * (see 0028_match_live_lifecycle.sql for why: it was exhausting the
 * API-Football Free-plan quota). Minute is optional; left blank, the feed
 * shows an automatic kickoff-based clock instead (computeElapsedMinute in
 * lib/bets.ts) — only pass one to override/correct it.
 */
export async function updateLiveScoreAction(matchId: string, input: Record<string, unknown>): Promise<ActionResult> {
  const admin = await requireAdmin();

  const [match] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match) return { error: "Jogo não encontrado." };
  if (!EDITABLE_STATUSES.has(match.matchStatus)) {
    return { error: "Este jogo já foi liquidado/anulado/fechado — o placar ao vivo já não é relevante." };
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
