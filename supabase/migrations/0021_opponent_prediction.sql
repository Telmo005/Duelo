-- =============================================================
-- Migration: 0021_opponent_prediction
--
-- Product change: the opponent no longer just bets AGAINST the creator's
-- specific prediction (binary — "creator's pick happened, or it didn't").
-- They now pick one of the two remaining outcomes themselves (three-way
-- market: home/draw/away). This means a valid final result can match
-- NEITHER side's prediction (e.g. creator says "Home", opponent says
-- "Away", actual result is a draw) — in that case nobody called it, so
-- both stakes are refunded in full, no commission, same treatment as a
-- voided match (see bet_void_match).
-- =============================================================

alter table public.bets
  add column if not exists opponent_prediction text
    check (opponent_prediction is null or opponent_prediction in ('home', 'draw', 'away'));

-- Enforced separately (not as a single combined CHECK) so the constraint
-- name gives a clear error independent of the value-domain check above.
-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, so drop-then-add makes this
-- safe to re-run (this migration is applied by hand against production,
-- not through a migration runner that tracks what already ran).
alter table public.bets drop constraint if exists bets_opponent_prediction_differs;
alter table public.bets
  add constraint bets_opponent_prediction_differs
    check (opponent_prediction is null or opponent_prediction <> prediction);

-- ── bet_accept ────────────────────────────────────────────────
-- Current signature from 0018_notifications.sql, extended with the
-- opponent's own prediction (previously implicit — "whatever isn't the
-- creator's pick"). Validated against the match's is_elimination flag the
-- same way bet_create already validates the creator's prediction.
--
-- Adding a parameter changes the signature, so `create or replace` would
-- leave the old 4-arg version callable as a separate overload — drop it
-- explicitly so there's exactly one bet_accept, and PostgREST (which
-- resolves .rpc() calls by matching named parameters) can never pick the
-- stale binary-acceptance version by mistake.
drop function if exists public.bet_accept(uuid, uuid, text, text);

create or replace function public.bet_accept(
  p_bet_id uuid,
  p_opponent_id uuid,
  p_opponent_prediction text,
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
  v_is_elimination boolean;
  v_reason text := null;
  v_opponent_name text;
begin
  if p_opponent_prediction not in ('home', 'draw', 'away') then
    raise exception 'bet_accept: invalid prediction %', p_opponent_prediction;
  end if;

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
  if p_opponent_prediction = v_bet.prediction then
    raise exception 'bet_accept: opponent prediction must differ from the creator''s prediction';
  end if;

  select kickoff_at, is_elimination into v_kickoff, v_is_elimination from public.matches where id = v_bet.match_id;
  if v_kickoff <= now() then
    raise exception 'bet_accept: match has already started, cannot accept';
  end if;
  if v_is_elimination and p_opponent_prediction = 'draw' then
    raise exception 'bet_accept: elimination matches cannot be predicted as a draw';
  end if;

  perform public.wallet_hold(p_opponent_id, v_bet.stake_cents, p_bet_id::text, 'Aposta aceite');

  if v_bet.creator_device_id is not null and v_bet.creator_device_id = p_opponent_device_id then
    v_reason := 'same_device';
  elsif v_bet.creator_ip is not null and v_bet.creator_ip = p_opponent_ip then
    v_reason := 'same_ip';
  end if;

  update public.bets
    set opponent_id = p_opponent_id, opponent_prediction = p_opponent_prediction,
        status = 'matched', matched_at = now(),
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

-- ── bet_settle_match ──────────────────────────────────────────
-- Current signature from 0019_elimination_matches.sql, extended for the
-- three-way market: creator's prediction correct -> creator wins;
-- opponent's prediction correct -> opponent wins; NEITHER correct (the
-- third, unclaimed outcome) -> refund both stakes in full, no commission.
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
      -- Matched before this migration shipped — opponent_prediction was
      -- never captured, because the opponent implicitly bet AGAINST the
      -- creator's specific prediction (the old binary rule), not for one
      -- specific alternative. Preserve that for these in-flight bets: they
      -- win on any result other than the creator's, not just one outcome.
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

-- ── Lock down execution to service_role only ─────────────────
revoke all on function public.bet_accept(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.bet_accept(uuid, uuid, text, text, text) to service_role;
