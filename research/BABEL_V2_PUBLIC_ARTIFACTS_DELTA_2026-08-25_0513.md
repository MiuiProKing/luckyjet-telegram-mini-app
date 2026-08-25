# BABEL V2 public-artifact delta — 2026-08-25 05:13 Europe/Kyiv

## New verified public artifact

Source: https://www.mycompiler.io/view/BzFpu4fW4s2
Title: `Lucky jet predictor`
Published: 2025-02-11
Platform: myCompiler
Language: Python 3.11

### Confirmed code behavior

This is a public Lucky Jet predictor-like Python snippet. No credentials, tokens, passwords, session IDs, or private endpoints are present in this manifest.

- Persists recent generated coefficients to `historique_cotes.json`.
- Keeps the last **50** values.
- Moving-average window: **50**.
- If history length is below 50, trend detection returns insufficient-data status.
- Trend rule:
  - last coefficient > `moving_average * 1.2` => favorable/high trend.
  - last coefficient < `moving_average * 0.8` => caution/down trend.
  - otherwise stable.
- Dynamic coefficient bounds:
  - `min_cote = max(2.0, moving_average * 0.8)`
  - `max_cote = min(25.0, moving_average * 1.5)`
  - midpoint/hack value = `(min_cote + max_cote) / 2`
- Final coefficient is selected with Python `random.uniform(midpoint, max_cote)`, rounded to 2 decimals.
- Assurance = `coefficient * 0.75`.
- Fiabilité = `coefficient * 0.5` (note: this is output as a multiplier-like numeric value, not a percentage).
- Timing rule: computes current time + **1 minute** and only generates a signal if the resulting hour is `>=22` or `<8`; otherwise it reports analysis paused.

### Classification

**Confirmed:** deterministic preprocessing (history/moving-average/bounds/trend thresholds) plus a **random final target selection**.

**Not confirmed:** any relationship to original BABEL Predictor V2, AllPredictor, `PREDICTORV2BBSY`, `@allpredictorv4bot`, or proprietary BABEL source code. Treat this as a related public reference artifact only.

### Why it matters

The snippet is useful as a control/reference because it exposes an explicit 50-round window, 0.8/1.2 trend thresholds, dynamic 2X–25X bounds, a 1-minute timing offset, and target/assurance-style output while making clear that the final coefficient is random rather than API-returned.
