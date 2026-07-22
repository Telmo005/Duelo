-- =============================================================
-- Migration: 0036_refund_fee
--
-- A settled 1x2 bet where NEITHER prediction matched the real result
-- (bet_settle_match's "nobody called it" branch — only ever reachable for
-- 1x2's three-way market; total_goals/btts are binary and always produce a
-- real winner, see migration 0035) used to refund both stakes in full,
-- with zero commission. That's the one settlement path where the platform
-- runs a whole duel to completion and earns nothing from it.
--
-- Now retains a 5% fee from EACH side's own stake (10% combined, same
-- headline rate as the win-side commission, just split between both
-- parties instead of taken from a single payout) — deliberately scoped to
-- ONLY this one refund path:
--
--  - bet_void_match (postponed/abandoned) stays a FULL refund, no fee —
--    the match never being played to a real result isn't either bettor's
--    "outcome", it's an external cancellation neither side caused.
--  - bet_cancel / bet_auto_refund_expired (no opponent ever found) stay
--    full refunds too — no duel ever actually happened, nothing for the
--    platform to have "run to completion".
-- =============================================================

-- ── wallet_release_with_fee ───────────────────────────────────
-- Like wallet_release, but retains p_fee_cents of the held stake instead
-- of returning all of it — the retained portion leaves the system
-- entirely (same "money genuinely gone" shape as the loser's stake in
-- wallet_settle), never credited to available. One ledger row records
-- both the release and the retained fee via its available/locked deltas,
-- same pattern wallet_settle already uses for its two ledger rows.
create or replace function public.wallet_release_with_fee(
  p_user_id uuid,
  p_stake_cents bigint,
  p_fee_cents bigint,
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
  v_refund_cents bigint;
begin
  if p_stake_cents <= 0 then
    raise exception 'wallet_release_with_fee: stake must be positive (got %)', p_stake_cents;
  end if;
  if p_fee_cents < 0 or p_fee_cents > p_stake_cents then
    raise exception 'wallet_release_with_fee: fee must be between 0 and the stake (got % of %)', p_fee_cents, p_stake_cents;
  end if;

  select w.available_cents, w.locked_cents into v_available, v_locked
    from public.wallets w
    where w.user_id = p_user_id
    for update;

  if not found then
    raise exception 'wallet_release_with_fee: wallet not found for user %', p_user_id;
  end if;
  if v_locked < p_stake_cents then
    raise exception 'wallet_release_with_fee: insufficient locked balance (has %, needs %)', v_locked, p_stake_cents;
  end if;

  v_refund_cents := p_stake_cents - p_fee_cents;
  v_available := v_available + v_refund_cents;
  v_locked := v_locked - p_stake_cents;

  update public.wallets
    set available_cents = v_available, locked_cents = v_locked, updated_at = now()
    where wallets.user_id = p_user_id;

  insert into public.wallet_ledger (
    user_id, type, available_delta_cents, locked_delta_cents,
    available_after_cents, locked_after_cents, reference, description
  ) values (
    p_user_id, 'refund_fee', v_refund_cents, -p_stake_cents, v_available, v_locked, p_reference, p_description
  );

  return query select v_available, v_locked;
end;
$$;

alter table public.wallet_ledger drop constraint if exists wallet_ledger_type_check;
alter table public.wallet_ledger add constraint wallet_ledger_type_check
  check (type in (
    'deposit', 'hold', 'release', 'settle_win', 'settle_loss',
    'withdrawal_hold', 'withdrawal_release', 'withdrawal_complete',
    'refund_fee'
  ));

revoke all on function public.wallet_release_with_fee(uuid, bigint, bigint, text, text) from public, anon, authenticated;
grant execute on function public.wallet_release_with_fee(uuid, bigint, bigint, text, text) to service_role;

-- ── bet_settle_match ──────────────────────────────────────────
-- Only the "neither prediction matched" branch changes — everything else
-- (per-bet market resolution from migration 0035, the winner-payout path)
-- is untouched.
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
  v_total integer;
  v_winner uuid;
  v_loser uuid;
  v_pot bigint;
  v_commission bigint;
  v_payout bigint;
  v_refund_fee bigint;
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

  update public.matches
    set result_home = p_result_home, result_away = p_result_away,
        match_status = 'finished', settled_at = now()
    where id = p_match_id;

  for v_bet in
    select * from public.bets where match_id = p_match_id and status = 'matched' for update
  loop
    if v_bet.market = 'total_goals' then
      v_total := p_result_home + p_result_away;
      if v_total > v_bet.line then v_actual := 'over';
      elsif v_total < v_bet.line then v_actual := 'under';
      else v_actual := null; -- unreachable with X.5 lines; defensive only
      end if;
    elsif v_bet.market = 'btts' then
      v_actual := case when p_result_home > 0 and p_result_away > 0 then 'yes' else 'no' end;
    else -- '1x2'
      if p_result_home > p_result_away then v_actual := 'home';
      elsif p_result_home < p_result_away then v_actual := 'away';
      else v_actual := 'draw';
      end if;
    end if;

    if v_bet.prediction = v_actual then
      v_winner := v_bet.creator_id;
      v_loser := v_bet.opponent_id;
    elsif v_bet.opponent_prediction is null then
      -- Matched before opponent_prediction existed — opponent implicitly
      -- bet AGAINST the creator's specific prediction (the old binary
      -- rule), not for one specific alternative. Preserve that for these
      -- in-flight bets: they win on any result other than the creator's.
      -- Only ever applies to 1x2 bets — market didn't exist back then.
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
      -- Neither prediction matched the actual result — nobody called it.
      -- Unlike a voided/cancelled match, this IS a real result the
      -- platform ran the whole duel to see — a 5% fee applies to each
      -- side's own stake (10% combined), same headline rate as the
      -- win-side commission, retained instead of a full refund.
      v_refund_fee := round(v_bet.stake_cents * 0.05);

      perform public.wallet_release_with_fee(
        v_bet.creator_id, v_bet.stake_cents, v_refund_fee, v_bet.id::text,
        'Nenhuma previsão acertou o resultado — reembolso menos 5% de taxa'
      );
      perform public.wallet_release_with_fee(
        v_bet.opponent_id, v_bet.stake_cents, v_refund_fee, v_bet.id::text,
        'Nenhuma previsão acertou o resultado — reembolso menos 5% de taxa'
      );

      insert into public.platform_ledger (bet_id, match_id, amount_cents)
      values (v_bet.id, p_match_id, v_refund_fee * 2);

      update public.bets set status = 'refunded' where id = v_bet.id;

      perform public.notify(
        v_bet.creator_id, 'bet_refunded', 'Aposta reembolsada',
        'Nenhuma das previsões acertou o resultado — devolvemos o valor menos uma taxa de 5%.',
        '/d/' || v_bet.reference
      );
      perform public.notify(
        v_bet.opponent_id, 'bet_refunded', 'Aposta reembolsada',
        'Nenhuma das previsões acertou o resultado — devolvemos o valor menos uma taxa de 5%.',
        '/d/' || v_bet.reference
      );
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
