-- Isolated v3 objects only. Existing coefficients, collectors and older models stay intact.
create schema if not exists god_complete_v3_private;
revoke all on schema god_complete_v3_private from public, anon, authenticated;
grant usage on schema god_complete_v3_private to service_role;

create table if not exists public.god_complete_v3_analytics_cache(
 zone text primary key check(zone in ('UTC','Europe/Kyiv')),
 calculated_at timestamptz not null default now(), payload jsonb not null
);
alter table public.god_complete_v3_analytics_cache enable row level security;
drop policy if exists god_complete_v3_analytics_read on public.god_complete_v3_analytics_cache;
create policy god_complete_v3_analytics_read on public.god_complete_v3_analytics_cache for select to anon,authenticated using(true);
revoke all on public.god_complete_v3_analytics_cache from public,anon,authenticated;
grant select on public.god_complete_v3_analytics_cache to anon,authenticated;
grant select,insert,update on public.god_complete_v3_analytics_cache to service_role;

create table if not exists public.god_complete_v3_signals(
 id text primary key,
 channel text not null,
 target double precision not null check(target>=1 and target<'Infinity'::float8),
 start bigint not null,
 "end" bigint,
 issued_at bigint not null,
 metadata jsonb not null,
 status text not null default 'pending' check(status in ('pending','hit','miss','unknown')),
 actual double precision,
 result_at bigint,
 round_id text,
 checked_at bigint,
 evidence jsonb,
 constraint god_complete_v3_end_order check("end" is null or "end">start)
);
create index if not exists god_complete_v3_signal_issued on public.god_complete_v3_signals(issued_at desc,id desc);
create unique index if not exists god_complete_v3_single_pending on public.god_complete_v3_signals(channel) where status='pending';
alter table public.god_complete_v3_signals enable row level security;
drop policy if exists god_complete_v3_signal_read on public.god_complete_v3_signals;
create policy god_complete_v3_signal_read on public.god_complete_v3_signals for select to anon,authenticated using(true);
revoke all on public.god_complete_v3_signals from public,anon,authenticated;
grant select on public.god_complete_v3_signals to anon,authenticated;
grant select,insert,update on public.god_complete_v3_signals to service_role;

create table if not exists public.god_complete_v3_events(
 seq bigserial primary key,
 signal_id text not null references public.god_complete_v3_signals(id),
 at bigint not null,
 kind text not null check(kind in ('created','hit','miss','unknown','revision')),
 payload jsonb not null
);
create index if not exists god_complete_v3_event_signal on public.god_complete_v3_events(signal_id,seq);
alter table public.god_complete_v3_events enable row level security;
drop policy if exists god_complete_v3_event_read on public.god_complete_v3_events;
create policy god_complete_v3_event_read on public.god_complete_v3_events for select to anon,authenticated using(true);
revoke all on public.god_complete_v3_events from public,anon,authenticated;
grant select on public.god_complete_v3_events to anon,authenticated;
grant select,insert on public.god_complete_v3_events to service_role;
grant usage,select on sequence public.god_complete_v3_events_seq_seq to service_role;

create table if not exists god_complete_v3_private.runtime(
 singleton boolean primary key default true check(singleton),
 generation bigint not null default 0,
 lease uuid,
 lease_until timestamptz,
 last_tick timestamptz,
 state jsonb not null default '{}'::jsonb,
 diagnostics jsonb not null default '{}'::jsonb
);
alter table god_complete_v3_private.runtime enable row level security;
grant select,insert,update on god_complete_v3_private.runtime to service_role;
insert into god_complete_v3_private.runtime(singleton) values(true) on conflict do nothing;

create or replace function god_complete_v3_private.immutable_signal() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Signal creation records are append-only'; end if;
 if row(new.id,new.channel,new.target,new.start,new."end",new.issued_at,new.metadata)
    is distinct from row(old.id,old.channel,old.target,old.start,old."end",old.issued_at,old.metadata)
 then raise exception 'Signal creation metadata is immutable'; end if;
 return new;
end; $$;
drop trigger if exists god_complete_v3_immutable_signal on public.god_complete_v3_signals;
create trigger god_complete_v3_immutable_signal before update or delete on public.god_complete_v3_signals
for each row execute function god_complete_v3_private.immutable_signal();

