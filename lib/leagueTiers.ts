/**
 * Shared competition-prestige ranking — used both to order league groups in
 * the feed (components/feed/duel-feed.tsx) and to sort fixtures in the
 * admin "Procurar jogo real" picker (components/admin/fixture-search-picker.tsx),
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
 */
const LEAGUE_TIERS: string[][] = [
  ["Moçambola"], // flagship local league this product is built around — always first
  ["World Cup", "Mundial", "Copa do Mundo", "FIFA World Cup"],
  ["UEFA Euro Championship", "Euro Championship", "Campeonato Europeu", "Copa América", "Copa America", "Africa Cup of Nations", "AFCON"],
  ["UEFA Champions League", "Champions League", "Liga dos Campeões"],
  ["Premier League"],
  ["La Liga"],
  ["Serie A", "Bundesliga", "Ligue 1"],
  ["UEFA Europa League", "Europa League", "UEFA Europa Conference League", "Europa Conference League"],
  ["Copa Libertadores", "CAF Champions League"],
];

const RANK_BY_NAME = new Map<string, number>();
LEAGUE_TIERS.forEach((tier, rank) => {
  for (const name of tier) RANK_BY_NAME.set(name.toLowerCase(), rank);
});

const FALLBACK_RANK = LEAGUE_TIERS.length;

export function leagueRank(league: string): number {
  return RANK_BY_NAME.get(league.trim().toLowerCase()) ?? FALLBACK_RANK;
}
