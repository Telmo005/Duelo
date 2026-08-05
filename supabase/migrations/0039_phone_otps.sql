-- =============================================================
-- Migration: 0039_phone_otps
--
-- One-time SMS codes for phone-number verification at registration (see
-- lib/actions/phoneVerification.ts, lib/phoneOtp.ts, and the OTP step now
-- required before registerUser creates the account in
-- lib/actions/auth.ts). Internal-only, same posture as auth_attempts —
-- never exposed via RLS/PostgREST, read/written exclusively server-side.
--
-- One active code per phone (unique index): requesting a new code
-- overwrites whatever row was pending, so only the latest SMS sent is
-- ever valid. The row is deleted outright on successful verification
-- (single-use) rather than marked "verified" and kept around.
-- =============================================================

create table if not exists public.phone_otps (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  ip text,
  created_at timestamptz not null default now()
);

create unique index if not exists phone_otps_phone_uq on public.phone_otps (phone);

alter table public.phone_otps enable row level security;
-- No select/insert/update/delete policies — internal only, same as
-- auth_attempts/error_log. Accessed exclusively via the service-role
-- Drizzle connection (db/schema.ts's phoneOtps).
