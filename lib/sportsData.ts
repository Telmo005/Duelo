/**
 * football-data.org client — replaces the earlier API-Football integration
 * (lib/apiFootballClient.ts is gone) after that account got suspended and,
 * separately, its Free plan flatly refused current-season fixtures at all.
 * football-data.org's Free tier: current-season fixtures DO work, live
 * scores come through (goals, not a minute/clock — see FixtureUpdate.minute
 * below, always null from this vendor; the app's existing kickoff-time
 * fallback clock covers that gap, unchanged), and the rate limit is a flat
 * 10 requests/minute with no daily cap at all — verified directly against
 * production before this migration (see lib/liveScoreSync.ts for what that
 * simplified).
 *
 * Settlement/lifecycle (bet_settle_match / bet_void_match /
 * match_advance_lifecycle, see supabase/migrations/0028_match_live_lifecycle.sql)
 * is purely time-based and never calls this file — the live scoreboard
 * comes from fetchFixtureById/fetchLiveFixtures below, called either by an
 * admin (updateLiveScoreFromApiAction / refreshAllLiveMatchesAction) or by
 * the automatic sync (lib/liveScoreSync.ts).
 */

import { footballDataFetch } from "@/lib/footballDataClient";
import { unstable_cache } from "next/cache";

/**
 * Every competition this token has confirmed access to (verified directly
 * against the live API before committing to this list) — Premier
 * League/La Liga/Champions League are the three actually wired into
 * automatic fixture import (lib/fixtures-import.ts); the rest just widen
 * what the admin's manual "pesquisar equipa"/"procurar jogo real" pickers
 * can find. Moçambola isn't here — no vendor has ever confirmed covering
 * it; it stays 100% manual, same as always.
 */
export const FOOTBALL_DATA_COMPETITIONS = [
  { code: "PL", id: 2021, name: "Premier League", country: "England" },
  { code: "PD", id: 2014, name: "La Liga", country: "Spain" },
  { code: "CL", id: 2001, name: "UEFA Champions League", country: null },
  { code: "BSA", id: 2013, name: "Campeonato Brasileiro Série A", country: "Brazil" },
  { code: "ELC", id: 2016, name: "Championship", country: "England" },
  { code: "FL1", id: 2015, name: "Ligue 1", country: "France" },
  { code: "BL1", id: 2002, name: "Bundesliga", country: "Germany" },
  { code: "SA", id: 2019, name: "Serie A", country: "Italy" },
  { code: "DED", id: 2003, name: "Eredivisie", country: "Netherlands" },
  { code: "PPL", id: 2017, name: "Primeira Liga", country: "Portugal" },
  { code: "CLI", id: 2152, name: "Copa Libertadores", country: null },
  { code: "EC", id: 2018, name: "European Championship", country: null },
  { code: "WC", id: 2000, name: "FIFA World Cup", country: null },
] as const;

/** external_id is prefixed for every match sourced from this vendor —
 *  guarantees no collision with whatever numeric IDs were left behind by
 *  the old API-Football integration (same column, different vendor's ID
 *  space, unique constraint on the column) and makes provenance obvious at
 *  a glance in the database. */
const ID_PREFIX = "fd-";
export function toExternalId(footballDataMatchId: number | string): string {
  return `${ID_PREFIX}${footballDataMatchId}`;
}
function stripPrefix(externalId: string): string {
  return externalId.startsWith(ID_PREFIX) ? externalId.slice(ID_PREFIX.length) : externalId;
}

export type FixtureSearchResult = {
  externalId: string;
  home: string;
  away: string;
  homeLogoUrl: string | null;
  awayLogoUrl: string | null;
  league: string;
  leagueId: number;
  country: string | null;
  kickoffAtIso: string;
  isElimination: boolean;
};

