-- =============================================================
-- Migration: 0020_notification_reference
--
-- Adds an optional `reference` to notifications, so a later event about the
-- same thing (a deposit that first reported 'failed', then a late
-- 'payment.success' arrived — mobile money rails are eventually
-- consistent, see app/api/webhooks/paygate/route.ts) can find and remove
-- the earlier notification instead of leaving both a "Depósito falhou" and
-- a "Depósito confirmado" sitting in the same list, contradicting each
-- other. Deleting a stale notification here isn't the same class of
-- operation as deleting a financial ledger row — wallet_ledger stays
-- fully append-only; this is a UX/communication layer correcting a
-- since-superseded status update, closer to replacing a toast than
-- rewriting an audit trail.
-- =============================================================

alter table public.notifications add column if not exists reference text;

create index if not exists notifications_user_id_type_reference_idx
  on public.notifications (user_id, type, reference);

-- create or replace only actually replaces a function when the parameter
-- TYPES/COUNT match exactly — adding a 6th parameter here would otherwise
-- create a second, overloaded `notify` alongside the old 5-arg one instead
-- of replacing it. Drop the old signature explicitly first.
drop function if exists public.notify(uuid, text, text, text, text);

create or replace function public.notify(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_link text default null,
  p_reference text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, body, link, reference)
  values (p_user_id, p_type, p_title, p_body, p_link, p_reference);
end;
$$;

-- notify()'s signature grew a new trailing default-valued parameter — same
-- object identity in Postgres (same name+arg types up to the new default),
-- so no drop/re-grant needed, but re-asserting the grant is cheap insurance.
revoke all on function public.notify(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.notify(uuid, text, text, text, text, text) to service_role;
