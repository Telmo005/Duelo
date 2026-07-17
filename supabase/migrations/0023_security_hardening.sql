-- =============================================================
-- Migration: 0023_security_hardening
--
-- Three findings from the same audit that produced 0022:
--
-- M1 — the "Anyone signed in can read bets" policy (0002_bets.sql) is
-- `using (true)` with no column restriction, so any authenticated user can
-- SELECT creator_ip/creator_device_id/opponent_ip/opponent_device_id/
-- flagged_reason/flagged_at for every bet in the system via PostgREST —
-- IP/device fingerprints for every bettor, plus which bets the anti-fraud
-- heuristic flagged (teaching an attacker exactly what to avoid). The app
-- itself never needs this: the feed and every other read of `bets` goes
-- through Drizzle on a direct service-role connection (bypasses RLS
-- entirely), never supabase-js from the client. Same column-grant fix as
-- 0022 used for profiles.
--
-- M2 — registerUser has no rate limiting (unlike signIn), so nothing
-- stops a script from mass-creating accounts. Adds a `kind` column to
-- auth_attempts so registration attempts can be counted separately from
-- login attempts (they're both phone/IP-keyed events, but conflating them
-- would mean a burst of registrations could lock out an unrelated login,
-- and vice versa).
--
-- B4 — the 5 MT withdrawal minimum (lib/validation/withdrawal.ts) was only
-- enforced by zod on the server ACTION, not inside withdrawal_request
-- itself. No financial risk (funds stay the caller's own, correctly
-- locked either way) — this just stops a hand-crafted RPC call from
-- landing a sub-5-MT request in the admin queue. Belt-and-suspenders,
-- same reasoning as every other money-moving function already validating
-- server-side twice (zod + SQL).
-- =============================================================

revoke select on public.bets from authenticated;
grant select (
  id, match_id, creator_id, opponent_id, prediction, opponent_prediction,
  stake_cents, status, reference, matched_at, cancelled_at, created_at
) on public.bets to authenticated;

alter table public.auth_attempts
  add column if not exists kind text not null default 'login' check (kind in ('login', 'register'));

-- withdrawal_request (current signature from 0018_notifications.sql),
-- extended with the 5 MT floor already enforced client/action-side.
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
  if p_amount_cents < 500 then
    raise exception 'withdrawal_request: amount must be at least 500 cents (5 MT), got %', p_amount_cents;
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

  insert into public.notifications (user_id, type, title, body, link)
  select id, 'withdrawal_pending', 'Novo pedido de levantamento',
    to_char(p_amount_cents / 100.0, 'FM999999990.00') || ' MT — ' || v_reference,
    '/admin/withdrawals'
  from public.profiles where is_admin = true;

  return query select v_withdrawal_id, v_reference;
end;
$$;
