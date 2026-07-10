-- =============================================================
-- Migration: 0000_profiles
-- Creates the profiles table with Row Level Security (RLS)
-- =============================================================

-- profiles table: one row per user, linked to auth.users
create table if not exists public.profiles (
  id            uuid        primary key references auth.users(id) on delete cascade,
  phone         text        not null unique,
  email         text        not null,
  display_name  text        not null,
  age_confirmed_at timestamptz not null,
  created_at    timestamptz not null default now()
);

-- Enable RLS
alter table public.profiles enable row level security;

-- Policy: users can only read their own profile
create policy "Owner can read own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

-- Policy: users can only update their own profile
create policy "Owner can update own profile"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No INSERT or DELETE via PostgREST/anon — inserts happen via server action
-- using the service-role key (which bypasses RLS).
