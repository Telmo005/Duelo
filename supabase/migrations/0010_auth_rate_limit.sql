-- =============================================================
-- Migration: 0010_auth_rate_limit
-- Login brute-force protection. The synthetic-email identity
-- (p<digits>@duelo.mz) is trivially derivable from any known phone
-- number, so the password itself is the only real secret — this table
-- backs a simple sliding-window lockout on signIn (see lib/rateLimit.ts).
-- Postgres-backed rather than Redis/in-memory: no Redis is provisioned
-- yet (see STACK.md), and this is a low-volume, correctness-sensitive
-- check that's fine as a normal indexed table for MVP scale.
-- =============================================================

create table if not exists public.auth_attempts (
  id          uuid        primary key default gen_random_uuid(),
  phone       text        not null,
  ip          text,
  success     boolean     not null,
  created_at  timestamptz not null default now()
);

create index if not exists auth_attempts_phone_created_at_idx
  on public.auth_attempts (phone, created_at desc);
create index if not exists auth_attempts_ip_created_at_idx
  on public.auth_attempts (ip, created_at desc);

alter table public.auth_attempts enable row level security;
-- No select/insert/update/delete policies for anon/authenticated — this is
-- an internal security control, never read or written by client code
-- directly. Only the service-role client (see lib/rateLimit.ts) touches it.
