-- =============================================================
-- Migration: 0005_team_logos
-- Adds team crest URLs sourced from API-Football (media.api-sports.io).
-- Nullable — manually seeded matches without a lookup fall back to the
-- coloured-shield placeholder in TeamBadge.
-- =============================================================

alter table public.matches
  add column if not exists home_logo_url text,
  add column if not exists away_logo_url text;
