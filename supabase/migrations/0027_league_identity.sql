-- =============================================================
-- Migration: 0027_league_identity
--
-- Product bug: the feed/catalogue group matches by `matches.league` (a
-- display NAME string). Different countries' leagues can share the exact
-- same name — e.g. England's "Premier League" and Kazakhstan's — so two
-- unrelated competitions were silently merging into one section, with no
-- way to tell them apart. Adding the vendor's real league identity
-- (league_id) plus its country lets the app group by identity and only
-- fall back to disambiguating the display label ("Premier League
-- (England)") when two DIFFERENT leagues genuinely share a name.
-- =============================================================

alter table public.matches add column if not exists league_id integer;
alter table public.matches add column if not exists country text;

comment on column public.matches.league_id is
  'API-Football numeric league ID. Null for manually seeded matches (Moçambola etc).';
comment on column public.matches.country is
  'API-Football country name for the league. Null for manually seeded matches.';
