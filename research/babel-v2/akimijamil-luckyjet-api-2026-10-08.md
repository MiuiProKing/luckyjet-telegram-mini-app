# Public-source triage: akimijamil-eng/luckyjet-api (2026-10-08)

Status: **VERIFIED PUBLIC JAVASCRIPT; NOT BABEL PREDICTOR V2; RANDOM-GENERATOR ONLY.**

Source: https://github.com/akimijamil-eng/luckyjet-api/blob/main/server.js
Repository: https://github.com/akimijamil-eng/luckyjet-api
History: https://github.com/akimijamil-eng/luckyjet-api/commits/main
Checked latest commit: `2d78fffea1c8f95960e931e72dd0f340094b15da`
Earliest public commit checked: `7f3dd760d7c1a81f68ed16a8e649105604dc0324`
Diff between those commits: no change to `server.js`.

## Directly verified
- Node.js / Express server; GET `/get-crash-value` returns JSON `{"crashPoint": <number>}`.
- `generateCrashValue()` calls `Math.random()`; 80% branch samples [1.20, 3.00), 18% samples [3.00, 15.00), 2% samples [20, 300), rounding to two decimals.
- No LuckyJet history ingestion; no round IDs, target/confidence/timing outputs, waiting rules, or verification.
- Separate public `akimijamil-eng/AllPredictor-sites-manager` repository is hosting infrastructure, not evidence of V2 predictor formulas.

## Assessment
Classification: **random / synthetic crash-value generator**. The GitHub account matches a search lead, but no proof links this endpoint to the original BABEL V2 predictor. **Do not use it as live LuckyJet data or a prediction model.**

No credentials, access tokens, or private data copied. This is a source manifest, not a reconstructed implementation.
