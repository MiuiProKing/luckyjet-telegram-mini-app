# AllPredictor Supabase setup

This directory contains the secure backend for:

- Telegram user tracking;
- individual license keys;
- license expiration and revocation;
- user blocking;
- referral attribution;
- analytics events;
- the protected `admin.html` panel.

## Required Supabase project secrets

Add these in **Project Settings → Edge Functions → Secrets**:

- `TELEGRAM_BOT_TOKEN` — the token from BotFather;
- `ADMIN_TELEGRAM_IDS` — owner/admin Telegram numeric IDs separated by commas;
- `APP_ORIGIN` — `https://miuiproking.github.io`;
- `SUPABASE_URL` — normally injected automatically by Supabase;
- `SUPABASE_SERVICE_ROLE_KEY` — normally injected automatically by Supabase.

Never put the bot token or service-role key in HTML, JavaScript, GitHub Pages, or `app-config.js`.

## Database

Open **SQL Editor** and run `schema.sql`.

## Edge Functions

Deploy these functions:

- `track-user`
- `activate-license`
- `check-license`
- `admin-api`

All user-facing calls verify the signed Telegram Mini App `initData` on the server.

## Public frontend values

After the project is created, copy only these two public values into `app-config.js`:

```js
supabaseUrl: "https://YOUR_PROJECT.supabase.co",
supabaseAnonKey: "YOUR_PUBLIC_ANON_KEY",
```

The anon key is public by design. Database tables are protected by RLS and are accessed through Edge Functions using the service role.

## Admin access

Set the same numeric Telegram ID in both places:

1. Supabase secret `ADMIN_TELEGRAM_IDS`;
2. `adminTelegramIds` in `app-config.js` if an admin link should be shown in the UI.

Open the admin panel from inside Telegram:

`https://miuiproking.github.io/luckyjet-telegram-mini-app/admin.html`

## Creating licenses

The admin panel can create:

- `pro_1`
- `pro_7`
- `pro_30`
- `pro_90`
- `lifetime`

Keys are generated in the format `V0X-XXXX-XXXX-XXXX` and are linked to the first verified Telegram ID that activates them.

## Current fallback

Until Supabase is connected, the frontend keeps the current local trial flow:

- 10 trial predictions;
- fallback password `Random`;
- purchase contact `@V0xFF3`.

The fallback password is client-side and is not a strong paid-access system. Individual server keys should replace it for real sales.
