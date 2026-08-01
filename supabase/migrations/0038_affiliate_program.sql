-- =============================================================
-- Migration: 0038_affiliate_program
--
-- Referral/affiliate program. A user's referral_code is generated at
-- registration (app-side, see lib/referral.ts — profiles is inserted via
-- Drizzle, not a Postgres function, unlike bets). referred_by is set once
-- at registration and never changed — the referral relationship is
-- permanent, matching the confirmed product decision.
--
-- Whenever a referred user is a party to a settled bet, their referrer
-- earns referral_share_bps of the platform commission THAT SIDE generated
-- — evaluated independently per side of the duel, not split between two
-- referrers if both sides happen to be referred (by different people).
-- Both rates (commission_rate_bps, referral_share_bps) are now admin-
-- configurable via platform_settings instead of hardcoded, and every
-- payout snapshots the rate it was paid at (affiliate_ledger.referral_rate_bps)
-- so a later rate change never rewrites historical payouts.
-- =============================================================

-- ── profiles: referral columns ──────────────────────────────────
alter table public.profiles
  add column if not exists referral_code text,
  add column if not exists referred_by uuid references public.profiles(id);

create unique index if not exists profiles_referral_code_uq on public.profiles (referral_code);
create index if not exists profiles_referred_by_idx on public.profiles (referred_by);

-- No NOT NULL on referral_code yet — existing rows (pre-feature users) have
-- none. Backfill them so every profile has a code, then enforce NOT NULL
-- for all rows going forward (new inserts always supply one — see
-- registerUser in lib/actions/auth.ts).
do $$
declare
  v_profile record;
  v_alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_code text;
  v_attempt int;
begin
  for v_profile in select id from public.profiles where referral_code is null loop
    v_attempt := 0;
    loop
      v_attempt := v_attempt + 1;
      v_code := '';
      for i in 1..7 loop
        v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
      end loop;
      begin
        update public.profiles set referral_code = v_code where id = v_profile.id;
        exit;
      exception when unique_violation then
        if v_attempt >= 10 then
          raise exception 'profiles backfill: could not generate a unique referral_code for %', v_profile.id;
        end if;
      end;
    end loop;
  end loop;
end $$;

alter table public.profiles alter column referral_code set not null;

-- ── platform_settings: singleton, admin-configurable rates ──────
-- Same singleton shape as live_sync_state (migration 0031) — one row,
-- id pinned to 1.
create table if not exists public.platform_settings (
  id smallint primary key default 1,
  commission_rate_bps integer not null default 1000,  -- 10.00%
  referral_share_bps integer not null default 3000,    -- 30.00%
  updated_at timestamptz not null default now(),
  constraint platform_settings_singleton check (id = 1),
  constraint platform_settings_commission_range check (commission_rate_bps between 0 and 10000),
  constraint platform_settings_referral_range check (referral_share_bps between 0 and 10000)
);

insert into public.platform_settings (id) values (1) on conflict (id) do nothing;

alter table public.platform_settings enable row level security;
-- Internal-only, same pattern as live_sync_state/admin_audit_log — no
-- select/insert/update policies for anon/authenticated; read/written only
-- via the service-role client (lib/actions/platform-settings.ts).

-- ── affiliate_ledger: one row per referral payout ────────────────
create table if not exists public.affiliate_ledger (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id),
  referred_user_id uuid not null references public.profiles(id),
  bet_id uuid not null references public.bets(id),
  match_id uuid not null references public.matches(id),
  side text not null check (side in ('creator', 'opponent')),
  source_commission_cents bigint not null,
  referral_rate_bps integer not null,
  payout_cents bigint not null,
  created_at timestamptz not null default now(),
  unique (bet_id, side)
);

create index if not exists affiliate_ledger_referrer_id_idx on public.affiliate_ledger (referrer_id);
create index if not exists affiliate_ledger_referred_user_id_idx on public.affiliate_ledger (referred_user_id);

alter table public.affiliate_ledger enable row level security;

create policy "Owner can read own affiliate earnings"
  on public.affiliate_ledger
  for select
  using (auth.uid() = referrer_id);

-- No insert/update/delete policies — written exclusively inside
-- affiliate_pay_if_referred below (SECURITY DEFINER, service_role only).

-- ── wallet_ledger: add 'referral_commission' type ────────────────
alter table public.wallet_ledger drop constraint if exists wallet_ledger_type_check;
alter table public.wallet_ledger add constraint wallet_ledger_type_check
  check (type in (
    'deposit', 'hold', 'release', 'settle_win', 'settle_loss',
    'withdrawal_hold', 'withdrawal_release', 'withdrawal_complete',
    'refund_fee', 'referral_commission'
  ));

