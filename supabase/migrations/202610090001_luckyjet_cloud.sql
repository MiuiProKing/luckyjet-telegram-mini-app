-- Separate Lucky Jet destination. No Telegram tables, credentials or game sessions.
begin;
create table if not exists public.luckyjet_rounds (
  id text primary key,
  source_seq bigint not null unique,
  coefficient double precision not null check (coefficient >= 1 and coefficient < 'Infinity'::float8),
  round_timestamp timestamptz,
  estimated boolean not null,
  origin text not null check (origin in ('archive','live')),
  received_at timestamptz,
  live_received_at timestamptz,
  completed boolean not null default true check (completed),
  imported_at timestamptz not null default now()
);
create table if not exists public.luckyjet_pc_state (
  id text primary key check (id='pc'),
  mirrored_at timestamptz not null,
  payload jsonb not null
);
create table if not exists public.luckyjet_prediction_journal (
  id text primary key,
  source text not null check (source in ('classic','beeai')),
  recorded_at double precision not null,
  payload jsonb not null
);
alter table public.luckyjet_rounds enable row level security;
alter table public.luckyjet_pc_state enable row level security;
alter table public.luckyjet_prediction_journal enable row level security;
revoke all on public.luckyjet_rounds, public.luckyjet_pc_state, public.luckyjet_prediction_journal from anon, authenticated;
grant all on public.luckyjet_rounds, public.luckyjet_pc_state, public.luckyjet_prediction_journal to service_role;
create or replace function public.luckyjet_immutable_round() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.id <> old.id or new.source_seq <> old.source_seq or new.coefficient <> old.coefficient then
    raise exception 'ROUND_ID_CONFLICT';
  end if;
  return new;
end $$;
drop trigger if exists luckyjet_round_immutable on public.luckyjet_rounds;
create trigger luckyjet_round_immutable before update on public.luckyjet_rounds
for each row execute function public.luckyjet_immutable_round();
create or replace function public.luckyjet_immutable_prediction() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.id<>old.id or new.source<>old.source or new.recorded_at<>old.recorded_at
    or new.payload->'target' is distinct from old.payload->'target'
    or new.payload->'horizon' is distinct from old.payload->'horizon'
    or new.payload->'anchor' is distinct from old.payload->'anchor'
    or new.payload->'anchor_id' is distinct from old.payload->'anchor_id'
    or new.payload->'created_at' is distinct from old.payload->'created_at' then
    raise exception 'PREDICTION_IMMUTABLE';
  end if;
  if coalesce(old.payload->>'status','') not in ('pending') and new.payload<>old.payload then
    raise exception 'RESOLVED_PREDICTION_IMMUTABLE';
  end if;
  return new;
end $$;
drop trigger if exists luckyjet_prediction_immutable on public.luckyjet_prediction_journal;
create trigger luckyjet_prediction_immutable before update on public.luckyjet_prediction_journal
for each row execute function public.luckyjet_immutable_prediction();
commit;

begin;
create sequence if not exists public.luckyjet_cloud_seq;
alter table public.luckyjet_rounds alter column source_seq set default nextval('public.luckyjet_cloud_seq');
create table if not exists public.luckyjet_cloud_workers(
 id uuid primary key, started_at timestamptz not null default now(),
 checked_at timestamptz not null default now(), connected boolean not null default false,
 expires_at timestamptz not null, error text not null default '', rounds integer not null default 0
);
alter table public.luckyjet_cloud_workers enable row level security;
revoke all on public.luckyjet_cloud_workers from anon,authenticated;
grant all on public.luckyjet_cloud_workers to service_role;
grant usage,select on sequence public.luckyjet_cloud_seq to service_role;
create or replace function public.luckyjet_save_cloud_round(p_id text,p_coefficient float8,p_timestamp timestamptz,p_estimated boolean)
returns boolean language plpgsql security definer set search_path=public as $$
declare previous float8; inserted boolean;
begin
 if p_id is null or length(p_id) not between 1 and 200 or p_coefficient<1 or p_coefficient>='Infinity'::float8 or p_coefficient='NaN'::float8 then raise exception 'INVALID_ROUND';end if;
 insert into luckyjet_rounds(id,coefficient,round_timestamp,estimated,origin,received_at,live_received_at)
 values(p_id,p_coefficient,p_timestamp,p_estimated,'live',now(),now()) on conflict(id) do nothing;
 inserted:=found;
 select coefficient into previous from luckyjet_rounds where id=p_id;
 if previous is distinct from p_coefficient then raise exception 'ROUND_ID_CONFLICT';end if;
 return inserted;
