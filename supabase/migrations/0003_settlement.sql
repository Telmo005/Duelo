-- =============================================================
-- Migration: 0003_settlement
-- Automatic settlement: match results + payout (pot - 10% commission)
-- + void handling for postponed/abandoned fixtures. Same pattern as
-- prior migrations — all mutation happens inside SECURITY DEFINER
-- functions restricted to service_role, with row locks for atomicity
-- and idempotency guards so a fixture is never settled twice.
-- =============================================================

alter table public.matches
  add column if not exists external_id text unique,
  add column if not exists result_home bigint,
  add column if not exists result_away bigint,
  add column if not exists match_status text not null default 'scheduled'
    check (match_status in ('scheduled', 'finished', 'postponed', 'abandoned')),
  add column if not exists settled_at timestamptz;

-- Allow the new ledger entry types written by wallet_settle below.
alter table public.wallet_ledger drop constraint if exists wallet_ledger_type_check;
alter table public.wallet_ledger add constraint wallet_ledger_type_check
  check (type in ('deposit', 'hold', 'release', 'settle_win', 'settle_loss'));

-- platform_ledger: one row per settled bet's 10% commission. Separate
-- from wallet_ledger, which only ever records movements to a user's
-- own available/locked buckets — commission belongs to the platform,
-- not to either bettor.
create table if not exists public.platform_ledger (
  id          uuid        primary key default gen_random_uuid(),
  bet_id      uuid        not null references public.bets(id),
  match_id    uuid        not null references public.matches(id),
  amount_cents bigint     not null check (amount_cents >= 0),
  created_at  timestamptz not null default now()
);

alter table public.platform_ledger enable row level security;
-- No select/insert/update/delete policies for anon/authenticated — this is
-- platform revenue data, not user-owned. service_role bypasses RLS by
-- design, so the Phase 5 admin panel can read it via the service client.

