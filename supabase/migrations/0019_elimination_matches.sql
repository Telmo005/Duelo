-- =============================================================
-- Migration: 0019_elimination_matches
--
-- Knockout/elimination fixtures (cup finals, Champions League knockout
-- rounds, etc.) can't end in a draw — extra time and penalties always
-- produce a winner. 'Empate' was offered as a prediction for every match
-- regardless, which is a real bug for those fixtures: nobody could ever
-- win that prediction, and worse, a drawn scoreline entered at settlement
-- would silently resolve every bet against whichever side didn't predict
-- the (impossible) draw.
--
-- The fix is enforced in TWO places, both required: bet_create rejects a
-- 'draw' prediction for an elimination match (so one is never placed), and
-- bet_settle_match rejects an equal scoreline for one (so an admin can't
-- accidentally settle it as a draw — they have to enter the actual
-- decisive result, e.g. reflecting a penalty-shootout winner).
-- =============================================================

alter table public.matches add column if not exists is_elimination boolean not null default false;

-- bet_create (current signature from 0014_bet_reference.sql)
create or replace function public.bet_create(
  p_creator_id uuid,
  p_match_id uuid,
  p_prediction text,
  p_stake_cents bigint,
  p_creator_ip text default null,
  p_creator_device_id text default null
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
  if p_prediction not in ('home', 'draw', 'away') then
    raise exception 'bet_create: invalid prediction %', p_prediction;
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

  insert into public.bets (id, match_id, creator_id, prediction, stake_cents, status, creator_ip, creator_device_id, reference)
  values (v_bet_id, p_match_id, p_creator_id, p_prediction, p_stake_cents, 'waiting', p_creator_ip, p_creator_device_id, v_reference);

  return query select v_bet_id, v_reference;
end;
$$;

-- bet_settle_match (current signature from 0003_settlement.sql, already
-- carrying the notify() calls added in 0018_notifications.sql)
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
