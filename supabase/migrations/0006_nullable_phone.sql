-- =============================================================
-- Migration: 0006_nullable_phone
-- Google OAuth users have no phone number at signup — the callback
-- (app/auth/callback/route.ts) inserts phone: null for them, which
-- violated the NOT NULL constraint from 0000_profiles.sql and silently
-- broke "Entrar com Google" after the Google auth step succeeded.
-- The unique constraint still holds (multiple NULLs are allowed under
-- standard SQL unique semantics), so phone-based accounts are unaffected.
-- =============================================================

alter table public.profiles alter column phone drop not null;
