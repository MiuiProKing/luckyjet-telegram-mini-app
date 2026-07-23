-- AllPredictor license and user database
-- Run this file once in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.app_users (
  telegram_id bigint primary key,
  username text,
  first_name text,
  last_name text,
  language_code text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  launch_count integer not null default 1,
  is_blocked boolean not null default false,
  referral_code text unique,
  referred_by text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.license_keys (
  id uuid primary key default gen_random_uuid(),
  license_key text unique not null,
  plan text not null check (plan in ('pro_1','pro_7','pro_30','pro_90','lifetime')),
  duration_days integer,
  max_devices integer not null default 1,
  max_activations integer not null default 1,
  activation_count integer not null default 0,
  bound_telegram_id bigint references public.app_users(telegram_id) on delete set null,
  status text not null default 'active' check (status in ('active','revoked','used','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  activated_at timestamptz,
  note text,
  created_by bigint
);

create table if not exists public.license_activations (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.license_keys(id) on delete cascade,
  telegram_id bigint not null references public.app_users(telegram_id) on delete cascade,
  activation_token text unique not null default encode(gen_random_bytes(32), 'hex'),
  device_hash text,
  activated_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  expires_at timestamptz,
  is_active boolean not null default true,
  unique (license_id, telegram_id)
);

create table if not exists public.app_events (
  id bigint generated always as identity primary key,
  telegram_id bigint references public.app_users(telegram_id) on delete set null,
  event_name text not null,
  page text,
  game text,
  created_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb
);

create table if not exists public.referrals (
  id bigint generated always as identity primary key,
  referrer_telegram_id bigint references public.app_users(telegram_id) on delete cascade,
  referred_telegram_id bigint unique references public.app_users(telegram_id) on delete cascade,
  referral_code text not null,
  created_at timestamptz not null default now(),
  reward_granted boolean not null default false
);

create index if not exists idx_app_users_last_seen on public.app_users(last_seen_at desc);
create index if not exists idx_license_keys_status on public.license_keys(status);
create index if not exists idx_license_activations_token on public.license_activations(activation_token);
create index if not exists idx_app_events_created on public.app_events(created_at desc);

alter table public.app_users enable row level security;
alter table public.license_keys enable row level security;
alter table public.license_activations enable row level security;
alter table public.app_events enable row level security;
alter table public.referrals enable row level security;

-- No direct anonymous table access. Edge Functions use SUPABASE_SERVICE_ROLE_KEY.
revoke all on public.app_users from anon, authenticated;
revoke all on public.license_keys from anon, authenticated;
revoke all on public.license_activations from anon, authenticated;
revoke all on public.app_events from anon, authenticated;
revoke all on public.referrals from anon, authenticated;

create or replace function public.make_license_key(prefix text default 'V0X')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
begin
  loop
    candidate := upper(prefix) || '-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 4)) || '-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 4)) || '-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 4));
    exit when not exists (select 1 from public.license_keys where license_key = candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function public.create_license(
  p_plan text,
  p_duration_days integer default null,
  p_max_activations integer default 1,
  p_note text default null,
  p_created_by bigint default null
)
returns public.license_keys
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.license_keys;
  effective_days integer;
begin
  if p_plan not in ('pro_1','pro_7','pro_30','pro_90','lifetime') then
    raise exception 'INVALID_PLAN';
  end if;

  effective_days := case p_plan
    when 'pro_1' then 1
    when 'pro_7' then 7
    when 'pro_30' then 30
    when 'pro_90' then 90
    else p_duration_days
  end;

  insert into public.license_keys (
    license_key, plan, duration_days, max_activations, note, created_by
  ) values (
    public.make_license_key('V0X'), p_plan, effective_days, greatest(1, p_max_activations), p_note, p_created_by
  ) returning * into result;

  return result;
end;
$$;
