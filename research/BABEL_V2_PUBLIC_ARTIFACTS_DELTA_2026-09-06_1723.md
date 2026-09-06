# BABEL V2 Original Logic Watch — public artifact delta (2026-09-06 17:23 Europe/Kyiv)

## New verified public artifact

**Repository:** `akimijamil-eng/luckyjet-api`

- Public repository: https://github.com/akimijamil-eng/luckyjet-api
- Repository created: 2025-10-11T22:45:11Z
- Original `server.js` commit: `7f3dd760d7c1a81f68ed16a8e649105604dc0324`
- Commit link: https://github.com/akimijamil-eng/luckyjet-api/commit/7f3dd760d7c1a81f68ed16a8e649105604dc0324
- Source: https://github.com/akimijamil-eng/luckyjet-api/blob/main/server.js
- Package metadata: https://github.com/akimijamil-eng/luckyjet-api/blob/main/package.json

## Provenance assessment

This is a first-party/public GitHub artifact under `akimijamil-eng`, the same public account that hosts `AllPredictor-sites-manager`. It is therefore relevant lineage evidence, but **it is NOT classified as the original BABEL Predictor / Lucky Jet V2 core**.

The Git history for `server.js` contains one source commit only (the root upload above), so there is no earlier public `server.js` revision in this repository to recover.

## Exact behavior extracted from public code

Endpoint:

- `GET /get-crash-value`
- JSON response: `{ "crashPoint": <number> }`

Inputs:

- No LuckyJet history input
- No coefficients array
- No round IDs
- No timestamps or intervals
- No market endpoint

History window:

- None

Formula / distribution:

1. Generate `r = Math.random()`.
2. If `r < 0.80`, output `1.20 + Math.random() * 1.80` (80% branch; approximately 1.20x–3.00x).
3. Else if `r < 0.98`, output `3.00 + Math.random() * 12.0` (18% branch; approximately 3.00x–15.00x).
4. Else output `20 + Math.random() * 280` (2% branch; approximately 20x–300x).
5. Round to two decimals.

Target selection:

- None

Confidence / score:

- None

Timing / wait rules:

- None

Signal conditions:

- None; every request returns a newly generated synthetic coefficient.

Fallback logic:

- None

Classification:

- **RANDOM / synthetic coefficient generator**
- Not deterministic
- Not history-driven
- Not API-returned prediction logic
- Not evidence of `history → target/confidence/timing`

## Why this matters

This artifact should be explicitly **rejected as the BABEL V2 predictor implementation**. It is useful provenance because it shows a public LuckyJet API created by the same `akimijamil-eng` lineage, but its only calculation is a fixed-probability random coefficient generator. Any reconstruction that treats `/get-crash-value` as real LuckyJet history or prediction output would be incorrect.

No authentication, ShieldWall, private repository, hidden directory, credential recovery, or exploitative scanning was used.