-- ── affiliate_pay_if_referred ─────────────────────────────────────
-- Pays p_referred_user_id's referrer (if any) their configured share of
-- the commission this one side of the bet generated. No-op if the user
-- has no referrer, or if the computed payout rounds to zero. Reuses the
-- existing wallet_credit (migration 0001) rather than a new function —
-- it already takes a free-form p_type. on conflict (bet_id, side) do
-- nothing makes this safe to call at most once-effectively per side even
-- if bet_settle_match were ever re-entered for the same bet.
create or replace function public.affiliate_pay_if_referred(
  p_referred_user_id uuid,
  p_source_commission_cents bigint,
  p_bet_id uuid,
  p_match_id uuid,
  p_side text,
  p_rate_bps integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer uuid;
  v_payout bigint;
begin
  if p_source_commission_cents <= 0 or p_rate_bps <= 0 then
    return;
  end if;

  select referred_by into v_referrer from public.profiles where id = p_referred_user_id;
  if v_referrer is null then
    return;
  end if;

  v_payout := round(p_source_commission_cents * p_rate_bps / 10000.0);
  if v_payout <= 0 then
    return;
  end if;

  perform public.wallet_credit(
    v_referrer, v_payout, 'referral_commission', p_bet_id::text,
    'Comissão de afiliado — aposta de utilizador que recomendaste'
  );

  insert into public.affiliate_ledger (
    referrer_id, referred_user_id, bet_id, match_id, side,
    source_commission_cents, referral_rate_bps, payout_cents
  ) values (
    v_referrer, p_referred_user_id, p_bet_id, p_match_id, p_side,
    p_source_commission_cents, p_rate_bps, v_payout
  )
  on conflict (bet_id, side) do nothing;
end;
$$;

revoke all on function public.affiliate_pay_if_referred(uuid, bigint, uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.affiliate_pay_if_referred(uuid, bigint, uuid, uuid, text, integer) to service_role;

-- ── bet_settle_match ──────────────────────────────────────────
-- Same body as 0036_refund_fee.sql, with two changes:
--  1. commission_rate_bps/referral_share_bps are read from
--     platform_settings once at the top instead of the 0.10/0.05
--     literals — the refund-fee branch keeps its documented "half of the
--     main rate" relationship, now computed instead of independently
--     hardcoded.
--  2. After each platform_ledger insert, affiliate_pay_if_referred is
--     called once per side of the bet.
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
  v_commission_rate_bps integer;
  v_referral_share_bps integer;
begin
  select commission_rate_bps, referral_share_bps
    into v_commission_rate_bps, v_referral_share_bps
    from public.platform_settings where id = 1;

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
      v_commission := round(v_pot * v_commission_rate_bps / 10000.0);
      v_payout := v_pot - v_commission;

      perform public.wallet_settle(
        v_winner, v_loser, v_bet.stake_cents, v_payout, v_bet.id,
        'Liquidação automática — pote menos comissão'
      );

      insert into public.platform_ledger (bet_id, match_id, amount_cents)
      values (v_bet.id, p_match_id, v_commission);

      perform public.affiliate_pay_if_referred(v_bet.creator_id, v_commission, v_bet.id, p_match_id, 'creator', v_referral_share_bps);
      perform public.affiliate_pay_if_referred(v_bet.opponent_id, v_commission, v_bet.id, p_match_id, 'opponent', v_referral_share_bps);

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
      -- platform ran the whole duel to see — a fee (half the main
      -- commission rate) applies to each side's own stake, retained
      -- instead of a full refund.
      v_refund_fee := round(v_bet.stake_cents * v_commission_rate_bps / 2 / 10000.0);

      perform public.wallet_release_with_fee(
        v_bet.creator_id, v_bet.stake_cents, v_refund_fee, v_bet.id::text,
        'Nenhuma previsão acertou o resultado — reembolso menos taxa'
      );
      perform public.wallet_release_with_fee(
        v_bet.opponent_id, v_bet.stake_cents, v_refund_fee, v_bet.id::text,
        'Nenhuma previsão acertou o resultado — reembolso menos taxa'
      );

      insert into public.platform_ledger (bet_id, match_id, amount_cents)
      values (v_bet.id, p_match_id, v_refund_fee * 2);

      perform public.affiliate_pay_if_referred(v_bet.creator_id, v_refund_fee, v_bet.id, p_match_id, 'creator', v_referral_share_bps);
      perform public.affiliate_pay_if_referred(v_bet.opponent_id, v_refund_fee, v_bet.id, p_match_id, 'opponent', v_referral_share_bps);

      update public.bets set status = 'refunded' where id = v_bet.id;

      perform public.notify(
        v_bet.creator_id, 'bet_refunded', 'Aposta reembolsada',
        'Nenhuma das previsões acertou o resultado — devolvemos o valor menos uma taxa.',
        '/d/' || v_bet.reference
      );
      perform public.notify(
        v_bet.opponent_id, 'bet_refunded', 'Aposta reembolsada',
        'Nenhuma das previsões acertou o resultado — devolvemos o valor menos uma taxa.',
        '/d/' || v_bet.reference
      );
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
