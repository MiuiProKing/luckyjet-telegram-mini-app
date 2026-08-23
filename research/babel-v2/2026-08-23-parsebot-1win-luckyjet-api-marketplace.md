# Public 1win Lucky Jet API marketplace artifact (Parse.bot)

Date checked: 2026-08-23

## Status
Third-party public API marketplace artifact. Not confirmed as BABEL / AllPredictor infrastructure.

## Public page
https://parse.bot/marketplace/00a26bcf-0dcd-455d-bc7e-8b5e1f4dc19f/1win-com-api

## Verified public schema / behavior
The marketplace page states that it exposes three Lucky Jet data operations:

- `get_rounds_history`: approximately 20 most recent rounds.
- `get_current_round`: current or most recently completed round plus up to 50 active bets.
- `get_top_coefficients`: top 20 highest crash multipliers within a requested interval.

Reported round fields include:
- `round_id`
- `top_coefficient`
- `final_values`
- `outcome`
- `hash`
- `salt`
- `start_time` (for some operations)

The marketplace states authentication uses `X-API-Key` and explicitly says 1win does **not** publish an official public developer API for Lucky Jet round results.

## Relevance to BABEL V2 research
This is useful only as a comparison/data-source artifact. It independently confirms that a public third-party service can expose approximately the same round primitives repeatedly seen in open Lucky Jet projects (`round_id`, `top_coefficient`, `final_values`, hash/salt). It does **not** prove that BABEL or AllPredictor used Parse.bot, nor does it expose BABEL prediction logic.

## Safety
No API keys, credentials, session IDs, hashes/salts from live rounds, or private data are stored here.
