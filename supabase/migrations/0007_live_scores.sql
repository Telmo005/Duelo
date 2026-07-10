-- =============================================================
-- Migration: 0007_live_scores
-- Live in-play score + minute for a fixture, updated by the
-- /api/cron/update-live-scores poller (API-Football). Display-only —
-- deliberately kept OUT of match_status so it never interferes with
-- settlement (bet_settle_match / bet_void_match require
-- match_status = 'scheduled'). The feed treats a match as "live" when
-- live_updated_at is recent and the match is still unsettled.
-- All nullable; a match with no live data simply shows its kickoff time.
-- =============================================================

alter table public.matches
  add column if not exists live_home int,
  add column if not exists live_away int,
  add column if not exists live_minute int,
  add column if not exists live_updated_at timestamptz;
