/**
 * Shared competition-prestige ranking — used both to order league groups in
 * the feed (components/feed/duel-feed.tsx, components/feed/match-catalog.tsx,
 * components/bets/create-bet-form.tsx) and to sort fixtures in the admin
 * "Procurar jogo real" picker (components/admin/fixture-search-picker.tsx),
 * so "melhor liga primeiro" means the same thing in both places instead of
 * two separately-maintained orderings drifting apart.
 *
 * Each inner array is one tier (same rank); lower tier index = higher
 * priority. Includes both the Portuguese names this app's own seed data /
 * manual admin entry uses ("Mundial") and the English names API-Football
 * returns ("World Cup") for the same competition, since a league group in
 * the feed can be populated by either source. Matching is case-insensitive.
 * Anything not listed falls back after every tier here, in whatever order
 * it already had (recency in the feed, arrival order in the fixture
 * picker) — a newly-encountered competition never needs this list touched
 * just to show up.
 *
 * A tier entry can be a bare name (matches by name alone, for competitions
 * whose name is effectively unique — "Champions League", "Moçambola") or a
 * { name, country } pair (matches ONLY when the country also matches) — for
 * names that different countries' domestic leagues reuse. Real example
 * this app hit: England's "Premier League" and Kazakhstan's are both
 * literally named "Premier League" in API-Football's data. Without the
 * country qualifier, whichever one showed up would borrow the other's
 * top-tier prestige. A same-named league with no country match (or no
 * country known at all, e.g. a manually-typed entry) falls through to the
 * ordinary fallback rank rather than silently inheriting the qualified
 * tier.
 */
type TierEntry = string | { name: string; country: string };

const LEAGUE_TIERS: TierEntry[][] = [
  ["Moçambola"], // flagship local league this product is built around — always first
  ["World Cup", "Mundial", "Copa do Mundo", "FIFA World Cup"],
  ["UEFA Euro Championship", "Euro Championship", "Campeonato Europeu", "Copa América", "Copa America", "Africa Cup of Nations", "AFCON"],
  ["UEFA Champions League", "Champions League", "Liga dos Campeões"],
  [{ name: "Premier League", country: "England" }],
  [{ name: "La Liga", country: "Spain" }],
  ["Serie A", "Bundesliga", "Ligue 1"],
  ["UEFA Europa League", "Europa League", "UEFA Europa Conference League", "Europa Conference League"],
  ["Copa Libertadores", "CAF Champions League"],
];

const RANK_BY_KEY = new Map<string, number>();
LEAGUE_TIERS.forEach((tier, rank) => {
  for (const entry of tier) {
    if (typeof entry === "string") {
      RANK_BY_KEY.set(entry.toLowerCase(), rank);
    } else {
      // Qualified entries are keyed "name|country" ONLY — deliberately no
      // bare-name key, so a same-named league from elsewhere doesn't match
      // here at all (see fallback-to-FALLBACK_RANK behaviour below).
      RANK_BY_KEY.set(`${entry.name.toLowerCase()}|${entry.country.toLowerCase()}`, rank);
    }
  }
});

const FALLBACK_RANK = LEAGUE_TIERS.length;

export function leagueRank(league: string, country?: string | null): number {
  const name = league.trim().toLowerCase();
  if (country) {
    const qualified = RANK_BY_KEY.get(`${name}|${country.trim().toLowerCase()}`);
    if (qualified !== undefined) return qualified;
  }
  return RANK_BY_KEY.get(name) ?? FALLBACK_RANK;
}

export type LeagueGroupable = { league: string; leagueId?: number | null; country?: string | null };

/**
 * Groups items by league IDENTITY — leagueId when the item has one
 * (API-sourced matches), otherwise the name string (manually-seeded
 * matches, which have no vendor ID to key off of). Two groups whose NAME
 * collides but whose identity differs (two different "Premier League"s)
 * get a disambiguated label — "Premier League (England)" — instead of
 * silently merging into one section; a name with no collision stays exactly
 * as-is, no clutter. Groups are returned already sorted by leagueRank.
 *
 * `getInfo` extracts the {league, leagueId, country} triple from whatever
 * shape the caller's items are — a Duel keeps them nested under `.match`,
 * a CatalogMatch/MatchOption has them at the top level — rather than
 * forcing every caller to pre-map into a common shape first.
 */
export function groupByLeague<T>(items: T[], getInfo: (item: T) => LeagueGroupable): [string, T[]][] {
  const byKey = new Map<string, T[]>();
  const infoByItem = new Map<T, LeagueGroupable>();
  for (const item of items) {
    const info = getInfo(item);
    infoByItem.set(item, info);
    const key = info.leagueId != null ? `id:${info.leagueId}` : `name:${info.league}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(item);
  }

  // A name is ambiguous only if 2+ DIFFERENT identity keys share it.
  const keysByName = new Map<string, Set<string>>();
  for (const [key, group] of byKey) {
    const name = infoByItem.get(group[0])!.league;
    if (!keysByName.has(name)) keysByName.set(name, new Set());
    keysByName.get(name)!.add(key);
  }

  return [...byKey.values()]
    .map((group) => {
      const first = infoByItem.get(group[0])!;
      const ambiguous = (keysByName.get(first.league)?.size ?? 0) > 1;
      const label = ambiguous && first.country ? `${first.league} (${first.country})` : first.league;
      return { label, group, rank: leagueRank(first.league, first.country) };
    })
    .sort((a, b) => a.rank - b.rank)
    .map(({ label, group }): [string, T[]] => [label, group]);
}
