-- =============================================================
-- Migration: 0012_deposits
-- Tracks deposit attempts through the PayGate gateway (mpesa/emola via
-- PaySuite, but Duelo never talks to PaySuite directly -- PayGate is the
-- single owner of that relationship across all its apps, see
-- payment-gateway repo). One row per deposit attempt, created 'pending'
-- when the charge is created and flipped to 'success'/'failed' by the
-- PayGate webhook (app/api/webhooks/paygate/route.ts), which then calls
-- wallet_credit() to actually move the money into the user's wallet.
-- =============================================================

create table if not exists public.deposits (
  id                  uuid        primary key default gen_random_uuid(),
  user_id             uuid        not null references public.profiles(id) on delete cascade,
  amount_cents        bigint      not null check (amount_cents > 0),
  method              text        not null check (method in ('mpesa', 'emola')),
  phone               text        not null,
  status              text        not null default 'pending' check (status in ('pending', 'success', 'failed')),
  -- Our own idempotency key, sent to PayGate as `reference`.
  reference           text        not null unique,
  -- PayGate's gateway_payment_id, set once the charge is created. Null
  -- only in the brief window between inserting the pending row and the
  -- PayGate API responding -- if that call fails the row is flipped
  -- straight to 'failed' (see lib/actions/deposit.ts).
  gateway_payment_id  text        unique,
  checkout_url        text,
  failure_reason      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  confirmed_at        timestamptz
);

create index if not exists deposits_user_id_created_at_idx
  on public.deposits (user_id, created_at desc);

create index if not exists deposits_gateway_payment_id_idx
  on public.deposits (gateway_payment_id);

alter table public.deposits enable row level security;

create policy "Owner can read own deposits"
  on public.deposits
  for select
  using (auth.uid() = user_id);

-- No insert/update/delete policies for anon/authenticated -- all writes
-- happen server-side via the service-role client: the deposit server
-- action creates the pending row, and the PayGate webhook handler
-- confirms/fails it. A client can never forge a deposit or mark one
-- as paid.
