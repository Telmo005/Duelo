-- Persists the raw API-Football fixture status code (e.g. 'FT', 'HT', '2H')
-- alongside the live score, so the admin UI can show an unambiguous
-- "Terminado" / "Intervalo" label instead of a bare minute number that keeps
-- ticking (or looks like it should) even after the real match has ended.
-- Null for manually-entered scores (updateLiveScoreAction clears it, since a
-- manual override makes any previously-fetched API status stale) and for
-- matches never linked to the API at all.
alter table public.matches add column if not exists live_status_code text;
