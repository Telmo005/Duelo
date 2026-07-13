-- =============================================================
-- Migration: 0018_notifications
--
-- Persistent in-app notifications for every event a user or admin
-- actually needs to know about: a bet got accepted/won/lost/refunded, a
-- deposit succeeded/failed, a withdrawal was completed/rejected, and (for
-- admins) a new withdrawal request came in. Written by the SAME
-- SECURITY DEFINER functions that already perform each of these actions —
-- notify() is called inside bet_accept/bet_settle_match/bet_void_match/
-- bet_auto_refund_expired/withdrawal_complete/withdrawal_reject/
-- withdrawal_request, so a notification can never exist without the real
-- event actually having happened (and vice versa: if the transaction rolls
-- back, so does the notification).
--
-- Deposit success/failure notifications are the one exception — they're
-- created from the PayGate webhook route (application code), not a
-- Postgres function, since that's where those events already live.
-- =============================================================

create table if not exists public.notifications (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  type        text        not null,
  title       text        not null,
  body        text        not null,
  -- Where tapping the notification takes the user, e.g. /d/DUE-BET-xxx or
  -- /wallet/withdraw. Null is fine (some notifications are just informational).
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_id_created_at_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_id_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;

create policy "Owner can read own notifications"
  on public.notifications
  for select
  using (auth.uid() = user_id);

-- No insert/update/delete policies for anon/authenticated — every write
-- happens via notify() (called from inside other SECURITY DEFINER
-- functions, or directly from the webhook route) or
-- notifications_mark_read() below, both service_role only.

-- ── notify ────────────────────────────────────────────────────
-- Thin insert helper, callable both from inside other PL/pgSQL functions
-- (`perform public.notify(...)`) and directly via RPC from application
-- code (the PayGate webhook, for deposit outcomes).
create or replace function public.notify(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_link text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, body, link)
  values (p_user_id, p_type, p_title, p_body, p_link);
end;
$$;

-- ── notifications_mark_read ──────────────────────────────────
-- p_notification_id null = mark everything unread as read (the "marcar
-- tudo como lido" action); otherwise marks just that one. Scoped to
-- p_user_id either way so a server action can never mark another user's
-- notification as read even by guessing an id.
create or replace function public.notifications_mark_read(
  p_user_id uuid,
  p_notification_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_notification_id is not null then
    update public.notifications set read_at = now()
      where id = p_notification_id and user_id = p_user_id and read_at is null;
  else
    update public.notifications set read_at = now()
      where user_id = p_user_id and read_at is null;
  end if;
end;
$$;

revoke all on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.notifications_mark_read(uuid, uuid) from public, anon, authenticated;
grant execute on function public.notify(uuid, text, text, text, text) to service_role;
grant execute on function public.notifications_mark_read(uuid, uuid) to service_role;

-- =============================================================
-- Hook notify() into the existing money-moving functions. Each is a full
-- create-or-replace of the CURRENT live definition (same signature as
-- last redefined — 0009 for bet_accept, 0003 for settle/void,
-- 0002 for auto-refund, 0017 for withdrawals) with one addition: a
-- notify() call at the point the event actually completes.
-- =============================================================

-- bet_accept (current signature from 0009_bet_accept_kickoff_check.sql)
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
  v_kickoff timestamptz;
  v_reason text := null;
  v_opponent_name text;
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

  select kickoff_at into v_kickoff from public.matches where id = v_bet.match_id;
  if v_kickoff <= now() then
    raise exception 'bet_accept: match has already started, cannot accept';
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

  select display_name into v_opponent_name from public.profiles where id = p_opponent_id;
  perform public.notify(
    v_bet.creator_id, 'bet_accepted', 'A tua aposta foi aceite! ⚔️',
    coalesce(v_opponent_name, 'Alguém') || ' aceitou o teu desafio.',
    '/d/' || v_bet.reference
  );
end;
$$;

-- bet_settle_match (current signature from 0003_settlement.sql)
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

    perform public.notify(
      v_winner, 'bet_won', 'Ganhaste! 🏆',
      'Recebeste ' || to_char(v_payout / 100.0, 'FM999999990.00') || ' MT.',
      '/d/' || v_bet.reference
    );
    perform public.notify(
      v_loser, 'bet_lost', 'Aposta perdida',
      'O resultado não foi a teu favor desta vez.',
      '/d/' || v_bet.reference
    );
  end loop;

  return v_count;
end;
$$;

-- bet_void_match (current signature from 0003_settlement.sql)
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

    perform public.notify(
      v_bet.creator_id, 'bet_refunded', 'Aposta reembolsada',
      'Jogo adiado/abandonado — o valor voltou para o teu saldo.',
      '/d/' || v_bet.reference
    );
    perform public.notify(
      v_bet.opponent_id, 'bet_refunded', 'Aposta reembolsada',
      'Jogo adiado/abandonado — o valor voltou para o teu saldo.',
      '/d/' || v_bet.reference
    );
  end loop;

  return v_count;
end;
$$;

-- bet_auto_refund_expired (current signature from 0002_bets.sql)
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

    perform public.notify(
      v_bet.creator_id, 'bet_refunded', 'Aposta reembolsada',
      'Não apareceu adversário antes do início do jogo — o valor voltou para o teu saldo.',
      '/d/' || v_bet.reference
    );
  end loop;

  return v_count;
end;
$$;

-- withdrawal_request (current signature from 0017_withdrawals.sql) — adds
-- an admin-facing notification only; the user-facing "pedido enviado"
-- state is already shown inline by the form itself, no notification needed.
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

  insert into public.notifications (user_id, type, title, body, link)
  select id, 'withdrawal_pending', 'Novo pedido de levantamento',
    to_char(p_amount_cents / 100.0, 'FM999999990.00') || ' MT — ' || v_reference,
    '/admin/withdrawals'
  from public.profiles where is_admin = true;

  return query select v_withdrawal_id, v_reference;
end;
$$;

-- withdrawal_complete (current signature from 0017_withdrawals.sql)
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

  perform public.notify(
    v_withdrawal.user_id, 'withdrawal_completed', 'Levantamento concluído',
    'O teu levantamento de ' || to_char(v_withdrawal.amount_cents / 100.0, 'FM999999990.00') || ' MT foi processado.',
    '/wallet/withdraw'
  );
end;
$$;

-- withdrawal_reject (current signature from 0017_withdrawals.sql)
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

  perform public.notify(
    v_withdrawal.user_id, 'withdrawal_rejected', 'Levantamento rejeitado',
    p_admin_note,
    '/wallet/withdraw'
  );
end;
$$;
