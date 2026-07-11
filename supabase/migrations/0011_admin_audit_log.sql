-- =============================================================
-- Migration: 0011_admin_audit_log
-- Append-only trail of admin actions. The project requires "auditoria
-- e rastreabilidade completa" for anything touching a user's money or
-- account — an admin resetting a password or manually settling/voiding
-- a match is exactly that kind of action, and previously left zero
-- record of who did it or when.
-- =============================================================

create table if not exists public.admin_audit_log (
  id              uuid        primary key default gen_random_uuid(),
  admin_id        uuid        not null references public.profiles(id),
  action          text        not null,
  target_user_id  uuid        references public.profiles(id),
  detail          text,
  created_at      timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at_idx
  on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;
-- No select/insert/update/delete policies for anon/authenticated — this is
-- an internal security control. Read via the service-role client (already
-- used throughout /admin/* pages) or a direct DB connection; never exposed
-- through PostgREST to a regular authenticated session.
