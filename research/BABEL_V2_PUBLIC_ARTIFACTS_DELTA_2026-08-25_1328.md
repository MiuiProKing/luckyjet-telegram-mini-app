# BABEL V2 Public Artifacts Delta — 2026-08-25 13:28 Europe/Kyiv

## New verified finding

A cross-file comparison in the public `gamehubciv/GAMEHUB` repository shows that the previously recovered `calculatePrediction()` logic from `luckyjet-predictor.js` is not Lucky Jet-specific. The same prediction engine is reused in other public predictor files, including `rocket-x-predictor.js` and `astronaute-predictor.js`.

### Confirmed shared logic

Across the compared predictor files, the same client-side engine includes:

- optional extreme-value removal;
- EMA smoothing factor `0.2`;
- volatility as population standard deviation;
- trend from the last two processed values;
- bullish/bearish pattern detection from the last three values;
- confidence factor `max(0.1, 1 - volatility * 2)`;
- PRO formula `0.60*EMA + 0.30*mean + 0.10*last`;
- trend multipliers `1.05` upward and `0.97` downward;
- confidence adjustment `raw *= 1 + confidenceFactor*0.1`;
- margin rules of 15% below 2.00, 25% from 2.00 to below 3.00, and 35% from 3.00 upward;
- regression/pattern/volatility based `globalScore`;
- collection of 5 coefficients before automatic prediction;
- validation against one of the next 3 rounds.

### Significance for BABEL lineage

**Confirmed:** this algorithm is a generic GAMEHUB predictor template reused across multiple crash-style games.

**Inference:** this substantially weakens the hypothesis that the GAMEHUB `luckyjet-predictor.js` formula is the original proprietary BABEL Predictor V2 / AllPredictor Lucky Jet algorithm. It remains useful as a public reference implementation, but should not be treated as provenance evidence for BABEL without an independent link.

### Public sources

- https://github.com/gamehubciv/GAMEHUB/blob/f3752b44d6cd157b67398f4436164f43d7d018cd/luckyjet-predictor.js
- https://github.com/gamehubciv/GAMEHUB/blob/f3752b44d6cd157b67398f4436164f43d7d018cd/rocket-x-predictor.js
- https://github.com/gamehubciv/GAMEHUB/blob/f3752b44d6cd157b67398f4436164f43d7d018cd/astronaute-predictor.js

## Exact BABEL/AllPredictor code status

No new verified public hit was found in this pass for `PREDICTORV2BBSY`, `/api/v1/luckyjet/predict`, `/api/v1/luckyjet/market`, `/coefficients`, `/app/servers.js`, or the original BABEL `predict/analyse/detection` function.

No credentials, tokens, session identifiers, passwords, or other secrets are preserved in this manifest.
