-- =============================================================
-- Migration: 0004_admin_fraud
-- Admin role gate (ADMIN-01) + same-device/IP self-betting detection
-- (ADMIN-02). Flagging never blocks a bet — flag-and-review is the
-- correct MVP pattern (PITFALLS.md): the platform's own design
-- (guaranteed winner, opposite-side match) creates a real incentive to
-- self-bet for commission-free profit, so this check is table stakes,
-- not optional hardening.
-- =============================================================

alter table public.profiles add column if not exists is_admin boolean not null default false;

alter table public.bets
  add column if not exists creator_ip text,
  add column if not exists creator_device_id text,
  add column if not exists opponent_ip text,
  add column if not exists opponent_device_id text,
  add column if not exists flagged_reason text,
  add column if not exists flagged_at timestamptz;

create index if not exists bets_flagged_idx on public.bets (flagged_at) where flagged_at is not null;

-- ── bet_create (replaces the 0002_bets.sql version) ───────────
-- Now also stores the creator's IP + device fingerprint for later
-- comparison against the opponent's at accept time.
drop function if exists public.bet_create(uuid, uuid, text, bigint);

create or replace function public.bet_create(
  p_creator_id uuid,
  p_match_id uuid,
  p_prediction text,
  p_stake_cents bigint,
  p_creator_ip text default null,
  p_creator_device_id text default null
)
returns table (bet_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet_id uuid := gen_random_uuid();
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

  perform public.wallet_hold(p_creator_id, p_stake_cents, v_bet_id::text, 'Aposta criada');

  insert into public.bets (id, match_id, creator_id, prediction, stake_cents, status, creator_ip, creator_device_id)
  values (v_bet_id, p_match_id, p_creator_id, p_prediction, p_stake_cents, 'waiting', p_creator_ip, p_creator_device_id);

  return query select v_bet_id;
end;
$$;

-- ── bet_accept (replaces the 0002_bets.sql version) ───────────
-- Stores the opponent's IP + device, then flags the bet (without
-- blocking it) if either matches the creator's.
drop function if exists public.bet_accept(uuid, uuid);

create or replace function public.bet_accept(
  p_bet_id uuid,
  p_opponent_id uuid,
  p_opponent_ip text default null,
  p_opponent_device_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet record;
  v_reason text := null;
begin
  select * into v_bet from public.bets where id = p_bet_id for update;

  if not found then
    raise exception 'bet_accept: bet % not found', p_bet_id;
  end if;
  if v_bet.status <> 'waiting' then
    raise exception 'bet_accept: bet is no longer open (status=%)', v_bet.status;
  end if;
  if v_bet.creator_id = p_opponent_id then
    raise exception 'bet_accept: cannot accept your own bet';
  end if;

  perform public.wallet_hold(p_opponent_id, v_bet.stake_cents, p_bet_id::text, 'Aposta aceite');

  if v_bet.creator_device_id is not null and v_bet.creator_device_id = p_opponent_device_id then
    v_reason := 'same_device';
  elsif v_bet.creator_ip is not null and v_bet.creator_ip = p_opponent_ip then
    v_reason := 'same_ip';
  end if;

  update public.bets
    set opponent_id = p_opponent_id, status = 'matched', matched_at = now(),
        opponent_ip = p_opponent_ip, opponent_device_id = p_opponent_device_id,
        flagged_reason = v_reason, flagged_at = case when v_reason is not null then now() else null end
    where id = p_bet_id;
end;
$$;

revoke all on function public.bet_create(uuid, uuid, text, bigint, text, text) from public, anon, authenticated;
revoke all on function public.bet_accept(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.bet_create(uuid, uuid, text, bigint, text, text) to service_role;
grant execute on function public.bet_accept(uuid, uuid, text, text) to service_role;