create or replace function god_complete_v3_private.immutable_event() returns trigger
language plpgsql set search_path='' as $$
begin raise exception 'Audit events are append-only'; end; $$;
drop trigger if exists god_complete_v3_immutable_event on public.god_complete_v3_events;
create trigger god_complete_v3_immutable_event before update or delete on public.god_complete_v3_events
for each row execute function god_complete_v3_private.immutable_event();

create or replace function public.god_complete_v3_analytics_read(p_zone text default 'UTC') returns jsonb
language sql stable security invoker set search_path='' as $$
 select payload||jsonb_build_object('calculatedAt',calculated_at)
 from public.god_complete_v3_analytics_cache where zone=p_zone;
$$;
revoke all on function public.god_complete_v3_analytics_read(text) from public;
grant execute on function public.god_complete_v3_analytics_read(text) to anon,authenticated,service_role;

create or replace function public.god_complete_v3_refresh_analytics(p_zone text default 'UTC',p_force boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cached public.god_complete_v3_analytics_cache%rowtype; answer jsonb; checked timestamptz:=clock_timestamp();
begin
 if p_zone not in ('UTC','Europe/Kyiv') then raise exception 'Unsupported timezone'; end if;
 perform pg_advisory_xact_lock(hashtextextended('god_complete_v3_analytics:'||p_zone,0));
 select * into cached from public.god_complete_v3_analytics_cache where zone=p_zone;
 if not p_force and cached.calculated_at is not null and cached.calculated_at>checked-interval '60 seconds' then
  return cached.payload||jsonb_build_object('calculatedAt',cached.calculated_at);
 end if;
 with base as materialized(
  select r.id,r.coefficient,r.round_timestamp,r.round_timestamp at time zone p_zone as local_time
  from public.luckyjet_rounds r where r.completed is true and not r.estimated
  and r.coefficient>=1 and r.coefficient<'Infinity'::float8 and r.round_timestamp<=checked
 ), totals as (
  select count(*) as n,min(round_timestamp) as first,max(round_timestamp) as last,
   count(*) filter(where coefficient>=2) as n2,count(*) filter(where coefficient>=5) as n5,
   count(*) filter(where coefficient>=10) as n10,count(*) filter(where coefficient>=100) as n100,
   count(*) filter(where coefficient>=1000) as n1000,count(*) filter(where coefficient>=10000) as n10000,
   count(*) filter(where coefficient>=50000) as n50000
  from base
 ), grouped as (
  select 'hour' as k,extract(hour from local_time)::int as v,count(*) n,
   count(*)filter(where coefficient>=2) n2,count(*)filter(where coefficient>=5)n5,count(*)filter(where coefficient>=10)n10,count(*)filter(where coefficient>=100)n100
  from base group by 2
  union all
  select 'minute',extract(minute from local_time)::int,count(*),
   count(*)filter(where coefficient>=2),count(*)filter(where coefficient>=5),count(*)filter(where coefficient>=10),count(*)filter(where coefficient>=100)
  from base group by 2
  union all
  select 'month',(extract(year from local_time)::int*100+extract(month from local_time)::int),count(*),
   count(*)filter(where coefficient>=2),count(*)filter(where coefficient>=5),count(*)filter(where coefficient>=10),count(*)filter(where coefficient>=100)
  from base group by 2
  union all
  select 'weekday',extract(isodow from local_time)::int,count(*),
   count(*)filter(where coefficient>=2),count(*)filter(where coefficient>=5),count(*)filter(where coefficient>=10),count(*)filter(where coefficient>=100)
  from base group by 2
 ), target_hits as materialized(
  select t.target,b.id,b.coefficient,b.round_timestamp,
   extract(epoch from b.round_timestamp-lag(b.round_timestamp)over(partition by t.target order by b.round_timestamp,b.id))*1000 as gap
  from (values(10),(20),(40),(50),(100),(200),(500))t(target)
  join base b on b.coefficient>=t.target
 ), medians as(
  select target,percentile_cont(0.5)within group(order by gap)filter(where gap>0) as median_gap
  from target_hits group by target
 ), target_stats as(
  select h.target,count(*) as count,min(h.round_timestamp) as first_hit,max(h.round_timestamp) as last_hit,
   max(m.median_gap) as median_gap,
   percentile_cont(0.5)within group(order by abs(h.gap-m.median_gap))filter(where h.gap>0) as mad_gap,
   avg(h.gap)filter(where h.gap>0) as avg_gap,stddev_pop(h.gap)filter(where h.gap>0)as std_gap,
   (array_agg(h.id order by h.round_timestamp desc,h.id desc))[1] as last_id,
   (array_agg(h.coefficient order by h.round_timestamp desc,h.id desc))[1] as last_x
  from target_hits h join medians m using(target) group by h.target
 )
 select jsonb_build_object(
  'version','god-complete-v3','zone',p_zone,'total',t.n,'first',t.first,'last',t.last,
  'serverNow',floor(extract(epoch from checked)*1000)::bigint,
  'firstCoefficient',(select coefficient from base order by round_timestamp,id limit 1),
  'global',jsonb_build_object('p2',round(100.0*t.n2/nullif(t.n,0),2),'p5',round(100.0*t.n5/nullif(t.n,0),2),
   'p10',round(100.0*t.n10/nullif(t.n,0),2),'p100',round(100.0*t.n100/nullif(t.n,0),3),
   'p1000',100.0*t.n1000/nullif(t.n,0),'n2',t.n2,'n5',t.n5,'n10',t.n10,'n100',t.n100,'n1000',t.n1000,'n10000',t.n10000,'n50000',t.n50000),
  'groups',coalesce((select jsonb_agg(jsonb_build_object('k',k,'v',v,'n',n,
   'p2',round(100.0*n2/nullif(n,0),2),'p5',round(100.0*n5/nullif(n,0),2),'p10',round(100.0*n10/nullif(n,0),2),'p100',round(100.0*n100/nullif(n,0),3))order by k,v)from grouped),'[]'::jsonb),
  'huge',coalesce((select jsonb_agg(jsonb_build_object('id',id,'c',coefficient,'t',round_timestamp)order by round_timestamp desc)from base where coefficient>=10000),'[]'::jsonb),
  'thresholdStats',coalesce((select jsonb_agg(jsonb_build_object('target',target,'count',count,'firstHitAt',floor(extract(epoch from first_hit)*1000)::bigint,
   'lastHitAt',floor(extract(epoch from last_hit)*1000)::bigint,'lastHitId',last_id,'lastHitX',last_x,
   'medianGapMs',median_gap,'madGapMs',mad_gap,'avgGapMs',avg_gap,'stdGapMs',std_gap)order by target)from target_stats),'[]'::jsonb),
  'completeHistory',true,'source','own_supabase_exact_completed','originalPrivateServerFormula',false
 )into answer from totals t;
 insert into public.god_complete_v3_analytics_cache(zone,calculated_at,payload)values(p_zone,checked,answer)
 on conflict(zone)do update set calculated_at=excluded.calculated_at,payload=excluded.payload;
 return answer||jsonb_build_object('calculatedAt',checked);
end; $$;
revoke all on function public.god_complete_v3_refresh_analytics(text,boolean) from public,anon,authenticated;
grant execute on function public.god_complete_v3_refresh_analytics(text,boolean) to service_role;

create or replace function public.god_complete_v3_head(p_limit integer default 5000) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(q)order by q.round_timestamp desc,q.id desc),'[]'::jsonb)
 from(select id,source_seq,coefficient,round_timestamp,estimated,completed,
 case when collection_backend='cloud' then 1000000000000+source_seq else coalesce(migration_source_seq,source_seq)end as feed_order
 from public.luckyjet_rounds where completed is true and not estimated and coefficient>=1 and coefficient<'Infinity'::float8
 and round_timestamp<=now() order by round_timestamp desc,id desc limit greatest(1,least(5000,p_limit)))q;
