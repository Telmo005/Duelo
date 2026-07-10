-- =============================================================
-- Migration: 0001_wallet
-- Wallet + append-only ledger with row-locked, SECURITY DEFINER
-- mutation functions. This is the ONLY safe way to move balance —
-- application code must never read-then-write available/locked
-- columns directly (that reintroduces the double-spend race
-- condition this migration exists to prevent).
-- =============================================================

-- wallets: one row per user. Cached balances only — source of truth
-- is wallet_ledger. Non-negative constraints are a belt-and-suspenders
-- backstop; the functions below never let them go negative anyway.
create table if not exists public.wallets (
  user_id         uuid        primary key references public.profiles(id) on delete cascade,
  available_cents bigint     not null default 0,
  locked_cents    bigint      not null default 0,
  updated_at      timestamptz not null default now(),
  constraint wallets_available_non_negative check (available_cents >= 0),
  constraint wallets_locked_non_negative check (locked_cents >= 0)
);

-- wallet_ledger: append-only audit trail. One row per balance movement.
-- Never updated or deleted — every row records the delta applied to
-- each bucket plus a post-movement snapshot for auditability.
create table if not exists public.wallet_ledger (
  id                      uuid        primary key default gen_random_uuid(),
  user_id                 uuid        not null references public.wallets(user_id) on delete cascade,
  type                    text        not null check (type in ('deposit', 'hold', 'release')),
  available_delta_cents   bigint      not null,
  locked_delta_cents      bigint      not null,
  available_after_cents   bigint      not null,
  locked_after_cents      bigint      not null,
  reference               text,
  description             text,
  created_at              timestamptz not null default now()
);

create index if not exists wallet_ledger_user_id_created_at_idx
  on public.wallet_ledger (user_id, created_at desc);

alter table public.wallets enable row level security;
alter table public.wallet_ledger enable row level security;

create policy "Owner can read own wallet"
  on public.wallets
  for select
  using (auth.uid() = user_id);

create policy "Owner can read own ledger"
  on public.wallet_ledger
  for select
  using (auth.uid() = user_id);

-- No insert/update/delete policies for anon/authenticated on either table —
-- all writes happen exclusively inside the SECURITY DEFINER functions below,
-- which are themselves locked down to service_role only (see grants at the
-- bottom). A client can never call these functions directly.

