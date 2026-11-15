-- Isolated Bayesian window journal. Run once on the existing project.
-- This migration does not alter source history, collectors, or the reference page.
begin;

-- New read-only source view: incomplete rows never enter the new model.
create view public.god_bayes_rounds_v1 with (security_invoker=true) as
select id,source_seq,coefficient,round_timestamp,estimated,completed,
  case when collection_backend='cloud' then 1000000000000::bigint+source_seq
       else coalesce(migration_source_seq,source_seq) end as feed_order
from public.luckyjet_rounds where completed is true;
revoke all on public.god_bayes_rounds_v1 from public,anon,authenticated,service_role;
grant select on public.god_bayes_rounds_v1 to anon,authenticated,service_role;

create table if not exists public.god_bayes_signals_v1 (
  id text primary key,
  model_version text not null,
  target integer not null check (target in (10,40,200,500)),
  issued_at timestamptz not null default clock_timestamp(),
  start_at timestamptz not null,
  end_at timestamptz not null,
  probability double precision not null check (probability between 0 and 1),
  interval_low double precision not null check (interval_low between 0 and 1),
  interval_high double precision not null check (interval_high between 0 and 1),
  per_round_probability double precision not null check (per_round_probability between 0 and 1),
  sample_size integer not null check (sample_size >= 200),
  hit_count integer not null check (hit_count >= 0 and hit_count <= sample_size),
  source_cutoff timestamptz not null,
  source_first timestamptz not null,
  exposure_seconds double precision not null check (exposure_seconds > 0 and exposure_seconds < 'Infinity'::double precision),
  forecast jsonb not null check (jsonb_typeof(forecast) = 'object'),
  status text not null default 'pending' check (status in ('pending','hit','miss','unknown')),
  actual double precision,
  actual_at timestamptz,
  round_id text,
  checked_at timestamptz,
  resolution_reason text,
  check (issued_at < start_at and end_at = start_at + interval '180 seconds'),
  check (source_first <= source_cutoff and source_cutoff <= issued_at + interval '10 seconds'),
  check (interval_low <= interval_high),
  check (actual is null or (actual >= 1 and actual < 'Infinity'::double precision)),
  check (status <> 'hit' or (actual is not null and actual >= target and actual_at is not null and actual_at between start_at and end_at and round_id is not null)),
  check (status <> 'miss' or (actual is not null and actual >= 1 and actual < target)),
  check (status = 'pending' or (checked_at is not null and checked_at > end_at))
);

create index if not exists god_bayes_signals_v1_pending
  on public.god_bayes_signals_v1 (target,start_at) where status='pending';
create index if not exists god_bayes_signals_v1_recent
  on public.god_bayes_signals_v1 (issued_at desc,id);
create index if not exists god_bayes_signals_v1_retry
  on public.god_bayes_signals_v1 (checked_at) where status='unknown';

create table if not exists public.god_bayes_signal_events_v1 (
  event_id bigint generated always as identity primary key,
  signal_id text not null references public.god_bayes_signals_v1(id),
  event_at timestamptz not null default clock_timestamp(),
  event_kind text not null check (event_kind in ('created','resolved','revised')),
  previous_state jsonb,
  state jsonb not null
);
create index if not exists god_bayes_signal_events_v1_signal
  on public.god_bayes_signal_events_v1(signal_id,event_id);

alter table public.god_bayes_signals_v1 enable row level security;
alter table public.god_bayes_signal_events_v1 enable row level security;
revoke all on public.god_bayes_signals_v1, public.god_bayes_signal_events_v1 from public,anon,authenticated;
grant select on public.god_bayes_signals_v1, public.god_bayes_signal_events_v1 to anon,authenticated;
grant select,insert,update on public.god_bayes_signals_v1 to service_role;
grant select,insert on public.god_bayes_signal_events_v1 to service_role;
grant usage,select on sequence public.god_bayes_signal_events_v1_event_id_seq to service_role;

create policy god_bayes_public_read_v1 on public.god_bayes_signals_v1
  for select to anon,authenticated using (true);
create policy god_bayes_events_public_read_v1 on public.god_bayes_signal_events_v1
  for select to anon,authenticated using (true);

create or replace function public.god_bayes_guard_v1() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'The Bayesian journal is append-only';
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.actual is not null or new.actual_at is not null or new.round_id is not null
       or new.start_at <= clock_timestamp() then
      raise exception 'Only a new future pending window may be created';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - array['status','actual','actual_at','round_id','checked_at','resolution_reason'])
     is distinct from
     (to_jsonb(old) - array['status','actual','actual_at','round_id','checked_at','resolution_reason']) then
    raise exception 'Forecast metadata is immutable';
  end if;
  if old.status in ('hit','miss') then
    raise exception 'A resolved result is immutable';
  end if;
  if new.status='pending' or clock_timestamp() <= old.end_at or new.checked_at is null or new.checked_at <= old.end_at
     or (old.status='unknown' and new.status not in ('unknown','hit','miss')) then
    raise exception 'Invalid outcome transition';
  end if;
  return new;
end;
$$;
revoke all on function public.god_bayes_guard_v1() from public,anon,authenticated;
grant execute on function public.god_bayes_guard_v1() to service_role;

create or replace function public.god_bayes_audit_v1() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then
    insert into public.god_bayes_signal_events_v1(signal_id,event_kind,state)
      values(new.id,'created',to_jsonb(new));
  elsif (new.status,new.actual,new.actual_at,new.round_id,new.resolution_reason)
      is distinct from (old.status,old.actual,old.actual_at,old.round_id,old.resolution_reason) then
    insert into public.god_bayes_signal_events_v1(signal_id,event_kind,previous_state,state)
      values(new.id,case when old.status='unknown' then 'revised' else 'resolved' end,to_jsonb(old),to_jsonb(new));
  end if;
  return new;
end;
$$;
revoke all on function public.god_bayes_audit_v1() from public,anon,authenticated;
grant execute on function public.god_bayes_audit_v1() to service_role;

create trigger god_bayes_guard_v1 before insert or update or delete on public.god_bayes_signals_v1
  for each row execute function public.god_bayes_guard_v1();
create trigger god_bayes_audit_v1 after insert or update on public.god_bayes_signals_v1
  for each row execute function public.god_bayes_audit_v1();

create or replace function public.god_bayes_events_guard_v1() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  raise exception 'The Bayesian event journal is append-only';
end;
$$;
revoke all on function public.god_bayes_events_guard_v1() from public,anon,authenticated;
grant execute on function public.god_bayes_events_guard_v1() to service_role;
create trigger god_bayes_events_guard_v1 before update or delete on public.god_bayes_signal_events_v1
  for each row execute function public.god_bayes_events_guard_v1();

comment on table public.god_bayes_signals_v1 is
 'Server-created statistical windows. Probabilities are model estimates, not measured betting accuracy.';
comment on table public.god_bayes_signal_events_v1 is
 'Append-only creation/outcome audit; retains UNKNOWN and later corrections.';
commit;
