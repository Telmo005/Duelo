/**
 * API-Football (api-sports.io) client — fetches the official result for a
 * single fixture by its external ID. Settlement logic (bet_settle_match /
 * bet_void_match, see supabase/migrations/0003_settlement.sql) is
 * source-agnostic: it only reads from our own `matches` table, so this is
 * the one place that talks to the vendor API. Swapping providers later
 * only touches this file.
 */

export type FixtureResult =
  | { status: "finished"; homeGoals: number; awayGoals: number }
  | { status: "postponed" | "abandoned" }
  | { status: "in_progress" | "scheduled" | "unknown" };

const FINISHED_CODES = new Set(["FT", "AET", "PEN"]);
const VOID_CODES: Record<string, "postponed" | "abandoned"> = {
  PST: "postponed",
  CANC: "postponed",
  ABD: "abandoned",
  WO: "abandoned",
  AWD: "abandoned",
};

export async function fetchFixtureResult(externalId: string): Promise<FixtureResult> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    throw new Error("API_FOOTBALL_KEY is not set");
  }

  const res = await fetch(`https://v3.football.api-sports.io/fixtures?id=${encodeURIComponent(externalId)}`, {
    headers: { "x-apisports-key": apiKey },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`API-Football request failed: ${res.status}`);
  }

  const body = await res.json();
  const fixture = body?.response?.[0];
  if (!fixture) {
    return { status: "unknown" };
  }

  const shortStatus: string = fixture.fixture?.status?.short ?? "";

  if (FINISHED_CODES.has(shortStatus)) {
    const homeGoals = fixture.goals?.home;
    const awayGoals = fixture.goals?.away;
    if (typeof homeGoals !== "number" || typeof awayGoals !== "number") {
      return { status: "unknown" };
    }
    return { status: "finished", homeGoals, awayGoals };
  }

  if (shortStatus in VOID_CODES) {
    return { status: VOID_CODES[shortStatus] };
  }

  if (shortStatus === "NS") {
    return { status: "scheduled" };
  }

  return { status: "in_progress" };
}

export type FixtureLive =
  | { state: "live"; homeGoals: number; awayGoals: number; minute: number | null; short: string }
  | { state: "not_live"; short: string };

/** API-Football short-status codes that mean the match is currently being played
 *  (or paused mid-match). Anything else — NS/FT/PST/… — is "not live". */
const IN_PLAY_CODES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"]);

/**
 * Fetches the *live* score + elapsed minute for an in-play fixture. Unlike
 * fetchFixtureResult (which drives settlement and only cares about the final
 * result), this feeds the live scoreboard on the feed. Returns state
 * "not_live" for anything not currently being played — the caller then leaves
 * the match's live columns untouched.
 */
export async function fetchFixtureLive(externalId: string): Promise<FixtureLive> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) throw new Error("API_FOOTBALL_KEY is not set");

  const res = await fetch(`https://v3.football.api-sports.io/fixtures?id=${encodeURIComponent(externalId)}`, {
    headers: { "x-apisports-key": apiKey },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API-Football request failed: ${res.status}`);

  const body = await res.json();
  const fixture = body?.response?.[0];
  const short: string = fixture?.fixture?.status?.short ?? "";
  if (!fixture || !IN_PLAY_CODES.has(short)) return { state: "not_live", short };

  const homeGoals = typeof fixture.goals?.home === "number" ? fixture.goals.home : 0;
  const awayGoals = typeof fixture.goals?.away === "number" ? fixture.goals.away : 0;
  const minute = typeof fixture.fixture?.status?.elapsed === "number" ? fixture.fixture.status.elapsed : null;
  return { state: "live", homeGoals, awayGoals, minute, short };
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
 * Live team search (API-Football /teams?search=), for the "pesquisar
 * equipa" picker in the manual add-match form. Exists because guessing a
 * crest from whatever name an admin typed (fetchTeamLogo above) silently
 * fails for two common cases: API-Football rejects non-ASCII characters
 * outright (e.g. "França"), and its database is keyed by English/official
 * names, so a Portuguese name like "Espanha" matches nothing even though
 * "Spain" returns instantly. Letting the admin search and pick the real
 * team sidesteps both — no translation guessing needed. Free-plan-friendly:
 * this is plain team metadata, not fixture/season data, so it isn't gated
 * behind a paid plan the way current-season fixtures are.
 */
export async function searchTeams(query: string): Promise<TeamSearchResult[]> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey || query.trim().length < 3) return [];

  // API-Football's search param rejects anything but letters/digits/spaces
  // (e.g. "ç", accents) with a 400 — strip to ASCII letters/spaces so a
  // Portuguese-flavoured query still gets a best-effort match instead of
  // erroring out silently.
  const asciiQuery = query
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining diacritical marks (accents) left behind by NFD
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim();
  if (asciiQuery.length < 3) return [];

  try {
    const res = await fetch(`https://v3.football.api-sports.io/teams?search=${encodeURIComponent(asciiQuery)}`, {
      headers: { "x-apisports-key": apiKey },
      cache: "no-store",
    });
    if (!res.ok) return [];

    const body = await res.json();
    const response: Array<{ team: { id: number; name: string; country: string; logo: string } }> = body?.response ?? [];
    return response.slice(0, 8).map((r) => ({
      id: r.team.id,
      name: r.team.name,
      country: r.team.country,
      logo: r.team.logo,
    }));
  } catch {
    return [];
  }
}
