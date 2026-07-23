-- Run after schema.sql to enable one or more devices per Telegram account/license.

alter table public.license_activations
  drop constraint if exists license_activations_license_id_telegram_id_key;

alter table public.license_activations
  alter column device_hash set not null;

create unique index if not exists license_activation_device_unique
  on public.license_activations (license_id, telegram_id, device_hash);

create index if not exists idx_license_activation_user_devices
  on public.license_activations (license_id, telegram_id, is_active);
