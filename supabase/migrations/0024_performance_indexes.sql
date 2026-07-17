-- =============================================================
-- Migration: 0024_performance_indexes
--
-- Two query patterns that 0016_performance_indexes.sql didn't cover, found
-- during the architecture review:
--
-- getUserBets/getUserStats (lib/profile.ts) filter on creator_id OR
-- opponent_id and ORDER BY created_at desc. The existing single-column
-- bets_creator_idx/bets_opponent_idx (0002_bets.sql) serve the filter via
-- bitmap-OR but don't cover the sort, so Postgres sorts the matched rows in
-- memory. Composite indexes with created_at as the second column let it
-- walk pre-sorted instead.
--
-- getUpcomingMatches (lib/bets.ts, the /bets/new match picker) filters
-- match_status='scheduled' AND kickoff_at > now(), ORDER BY kickoff_at.
-- matches_match_status_idx (0016) covers the status filter alone; a
-- composite index covers both the filter and the sort together.
-- =============================================================

create index if not exists bets_creator_created_idx on public.bets (creator_id, created_at desc);
create index if not exists bets_opponent_created_idx on public.bets (opponent_id, created_at desc);
create index if not exists matches_status_kickoff_idx on public.matches (match_status, kickoff_at);