end $$;
revoke all on function public.luckyjet_save_cloud_round(text,float8,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.luckyjet_save_cloud_round(text,float8,timestamptz,boolean) to service_role;
create or replace function public.luckyjet_cloud_status() returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('source','Supabase cloud collector','pc_required',false,
 'source_connected',exists(select 1 from luckyjet_cloud_workers where connected and error='' and checked_at>now()-interval '35 seconds' and expires_at>now()),
 'fresh',exists(select 1 from luckyjet_cloud_workers where connected and error='' and checked_at>now()-interval '35 seconds' and expires_at>now()),
 'last_round_at',(select max(live_received_at) from luckyjet_rounds where origin='live'),
 'checked_at',now(),'error',coalesce((select error from luckyjet_cloud_workers order by started_at desc limit 1),'NOT_STARTED'),
 'game_order_verified',false);
$$;
revoke all on function public.luckyjet_cloud_status() from public,anon,authenticated;
grant execute on function public.luckyjet_cloud_status() to anon,authenticated,service_role;
-- Historical and LIVE coefficients were public in the original version.
-- Only read access is granted; private predictions and credentials remain private.
grant select on public.luckyjet_rounds to anon,authenticated;
drop policy if exists luckyjet_read_coefficients on public.luckyjet_rounds;
create policy luckyjet_read_coefficients on public.luckyjet_rounds for select to anon,authenticated using(true);
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='luckyjet_rounds' and schemaname='public') then
 alter publication supabase_realtime add table public.luckyjet_rounds;
 end if;
end $$;
commit;

begin;
alter table public.luckyjet_rounds add column if not exists collection_backend text not null default 'pc_import' check(collection_backend in('pc_import','cloud'));
alter table public.luckyjet_rounds add column if not exists migration_source_seq bigint;
update public.luckyjet_rounds set collection_backend='cloud' where imported_at>=(select min(started_at) from public.luckyjet_cloud_workers) and source_seq>0;
create or replace function public.luckyjet_save_cloud_round(p_id text,p_coefficient float8,p_timestamp timestamptz,p_estimated boolean)
returns boolean language plpgsql security definer set search_path=public as $$
declare previous float8; inserted boolean;
begin
 if p_id is null or length(p_id) not between 1 and 200 or p_coefficient<1 or p_coefficient>='Infinity'::float8 or p_coefficient='NaN'::float8 then raise exception 'INVALID_ROUND';end if;
 insert into luckyjet_rounds(id,coefficient,round_timestamp,estimated,origin,received_at,live_received_at,collection_backend)
 values(p_id,p_coefficient,p_timestamp,p_estimated,'live',now(),now(),'cloud') on conflict(id) do nothing;
 inserted:=found;
 select coefficient into previous from luckyjet_rounds where id=p_id;
 if previous is distinct from p_coefficient then raise exception 'ROUND_ID_CONFLICT';end if;
 return inserted;
end $$;
create or replace view public.luckyjet_classic_history with(security_invoker=true) as
 select id,source_seq,coefficient,round_timestamp,estimated,origin,received_at,live_received_at,collection_backend,
 case when collection_backend='cloud' then 1000000000000+source_seq else coalesce(migration_source_seq,source_seq) end as feed_order
 from public.luckyjet_rounds;
grant select on public.luckyjet_classic_history to anon,authenticated,service_role;
commit;
