# BABEL V2 public artifacts delta — 2026-08-24 08:13 Europe/Kyiv

## New public code artifact (relationship to BABEL/AllPredictor NOT proven)

Source: https://github.com/JeanIvna/EXPERTCASINO1/blob/8b3623a261628cfb4d4596864d65bf398f9ace72/ultimate_real_api_system.py

Repository: `JeanIvna/EXPERTCASINO1` (public)
Commit ref inspected: `8b3623a261628cfb4d4596864d65bf398f9ace72`

### Why it is relevant

This public Lucky Jet code uses a `gamedev-tech.cc/history` crash-gateway family and the same public customer identifier family seen in other Lucky Jet captures, but there is currently no evidence that it is original BABEL/AllPredictor code. Treat it as an independent related implementation.

### Sanitization

The source file contains embedded Telegram/config identifiers and URL query identifiers. Those values are intentionally NOT copied here.

### Confirmed algorithm structure in the public source

- Keeps up to 200 real rounds in memory (`deque(maxlen=200)`).
- Requires at least 10 rounds before full analysis.
- Extracts each round's top/final coefficient.
- Runs separate analyses for cycles, low/montant coefficients, premium coefficients, standard coefficients, volatility, trends, frequencies and pattern strength.
- Advanced cycle detector tests cycle lengths from 2 up to 15 rounds (bounded by available history).
- Cycle candidate threshold: `cycle_strength > 0.3`.
- Cycle similarity counts values as matching when absolute coefficient difference is below `1.0`.
- `montant` band: 1.20X–1.50X.
- Montant target is selected from the most frequent band: 1.25X, 1.35X or 1.45X.
- Montant confidence is capped at 0.85 and follows `min(0.85, 0.4 + count * 0.05)`.
- It computes positions and average intervals between qualifying coefficients and derives a bounded timing factor from the last position / average interval.
- The code defines three outward signal classes: `montant`, `premium`, and `standard`.
- Initial adaptive pattern weights in the inspected section are 0.5 for each listed component; these are implementation defaults, not evidence of BABEL weights.

### Classification

- Publicly verifiable code: YES.
- Deterministic/heuristic analysis in inspected functions: YES.
- Direct provenance as BABEL/AllPredictor V2: NO / unproven.
- New official BABEL endpoint: NO.
- Secrets preserved: NO; sensitive/config values omitted from this manifest.
