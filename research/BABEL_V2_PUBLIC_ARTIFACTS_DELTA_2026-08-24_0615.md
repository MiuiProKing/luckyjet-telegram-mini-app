# BABEL V2 / Lucky Jet public artifact delta — 2026-08-24 06:15 Kyiv

## Scope
Public-source research only. No authentication bypass, private repositories, credential attacks, or secret recovery. Header credential/session values found in public code are intentionally **not reproduced** here.

## 1) Newly recovered public prediction implementation

Public repository: `gamehubciv/GAMEHUB`

Artifact:
- `luckyjet-predictor.js`
- Public source: https://github.com/gamehubciv/GAMEHUB/blob/f3752b44d6cd157b67398f4436164f43d7d018cd/luckyjet-predictor.js

### Confirmed API/data path
The code uses:
- `GET https://crash-gateway-grm-cr.100hp.app/state`
- `accept: application/json`
- public code also contained customer/session header values; these are intentionally omitted here.
- it reads `data.stopCoefficients[0]`
- changes an exact `1.00` to `1.01`
- suppresses a duplicate coefficient if the same rounded value is seen within 7 seconds
- appends coefficients to `autoCoefficients`
- triggers a prediction when 5 coefficients have been collected
- then clears the collected window after the prediction

### Confirmed prediction formulas
`calculatePrediction(oddsArray, betAmount, settings)`:

1. Optional extreme removal
- if `excludeExtremes` is enabled, sort ascending and remove one minimum + one maximum.

2. EMA
- smoothing factor default: `0.2`
- recurrence: `ema[i] = data[i] * 0.2 + ema[i-1] * 0.8`

3. Volatility
- population standard deviation over the processed window.

4. Simple trend
- compares only the last two processed values:
  - last > previous => `up`
  - last < previous => `down`
  - otherwise `stable`

5. Three-value pattern
- last 3 strictly ascending => `bullish`
- last 3 strictly descending => `bearish`
- otherwise `neutral`

6. Confidence factor
- `confidenceFactor = max(0.1, 1 - volatility * 2)`
- displayed confidence = rounded `confidenceFactor * 100`.

7. Base prediction by mode
- default: arithmetic mean
- `advanced`: linearly increasing weights `1 + i*0.1`; weighted mean
- `pro`: `60% EMA + 30% mean + 10% last coefficient`
  - if trend `up`: multiply by `1.05`
  - if trend `down`: multiply by `0.97`

8. Confidence adjustment
- multiply raw prediction by `1 + confidenceFactor*0.1`.

9. Safety margin
- raw prediction `< 2.00`: subtract 15%
- `2.00 <= raw < 3.00`: subtract 25%
- `>= 3.00`: subtract 35%
- final value rounded to 2 decimals.

### Additional score / pattern-strength calculation
Uses last 5 processed coefficients:
- linear regression slope over x=1..n
- volatility on last five
- last-three pattern strength: `min(1, abs(diff1 + diff2) / 0.3)`
- normalized slope: `min(1, abs(slope)/0.25)`
- normalized volatility: `min(1, volatilityForRegression / settings.volatilityThreshold)`
- normalized pattern: bullish=1, bearish=0, neutral=0.5

`globalScore` is calculated as:

```
0.3 * normalizedSlope
+ 0.2 * normalizedVolatility
+ 0.1 * normalizedPattern
+ 0.4 * confidenceFactor
+ 0.1 * patternStrength
```

Note: these weights sum to **1.1**, not 1.0.

### Verification rule
When auto-triggered, the result is stored as pending verification and the UI states that the final predicted multiplier should appear in **one of the next 3 rounds**.

### Classification
This implementation is **deterministic/heuristic given the same coefficient window and settings**. The recovered prediction function itself does not use `Math.random()`.

Important attribution caveat: this is a public `gamehubciv/GAMEHUB` implementation that uses the same Lucky Jet state gateway seen elsewhere. It is **not yet proven to be the original BABEL/AllPredictor V2 algorithm**. Treat it as a strong related implementation/reference, not as confirmed proprietary BABEL source.

## 2) Newly recovered public endpoint lineage from Git history

The public Git history of `gamehubciv/GAMEHUB/luckyjet-predictor.html` shows endpoint changes on 2026-01-30/31.

### Older endpoint A
Commit `f4e2be03e42a7741efe20c13528dee3c11019a1f` changed:

`https://luckyjet-gateway-grm-lj.100hp.app/state`
→ `https://crash-gateway-grm-cr.100hp.app/state`

Public commit:
https://github.com/gamehubciv/GAMEHUB/commit/f4e2be03e42a7741efe20c13528dee3c11019a1f

### Older endpoint B
Commit `cc8d61c259bc57fffff38b10695d33aa9fb5e466` changed:

`https://crash-gateway-grm-cr.100hp.app/state`
→ `https://crash-gateway-grm-cr.gamedev-tech.cc/state`

Public commit:
https://github.com/gamehubciv/GAMEHUB/commit/cc8d61c259bc57fffff38b10695d33aa9fb5e466

### Return to current 100hp endpoint
Commit `38cf314245967a7bd0f1b082b064859ae4cbc9d5` changed:

`https://crash-gateway-grm-cr.gamedev-tech.cc/state`
→ `https://crash-gateway-grm-cr.100hp.app/state`

Public commit:
https://github.com/gamehubciv/GAMEHUB/commit/38cf314245967a7bd0f1b082b064859ae4cbc9d5

This establishes a public historical endpoint chain:

`luckyjet-gateway-grm-lj.100hp.app/state`
→ `crash-gateway-grm-cr.100hp.app/state`
→ `crash-gateway-grm-cr.gamedev-tech.cc/state`
→ `crash-gateway-grm-cr.100hp.app/state`

No attempt was made to use old session/customer values or bypass access controls.

## 3) Separate public prompt artifact

A publicly indexed LovablePrompts artifact, approximately 19 weeks old when checked, has a title/snippet explicitly referencing `https://crash-gateway-grm-cr.100hp.app/state` and a “Configuration de la nouvelle luckyjet API”. Its generated description specifies a Lucky Jet predictor web app using real-time API data plus historical-data analysis.

Public URL:
https://lovableprompts.app/prompts/10021fce-cc2a-4512-91ca-fa930b965c58

This is useful as independent evidence that the endpoint was reused in public Lucky Jet predictor development, but it does **not** prove BABEL/AllPredictor authorship and it does not expose the original BABEL formula.

## Current conclusion

Genuinely new verified material in this delta:
1. a complete deterministic heuristic prediction formula from a public related Lucky Jet implementation;
2. a 5-coefficient auto window plus 3-round verification behavior;
3. exact public historical state-endpoint lineage including `luckyjet-gateway-grm-lj.100hp.app/state` and `crash-gateway-grm-cr.gamedev-tech.cc/state`;
4. an independent public Lovable prompt referencing the current state gateway.

Still **not confirmed**: that this formula is the original BABEL Predictor V2 / AllPredictor proprietary algorithm.