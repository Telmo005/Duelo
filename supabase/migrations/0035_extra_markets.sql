-- =============================================================
-- Migration: 0035_extra_markets
--
-- Adds two new betting markets alongside the existing 1X2:
--   - total_goals: bet on OVER/UNDER a fixed line (1.5/2.5/3.5) of combined
--     match goals.
--   - btts (both teams to score): bet on YES/NO.
--
-- Both are settled from the exact same final score (result_home/result_away)
-- 1X2 already uses — no new data source, no change to the admin's
-- liquidation flow (still just types in the final score). Deliberately
-- binary with a half-point line (never an exact tie), unlike the discussed
-- "exact card count" idea: over/under and yes/no always produce a real
-- winner from the score, so the "neither side called it, refund both"
-- branch bet_settle_match already has for 1X2's three-way market simply
-- never triggers for these two — there's no third, unclaimed outcome.
--
-- `market` defaults to '1x2' so every existing row is correctly classified
-- with no backfill needed; `line` only applies to total_goals.
-- =============================================================

alter table public.bets add column if not exists market text not null default '1x2';
alter table public.bets add column if not exists line numeric(4,1);

alter table public.bets drop constraint if exists bets_market_check;
alter table public.bets add constraint bets_market_check
  check (market in ('1x2', 'total_goals', 'btts'));

alter table public.bets drop constraint if exists bets_line_check;
alter table public.bets add constraint bets_line_check
  check (
    (market = 'total_goals' and line in (1.5, 2.5, 3.5))
    or (market <> 'total_goals' and line is null)
  );

-- Widen prediction/opponent_prediction to validate the (market, value) PAIR,
-- not just a bare value list — a 'total_goals' bet must use over/under, a
-- 'btts' bet must use yes/no, and '1x2' keeps its original three values.
alter table public.bets drop constraint if exists bets_prediction_check;
alter table public.bets add constraint bets_prediction_check
  check (
    (market = '1x2' and prediction in ('home', 'draw', 'away'))
    or (market = 'total_goals' and prediction in ('over', 'under'))
    or (market = 'btts' and prediction in ('yes', 'no'))
  );

alter table public.bets drop constraint if exists opponent_prediction_check;
alter table public.bets drop constraint if exists bets_opponent_prediction_check;
alter table public.bets add constraint bets_opponent_prediction_check
  check (
    opponent_prediction is null
    or (market = '1x2' and opponent_prediction in ('home', 'draw', 'away'))
    or (market = 'total_goals' and opponent_prediction in ('over', 'under'))
    or (market = 'btts' and opponent_prediction in ('yes', 'no'))
  );

-- The "differs from creator" constraint (0021_opponent_prediction.sql)
-- stays exactly as-is — it's a bare inequality on text values, which is
-- still exactly right regardless of which market's value domain they come
-- from (an 'over' can never equal a 'yes', so this never needs to be
-- market-aware itself).

-- ── bet_create ────────────────────────────────────────────────
-- Adds p_market/p_line (both optional, default to the original 1x2
-- behaviour). Adding parameters changes the signature, so `create or
-- replace` would leave the old 6-arg version callable as a separate
-- overload — same reasoning 0021_opponent_prediction.sql already used for
-- bet_accept. Drop it explicitly so there's exactly one bet_create.
drop function if exists public.bet_create(uuid, uuid, text, bigint, text, text);

