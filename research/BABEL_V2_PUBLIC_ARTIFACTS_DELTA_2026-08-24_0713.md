# BABEL V2 / Lucky Jet — public artifact delta — 2026-08-24 07:13 EEST

## New verified public-code details

Source: `gamehubciv/GAMEHUB` → `luckyjet-predictor.js`

Public source:
- https://github.com/gamehubciv/GAMEHUB/blob/main/luckyjet-predictor.js

### Exact polling behavior

The public predictor starts one fetch immediately, then runs:

```js
autoFetchInterval = setInterval(fetchLatestCoefficient, 5000);
```

So its explicit polling cadence is **5 seconds**.

### Duplicate suppression

After reading the latest coefficient, it suppresses a duplicate when the rounded coefficient equals the previous coefficient and the prior fetch was less than **7000 ms** ago:

```js
if (lastCoefficient === roundedCoefficient && lastFetchTime && (now - lastFetchTime) < 7000) {
    showDuplicateWarning();
    return;
}
```

This is value/time duplicate suppression; it does **not** use a round UUID in this public version.

### Prediction trigger window

The code accumulates coefficients and automatically calls prediction when it has **5 values**:

```js
if (autoCoefficients.length >= 5) {
    predictAutoOdds(true);
    setTimeout(() => {
        autoCoefficients = [];
        updateCoefficientsDisplay();
    }, 1000);
}
```

Therefore the auto-analysis window is reset after every five collected values.

### Exact 3-round validation condition

Each automatic prediction is added to `pendingVerification` with `currentRound: 1`.

For each new coefficient, success is declared with the direct condition:

```js
if (newCoefficient >= pending.predictedOdds) {
    // success
}
```

If not reached, `currentRound` increments. The pending signal remains active while `currentRound <= 3`; otherwise it is marked failed.

This means the public implementation defines a prediction as successful when **any of the next 3 observed coefficients is greater than or equal to the predicted final multiplier**.

There is no additional tolerance band, exact-value match, target window, confidence threshold gate, or market-score gate in the verification step.

### Default analysis settings

When no saved settings are present:

```js
{
  analysisMode: 'pro',
  excludeExtremes: true,
  trendAnalysis: false,
  volatilityThreshold: 0.15
}
```

The UI exposes volatility threshold range **0.05–0.50** in steps of **0.01**.

### Historical-analysis behavior

The historical-analysis section does not feed back into the next prediction formula. It summarizes only already stored prediction outcomes:

- average confidence among successful predictions;
- successful final-odds buckets: `1.0–1.5`, `1.5–2.0`, `2.0–2.5`, `2.5+`;
- best probability interval;
- best-performing verification round.

So in this public version, `analyzeHistoricalData()` is a reporting/statistics layer, not an adaptive learning loop.

## Classification

**Confirmed for this public `gamehubciv/GAMEHUB` implementation:** deterministic/heuristic client-side calculation + 5-value input window + 5-second API polling + threshold validation over 3 subsequent coefficients.

**Not confirmed:** that this is the original proprietary BABEL / AllPredictor V2 algorithm. No public provenance currently proves that identity.

## Security handling

The public source contains connection identifiers. They are intentionally omitted from this research manifest. No credentials, tokens, passwords, cookies, or session values are copied here.