type RawArea = { name?: string };
type RawCompetition = { id?: number; name?: string; code?: string };
type RawTeam = { name?: string; crest?: string };
type RawMatch = {
  id?: number;
  utcDate?: string;
  status?: string;
  stage?: string;
  area?: RawArea;
  competition?: RawCompetition;
  homeTeam?: RawTeam;
  awayTeam?: RawTeam;
  score?: { fullTime?: { home?: number | null; away?: number | null } };
};

/** Stages football-data.org uses that are ALWAYS a single, decisive match —
 *  mirrors the same reasoning the old API-Football round-name check used
 *  (see git history): getting this wrong in the "too eager" direction is
 *  worse than not flagging it, since bet_settle_match rejects a tied score
 *  for an elimination match. Admins can always correct the checkbox by hand
 *  regardless. */
const ELIMINATION_STAGES = new Set(["FINAL", "THIRD_PLACE_PLAYOFF"]);
function isEliminationStage(stage: string | undefined): boolean {
  return stage != null && ELIMINATION_STAGES.has(stage.toUpperCase());
}

/**
 * Lists real fixtures across every competition this token can see, for a
 * given date — powers the "Procurar jogo real" admin picker. No
 * league/season restriction here (unlike the old vendor): football-data's
 * Free plan simply returns current-season fixtures.
 */
export async function searchFixturesByDate(date: string): Promise<{ fixtures: FixtureSearchResult[]; error?: string }> {
  const { body, error } = await footballDataFetch<{ matches?: RawMatch[] }>(`/matches?dateFrom=${date}&dateTo=${date}`);
  if (error) return { fixtures: [], error };

  const raw = body?.matches ?? [];
  const fixtures = raw
    .map((fx): FixtureSearchResult | null => {
      const id = fx.id;
      const home = fx.homeTeam?.name;
      const away = fx.awayTeam?.name;
      const kickoffAtIso = fx.utcDate;
      const leagueId = fx.competition?.id;
      const league = fx.competition?.name;
      if (id == null || !home || !away || !kickoffAtIso || leagueId == null || !league) return null;
      return {
        externalId: toExternalId(id),
        home,
        away,
        league,
        leagueId,
        country: fx.area?.name ?? null,
        kickoffAtIso,
        homeLogoUrl: fx.homeTeam?.crest ?? null,
        awayLogoUrl: fx.awayTeam?.crest ?? null,
        isElimination: isEliminationStage(fx.stage),
      };
    })
    .filter((fx): fx is FixtureSearchResult => fx !== null);

  return { fixtures };
}

/** Match statuses that mean the fixture is genuinely OVER as scheduled —
 *  distinct from HALTED below because the admin needs to know "this is
 *  done" rather than "this paused, it'll resume". POSTPONED/CANCELLED have
 *  no valid score at all (need Adiado/Abandonado — a refund — not
 *  Liquidar); AWARDED is an administrative decision left for manual
 *  review, same reasoning as the old vendor's w.o./awd codes. */
const FINISHED_STATUS_CODES = new Set(["FINISHED", "POSTPONED", "CANCELLED", "AWARDED"]);

/** Paused but NOT over — the clock stops, but the match resumes. */
const HALTED_STATUS_CODES = new Set(["PAUSED", "SUSPENDED"]);

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Agendado",
  TIMED: "Agendado",
  IN_PLAY: "Em jogo",
  PAUSED: "Intervalo",
  FINISHED: "Terminado",
  SUSPENDED: "Suspenso",
  POSTPONED: "Adiado",
  CANCELLED: "Cancelado",
  AWARDED: "Decidido por w.o.",
};

export type FixtureUpdate = {
  homeGoals: number | null;
  awayGoals: number | null;
  /** Always null from this vendor — football-data.org's match resource has
   *  no live-minute/clock field at all (confirmed directly against a real
   *  in-play match), only halftime/fulltime goal counts. The existing
   *  kickoff-time-derived fallback clock (computeElapsedMinute /
   *  computeLiveMinuteLabel in lib/bets.ts) already covers exactly this
   *  case — nothing else needed to change for the display to keep working. */
  minute: null;
  /** True for both "halted, will resume" and "finished" statuses — either
   *  way the ticking clock should freeze instead of counting up forever.
   *  Distinguish the two with `finished` below for what label to show. */
  paused: boolean;
  /** True only for a genuinely-over match (FINISHED/POSTPONED/CANCELLED/
   *  AWARDED) — the admin's cue to go liquidate or void, not just wait. */
  finished: boolean;
  statusCode: string;
  statusLabel: string;
};

