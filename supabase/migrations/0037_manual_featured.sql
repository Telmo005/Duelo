-- =============================================================
-- Migration: 0037_manual_featured
--
-- Lets an admin manually pin a match into the feed's "Destaques" strip
-- (components/feed/match-catalog.tsx), on top of the automatic pick
-- (live first, then league prestige, then soonest kickoff). A manual pin
-- always wins a slot regardless of what the algorithm would have picked —
-- the admin knows things the algorithm can't (a local derby getting real
-- attention, a marketing push for a specific match) that competition
-- prestige + kickoff time alone can't capture.
-- =============================================================

alter table public.matches add column if not exists featured boolean not null default false;
