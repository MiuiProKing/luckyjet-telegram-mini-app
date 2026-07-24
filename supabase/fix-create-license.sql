-- AllPredictor: repair license creation RPC
-- Run this file once in Supabase SQL Editor.

create extension if not exists pgcrypto;

alter table if exists public.license_keys
  add column if not exists max_devices integer not null default 1,
  add column if not exists max_activations integer not null default 1,
  add column if not exists activation_count integer not null default 0,
  add column if not exists note text,
  add column if not exists created_by bigint;

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
    candidate := upper(prefix)
      || '-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 4))
      || '-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 4))
      || '-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 4));
    exit when not exists (
      select 1 from public.license_keys where license_key = candidate
    );
  end loop;
  return candidate;
end;
$$;

drop function if exists public.create_license(text, integer, integer, text, bigint);

create function public.create_license(
  p_plan text,
  p_duration_days integer default null,
  p_max_activations integer default 1,
  p_note text default null,
  p_created_by bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  created_row public.license_keys;
  effective_days integer;
  device_limit integer;
begin
  if p_plan not in ('pro_1','pro_7','pro_30','pro_90','lifetime') then
    raise exception 'INVALID_PLAN';
  end if;

  effective_days := case p_plan
    when 'pro_1' then 1
    when 'pro_7' then 7
    when 'pro_30' then 30
    when 'pro_90' then 90
    when 'lifetime' then null
    else p_duration_days
  end;

  device_limit := least(2, greatest(1, coalesce(p_max_activations, 1)));

  insert into public.license_keys (
    license_key,
    plan,
    duration_days,
    max_devices,
    max_activations,
    activation_count,
    status,
    note,
    created_by
  ) values (
    public.make_license_key('V0X'),
    p_plan,
    effective_days,
    device_limit,
    device_limit,
    0,
    'active',
    nullif(trim(coalesce(p_note, '')), ''),
    p_created_by
  )
  returning * into created_row;

  return to_jsonb(created_row);
end;
$$;

grant execute on function public.create_license(text, integer, integer, text, bigint)
  to service_role;

notify pgrst, 'reload schema';

-- Test result: should return one JSON object with a V0X key.
select public.create_license('pro_1', null, 1, 'SQL TEST', 8016237913) as test_license;
