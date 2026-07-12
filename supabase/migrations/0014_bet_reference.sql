-- =============================================================
-- Migration: 0014_bet_reference
--
-- Adds a short, human-readable reference to every bet (DUE-BET-XXXXXXXX,
-- derived from the bet's own id). Shown on the post-creation receipt and
-- on the shareable bet page — the same "give the user a code they can
-- quote" pattern deposits already use (DUE-DEP-...). Because it's derived
-- from the bet's id (not a separate random value), looking a bet up by
-- reference and by id both land on the same row, which is what makes it
-- useful for support/audit ("qual é a referência da tua aposta?").
-- =============================================================

alter table public.bets add column if not exists reference text;

-- Backfill any pre-existing rows (none expected in a fresh project, but
-- keeps this migration safe to run against a populated database too).
update public.bets
  set reference = 'DUE-BET-' || upper(substr(replace(id::text, '-', ''), 1, 8))
  where reference is null;

alter table public.bets alter column reference set not null;
create unique index if not exists bets_reference_uniq on public.bets (reference);

-- ── bet_create (replaces the 0004_admin_fraud.sql version) ────
-- Same behaviour, plus: generates and returns the reference.
drop function if exists public.bet_create(uuid, uuid, text, bigint, text, text);

create or replace function public.bet_create(
  p_creator_id uuid,
  p_match_id uuid,
  p_prediction text,
  p_stake_cents bigint,
  p_creator_ip text default null,
  p_creator_device_id text default null
)
returns table (bet_id uuid, reference text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet_id uuid := gen_random_uuid();
  v_reference text;
  v_kickoff timestamptz;
begin
  if p_prediction not in ('home', 'draw', 'away') then
    raise exception 'bet_create: invalid prediction %', p_prediction;
  end if;
  if p_stake_cents <= 0 then
    raise exception 'bet_create: stake must be positive (got %)', p_stake_cents;
  end if;

  select kickoff_at into v_kickoff from public.matches where id = p_match_id;
  if not found then
    raise exception 'bet_create: match % not found', p_match_id;
  end if;
  if v_kickoff <= now() then
    raise exception 'bet_create: match has already started';
  end if;

  v_reference := 'DUE-BET-' || upper(substr(replace(v_bet_id::text, '-', ''), 1, 8));

  perform public.wallet_hold(p_creator_id, p_stake_cents, v_bet_id::text, 'Aposta criada');

  insert into public.bets (id, match_id, creator_id, prediction, stake_cents, status, creator_ip, creator_device_id, reference)
  values (v_bet_id, p_match_id, p_creator_id, p_prediction, p_stake_cents, 'waiting', p_creator_ip, p_creator_device_id, v_reference);

  return query select v_bet_id, v_reference;
end;
$$;

revoke all on function public.bet_create(uuid, uuid, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.bet_create(uuid, uuid, text, bigint, text, text) to service_role;