-- ── wallet_settle ─────────────────────────────────────────────
-- Moves money between TWO wallets (unlike hold/release, which only ever
-- touch one). Locks both wallet rows in a consistent order (lower uuid
-- first) so two concurrent settlements can never deadlock against each
-- other by locking the same pair of wallets in opposite order.
create or replace function public.wallet_settle(
  p_winner_id uuid,
  p_loser_id uuid,
  p_stake_cents bigint,
  p_payout_cents bigint,
  p_bet_id uuid,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first uuid;
  v_second uuid;
begin
  if p_stake_cents <= 0 or p_payout_cents <= 0 then
    raise exception 'wallet_settle: amounts must be positive';
  end if;

  if p_winner_id < p_loser_id then
    v_first := p_winner_id; v_second := p_loser_id;
  else
    v_first := p_loser_id; v_second := p_winner_id;
  end if;

  perform 1 from public.wallets where user_id = v_first for update;
  perform 1 from public.wallets where user_id = v_second for update;

  -- Loser: their held stake leaves the system entirely (it funds the
  -- winner's payout + platform commission) — it does not return to them.
  update public.wallets
    set locked_cents = locked_cents - p_stake_cents, updated_at = now()
    where user_id = p_loser_id;

  insert into public.wallet_ledger (
    user_id, type, available_delta_cents, locked_delta_cents,
    available_after_cents, locked_after_cents, reference, description
  )
  select p_loser_id, 'settle_loss', 0, -p_stake_cents, available_cents, locked_cents, p_bet_id::text, p_description
  from public.wallets where user_id = p_loser_id;

  -- Winner: their own held stake is released, plus the payout (their
  -- stake back + the loser's stake minus commission) lands in available.
  update public.wallets
    set locked_cents = locked_cents - p_stake_cents,
        available_cents = available_cents + p_payout_cents,
        updated_at = now()
    where user_id = p_winner_id;

  insert into public.wallet_ledger (
    user_id, type, available_delta_cents, locked_delta_cents,
    available_after_cents, locked_after_cents, reference, description
  )
  select p_winner_id, 'settle_win', p_payout_cents, -p_stake_cents, available_cents, locked_cents, p_bet_id::text, p_description
  from public.wallets where user_id = p_winner_id;
end;
$$;

-- ── bet_settle_match ──────────────────────────────────────────
-- Idempotent per fixture: locks the match row first and requires
-- match_status = 'scheduled', so calling this twice on the same match
-- (e.g. a retried cron tick) raises instead of double-paying.
-- Winner is determined by the founder's design decision that the
-- opponent always bets AGAINST the creator's specific prediction, not
-- for a specific alternative outcome — so the rule is simply "creator's
-- prediction matched the result -> creator wins, otherwise opponent wins".
create or replace function public.bet_settle_match(
  p_match_id uuid,
  p_result_home integer,
  p_result_away integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match record;
  v_bet record;
  v_actual text;
  v_winner uuid;
  v_loser uuid;
  v_pot bigint;
  v_commission bigint;
  v_payout bigint;
  v_count integer := 0;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'bet_settle_match: match % not found', p_match_id;
  end if;
  if v_match.match_status <> 'scheduled' then
    raise exception 'bet_settle_match: match already processed (status=%)', v_match.match_status;
  end if;

  if p_result_home > p_result_away then
    v_actual := 'home';
  elsif p_result_home < p_result_away then
    v_actual := 'away';
  else
    v_actual := 'draw';
  end if;

  update public.matches
    set result_home = p_result_home, result_away = p_result_away,
        match_status = 'finished', settled_at = now()
    where id = p_match_id;

  for v_bet in
    select * from public.bets where match_id = p_match_id and status = 'matched' for update
  loop
    if v_bet.prediction = v_actual then
      v_winner := v_bet.creator_id;
      v_loser := v_bet.opponent_id;
    else
      v_winner := v_bet.opponent_id;
      v_loser := v_bet.creator_id;
    end if;

    v_pot := v_bet.stake_cents * 2;
    v_commission := round(v_pot * 0.10);
    v_payout := v_pot - v_commission;

    perform public.wallet_settle(
      v_winner, v_loser, v_bet.stake_cents, v_payout, v_bet.id,
      'Liquidação automática — pote menos 10% de comissão'
    );

    insert into public.platform_ledger (bet_id, match_id, amount_cents)
    values (v_bet.id, p_match_id, v_commission);

    update public.bets set status = 'settled' where id = v_bet.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ── bet_void_match ────────────────────────────────────────────
-- Postponed/abandoned fixture (SETL-04): refund both stakes in full,
-- no commission. Also idempotent via the same match_status guard.
create or replace function public.bet_void_match(
  p_match_id uuid,
  p_status text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match record;
  v_bet record;
  v_count integer := 0;
begin
  if p_status not in ('postponed', 'abandoned') then
    raise exception 'bet_void_match: invalid status %', p_status;
  end if;

  select * into v_match from public.matches where id = p_match_id for update;
  if not found then
    raise exception 'bet_void_match: match % not found', p_match_id;
  end if;
  if v_match.match_status <> 'scheduled' then
    raise exception 'bet_void_match: match already processed (status=%)', v_match.match_status;
  end if;

  update public.matches set match_status = p_status, settled_at = now() where id = p_match_id;

  for v_bet in
    select * from public.bets where match_id = p_match_id and status = 'matched' for update
  loop
    perform public.wallet_release(v_bet.creator_id, v_bet.stake_cents, v_bet.id::text, 'Jogo adiado/abandonado — reembolso');
    perform public.wallet_release(v_bet.opponent_id, v_bet.stake_cents, v_bet.id::text, 'Jogo adiado/abandonado — reembolso');
    update public.bets set status = 'refunded' where id = v_bet.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ── Lock down execution to service_role only ─────────────────
revoke all on function public.wallet_settle(uuid, uuid, bigint, bigint, uuid, text) from public, anon, authenticated;
revoke all on function public.bet_settle_match(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.bet_void_match(uuid, text) from public, anon, authenticated;

grant execute on function public.wallet_settle(uuid, uuid, bigint, bigint, uuid, text) to service_role;
grant execute on function public.bet_settle_match(uuid, integer, integer) to service_role;
grant execute on function public.bet_void_match(uuid, text) to service_role;
