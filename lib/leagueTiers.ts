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
 * manual admin entry uses ("Mundial") and the English names football-data.org
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
 * literally named "Premier League" in football data. Without the
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
  // Explicit correction: Portugal's Primeira Liga sits below the "big 5"
  // domestic leagues above but ahead of everything else with no tier of its
  // own — including Brasileirão, which otherwise ranks identically to it
  // (both fall to FALLBACK_RANK with no entry here at all).
  [{ name: "Primeira Liga", country: "Portugal" }],
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

export type FeaturePriorityInfo = {
  league: string;
  country?: string | null;
  kickoffAtIso: string;
  /** Absent or 'scheduled' counts as not-live. Matches the bet-creation
   *  picker's own list (getUpcomingMatches only ever returns 'scheduled'
   *  fixtures — a match that's kicked off is no longer offered there at
   *  all), so this field is optional rather than forcing every caller to
   *  carry a status they'll never actually vary. */
  matchStatus?: string;
  /** Admin manual pin — see toggleMatchFeaturedAction. */
  featured?: boolean;
};

const FEATURED_HORIZON_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Picks the "worth featuring right now" set — shared by the feed's
 * Destaques strip (components/feed/match-catalog.tsx), the "Apostas" tab
 * (duel-feed.tsx), and the bet-creation wizard's match step
 * (create-bet-form.tsx), so "featured" means exactly the same selection
 * everywhere instead of several ranking algorithms quietly drifting apart.
 * Same `getInfo` extractor pattern as groupByLeague above, for the same
 * reason: a feed CatalogMatch and a wizard MatchOption don't share a
 * common shape.
 *
 * Included: every admin manual pin (info.featured — no horizon limit,
 * reaching further out is the whole point of overriding the algorithm by
 * hand), plus anything live/needs_review, plus anything scheduled within
 * the next 7 days (so a top-tier match still weeks away doesn't crowd out
 * something worth tapping into today). No cap on how many can show —
 * Destaques is a horizontally-scrollable strip, not a fixed set of slots.
 *
 * Ordered purely by kickoff time — a live/already-started match's kickoff
 * is already in the past, so it naturally sorts to the front on its own,
 * without needing a separate "live first" rule. League prestige plays no
 * role in the order (only lib/leagueTiers.ts's groupByLeague uses it) —
 * Destaques is meant to read as "what's on today and next," not "what's
 * the most prestigious."
 */
export function pickFeatured<T>(items: T[], now: number, getInfo: (item: T) => FeaturePriorityInfo): T[] {
  return items
    .filter((item) => {
      const info = getInfo(item);
      if (info.featured) return true;
      if (info.matchStatus && info.matchStatus !== "scheduled") return true;
      return new Date(info.kickoffAtIso).getTime() - now <= FEATURED_HORIZON_MS;
    })
    .sort((a, b) => new Date(getInfo(a).kickoffAtIso).getTime() - new Date(getInfo(b).kickoffAtIso).getTime());
}
