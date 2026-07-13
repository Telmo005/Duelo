-- =============================================================
-- Migration: 0017_withdrawals
--
-- User-requested withdrawals, processed manually: the user requests an
-- amount + destination (method/phone/recipient name), the app locks that
-- amount out of their available balance immediately (same wallet_hold-style
-- row-locked mutation every other money-moving path in this app uses — see
-- 0001_wallet.sql's comment on why read-then-write is the exact bug this
-- pattern exists to prevent), and the request sits 'pending' for an admin
-- to see. The admin pays it out by hand on PaySuite's own dashboard (no
-- payout API integration exists yet — see the withdrawal-feature
-- discussion), then comes back to /admin/withdrawals and marks it
-- completed or rejected.
--
-- Every mutation here is a single SECURITY DEFINER function that takes the
-- wallet row lock BEFORE checking/moving balance, and does the balance
-- check inside that same locked scope — exactly the pattern bet_create and
-- wallet_hold already use, and for the same reason: a check done in a
-- separate statement from the mutation is a race two concurrent requests
-- can both pass against the same stale balance.
-- =============================================================

create table if not exists public.withdrawals (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.profiles(id) on delete cascade,
  amount_cents    bigint      not null check (amount_cents > 0),
  method          text        not null check (method in ('mpesa', 'emola')),
  -- Destination for the payout. Deliberately NOT required to equal the
  -- user's own registered profile phone/name — someone may legitimately
  -- want to send winnings to a different verified number (e.g. a family
  -- member) — but the admin view (lib/withdrawals.ts) always shows the
  -- requester's own registered phone/name alongside these for comparison,
  -- so a mismatch is visible to whoever is about to send real money.
  phone           text        not null,
  recipient_name  text        not null,
  status          text        not null default 'pending' check (status in ('pending', 'completed', 'rejected')),
  reference       text        not null unique,
  admin_note      text,
  processed_by    uuid        references public.profiles(id),
  created_at      timestamptz not null default now(),
  processed_at    timestamptz
);

create index if not exists withdrawals_user_id_created_at_idx
  on public.withdrawals (user_id, created_at desc);

create index if not exists withdrawals_status_created_at_idx
  on public.withdrawals (status, created_at desc);

alter table public.withdrawals enable row level security;

create policy "Owner can read own withdrawals"
  on public.withdrawals
  for select
  using (auth.uid() = user_id);

-- No insert/update/delete policies for anon/authenticated — every write
-- happens inside the SECURITY DEFINER functions below (service_role only),
-- same as deposits/bets. A client can never forge a withdrawal or mark one
-- paid.

-- Three new ledger types for this feature's two money movements (the third,
-- 'withdrawal_hold', is the initial lock) — distinct from the generic
-- 'hold'/'release' bet-escrow types so the ledger stays queryable by cause,
-- not just by direction (matches the precedent set by settle_win/settle_loss
-- in 0003_settlement.sql rather than overloading hold/release).
alter table public.wallet_ledger drop constraint if exists wallet_ledger_type_check;
alter table public.wallet_ledger add constraint wallet_ledger_type_check
  check (type in (
    'deposit', 'hold', 'release', 'settle_win', 'settle_loss',
    'withdrawal_hold', 'withdrawal_release', 'withdrawal_complete'
  ));

-- ── withdrawal_request ───────────────────────────────────────
-- Atomically: validates balance, locks the funds, and inserts the request
-- row — all inside one transaction, so there is no window where funds are
-- locked but no withdrawal row exists to account for them (if the insert
-- fails for any reason, the whole function raises and the wallet mutation
-- rolls back with it). Also caps at one pending request per user: not a
-- security boundary (each hold is independently safe), just keeps a user
-- from burying the admin queue in duplicate submissions.
create or replace function public.withdrawal_request(
  p_user_id uuid,
  p_amount_cents bigint,
  p_method text,
  p_phone text,
  p_recipient_name text
)
returns table (withdrawal_id uuid, reference text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_withdrawal_id uuid := gen_random_uuid();
  v_reference text;
  v_available bigint;
  v_locked bigint;
  v_pending_count integer;
begin
  if p_amount_cents <= 0 then
    raise exception 'withdrawal_request: amount must be positive (got %)', p_amount_cents;
  end if;
  if p_method not in ('mpesa', 'emola') then
    raise exception 'withdrawal_request: invalid method %', p_method;
  end if;
  if p_phone is null or trim(p_phone) = '' or p_recipient_name is null or trim(p_recipient_name) = '' then
    raise exception 'withdrawal_request: phone and recipient name are required';
  end if;

  select count(*) into v_pending_count from public.withdrawals
    where user_id = p_user_id and status = 'pending';
  if v_pending_count > 0 then
    raise exception 'you already have a pending withdrawal request';
  end if;

  v_reference := 'DUE-WD-' || upper(substr(replace(v_withdrawal_id::text, '-', ''), 1, 8));

  select w.available_cents, w.locked_cents into v_available, v_locked
    from public.wallets w
    where w.user_id = p_user_id
    for update;

  if not found then
    raise exception 'withdrawal_request: wallet not found';
  end if;

  if v_available < p_amount_cents then
    raise exception 'insufficient available balance';
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
    p_user_id, 'withdrawal_hold', -p_amount_cents, p_amount_cents, v_available, v_locked, v_reference,
    'Levantamento pedido — aguarda processamento'
  );

  insert into public.withdrawals (
    id, user_id, amount_cents, method, phone, recipient_name, reference
  ) values (
    v_withdrawal_id, p_user_id, p_amount_cents, p_method, p_phone, p_recipient_name, v_reference
  );

  return query select v_withdrawal_id, v_reference;
