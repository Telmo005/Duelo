-- =============================================================
-- Migration: 0015_remove_seed_matches
--
-- Removes the 6 placeholder fixtures inserted by 0002_bets.sql's seed
-- insert (Man United/Arsenal, Barcelona/Real Madrid, PSG/Bayern Munich,
-- Liverpool/Chelsea, Juventus/AC Milan, Dortmund/Leipzig). Those were
-- fine for early development but the product is going to production —
-- the match list must only ever show real fixtures (manually entered via
-- /admin or, once API-Football is upgraded off its Free plan, imported by
-- app/api/cron/import-fixtures). Scoped by external_id IS NULL (no seed
-- row was ever linked to a real fixture) so this can never delete a real
-- match, and by name+league so it can never touch a real match that
-- happens to share a null external_id for some other reason in the future.
-- =============================================================

delete from public.matches
where external_id is null
  and (home, away, league) in (
    ('Man United', 'Arsenal', 'Premier League'),
    ('Barcelona', 'Real Madrid', 'La Liga'),
    ('PSG', 'Bayern Munich', 'Champions League'),
    ('Liverpool', 'Chelsea', 'Premier League'),
    ('Juventus', 'AC Milan', 'Serie A'),
    ('Dortmund', 'Leipzig', 'Bundesliga')
  );
