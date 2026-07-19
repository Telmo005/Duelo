-- =============================================================
-- Migration: 0029_live_minute_clock
--
-- Fixes two problems with the manual live-minute tracker introduced in
-- migration 0007 / updateLiveScoreAction:
--
-- 1. Once an admin entered a minute (e.g. "45" at half-time), it froze
--    forever — computeElapsedMinuteLabel only ever falls back to it when
--    live_minute IS NULL, so a manually-set minute never advanced again.
--    The admin wants it to keep counting up in real time from whatever
--    they last entered ("quando eu actualizar a contagem deve continuar
--    daí"), not sit frozen at a stale number.
-- 2. There was no way to pause the clock for a real break (half-time,
--    injury delay) without it either freezing wrong (already covered by
--    the bug above) or being cleared back to the raw kickoff-based clock.
--
-- live_minute_anchor_at: the real-world timestamp live_minute was last set
-- to. When live_paused is false, the displayed minute is
-- live_minute + minutes elapsed since this anchor — a real ticking clock
-- anchored to an admin-confirmed checkpoint instead of purely kickoff_at.
-- live_paused: when true, the clock is frozen at live_minute exactly
-- (half-time / any other break) regardless of how much real time passes.
-- =============================================================

alter table public.matches
  add column if not exists live_minute_anchor_at timestamptz,
  add column if not exists live_paused boolean not null default false;
