-- =============================================================
-- Migration: 0025_auto_close_empty_matches
--
-- Product change: a manually-entered fixture (no external_id — the SETL-01
-- fallback for leagues no automated feed covers) that nobody ever bet on
-- shouldn't need an admin to click "Liquidar"/"Adiado"/"Abandonado" just to
-- get it out of the worklist — there's no money involved, nothing to
-- settle. This closes it automatically once its live window has passed.
-- Matches that DID get at least one bet still require a human to enter the
-- real result (no trusted automated feed for these), unchanged from before.
-- =============================================================

create or replace function public.match_close_if_empty(p_match_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match record;
  v_bet_count integer;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then
    return false;
  end if;
  if v_match.match_status <> 'scheduled' then
    return false;
  end if;

  select count(*) into v_bet_count from public.bets where match_id = p_match_id;
  if v_bet_count > 0 then
    return false;
  end if;

  update public.matches set match_status = 'closed', settled_at = now() where id = p_match_id;
  return true;
end;
$$;

revoke all on function public.match_close_if_empty(uuid) from public, anon, authenticated;
grant execute on function public.match_close_if_empty(uuid) to service_role;
