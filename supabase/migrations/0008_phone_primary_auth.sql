-- =============================================================
-- Migration: 0008_phone_primary_auth
-- Switches phone to the primary auth identity (phone + password).
-- Email becomes optional — only ever populated via the (currently
-- hidden) Google OAuth path, which supplies one. New registrations no
-- longer collect or require an email at all.
-- =============================================================

alter table public.profiles
  alter column email drop not null;
