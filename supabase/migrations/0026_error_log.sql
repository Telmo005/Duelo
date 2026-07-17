-- =============================================================
-- Migration: 0026_error_log
-- Append-only trail of server-side failures. Before this, every error path
-- (webhook credit failures, cron crashes, rate-limit DB hiccups, client
-- render errors) only reached console.error — ephemeral Vercel function
-- logs, nothing durable or queryable. Written via lib/errorLog.ts, read by
-- the /admin/errors page. Same internal-only pattern as admin_audit_log and
-- auth_attempts: RLS enabled, no policies, service-role/direct-connection
-- only.
-- =============================================================

create table if not exists public.error_log (
  id          uuid        primary key default gen_random_uuid(),
  source      text        not null,
  message     text        not null,
  detail      text,
  created_at  timestamptz not null default now()
);

create index if not exists error_log_created_at_idx
  on public.error_log (created_at desc);

alter table public.error_log enable row level security;
-- No select/insert/update/delete policies for anon/authenticated — internal
-- security/observability control, never exposed through PostgREST.
