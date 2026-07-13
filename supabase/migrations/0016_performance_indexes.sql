-- =============================================================
-- Migration: 0016_performance_indexes
--
-- Fills index gaps found in a pagination/performance audit — every
-- existing list query is already LIMIT-bounded (see lib/*.ts), but several
-- filter+sort combinations they use have no matching index, so Postgres
-- falls back to a sequential scan + in-memory sort that gets slower as each
-- table grows. None of these change query results, only how cheaply
-- Postgres can produce them.
-- =============================================================

-- getFeedDuels (home feed) filters bets by status IN ('waiting','matched')
-- and sorts by created_at desc; getRecentBets (admin) sorts the whole table
-- by created_at desc. The existing bets_status_match_idx is (status,
-- match_id) — doesn't help either ORDER BY.
create index if not exists bets_status_created_at_idx
  on public.bets (status, created_at desc);

-- getUnsettledMatches / getProcessedMatches filter matches by match_status
-- with no index at all on that column.
create index if not exists matches_match_status_idx
  on public.matches (match_status);

-- getStuckDeposits (admin) and the reconcile-deposits cron both filter
-- deposits by status IN ('pending','failed') sorted by created_at desc.
-- The existing deposits_user_id_created_at_idx is (user_id, created_at) —
-- doesn't cover a status-only filter.
create index if not exists deposits_status_created_at_idx
  on public.deposits (status, created_at desc);

-- getWalletOverview (admin) sorts every wallet by updated_at desc.
create index if not exists wallets_updated_at_idx
  on public.wallets (updated_at desc);