-- ── wallet_ensure ─────────────────────────────────────────────
-- Idempotent: creates a zero-balance wallet row if one doesn't exist yet.
-- Called once at registration.
create or replace function public.wallet_ensure(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.wallets (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;
end;
$$;

-- ── wallet_credit ─────────────────────────────────────────────
-- Increases available balance (deposits). Takes a row lock before
-- mutating so concurrent credits never clobber each other.
create or replace function public.wallet_credit(
  p_user_id uuid,
  p_amount_cents bigint,
  p_type text,
  p_reference text,
  p_description text
)
returns table (available_cents bigint, locked_cents bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available bigint;
  v_locked bigint;
begin
  if p_amount_cents <= 0 then
    raise exception 'wallet_credit: amount must be positive (got %)', p_amount_cents;
  end if;

  insert into public.wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;

  select w.available_cents, w.locked_cents into v_available, v_locked
    from public.wallets w
    where w.user_id = p_user_id
    for update;

  v_available := v_available + p_amount_cents;

  update public.wallets
    set available_cents = v_available, updated_at = now()
    where wallets.user_id = p_user_id;

  insert into public.wallet_ledger (
    user_id, type, available_delta_cents, locked_delta_cents,
    available_after_cents, locked_after_cents, reference, description
  ) values (
    p_user_id, p_type, p_amount_cents, 0, v_available, v_locked, p_reference, p_description
  );

  return query select v_available, v_locked;
end;
$$;

-- ── wallet_hold ───────────────────────────────────────────────
-- Moves funds available -> locked (bet creation/acceptance escrow).
-- Raises if the available balance can't cover the hold — this is the
-- check that must happen INSIDE the same locked transaction as the
-- mutation, or two concurrent holds could both pass the check against
-- the same stale balance and double-spend it.
create or replace function public.wallet_hold(
  p_user_id uuid,
  p_amount_cents bigint,
  p_reference text,
  p_description text
)
returns table (available_cents bigint, locked_cents bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available bigint;
  v_locked bigint;
begin
  if p_amount_cents <= 0 then
    raise exception 'wallet_hold: amount must be positive (got %)', p_amount_cents;
  end if;

  insert into public.wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;

  select w.available_cents, w.locked_cents into v_available, v_locked
    from public.wallets w
    where w.user_id = p_user_id
    for update;

  if v_available < p_amount_cents then
    raise exception 'wallet_hold: insufficient available balance (has %, needs %)', v_available, p_amount_cents;
  end if;

  v_available := v_available - p_amount_cents;
  v_locked := v_locked + p_amount_cents;

  update public.wallets
    set available_cents = v_available, locked_cents = v_locked, updated_at = now()
    where wallets.user_id = p_user_id;

  insert into public.wallet_ledger (
    user_id, type, available_delta_cents, locked_delta_cents,
    available_after_cents, locked_after_cents, reference, description
  ) values (
    p_user_id, 'hold', -p_amount_cents, p_amount_cents, v_available, v_locked, p_reference, p_description
  );

  return query select v_available, v_locked;
end;
$$;

-- ── wallet_release ────────────────────────────────────────────
-- Moves funds locked -> available (bet cancelled/refunded before
-- settlement exists). Settlement payout logic is a later phase.
create or replace function public.wallet_release(
  p_user_id uuid,
  p_amount_cents bigint,
  p_reference text,
  p_description text
)
returns table (available_cents bigint, locked_cents bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available bigint;
  v_locked bigint;
begin
  if p_amount_cents <= 0 then
    raise exception 'wallet_release: amount must be positive (got %)', p_amount_cents;
  end if;

  select w.available_cents, w.locked_cents into v_available, v_locked
    from public.wallets w
    where w.user_id = p_user_id
    for update;

  if not found then
    raise exception 'wallet_release: wallet not found for user %', p_user_id;
  end if;

  if v_locked < p_amount_cents then
    raise exception 'wallet_release: insufficient locked balance (has %, needs %)', v_locked, p_amount_cents;
  end if;

  v_available := v_available + p_amount_cents;
  v_locked := v_locked - p_amount_cents;

  update public.wallets
    set available_cents = v_available, locked_cents = v_locked, updated_at = now()
    where wallets.user_id = p_user_id;

  insert into public.wallet_ledger (
    user_id, type, available_delta_cents, locked_delta_cents,
    available_after_cents, locked_after_cents, reference, description
  ) values (
    p_user_id, 'release', p_amount_cents, -p_amount_cents, v_available, v_locked, p_reference, p_description
  );

  return query select v_available, v_locked;
end;
$$;

-- ── Lock down execution to service_role only ─────────────────
-- Postgres grants EXECUTE to PUBLIC by default, which would let any
-- authenticated client call these via PostgREST RPC and self-credit
-- or self-release funds. These must only ever run from trusted
-- server-side code (Next.js server actions using the service-role
-- client) — never directly from the browser.
revoke all on function public.wallet_ensure(uuid) from public, anon, authenticated;
revoke all on function public.wallet_credit(uuid, bigint, text, text, text) from public, anon, authenticated;
revoke all on function public.wallet_hold(uuid, bigint, text, text) from public, anon, authenticated;
revoke all on function public.wallet_release(uuid, bigint, text, text) from public, anon, authenticated;

grant execute on function public.wallet_ensure(uuid) to service_role;
grant execute on function public.wallet_credit(uuid, bigint, text, text, text) to service_role;
grant execute on function public.wallet_hold(uuid, bigint, text, text) to service_role;
grant execute on function public.wallet_release(uuid, bigint, text, text) to service_role;
