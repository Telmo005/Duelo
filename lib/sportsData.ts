/**
 * API-Football (api-sports.io) client. Settlement/lifecycle (bet_settle_match
 * / bet_void_match / match_advance_lifecycle, see
 * supabase/migrations/0028_match_live_lifecycle.sql) is purely time-based and
 * never calls this file — result entry and the live scoreboard (goals; the
 * minute ticks automatically off kickoff time) are both manual admin input
 * now (lib/actions/matches.ts updateLiveScoreAction). What's left here is
 * fixture import (kickoff time/teams) and the admin's team-search/fixture-
 * search pickers — the only remaining calls to the vendor API, all
 * admin-triggered rather than polled, to stay well inside a Free-plan daily
 * quota (see the 429s that motivated 0028_match_live_lifecycle.sql).
 */

export type FixtureSearchResult = {
  externalId: string;
  home: string;
  away: string;
  homeLogoUrl: string | null;
  awayLogoUrl: string | null;
  league: string;
  leagueId: number;
  /** API-Football's country name for the league (e.g. "England",
   *  "Kazakhstan") — different countries can have identically-named
   *  leagues, so this is what disambiguates them when grouping/displaying
   *  (see lib/leagueTiers.ts groupByLeague). Null on the rare fixture where
   *  the API omits it (e.g. some international/club-friendly entries). */
  country: string | null;
  /** ISO instant — kept raw so the caller decides how to localize/display it
   *  (matches the pattern the rest of the admin match forms already use). */
  kickoffAtIso: string;
  /** Derived from the API's round name (see isEliminationRound below) — true
   *  only for rounds that are always a single decisive match (a final),
   *  never for multi-leg knockout rounds (Round of 16, Quarter/Semi-finals
   *  in club competitions genuinely can and do draw leg-by-leg). Admins can
   *  still correct this by hand after adding (Editar), same as any manually
   *  typed match. */
  isElimination: boolean;
};

type RawFixture = {
  fixture?: { id?: number; date?: string };
  teams?: { home?: { name?: string; logo?: string }; away?: { name?: string; logo?: string } };
  league?: { id?: number; name?: string; round?: string; country?: string };
};

/** Round names API-Football uses that are ALWAYS a single, decisive match
 *  (extra time + penalties if needed, never left drawn) — as opposed to
 *  "Round of 16"/"Quarter-finals"/"Semi-finals" in two-legged club
 *  competitions, where an individual leg frequently DOES end in a draw
 *  (the tie is decided on aggregate, not that match alone). Getting this
 *  wrong in the other direction would be worse than not flagging it at all:
 *  bet_settle_match rejects entering a tied score for an elimination match
 *  (supabase/migrations/0003_settlement.sql), so wrongly marking a
 *  two-legged fixture as elimination would block the admin from recording a
 *  perfectly legitimate 1-1 result. Scoped deliberately narrow —
 *  false negatives just fall back to the existing manual checkbox, which is
 *  always available regardless. */
const ELIMINATION_ROUND_NAMES = new Set(["final", "3rd place final", "final round"]);

function isEliminationRound(round: string | undefined): boolean {
  if (!round) return false;
  return ELIMINATION_ROUND_NAMES.has(round.trim().toLowerCase());
}

/**
 * Lists every real fixture on a single date, across every league
 * API-Football covers. The Free plan blocks fixture queries filtered by
 * `league`+`season` (see lib/fixtures-import.ts's importUpcomingFixtures —
 * that's why automated import is a no-op today), but a bare `date` query
 * IS allowed, within roughly a 3-day rolling window around today — the API
 * itself reports the exact allowed range if you ask outside it, which we
 * surface as `error` rather than guessing a window client-side.
 *
 * Powers the "Procurar jogo real" admin picker: a manual pick-and-autofill
 * flow, not automated import, so it's usable on the Free plan today. Since
 * the API won't let us filter by league without `season`, filtering down to
 * the leagues this product covers happens here, client-of-the-vendor-API
 * side, against `league.id` in the (unfiltered) response.
 */
