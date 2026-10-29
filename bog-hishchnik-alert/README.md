# Classic + BeeAI with Supabase LIVE

Template: fc653e205c2c78f5f605b48c830844bee0abe62a. Old branches are preserved.
The HTML page is served by GitHub/raw.githack. Supabase receives and stores real completed game rounds independently of the PC; Realtime sends them to this page.
BeeAI runs in Supabase Edge Functions, reads this same cloud feed, and sends the unchanged classic calculation source and results to Gemini. The existing owner key is stored only in Supabase Secrets. A private fragment access code protects AI reports and settings; it is removed from the address bar and retained only in sessionStorage.

AI attempts and immutable forecasts are stored in separate private tables. Responses received after a new round are late; disconnections, uncertain timestamps and missing coverage are unknown. All misses remain. The previous 30 BeeAI records remain in the migrated private legacy journal, separate from the cloud evaluation period. Worker leases avoid concurrent Gemini calls. Source warmup requires 200 consecutive cloud records, then at most one analysis per minute, with quota-error backoff. Archive and classic formulas do not demonstrate predictive advantage or a betting minute.

For a fresh project, deploy the existing cloud collector and migrations from classic-supabase-live-20261009 before this BeeAI migration. Do not reset an active database. Cloud and Gemini quotas, source outages or session expiration may interrupt service; zero delay is not guaranteed. No Telegram, payments or bets are performed. Automatic chat notifications remain stopped.