function parseFixtureUpdate(fx: RawMatch): FixtureUpdate {
  const statusCode = fx.status ?? "SCHEDULED";
  const finished = FINISHED_STATUS_CODES.has(statusCode);
  return {
    homeGoals: fx.score?.fullTime?.home ?? null,
    awayGoals: fx.score?.fullTime?.away ?? null,
    minute: null,
    paused: finished || HALTED_STATUS_CODES.has(statusCode),
    finished,
    statusCode,
    statusLabel: STATUS_LABELS[statusCode] ?? statusCode,
  };
}

/**
 * Single-fixture lookup — the cheapest possible call against the vendor
 * (one match), used by the admin's per-match "Última atualização" button
 * (updateLiveScoreFromApiAction, lib/actions/matches.ts).
 */
export async function fetchFixtureById(externalId: string): Promise<{ data?: FixtureUpdate; error?: string }> {
  const id = stripPrefix(externalId);
  const { body, error } = await footballDataFetch<RawMatch>(`/matches/${encodeURIComponent(id)}`);
  if (error) return { error };
  if (!body) return { error: "Jogo não encontrado na API (verifica a ligação ao football-data.org)" };

  return { data: parseFixtureUpdate(body) };
}

/**
 * Every fixture currently in play, across every competition this token can
 * see, in ONE request (status=LIVE, football-data's combined IN_PLAY +
 * PAUSED filter) — backs the admin's "Atualizar jogos ao vivo" button and
 * the automatic sync (lib/liveScoreSync.ts). Same one-request-covers-
 * everything shape the old vendor's live=all had.
 */
export async function fetchLiveFixtures(): Promise<{ data?: Map<string, FixtureUpdate>; error?: string }> {
  const { body, error } = await footballDataFetch<{ matches?: RawMatch[] }>("/matches?status=LIVE");
  if (error) return { error };

  const raw = body?.matches ?? [];
  const byExternalId = new Map<string, FixtureUpdate>();
  for (const fx of raw) {
    if (fx.id == null) continue;
    byExternalId.set(toExternalId(fx.id), parseFixtureUpdate(fx));
  }
  return { data: byExternalId };
}

export type TeamSearchResult = { id: number; name: string; country: string; logo: string };

type CachedTeam = { id: number; name: string; crest: string; country: string };

/** One competition's full team roster, cached a full day — team rosters
 *  don't change minute to minute, and caching means a search never spends
 *  more than the first request of the day per competition (13 competitions
 *  fetched once every 24h each, not once per keystroke). */
const getCompetitionTeams = unstable_cache(
  async (code: string): Promise<CachedTeam[]> => {
    const { body, error } = await footballDataFetch<{ teams?: Array<{ id: number; name: string; crest?: string; area?: RawArea }> }>(
      `/competitions/${code}/teams`
    );
    if (error || !body?.teams) return [];
    return body.teams.map((t) => ({ id: t.id, name: t.name, crest: t.crest ?? "", country: t.area?.name ?? "" }));
  },
  ["football-data-competition-teams"],
  { revalidate: 86_400 }
);

/** National teams are searched by their ENGLISH name ("France", not
 *  "França") — the two national-team competitions this token covers
 *  (World Cup, Euro) list teams under their official English names, so a
 *  Portuguese query needs the same translation the old vendor's search
 *  needed. Club names usually survive translation fine and don't need it. */
