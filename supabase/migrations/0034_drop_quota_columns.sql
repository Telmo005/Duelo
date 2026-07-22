-- Migrated live-score data from API-Football to football-data.org (see
-- lib/sportsData.ts, lib/footballDataClient.ts). The new vendor has no
-- daily request cap — just a flat 10 requests/minute the automatic sync
-- stays nowhere near — so the daily-quota tracking columns migrations 0031
-- and 0032 added (quota_remaining, quota_updated_at, quota_limit,
-- quota_exhausted_notified_at) have no reader left in the codebase. Dropped
-- rather than left as dead columns.
alter table public.live_sync_state
  drop column if exists quota_remaining,
  drop column if exists quota_updated_at,
  drop column if exists quota_limit,
  drop column if exists quota_exhausted_notified_at;
