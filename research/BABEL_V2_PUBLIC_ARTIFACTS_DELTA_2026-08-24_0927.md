# BABEL V2 Public Artifacts Delta — 2026-08-24 09:27 Kyiv

## New verified public artifact

### `gamehubciv/GAMEHUB/luckyjet-hack.html`

Public source:
- https://github.com/gamehubciv/GAMEHUB/blob/f3752b44d6cd157b67398f4436164f43d7d018cd/luckyjet-hack.html

Classification:
- Public Lucky Jet predictor implementation.
- **Not proven to be original BABEL/AllPredictor V2 source.** Treat as related/reference implementation only.

Confirmed behavior from the public source:
- Polls Lucky Jet data every 5 seconds.
- Accumulates 5 coefficients and then runs an automatic prediction.
- Default prediction settings include `analysisMode: 'pro'`, `excludeExtremes: true`, `trendAnalysis: false`, `volatilityThreshold: 0.15`.
- In PRO mode, base prediction is `0.60 * EMA + 0.30 * mean + 0.10 * lastCoefficient`.
- Trend adjustment: upward trend multiplies prediction by `1.05`; downward trend by `0.97`.
- Confidence factor is based on volatility: `max(0.1, 1 - volatility * 2)`.
- Regression/pattern section evaluates the last 5 processed coefficients, computes linear-regression slope, volatility, pattern strength, and a global score.
- Automatic prediction is silently filtered unless `averageOdds` is between `2.00` and `2.45`.
- Pending predictions are validated against later coefficients.

Architecture notes:
- Client-side HTML/JavaScript implementation.
- Uses Firebase authentication / Firestore for license checks in the public file; credential-like configuration values are intentionally not copied into this manifest.
- Prediction logic is deterministic/heuristic given the same coefficient sequence and settings; it is not a direct `/predict` API result in this artifact.

## Why this is new/useful

Earlier public `luckyjet-predictor.js` evidence established EMA/regression/confidence/margin-style logic. This artifact adds a distinct **2.00–2.45 automatic signal gate**, explicit 5-coefficient auto-cycle behavior, and a license-gated standalone Lucky Jet predictor page named `luckyjet-hack.html`.

## Safety / provenance

No authentication bypass was attempted. No private resources were accessed. API keys, tokens, passwords, session identifiers, and user-specific identifiers are omitted from this manifest.
