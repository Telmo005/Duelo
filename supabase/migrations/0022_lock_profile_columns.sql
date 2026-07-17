-- =============================================================
-- Migration: 0022_lock_profile_columns
--
-- CRITICAL: the original "Owner can update own profile" RLS policy
-- (0000_profiles.sql) authorizes UPDATE on the entire row, and Supabase's
-- default grants give `authenticated` UPDATE on every column of
-- `profiles` — including `is_admin`, added later in 0004_admin_fraud.sql
-- without ever revisiting this. RLS only checks WHICH ROW you can touch
-- (your own), never WHICH COLUMNS — so any authenticated user can call
-- PATCH /rest/v1/profiles?id=eq.<their-own-id> with {"is_admin": true}
-- using the public anon key + their own session token, and grant
-- themselves full admin access (settle matches, reset other users'
-- passwords, approve withdrawals).
--
-- Fix: revoke UPDATE entirely for authenticated/anon, then grant it back
-- only on the one column the app actually needs self-service editable
-- (display_name, see components/profile/editable-display-name.tsx). Every
-- other write to `profiles` in the app (registerUser, admin actions)
-- already goes through Drizzle on a direct service-role connection, which
-- bypasses PostgREST/RLS entirely — so this doesn't touch any real path.
-- =============================================================

revoke update on public.profiles from authenticated, anon;
grant update (display_name) on public.profiles to authenticated;
