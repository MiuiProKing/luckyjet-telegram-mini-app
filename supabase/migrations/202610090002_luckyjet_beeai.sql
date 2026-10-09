create table if not exists public.luckyjet_bee_settings (
 id boolean primary key default true check(id), enabled boolean not null default true,
 persona text not null default 'Краткий русский анализ реальных раундов.', knowledge text not null default '',
 model text not null default '', message text not null default 'Ожидаю свежие раунды Supabase',
 active boolean not null default false, checked_at timestamptz, lease_id uuid, lease_until timestamptz,
 retry_at timestamptz not null default '-infinity', next_analysis timestamptz not null default '-infinity'
);
insert into public.luckyjet_bee_settings(id) values(true) on conflict do nothing;
create table if not exists public.luckyjet_bee_predictions (
 id bigint generated always as identity primary key, anchor_id text not null unique,
 anchor_seq bigint not null, created_at timestamptz not null default clock_timestamp(),
 model text not null, target numeric, horizon integer not null check(horizon between 1 and 3),
 status text not null check(status in('pending','hit','miss','unknown','late','observe','error')),
 explanation text not null, observed integer not null default 0, actual numeric, result_id text,
 context_sha256 text not null, context jsonb not null
);
create table if not exists public.luckyjet_bee_attempts (
 id uuid primary key, anchor_id text not null, requested_at timestamptz not null default clock_timestamp(),
 context jsonb not null, outcome text not null default 'requested', finished_at timestamptz
);
alter table public.luckyjet_bee_attempts enable row level security;
revoke all on public.luckyjet_bee_attempts from anon,authenticated;
grant all on public.luckyjet_bee_attempts to service_role;
alter table public.luckyjet_bee_settings enable row level security;
alter table public.luckyjet_bee_predictions enable row level security;
revoke all on public.luckyjet_bee_settings,public.luckyjet_bee_predictions from anon,authenticated;
grant all on public.luckyjet_bee_settings,public.luckyjet_bee_predictions to service_role;
grant usage,select on sequence public.luckyjet_bee_predictions_id_seq to service_role;
create or replace function public.luckyjet_bee_immutable() returns trigger language plpgsql as $$
begin
 if old.status<>'pending' or (to_jsonb(new)-array['status','observed','actual','result_id'])<>(to_jsonb(old)-array['status','observed','actual','result_id']) then
  raise exception 'BEE_PREDICTION_IMMUTABLE';
 end if;
 if new.observed<old.observed then raise exception 'BEE_OBSERVED_REWIND';end if;
 return new;
end $$;
drop trigger if exists luckyjet_bee_immutable on public.luckyjet_bee_predictions;
create trigger luckyjet_bee_immutable before update on public.luckyjet_bee_predictions for each row execute function public.luckyjet_bee_immutable();
create or replace function public.luckyjet_bee_claim(p_lease uuid) returns boolean
language plpgsql security definer set search_path=public as $$
begin
 update luckyjet_bee_settings set lease_id=p_lease,lease_until=clock_timestamp()+interval '120 seconds'
 where id and (lease_until is null or lease_until<clock_timestamp());
 return found;
end $$;
create or replace function public.luckyjet_bee_save(p_anchor text,p_model text,p_target numeric,p_horizon integer,p_decision text,p_explanation text,p_digest text,p_context jsonb) returns text
language plpgsql security definer set search_path=public as $$
declare anchor luckyjet_rounds%rowtype;latest text;state text;fresh boolean;
begin
 lock table luckyjet_rounds in share mode;
 select * into anchor from luckyjet_rounds where id=p_anchor and collection_backend='cloud';
 if not found then raise exception 'BEE_ANCHOR_REQUIRED';end if;
 select id into latest from luckyjet_rounds where collection_backend='cloud' order by source_seq desc limit 1;
 fresh:=coalesce((luckyjet_cloud_status()->>'fresh')::boolean,false);
 state:=case when not(select enabled from luckyjet_bee_settings where id) then 'unknown'
 when latest<>p_anchor or not fresh then 'late' when p_decision='observe' then 'observe' else 'pending' end;
 insert into luckyjet_bee_predictions(anchor_id,anchor_seq,model,target,horizon,status,explanation,context_sha256,context)
 values(p_anchor,anchor.source_seq,p_model,p_target,p_horizon,state,p_explanation,p_digest,p_context) on conflict(anchor_id) do nothing;
 if not found then return 'duplicate';end if;return state;
end $$;
revoke all on function public.luckyjet_bee_claim(uuid),public.luckyjet_bee_save(text,text,numeric,integer,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.luckyjet_bee_claim(uuid),public.luckyjet_bee_save(text,text,numeric,integer,text,text,text,jsonb) to service_role;
create or replace function public.luckyjet_bee_stats() returns jsonb language sql security definer set search_path=public as $$
 select coalesce(jsonb_agg(t),'[]'::jsonb) from (select target,horizon,count(*) filter(where status='hit') hits,count(*) filter(where status='miss') misses,count(*) filter(where status in('unknown','late')) unknown from luckyjet_bee_predictions where target is not null group by target,horizon order by target,horizon)t;
$$;
revoke all on function public.luckyjet_bee_stats() from public,anon,authenticated;
grant execute on function public.luckyjet_bee_stats() to service_role;