export async function searchFixturesByDate(date: string): Promise<{ fixtures: FixtureSearchResult[]; error?: string }> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return { fixtures: [], error: "API_FOOTBALL_KEY não está configurada" };

  try {
    const res = await fetch(`https://v3.football.api-sports.io/fixtures?date=${encodeURIComponent(date)}`, {
      headers: { "x-apisports-key": apiKey },
      cache: "no-store",
    });
    if (!res.ok) return { fixtures: [], error: `Pedido falhou (HTTP ${res.status})` };

    const body = await res.json();
    if (body.errors && Object.keys(body.errors).length > 0) {
      const messages = Object.values(body.errors as Record<string, string>);
      return { fixtures: [], error: messages.join(" ") || "A API rejeitou o pedido" };
    }

    const raw: RawFixture[] = body.response ?? [];
    const fixtures = raw
      .map((fx): FixtureSearchResult | null => {
        const externalId = fx.fixture?.id != null ? String(fx.fixture.id) : null;
        const home = fx.teams?.home?.name;
        const away = fx.teams?.away?.name;
        const kickoffAtIso = fx.fixture?.date;
        const leagueId = fx.league?.id;
        const league = fx.league?.name;
        if (!externalId || !home || !away || !kickoffAtIso || leagueId == null || !league) return null;
        return {
          externalId,
          home,
          away,
          league,
          leagueId,
          country: fx.league?.country ?? null,
          kickoffAtIso,
          homeLogoUrl: fx.teams?.home?.logo ?? null,
          awayLogoUrl: fx.teams?.away?.logo ?? null,
          isElimination: isEliminationRound(fx.league?.round),
        };
      })
      .filter((fx): fx is FixtureSearchResult => fx !== null);

    return { fixtures };
  } catch (err) {
    return { fixtures: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Looks up a team's crest URL by name (API-Football team search). Used to
 * backfill matches.home_logo_url/away_logo_url — manually seeded matches
 * have no externalId to read a logo off of directly, so this is a
 * best-effort name match. Returns null on no-match or API failure (the UI
 * falls back to the coloured-shield placeholder either way).
 */
export async function fetchTeamLogo(teamName: string): Promise<string | null> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(`https://v3.football.api-sports.io/teams?search=${encodeURIComponent(teamName)}`, {
      headers: { "x-apisports-key": apiKey },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const body = await res.json();
    const logo: string | undefined = body?.response?.[0]?.team?.logo;
    return logo ?? null;
  } catch {
    return null;
  }
}

export type TeamSearchResult = { id: number; name: string; country: string; logo: string };

/**
 * National teams are searched by their ENGLISH name in API-Football
 * ("France", not "França") — club names usually survive translation fine
 * (Barcelona, Manchester United, Ferroviário read the same or close enough
 * in both languages), but country names very often don't. This is a closed,
 * small set (world's footballing nations), so a lookup table is the right
 * fix — no ambiguity, no guessing, unlike club names which are too numerous
 * and varied to hand-map. Keys are ASCII-folded + lowercased (matches how
 * the query is normalised below) so "frança"/"França"/"FRANÇA" all hit it.
 */
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
 * Live team search (API-Football /teams?search=), for the "pesquisar
 * equipa" picker in the manual add-match form. Exists because guessing a
 * crest from whatever name an admin typed (fetchTeamLogo above) silently
 * fails for two common cases: API-Football rejects non-ASCII characters
 * outright (e.g. "França"), and its database is keyed by English/official
 * names, so a Portuguese name like "Espanha" matches nothing even though
 * "Spain" returns instantly. Letting the admin search and pick the real
 * team sidesteps both — no translation guessing needed for CLUBS. National
 * teams need the extra PT_TO_EN_COUNTRY lookup above, tried first since it's
 * the more likely intent when the query is a bare country name (an admin
 * looking up "França" almost always wants the national team, not some club
 * that happens to be based in France). Free-plan-friendly: this is plain
 * team metadata, not fixture/season data, so it isn't gated behind a paid
 * plan the way current-season fixtures are.
 */
export async function searchTeams(query: string): Promise<TeamSearchResult[]> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey || query.trim().length < 3) return [];

  const asciiQuery = asciiFold(query);
  if (asciiQuery.length < 3) return [];

  const countryTranslation = PT_TO_EN_COUNTRY[asciiQuery.toLowerCase()];
  const searchTerms = countryTranslation ? [countryTranslation, asciiQuery] : [asciiQuery];

  try {
    const seen = new Set<number>();
    const results: TeamSearchResult[] = [];

    for (const term of searchTerms) {
      const res = await fetch(`https://v3.football.api-sports.io/teams?search=${encodeURIComponent(term)}`, {
        headers: { "x-apisports-key": apiKey },
        cache: "no-store",
      });
      if (!res.ok) continue;

      const body = await res.json();
      const response: Array<{ team: { id: number; name: string; country: string; logo: string } }> = body?.response ?? [];
      for (const r of response) {
        if (seen.has(r.team.id)) continue;
        seen.add(r.team.id);
        results.push({ id: r.team.id, name: r.team.name, country: r.team.country, logo: r.team.logo });
      }
      if (results.length >= 8) break;
    }

    return results.slice(0, 8);
  } catch {
    return [];
  }
}