create or replace function public.bet_create(
  p_creator_id uuid,
  p_match_id uuid,
  p_prediction text,
  p_stake_cents bigint,
  p_creator_ip text default null,
  p_creator_device_id text default null,
  p_market text default '1x2',
  p_line numeric default null
)
returns table (bet_id uuid, reference text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bet_id uuid := gen_random_uuid();
  v_reference text;
  v_kickoff timestamptz;
  v_is_elimination boolean;
begin
  if p_market not in ('1x2', 'total_goals', 'btts') then
    raise exception 'bet_create: invalid market %', p_market;
  end if;
  if p_market = '1x2' then
    if p_prediction not in ('home', 'draw', 'away') then
      raise exception 'bet_create: invalid prediction % for market 1x2', p_prediction;
    end if;
    if p_line is not null then
      raise exception 'bet_create: market 1x2 does not take a line';
    end if;
  elsif p_market = 'total_goals' then
    if p_prediction not in ('over', 'under') then
      raise exception 'bet_create: invalid prediction % for market total_goals', p_prediction;
    end if;
    if p_line is null or p_line not in (1.5, 2.5, 3.5) then
      raise exception 'bet_create: invalid total_goals line %', p_line;
    end if;
  elsif p_market = 'btts' then
    if p_prediction not in ('yes', 'no') then
      raise exception 'bet_create: invalid prediction % for market btts', p_prediction;
    end if;
    if p_line is not null then
      raise exception 'bet_create: market btts does not take a line';
    end if;
  end if;

  if p_stake_cents <= 0 then
    raise exception 'bet_create: stake must be positive (got %)', p_stake_cents;
  end if;

  select kickoff_at, is_elimination into v_kickoff, v_is_elimination from public.matches where id = p_match_id;
  if not found then
    raise exception 'bet_create: match % not found', p_match_id;
  end if;
  if v_kickoff <= now() then
    raise exception 'bet_create: match has already started';
  end if;
  if v_is_elimination and p_prediction = 'draw' then
    raise exception 'bet_create: elimination matches cannot be predicted as a draw';
  end if;

  v_reference := 'DUE-BET-' || upper(substr(replace(v_bet_id::text, '-', ''), 1, 8));

  perform public.wallet_hold(p_creator_id, p_stake_cents, v_bet_id::text, 'Aposta criada');

  insert into public.bets (id, match_id, creator_id, prediction, stake_cents, status, creator_ip, creator_device_id, reference, market, line)
  values (v_bet_id, p_match_id, p_creator_id, p_prediction, p_stake_cents, 'waiting', p_creator_ip, p_creator_device_id, v_reference, p_market, p_line);

  return query select v_bet_id, v_reference;
end;
$$;

-- ── bet_accept ────────────────────────────────────────────────
-- No new parameter — the market/line are already fixed by the creator; the
-- opponent only picks a prediction WITHIN that same market. Validates
-- p_opponent_prediction against v_bet.market's own domain instead of always
-- assuming 1x2's home/draw/away.
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
  select * into v_bet from public.bets where id = p_bet_id for update;

  if not found then
    raise exception 'bet_accept: bet % not found', p_bet_id;
  end if;

  if v_bet.market = '1x2' and p_opponent_prediction not in ('home', 'draw', 'away') then
    raise exception 'bet_accept: invalid prediction % for market 1x2', p_opponent_prediction;
  elsif v_bet.market = 'total_goals' and p_opponent_prediction not in ('over', 'under') then
    raise exception 'bet_accept: invalid prediction % for market total_goals', p_opponent_prediction;
  elsif v_bet.market = 'btts' and p_opponent_prediction not in ('yes', 'no') then
    raise exception 'bet_accept: invalid prediction % for market btts', p_opponent_prediction;
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
-- Structural change: v_actual used to be computed ONCE, before the bet
-- loop, since every bet on a match was necessarily 1x2. Now different bets
-- on the SAME match can be different markets, so it's computed PER BET,
-- inside the loop, branching on v_bet.market. Everything else (winner
-- determination, payout, commission, notifications, the "neither side
-- called it" refund path) is unchanged — it already only cares about
-- comparing v_bet.prediction/v_bet.opponent_prediction against whatever
-- v_actual turns out to be.
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
      -- Neither prediction matched the actual result — nobody called it,
      -- so nobody should be paid. Same treatment as a voided match: full
      -- refund, no commission. Structurally unreachable for total_goals/
      -- btts (both binary, v_actual always equals exactly one side) —
      -- this path only ever fires for a 1x2 draw nobody predicted.
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

revoke all on function public.bet_create(uuid, uuid, text, bigint, text, text, text, numeric) from public, anon, authenticated;
grant execute on function public.bet_create(uuid, uuid, text, bigint, text, text, text, numeric) to service_role;

revoke all on function public.bet_accept(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.bet_accept(uuid, uuid, text, text, text) to service_role;
