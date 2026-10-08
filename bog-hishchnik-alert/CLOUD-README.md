# Classic version with autonomous Supabase LIVE

Original template: 2ed7416d2da826fde42c93794c51d3c2672fd2c5.
New project: zulsrqkjkatzjjhacowy. Previous branches are preserved.

The game lifecycle WebSocket runs in Supabase Edge Functions. Supabase Cron starts a worker every minute; each worker lives for 115 seconds. Connections overlap during handover. Real round IDs from startGame are checked against endGame and fair hashes. Ambiguous values are rejected. Database ID uniqueness prevents overlapping workers from duplicating a round. Changed coefficients for an existing ID are rejected. The PC is only used for one-time archive migration and deployment, not collection.

Postgres stores history and Realtime sends INSERTs to the classic page. REST polling every 10 seconds recovers missing delivery after reconnection; source disconnection is shown explicitly. Archive stays readable when the game source is unavailable. There is no zero-latency guarantee or verified complete coverage through outages. Session expiration requires owner action; billing limits and source availability still apply. Keys that write to the database and the game session are Supabase secrets. Only an anonymous read-only key for public coefficients is in the frontend; prediction journals are private.

Classic calculations and trained model weights are unchanged. Model advantage and an ideal betting minute have not been demonstrated. Stored results do not guarantee future coefficients. Notifications and the separate frozen BIG experiment remain stopped.
