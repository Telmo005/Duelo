-- =============================================================
-- Migration: 0013_deposit_phone_nullable_and_credit_idempotent
--
-- Two related changes to the deposit path:
--
-- 1. deposits.phone becomes nullable. We no longer collect the payer's
--    phone number in the app — PayGate/PaySuite's own checkout page asks
--    for it, and createCharge never sent it anyway (see lib/paygate-client.ts).
--    Asking for it twice was pure friction (and the source of the
--    "número não corresponde ao método" errors).
--
-- 2. wallet_credit becomes IDEMPOTENT per deposit reference. The PayGate
--    webhook (app/api/webhooks/paygate/route.ts) previously marked a
--    deposit 'success' BEFORE crediting the wallet — if wallet_credit
--    failed, the deposit was stuck 'success' with no money credited, and
--    the reconciliation job (which only looks at 'pending' rows) never
--    caught it. The fix reorders the webhook to credit FIRST, then mark
--    success — but that reorder is only safe if a retried webhook can
--    re-run wallet_credit without double-crediting. A partial unique index
--    on the deposit reference + an ON CONFLICT guard gives us exactly that.
-- =============================================================

-- 1. Stop requiring a phone on deposits.
alter table public.deposits alter column phone drop not null;

-- 2a. One deposit ledger row per (user, reference), ever. A real deposit
--     reference (DUE-DEP-...) maps to exactly one user, so this is the
--     correct idempotency key: a retried webhook for the same deposit hits
--     the same (user_id, reference) and is rejected, while it stays tolerant
--     of non-production seed rows that reused a literal reference across
--     users. Holds/releases reuse bet references, so the index is scoped to
--     type = 'deposit' only.
create unique index if not exists wallet_ledger_deposit_reference_uniq
  on public.wallet_ledger (user_id, reference)
  where type = 'deposit';

-- 2b. Make wallet_credit idempotent. Same locking discipline as before
--     (row lock via SELECT ... FOR UPDATE), but the ledger insert now
--     uses ON CONFLICT DO NOTHING against the partial index above, and the
--     balance is only bumped when a NEW ledger row was actually written.
--     A duplicate call (webhook retry) returns the current balance,
--     unchanged — a safe no-op.
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
  v_inserted int;
begin
  if p_amount_cents <= 0 then
    raise exception 'wallet_credit: amount must be positive (got %)', p_amount_cents;
  end if;

  insert into public.wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;

  -- Serialize all balance movements for this user behind the wallet row lock.
  select w.available_cents, w.locked_cents into v_available, v_locked
    from public.wallets w
    where w.user_id = p_user_id
    for update;

  -- Idempotent append: a retried deposit webhook conflicts on the deposit
  -- reference and writes nothing. Snapshot columns record the post-movement
  -- balance for the row we're about to (maybe) apply.
  insert into public.wallet_ledger (
    user_id, type, available_delta_cents, locked_delta_cents,
    available_after_cents, locked_after_cents, reference, description
  ) values (
    p_user_id, p_type, p_amount_cents, 0, v_available + p_amount_cents, v_locked, p_reference, p_description
  )
  on conflict (user_id, reference) where type = 'deposit' do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    -- Already credited for this reference — no-op, return current balance.
    return query select v_available, v_locked;
    return;
  end if;

  v_available := v_available + p_amount_cents;

  update public.wallets
    set available_cents = v_available, updated_at = now()
    where wallets.user_id = p_user_id;

  return query select v_available, v_locked;
end;
$$;

revoke all on function public.wallet_credit(uuid, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.wallet_credit(uuid, bigint, text, text, text) to service_role;
