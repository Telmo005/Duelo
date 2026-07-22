-- Same dedup pattern as quota_exhausted_notified_at (migration 0031): lets
-- runLiveScoreAutoSync notify the admin once per day when API-Football
-- calls are failing (account suspended, key revoked, vendor outage), instead
-- of only ever showing up in /admin/errors where nobody's necessarily
-- looking. Separate column from quota_exhausted_notified_at because these
-- are different failure classes an admin needs to distinguish at a glance:
-- one means "slow down, budget's tight", the other means "go fix the
-- account, nothing is updating at all".
alter table public.live_sync_state add column if not exists api_error_notified_at timestamptz;