end;
$$;

-- ── withdrawal_complete ──────────────────────────────────────
-- Admin confirms the payout was actually sent on PaySuite's dashboard. The
-- locked funds leave the system entirely (never credited back to
-- available) — same "money genuinely left" shape as a lost bet's stake in
-- wallet_settle. Idempotency guard: only a 'pending' row can be completed,
-- so this can't be called twice for the same request.
create or replace function public.withdrawal_complete(
  p_withdrawal_id uuid,
  p_admin_id uuid,
  p_admin_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_withdrawal record;
  v_available bigint;
  v_locked bigint;
begin
  select * into v_withdrawal from public.withdrawals where id = p_withdrawal_id for update;
  if not found then
    raise exception 'withdrawal_complete: withdrawal % not found', p_withdrawal_id;
  end if;
  if v_withdrawal.status <> 'pending' then
    raise exception 'withdrawal_complete: already processed (status=%)', v_withdrawal.status;
  end if;

  select w.available_cents, w.locked_cents into v_available, v_locked
    from public.wallets w where w.user_id = v_withdrawal.user_id for update;

  if v_locked < v_withdrawal.amount_cents then
    raise exception 'withdrawal_complete: locked balance inconsistent (has %, needs %)', v_locked, v_withdrawal.amount_cents;
  end if;

  v_locked := v_locked - v_withdrawal.amount_cents;

  update public.wallets
    set locked_cents = v_locked, updated_at = now()
    where wallets.user_id = v_withdrawal.user_id;

  insert into public.wallet_ledger (
    user_id, type, available_delta_cents, locked_delta_cents,
    available_after_cents, locked_after_cents, reference, description
  ) values (
    v_withdrawal.user_id, 'withdrawal_complete', 0, -v_withdrawal.amount_cents, v_available, v_locked, v_withdrawal.reference,
    'Levantamento processado — pago via ' || v_withdrawal.method
  );

  update public.withdrawals
    set status = 'completed', processed_by = p_admin_id, processed_at = now(), admin_note = p_admin_note
    where id = p_withdrawal_id;
end;
$$;

-- ── withdrawal_reject ────────────────────────────────────────
-- Releases the locked funds back to available (mirrors wallet_release) and
-- marks the request rejected. Requires a note — the user needs to know why
-- their withdrawal didn't go through.
create or replace function public.withdrawal_reject(
  p_withdrawal_id uuid,
  p_admin_id uuid,
  p_admin_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_withdrawal record;
  v_available bigint;
  v_locked bigint;
begin
  if p_admin_note is null or trim(p_admin_note) = '' then
    raise exception 'withdrawal_reject: a note explaining the rejection is required';
  end if;

  select * into v_withdrawal from public.withdrawals where id = p_withdrawal_id for update;
  if not found then
    raise exception 'withdrawal_reject: withdrawal % not found', p_withdrawal_id;
  end if;
  if v_withdrawal.status <> 'pending' then
    raise exception 'withdrawal_reject: already processed (status=%)', v_withdrawal.status;
  end if;

  select w.available_cents, w.locked_cents into v_available, v_locked
    from public.wallets w where w.user_id = v_withdrawal.user_id for update;

  v_available := v_available + v_withdrawal.amount_cents;
  v_locked := v_locked - v_withdrawal.amount_cents;

  update public.wallets
    set available_cents = v_available, locked_cents = v_locked, updated_at = now()
    where wallets.user_id = v_withdrawal.user_id;

  insert into public.wallet_ledger (
    user_id, type, available_delta_cents, locked_delta_cents,
    available_after_cents, locked_after_cents, reference, description
  ) values (
    v_withdrawal.user_id, 'withdrawal_release', v_withdrawal.amount_cents, -v_withdrawal.amount_cents, v_available, v_locked, v_withdrawal.reference,
    'Levantamento rejeitado — ' || p_admin_note
  );

  update public.withdrawals
    set status = 'rejected', processed_by = p_admin_id, processed_at = now(), admin_note = p_admin_note
    where id = p_withdrawal_id;
end;
$$;

-- ── Lock down execution to service_role only ─────────────────
revoke all on function public.withdrawal_request(uuid, bigint, text, text, text) from public, anon, authenticated;
revoke all on function public.withdrawal_complete(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.withdrawal_reject(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.withdrawal_request(uuid, bigint, text, text, text) to service_role;
grant execute on function public.withdrawal_complete(uuid, uuid, text) to service_role;
grant execute on function public.withdrawal_reject(uuid, uuid, text) to service_role;
