-- Singleton row tracking the automatic live-score sync's own state: when it
-- last actually called the API-Football, and the daily quota remaining as
-- last reported by the vendor (x-ratelimit-requests-remaining response
-- header — the authoritative source, not a self-maintained guess). Lets the
-- sync gate future calls against real, vendor-reported budget without
-- spending a request just to check it.
create table if not exists public.live_sync_state (
  id smallint primary key default 1,
  last_synced_at timestamptz,
  quota_remaining integer,
  quota_updated_at timestamptz,
  quota_exhausted_notified_at timestamptz,
  constraint live_sync_state_singleton check (id = 1)
);

insert into public.live_sync_state (id) values (1) on conflict (id) do nothing;

alter table public.live_sync_state enable row level security;
-- Internal-only, same pattern as admin_audit_log/error_log — no
-- select/insert/update policies for anon/authenticated; read/written only
-- via the service-role client.