$$;
revoke all on function public.god_complete_v3_head(integer) from public,anon,authenticated;
grant execute on function public.god_complete_v3_head(integer) to service_role;

create or replace function public.god_complete_v3_evidence(p_id text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare s public.god_complete_v3_signals%rowtype; observed bigint:=floor(extract(epoch from now())*1000)::bigint;
 n integer; count_rows integer:=0; actual_x float8;actual_at bigint;actual_id text;first_hit_at bigint;first_hit_rank bigint;
 max_gap float8; first_at bigint;last_at bigint; before_at bigint;after_at bigint;
 max_gap_allowed float8;open_start boolean; is_rounds boolean;result_status text;reason text;
begin
 select * into s from public.god_complete_v3_signals where id=p_id;
 if not found then return null;end if;
 open_start:=coalesce(s.metadata->>'boundaryPolicy','closed')='open_start';
 is_rounds:=coalesce(s.metadata->>'windowKind','time')='rounds' or s."end" is null;
 max_gap_allowed:=least(180000,greatest(60000,coalesce(nullif(s.metadata->>'avgRoundSeconds','')::float8,20)*3000));
 if is_rounds then
  n:=coalesce(nullif(s.metadata->>'roundsRequired','')::integer,nullif(s.metadata->>'plannedRounds','')::integer,nullif(s.metadata->>'rounds','')::integer);
  if n is null or n<1 or n>100000 then return jsonb_build_object('kind','rounds','status','unknown','coverageReason','Некорректное число раундов');end if;
  with prefix as materialized(
   select id,coefficient,floor(extract(epoch from round_timestamp)*1000)::bigint at
   from public.luckyjet_rounds where completed is true and not estimated and coefficient>=1 and coefficient<'Infinity'::float8
   and round_timestamp>to_timestamp(s.start/1000.0) and round_timestamp<=now()
   order by round_timestamp,id limit n
  ), numbered as(
   select *,row_number()over(order by at,id)rn,at-coalesce(lag(at)over(order by at,id),s.start)gap from prefix
  ), hit as(select * from numbered where coefficient>=s.target order by rn limit 1)
  select (select count(*)from numbered),coalesce((select coefficient from hit),(select max(coefficient)from numbered)),
   coalesce((select at from hit),(select at from numbered order by coefficient desc,at,id limit 1)),coalesce((select id from hit),(select id from numbered order by coefficient desc,at,id limit 1)),
   (select at from hit),(select rn from hit),
   (select max(gap)from numbered where rn<=coalesce((select rn from hit),n)),(select min(at)from numbered),(select max(at)from numbered)
  into count_rows,actual_x,actual_at,actual_id,first_hit_at,first_hit_rank,max_gap,first_at,last_at;
  if first_hit_at is null and count_rows<n then result_status:='pending';reason:='Ожидаются следующие полученные завершённые раунды';
  elsif first_hit_at is not null then result_status:='hit';reason:='Цель достигнута в первых N полученных завершённых раундах';
  elsif max_gap is null or max_gap>max_gap_allowed then result_status:='unknown';reason:='Нет полного временного покрытия первых N полученных раундов';
  else result_status:='miss';reason:='Первые N полученных завершённых раундов проверены';end if;
  return jsonb_build_object('kind','rounds','status',result_status,'actual',actual_x,'resultAt',actual_at,'roundId',actual_id,'count',count_rows,'roundsRemaining',greatest(0,n-count_rows),'firstHitAt',first_hit_at,'coverageReason',reason,'maxGapMs',max_gap,'gapThresholdMs',max_gap_allowed,'providerCompletenessVerified',false,'checkedAt',observed);
 end if;
 if observed<=s."end" then return jsonb_build_object('kind','time','status','pending','coverageReason','Окно ещё не закрыто','checkedAt',observed);end if;
 select count(*),max(coefficient) into count_rows,actual_x
 from public.luckyjet_rounds where completed is true and not estimated and coefficient>=1 and coefficient<'Infinity'::float8
 and (case when open_start then round_timestamp>to_timestamp(s.start/1000.0)else round_timestamp>=to_timestamp(s.start/1000.0)end)
 and round_timestamp<=to_timestamp(s."end"/1000.0)and round_timestamp<=now();
 select floor(extract(epoch from round_timestamp)*1000)::bigint,id into actual_at,actual_id
 from public.luckyjet_rounds where completed is true and not estimated and coefficient=actual_x
 and(case when open_start then round_timestamp>to_timestamp(s.start/1000.0)else round_timestamp>=to_timestamp(s.start/1000.0)end)
 and round_timestamp<=to_timestamp(s."end"/1000.0)and round_timestamp<=now()order by round_timestamp,id limit 1;
 if actual_x>=s.target then
  if open_start then
   select coefficient,floor(extract(epoch from round_timestamp)*1000)::bigint,id into actual_x,actual_at,actual_id
   from public.luckyjet_rounds where completed is true and not estimated and coefficient>=s.target and coefficient<'Infinity'::float8
   and round_timestamp>to_timestamp(s.start/1000.0)and round_timestamp<=to_timestamp(s."end"/1000.0)and round_timestamp<=now()order by round_timestamp,id limit 1;
  end if;
  return jsonb_build_object('kind','time','status','hit','actual',actual_x,'resultAt',actual_at,'roundId',actual_id,'count',count_rows,'coverageReason','Цель достигнута внутри закрытого окна','providerCompletenessVerified',false,'checkedAt',observed);
 end if;
 select max(floor(extract(epoch from round_timestamp)*1000)::bigint)into before_at from public.luckyjet_rounds
 where completed is true and not estimated and coefficient>=1 and coefficient<'Infinity'::float8
 and(case when open_start then round_timestamp<=to_timestamp(s.start/1000.0)else round_timestamp<to_timestamp(s.start/1000.0)end);
 select min(floor(extract(epoch from round_timestamp)*1000)::bigint)into after_at from public.luckyjet_rounds
 where completed is true and not estimated and coefficient>=1 and coefficient<'Infinity'::float8
 and round_timestamp>to_timestamp(s."end"/1000.0)and round_timestamp<=now();
 if before_at is not null and after_at is not null then
  select max(gap)into max_gap from(
   select extract(epoch from round_timestamp-lag(round_timestamp)over(order by round_timestamp,id))*1000 as gap
   from public.luckyjet_rounds where completed is true and not estimated and coefficient>=1 and coefficient<'Infinity'::float8
   and round_timestamp>=to_timestamp(before_at/1000.0)and round_timestamp<=to_timestamp(after_at/1000.0)
  )g;
 end if;
 if count_rows=0 or before_at is null or after_at is null then result_status:='unknown';reason:='Нет полного покрытия границ окна';
 elsif max_gap is null or max_gap>max_gap_allowed then result_status:='unknown';reason:='В истории есть большой временной разрыв';
 else result_status:='miss';reason:='Цель не достигнута при проверенном временном покрытии';end if;
 return jsonb_build_object('kind','time','status',result_status,'actual',actual_x,'resultAt',actual_at,'roundId',actual_id,'count',count_rows,'coverageReason',reason,'maxGapMs',max_gap,'gapThresholdMs',max_gap_allowed,'providerCompletenessVerified',false,'checkedAt',observed);
end; $$;
revoke all on function public.god_complete_v3_evidence(text) from public,anon,authenticated;
grant execute on function public.god_complete_v3_evidence(text) to service_role;

create or replace function public.god_complete_v3_acquire() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r god_complete_v3_private.runtime%rowtype; clock timestamptz:=clock_timestamp();nonce uuid; selected jsonb;
begin
 select * into r from god_complete_v3_private.runtime where singleton for update;
 if (r.lease_until is not null and r.lease_until>clock)or(r.last_tick is not null and r.last_tick>clock-interval '4 seconds')then
  return jsonb_build_object('acquired',false,'generation',r.generation);
 end if;
 nonce:=gen_random_uuid();
 update god_complete_v3_private.runtime set lease=nonce,lease_until=clock+interval '45 seconds'where singleton;
 with candidates as(
  (select id from public.god_complete_v3_signals where status='pending'order by issued_at limit 80)
  union
  (select id from public.god_complete_v3_signals where status='unknown'order by coalesce(checked_at,0),issued_at limit 20)
  union
  (select id from public.god_complete_v3_signals order by issued_at desc limit 100)
 ), vals as(
  select s.metadata||jsonb_build_object('id',s.id,'channel',s.channel,'target',s.target,'start',s.start,'end',s."end",'issuedAt',s.issued_at,'status',s.status,'actual',s.actual,'resultAt',s.result_at,'roundId',s.round_id,'evidence',case when s.status in('pending','unknown')then public.god_complete_v3_evidence(s.id)else s.evidence end)as v
  from public.god_complete_v3_signals s join candidates c using(id)
 )select coalesce(jsonb_agg(v),'[]'::jsonb)into selected from vals;
 update public.god_complete_v3_signals set checked_at=floor(extract(epoch from clock)*1000)::bigint
 where id in(select v->>'id'from jsonb_array_elements(selected)v)and status='unknown';
 return jsonb_build_object('acquired',true,'lease',nonce,'generation',r.generation,'now',floor(extract(epoch from clock)*1000)::bigint,'state',r.state,'signals',selected);
end; $$;
revoke all on function public.god_complete_v3_acquire() from public,anon,authenticated;
grant execute on function public.god_complete_v3_acquire() to service_role;

create or replace function public.god_complete_v3_commit(p_lease uuid,p_generation bigint,p_plan jsonb)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r god_complete_v3_private.runtime%rowtype;s jsonb;o jsonb;old_status text;proof jsonb;sig public.god_complete_v3_signals%rowtype;clock bigint:=floor(extract(epoch from clock_timestamp())*1000)::bigint;created integer:=0;changed integer:=0;
begin
 select * into r from god_complete_v3_private.runtime where singleton for update;
 if r.lease is distinct from p_lease or r.generation<>p_generation or r.lease_until<clock_timestamp() then return jsonb_build_object('committed',false,'reason','lease_lost');end if;
 -- Persist outcomes before creations so one pending channel cannot overlap itself.
 for o in select value from jsonb_array_elements(coalesce(p_plan->'outcomes','[]'::jsonb))loop
  select * into sig from public.god_complete_v3_signals where id=o->>'id'for update;
  if not found or sig.status not in('pending','unknown')then continue;end if;
  proof:=public.god_complete_v3_evidence(sig.id);
  if proof->>'status'not in('hit','miss','unknown')then continue;end if;
  old_status:=sig.status;
  update public.god_complete_v3_signals set status=proof->>'status',actual=nullif(proof->>'actual','')::float8,result_at=nullif(proof->>'resultAt','')::bigint,round_id=proof->>'roundId',checked_at=clock,evidence=proof where id=sig.id;
  if old_status is distinct from proof->>'status' then
   select * into sig from public.god_complete_v3_signals where id=sig.id;
   s:=sig.metadata||jsonb_build_object('id',sig.id,'status',sig.status,'actual',sig.actual,'resultAt',sig.result_at,'roundId',sig.round_id,'evidence',sig.evidence);
   insert into public.god_complete_v3_events(signal_id,at,kind,payload)values(sig.id,clock,case when old_status='unknown'then'revision'else sig.status end,jsonb_build_object('signal',s,'outcome',proof,'previousStatus',old_status));changed:=changed+1;
  end if;
 end loop;
 for s in select value from jsonb_array_elements(coalesce(p_plan->'signals','[]'::jsonb))loop
  if s->>'id' !~'^[A-Za-z0-9_-]{12,160}$'or s->>'channel' !~'^[a-z0-9_]{1,80}$'then raise exception 'Invalid signal identity';end if;
  insert into public.god_complete_v3_signals(id,channel,target,start,"end",issued_at,metadata)
  values(s->>'id',s->>'channel',(s->>'target')::float8,(s->>'start')::bigint,nullif(s->>'end','')::bigint,(s->>'issuedAt')::bigint,s)
  on conflict do nothing;
  if found then insert into public.god_complete_v3_events(signal_id,at,kind,payload)values(s->>'id',clock,'created',jsonb_build_object('signal',s||jsonb_build_object('status','pending')));created:=created+1;end if;
 end loop;
 update god_complete_v3_private.runtime set generation=generation+1,lease=null,lease_until=null,last_tick=clock_timestamp(),state=coalesce(p_plan->'state','{}'::jsonb),diagnostics=coalesce(p_plan->'diagnostics','{}'::jsonb)where singleton;
 return jsonb_build_object('committed',true,'created',created,'outcomes',changed,'generation',r.generation+1);
end; $$;
revoke all on function public.god_complete_v3_commit(uuid,bigint,jsonb)from public,anon,authenticated;
grant execute on function public.god_complete_v3_commit(uuid,bigint,jsonb)to service_role;

create or replace function public.god_complete_v3_release(p_lease uuid)returns void
language sql security invoker set search_path=''as $$update god_complete_v3_private.runtime set lease=null,lease_until=null where singleton and lease=p_lease;$$;
revoke all on function public.god_complete_v3_release(uuid)from public,anon,authenticated;
grant execute on function public.god_complete_v3_release(uuid)to service_role;

create or replace function public.god_complete_v3_snapshot(p_zone text default 'UTC',p_after_event bigint default null)returns jsonb
language plpgsql stable security invoker set search_path=''as $$
declare response jsonb;cursor_value bigint;
begin
 if p_zone not in('UTC','Europe/Kyiv')or p_after_event<0 then raise exception 'Invalid read parameters';end if;
 with chosen as(
  (select id from public.god_complete_v3_signals where status='pending')
  union(select id from public.god_complete_v3_signals order by issued_at desc limit 100)
 ), signal_rows as(
  select s.metadata||jsonb_build_object('id',s.id,'channel',s.channel,'target',s.target,'start',s.start,'end',s."end",'issuedAt',s.issued_at,'status',s.status,'actual',s.actual,'resultAt',s.result_at,'roundId',s.round_id,'evidence',s.evidence,'checkedAt',s.checked_at)as v
  from public.god_complete_v3_signals s join chosen c using(id)
 ), by_channel as(
  select channel,count(*)total,count(*)filter(where status='pending')pending,count(*)filter(where status='hit')hit,count(*)filter(where status='miss')miss,count(*)filter(where status='unknown')unknown from public.god_complete_v3_signals group by channel
 ), by_target as(
  select target,count(*)total,count(*)filter(where status='pending')pending,count(*)filter(where status='hit')hit,count(*)filter(where status='miss')miss,count(*)filter(where status='unknown')unknown from public.god_complete_v3_signals group by target
 ), selected_events as(
  select * from public.god_complete_v3_events where seq>coalesce(p_after_event,greatest(0,(select coalesce(max(seq),0)-100 from public.god_complete_v3_events)))order by seq limit 500
 )
 select jsonb_build_object('version','god-complete-canonical-v3-20261121','serverNow',floor(extract(epoch from now())*1000)::bigint,
  'signals',coalesce((select jsonb_agg(v order by(v->>'issuedAt')::bigint desc)from signal_rows),'[]'::jsonb),
  'analytics',public.god_complete_v3_analytics_read(p_zone),
  'state',(select state from god_complete_v3_private.runtime where singleton),
  'diagnostics',(select diagnostics from god_complete_v3_private.runtime where singleton),
  'generation',(select generation from god_complete_v3_private.runtime where singleton),
  'computedAt',(select floor(extract(epoch from last_tick)*1000)::bigint from god_complete_v3_private.runtime where singleton),
  'statistics',jsonb_build_object('scope','all_server_created_signals','total',(select count(*)from public.god_complete_v3_signals),'pending',(select count(*)from public.god_complete_v3_signals where status='pending'),'hit',(select count(*)from public.god_complete_v3_signals where status='hit'),'miss',(select count(*)from public.god_complete_v3_signals where status='miss'),'unknown',(select count(*)from public.god_complete_v3_signals where status='unknown'),'byChannel',coalesce((select jsonb_agg(to_jsonb(b))from by_channel b),'[]'::jsonb),'byTarget',coalesce((select jsonb_agg(to_jsonb(b))from by_target b),'[]'::jsonb)),
  'events',coalesce((select jsonb_agg(jsonb_build_object('seq',seq,'signalId',signal_id,'kind',kind,'at',at,'payload',payload)order by seq)from selected_events),'[]'::jsonb),
  'eventCursor',coalesce((select max(seq)from selected_events),p_after_event,0),
  'eventHasMore',exists(select 1 from public.god_complete_v3_events where seq>coalesce((select max(seq)from selected_events),p_after_event,0))
 )into response;
 return response;
end;$$;
revoke all on function public.god_complete_v3_snapshot(text,bigint)from public,anon,authenticated;
grant execute on function public.god_complete_v3_snapshot(text,bigint)to service_role;
