begin;
create table if not exists public.astronaut_rounds (
  id text primary key,
  coefficient numeric not null check (coefficient >= 1),
  round_timestamp timestamptz not null,
  observed_at timestamptz not null default now(),
  source_position integer not null default 0,
  collected_at timestamptz not null default now(),
  estimated boolean not null default false,
  source text not null default 'astronaut-history'
);
alter table public.astronaut_rounds add column if not exists observed_at timestamptz not null default now();
alter table public.astronaut_rounds add column if not exists source_position integer not null default 0;
create index if not exists astronaut_rounds_observed_at_idx on public.astronaut_rounds (observed_at desc, source_position asc, id);
alter table public.astronaut_rounds enable row level security;
revoke all on public.astronaut_rounds from anon, authenticated;
grant select, insert, update on public.astronaut_rounds to service_role;
create table if not exists public.astronaut_collector_status (
  id integer primary key check (id=1),
  status text not null,
  checked_at timestamptz not null default now(),
  received integer not null default 0,
  rejected integer not null default 0,
  upstream_status integer
);
alter table public.astronaut_collector_status enable row level security;
revoke all on public.astronaut_collector_status from anon, authenticated;
grant select, insert, update on public.astronaut_collector_status to service_role;
insert into public.astronaut_collector_status(id,status) values(1,'Источник Astronaut ожидает подтверждённого доступа') on conflict(id) do nothing;
commit;
