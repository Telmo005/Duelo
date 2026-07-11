-- =============================================================
-- Migration: 0009_bet_accept_kickoff_check
-- Fixes a settlement-integrity bug: bet_create already refuses to open
-- a bet once its match has kicked off, but bet_accept had no equivalent
-- check. A 'waiting' bet stayed acceptable after kickoff (until the
-- refund-expired-bets cron eventually caught it), letting an opponent
-- accept with knowledge of the live score/result — defeating the whole
-- point of a P2P bet (symmetric uncertainty at acceptance time).
-- =============================================================

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
end;
$$;
