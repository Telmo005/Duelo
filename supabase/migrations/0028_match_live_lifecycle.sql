-- =============================================================
-- Migration: 0028_match_live_lifecycle
--
-- Replaces API-driven settlement timing with a purely time-based lifecycle,
-- since result/live-score polling was exhausting the API-Football Free
-- plan's quota (confirmed in production: repeated 429s in error_log,
-- dozens of matches stuck 'scheduled' hours past kickoff). The API is now
-- only used to import the fixture list (teams/kickoff time) — never to
-- decide match state.
--
-- New lifecycle, driven entirely by kickoff_at vs. now():
--   scheduled --(kickoff_at <= now())--> live
--   live --(kickoff_at + 90min, no 'matched' bets)--> closed
--   live --(kickoff_at + 90min, has 'matched' bets)--> needs_review (admin notified)
--   needs_review/live/scheduled --(admin liquida/anula)--> finished/postponed/abandoned
--
-- 'waiting' bets (no opponent) are unaffected by this migration — they're
-- already refunded immediately at kickoff by bet_auto_refund_expired
-- (0002_bets.sql), which keeps running unchanged on its own schedule. By
-- the time a match reaches the 90-minute mark, any 'waiting' bet on it has
-- already been resolved, so match_advance_lifecycle only has to look at
-- 'matched' bets to decide closed vs. needs_review.
--
-- match_close_if_empty (0025) is superseded and dropped: it only ever
-- covered matches with no external_id, and its 'closed' write violated the
-- match_status check constraint below since the day it was introduced
-- (confirmed in production — it always raised and was silently swallowed
-- by the calling cron's per-match try/catch, so no manually-added empty
-- match ever actually closed). match_advance_lifecycle replaces it for
-- every match, external_id or not.
-- =============================================================

alter table public.matches drop constraint if exists matches_match_status_check;
alter table public.matches add constraint matches_match_status_check
  check (match_status in ('scheduled', 'live', 'finished', 'postponed', 'abandoned', 'closed', 'needs_review'));

drop function if exists public.match_close_if_empty(uuid);

-- ── bet_settle_match / bet_void_match ────────────────────────
-- Current bet_settle_match body is straight from 0021_opponent_prediction.sql
-- (three-way market + elimination-match validation) — only the status guard
-- changes here, widened to allow settling from 'live' or 'needs_review' too,
-- not just 'scheduled' — a real match spends almost its entire
-- admin-relevant life in one of those two states now.
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
  if v_match.match_status not in ('scheduled', 'live', 'needs_review') then
    raise exception 'bet_settle_match: match already processed (status=%)', v_match.match_status;
  end if;
  if v_match.is_elimination and p_result_home = p_result_away then
    raise exception 'bet_settle_match: elimination match cannot settle as a draw — enter the decisive result (e.g. reflecting the penalty shootout winner)';
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
    elsif v_bet.opponent_prediction is null then
      -- Matched before opponent_prediction existed — opponent implicitly
      -- bet AGAINST the creator's specific prediction (the old binary
      -- rule), not for one specific alternative. Preserve that for these
      -- in-flight bets: they win on any result other than the creator's.
      v_winner := v_bet.opponent_id;
      v_loser := v_bet.creator_id;
    elsif v_bet.opponent_prediction = v_actual then
      v_winner := v_bet.opponent_id;
      v_loser := v_bet.creator_id;
    else
      v_winner := null;
    end if;

    if v_winner is not null then
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
    else
      -- Neither prediction matched the actual result — nobody called it,
      -- so nobody should be paid. Same treatment as a voided match: full
      -- refund, no commission.
      perform public.wallet_release(v_bet.creator_id, v_bet.stake_cents, v_bet.id::text, 'Nenhuma previsão acertou o resultado — reembolso');
      perform public.wallet_release(v_bet.opponent_id, v_bet.stake_cents, v_bet.id::text, 'Nenhuma previsão acertou o resultado — reembolso');

      update public.bets set status = 'refunded' where id = v_bet.id;

      perform public.notify(
        v_bet.creator_id, 'bet_refunded', 'Aposta reembolsada',
        'Nenhuma das previsões acertou o resultado — o valor voltou para o teu saldo.',
        '/d/' || v_bet.reference
      );
      perform public.notify(
        v_bet.opponent_id, 'bet_refunded', 'Aposta reembolsada',
        'Nenhuma das previsões acertou o resultado — o valor voltou para o teu saldo.',
        '/d/' || v_bet.reference
      );
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

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
  if v_match.match_status not in ('scheduled', 'live', 'needs_review') then
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

-- ── match_advance_lifecycle ───────────────────────────────────
-- Pure time-based state machine, no external calls — safe to run every
-- minute. skip locked on the second pass so concurrent invocations (e.g. a
-- manual admin trigger overlapping the scheduled cron tick) never block on
-- each other or double-process the same match.
create or replace function public.match_advance_lifecycle()
returns table (to_live integer, to_closed integer, to_needs_review integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_to_live integer := 0;
  v_to_closed integer := 0;
  v_to_review integer := 0;
  v_match record;
  v_has_matched boolean;
begin
  update public.matches
     set match_status = 'live'
   where match_status = 'scheduled'
     and kickoff_at <= now();
  get diagnostics v_to_live = row_count;

  for v_match in
    select m.* from public.matches m
    where m.match_status = 'live'
      and m.kickoff_at <= now() - interval '90 minutes'
    for update skip locked
  loop
    select exists(
      select 1 from public.bets b where b.match_id = v_match.id and b.status = 'matched'
    ) into v_has_matched;

    if v_has_matched then
      update public.matches set match_status = 'needs_review' where id = v_match.id;
      v_to_review := v_to_review + 1;

      insert into public.notifications (user_id, type, title, body, link)
      select id, 'match_needs_review', 'Jogo precisa de liquidação',
        v_match.home || ' vs ' || v_match.away || ' passou dos 90 min — introduz o resultado.',
        '/admin/matches'
      from public.profiles where is_admin = true;
    else
      update public.matches set match_status = 'closed', settled_at = now() where id = v_match.id;
      v_to_closed := v_to_closed + 1;
    end if;
  end loop;

  return query select v_to_live, v_to_closed, v_to_review;
end;
$$;

revoke all on function public.match_advance_lifecycle() from public, anon, authenticated;
grant execute on function public.match_advance_lifecycle() to service_role;