const PT_TO_EN_COUNTRY: Record<string, string> = {
  "africa do sul": "South Africa", "alemanha": "Germany", "arabia saudita": "Saudi Arabia",
  "argelia": "Algeria", "argentina": "Argentina", "australia": "Australia", "austria": "Austria",
  "belgica": "Belgium", "bolivia": "Bolivia", "bosnia": "Bosnia and Herzegovina", "brasil": "Brazil",
  "bulgaria": "Bulgaria", "camaroes": "Cameroon", "canada": "Canada", "catar": "Qatar",
  "chile": "Chile", "china": "China", "colombia": "Colombia", "coreia do norte": "North Korea",
  "coreia do sul": "South Korea", "costa do marfim": "Ivory Coast", "costa rica": "Costa Rica",
  "croacia": "Croatia", "dinamarca": "Denmark", "egipto": "Egypt", "egito": "Egypt",
  "equador": "Ecuador", "escocia": "Scotland", "eslovaquia": "Slovakia", "eslovenia": "Slovenia",
  "espanha": "Spain", "estados unidos": "USA", "franca": "France", "gales": "Wales",
  "gana": "Ghana", "grecia": "Greece", "holanda": "Netherlands", "hungria": "Hungary",
  "inglaterra": "England", "irlanda": "Ireland", "islandia": "Iceland", "italia": "Italy",
  "jamaica": "Jamaica", "japao": "Japan", "mali": "Mali", "marrocos": "Morocco",
  "mexico": "Mexico", "mocambique": "Mozambique", "nigeria": "Nigeria", "noruega": "Norway",
  "panama": "Panama", "paraguai": "Paraguay", "peru": "Peru", "polonia": "Poland",
  "portugal": "Portugal", "quenia": "Kenya", "republica checa": "Czech Republic",
  "romenia": "Romania", "russia": "Russia", "senegal": "Senegal", "servia": "Serbia",
  "suecia": "Sweden", "suica": "Switzerland", "tunisia": "Tunisia", "turquia": "Turkey",
  "ucrania": "Ukraine", "uruguai": "Uruguay", "zambia": "Zambia",
};

function asciiFold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining diacritical marks (accents) left behind by NFD
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim();
}

/**
 * Team search for the "pesquisar equipa" admin picker — searches within the
 * rosters of every competition this token can see (cached, see
 * getCompetitionTeams) rather than a global vendor search endpoint, which
 * football-data.org doesn't offer. Fetched sequentially, not in parallel:
 * a cold cache (first search of the day) touches up to 13 endpoints, and
 * spacing them out keeps comfortably clear of the 10-requests/minute limit
 * even in that worst case; any single competition's request failing just
 * means that one's roster is empty for this search, not a crash.
 */
export async function searchTeams(query: string): Promise<TeamSearchResult[]> {
  if (query.trim().length < 3) return [];

  const asciiQuery = asciiFold(query).toLowerCase();
  if (asciiQuery.length < 3) return [];

  const countryTranslation = PT_TO_EN_COUNTRY[asciiQuery];
  const searchTerms = countryTranslation ? [asciiQuery, countryTranslation.toLowerCase()] : [asciiQuery];

  const seen = new Set<number>();
  const results: TeamSearchResult[] = [];

  for (const comp of FOOTBALL_DATA_COMPETITIONS) {
    const teams = await getCompetitionTeams(comp.code);
    for (const team of teams) {
      if (seen.has(team.id)) continue;
      const nameLower = asciiFold(team.name).toLowerCase();
      if (searchTerms.some((t) => nameLower.includes(t))) {
        seen.add(team.id);
        results.push({ id: team.id, name: team.name, country: team.country, logo: team.crest });
        if (results.length >= 8) return results;
      }
    }
  }

  return results;
}

/** Best-effort crest lookup by name — backfills matches.home_logo_url/
 *  away_logo_url for manually-seeded matches with no externalId to read a
 *  logo off of directly. Reuses searchTeams's cached rosters; returns null
 *  on no-match rather than blocking (the UI falls back to the coloured-
 *  shield placeholder either way). */
export async function fetchTeamLogo(teamName: string): Promise<string | null> {
  const results = await searchTeams(teamName);
  return results[0]?.logo ?? null;
}
