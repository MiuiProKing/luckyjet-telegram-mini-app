-- Optional notification log and scheduled-notification support.

create table if not exists public.notification_log (
  id bigint generated always as identity primary key,
  telegram_id bigint not null references public.app_users(telegram_id) on delete cascade,
  notification_type text not null,
  reference_id text,
  sent_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  unique (telegram_id, notification_type, reference_id)
);

alter table public.notification_log enable row level security;
revoke all on public.notification_log from anon, authenticated;

create index if not exists idx_notification_log_sent_at on public.notification_log(sent_at desc);
