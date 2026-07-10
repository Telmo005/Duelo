-- =============================================================
-- Migration: 0002_bets
-- Peer-to-peer bet matching: matches catalogue + bets table +
-- row-locked, SECURITY DEFINER functions that keep the wallet hold
-- and the bet status transition atomic. Same pattern as 0001_wallet:
-- application code must never write bets.status directly — always
-- go through bet_create / bet_accept / bet_cancel.
-- =============================================================

-- matches: fixtures available to bet on. Manually seeded for now —
-- automatic ingestion from a sports-data API is a later phase.
create table if not exists public.matches (
  id          uuid        primary key default gen_random_uuid(),
  home        text        not null,
  away        text        not null,
  league      text        not null,
  kickoff_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

-- bets: one row per P2P bet.
create table if not exists public.bets (
  id            uuid        primary key default gen_random_uuid(),
  match_id      uuid        not null references public.matches(id),
  creator_id    uuid        not null references public.profiles(id),
  opponent_id   uuid        references public.profiles(id),
  prediction    text        not null check (prediction in ('home', 'draw', 'away')),
  stake_cents   bigint      not null check (stake_cents > 0),
  status        text        not null default 'waiting'
                check (status in ('waiting', 'matched', 'cancelled', 'refunded', 'settled')),
  matched_at    timestamptz,
  cancelled_at  timestamptz,
  created_at    timestamptz not null default now(),
  constraint bets_opponent_not_creator check (opponent_id is null or opponent_id <> creator_id)
);

create index if not exists bets_status_match_idx on public.bets (status, match_id);
create index if not exists bets_creator_idx on public.bets (creator_id);
create index if not exists bets_opponent_idx on public.bets (opponent_id);

alter table public.matches enable row level security;
alter table public.bets enable row level security;

create policy "Anyone signed in can read matches"
  on public.matches
  for select
  to authenticated
  using (true);

create policy "Anyone signed in can read bets"
  on public.bets
  for select
  to authenticated
  using (true);

-- No insert/update/delete policies for anon/authenticated on either table —
-- all writes happen inside the SECURITY DEFINER functions below, which are
-- restricted to service_role only (see grants at the bottom).

-- ── bet_create ────────────────────────────────────────────────
-- Locks the creator's stake, then inserts the bet row. If the hold
-- fails (insufficient funds), the whole function aborts and no bet
-- row is ever created — there is no window where a bet exists without
-- its creator's stake actually held.
create or replace function public.bet_create(
  p_creator_id uuid,
  p_match_id uuid,
  p_prediction text,
  p_stake_cents bigint
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

  insert into public.bets (id, match_id, creator_id, prediction, stake_cents, status)
  values (v_bet_id, p_match_id, p_creator_id, p_prediction, p_stake_cents, 'waiting');

  return query select v_bet_id;
end;
$$;

-- ── bet_accept ────────────────────────────────────────────────
-- Row-locks the bet first (`for update`) so two concurrent accept
-- attempts on the SAME bet can't both succeed — the second one blocks
-- until the first commits, then sees status='matched' and aborts.
create or replace function public.bet_accept(
  p_bet_id uuid,
  p_opponent_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet record;
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

  update public.bets
    set opponent_id = p_opponent_id, status = 'matched', matched_at = now()
    where id = p_bet_id;
end;
$$;

-- ── bet_cancel ────────────────────────────────────────────────
-- Only the creator can cancel, and only while still unmatched.
create or replace function public.bet_cancel(
  p_bet_id uuid,
  p_requester_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet record;
begin
  select * into v_bet from public.bets where id = p_bet_id for update;

  if not found then
    raise exception 'bet_cancel: bet % not found', p_bet_id;
  end if;
  if v_bet.creator_id <> p_requester_id then
    raise exception 'bet_cancel: only the creator can cancel this bet';
  end if;
  if v_bet.status <> 'waiting' then
    raise exception 'bet_cancel: bet can only be cancelled while waiting for an opponent (status=%)', v_bet.status;
  end if;

  perform public.wallet_release(v_bet.creator_id, v_bet.stake_cents, p_bet_id::text, 'Aposta cancelada pelo criador');

  update public.bets set status = 'cancelled', cancelled_at = now() where id = p_bet_id;
end;
$$;

-- ── bet_auto_refund_expired ──────────────────────────────────
-- Refunds any 'waiting' bet whose match has already kicked off with
-- no opponent found (BET-06). Not yet wired to a scheduler — call
-- periodically (cron job) once one exists. `skip locked` lets multiple
-- callers run this safely without blocking on each other.
create or replace function public.bet_auto_refund_expired()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet record;
  v_count integer := 0;
begin
  for v_bet in
    select b.* from public.bets b
    join public.matches m on m.id = b.match_id
    where b.status = 'waiting' and m.kickoff_at <= now()
    for update of b skip locked
  loop
    perform public.wallet_release(
      v_bet.creator_id, v_bet.stake_cents, v_bet.id::text,
      'Reembolso automático — sem adversário antes do início do jogo'
    );
    update public.bets set status = 'refunded', cancelled_at = now() where id = v_bet.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ── Lock down execution to service_role only ─────────────────
-- Same reasoning as 0001_wallet: these must only run from trusted
-- server-side code, never directly from an authenticated client —
-- otherwise a client could forge stakes or accept its own bets.
revoke all on function public.bet_create(uuid, uuid, text, bigint) from public, anon, authenticated;
revoke all on function public.bet_accept(uuid, uuid) from public, anon, authenticated;
revoke all on function public.bet_cancel(uuid, uuid) from public, anon, authenticated;
revoke all on function public.bet_auto_refund_expired() from public, anon, authenticated;

grant execute on function public.bet_create(uuid, uuid, text, bigint) to service_role;
grant execute on function public.bet_accept(uuid, uuid) to service_role;
grant execute on function public.bet_cancel(uuid, uuid) to service_role;
grant execute on function public.bet_auto_refund_expired() to service_role;

-- ── Seed a handful of upcoming fixtures ───────────────────────
insert into public.matches (home, away, league, kickoff_at) values
  ('Man United', 'Arsenal', 'Premier League', now() + interval '2 days'),
  ('Barcelona', 'Real Madrid', 'La Liga', now() + interval '3 days'),
  ('PSG', 'Bayern Munich', 'Champions League', now() + interval '4 days'),
  ('Liverpool', 'Chelsea', 'Premier League', now() + interval '1 day'),
  ('Juventus', 'AC Milan', 'Serie A', now() + interval '5 days'),
  ('Dortmund', 'Leipzig', 'Bundesliga', now() + interval '6 days')
on conflict do nothing;
