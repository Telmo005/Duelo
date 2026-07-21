-- Persists the daily request LIMIT alongside the remaining count already
-- tracked in live_sync_state (migration 0031) — both read from the same
-- x-ratelimit-requests-* response headers on every API-Football call (see
-- lib/apiFootballClient.ts). Having the real limit on file means the admin
-- UI can show "41/100" without hardcoding 100, which would silently go
-- stale if the plan is ever upgraded.
alter table public.live_sync_state add column if not exists quota_limit integer;
