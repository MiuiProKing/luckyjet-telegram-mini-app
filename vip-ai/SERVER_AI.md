# VIP AI: server model context
Revision: 20261010-server-ml-v1.

Supabase now calculates the four existing frozen model families for six target/horizon tasks from the latest 200 verified cloud LIVE rounds. The feature code and artifact remain unchanged; parity tests compare every numeric score with the browser implementation. ML, classic rules and Gemini registration share the same anchor. A page need not remain open to supply model context. Classic rules still use their original sample (up to 2000 rounds).

Gemini returns decision, target, horizon, nullable insurance_target, explanation. New main targets are at least 10; a smaller target may be 1.5, 2, 3 or 5 and must be below the main target. An observe response has both targets null. Smaller targets are not protection against losing money.

Migration supabase/migrations/20261010_beeai_models.sql is additive. It retains old predictions and the old save RPC; new predictions use a separate RPC with the same atomic latest-anchor check. The original immutability trigger remains. Older predictions without the new field use legacy explanation parsing; an explicit new null cannot be overridden by text.

The report exposes diagnostic codes, worker timestamps and the last registered model snapshot. UI refresh reads the report; enabling changes only enabled. Legacy client snapshot markers are excluded from the Gemini prompt while retaining user facts.

Deployment: apply the migration to project zulsrqkjkatzjjhacowy, then deploy only luckyjet-beeai. Existing server secrets and cron remain. The collector, old app branches, model training and other functions are outside this change.

Checks: browser state tests, full frozen-weight and numeric parity tests, Deno type checking, mocked Gemini/database contract tests, read-only cloud source check, and live report verification after deployment.
