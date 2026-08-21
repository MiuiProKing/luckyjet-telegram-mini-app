# Public Lucky Jet / BABEL-related artifacts — 2026-08-21

This manifest records newly verified public artifacts. It intentionally does not store credentials, tokens, passwords, session IDs, or other secrets.

## JOKERPCS / myCompiler public code set

Profile: https://www.mycompiler.io/@JOKERPCS

### `Lucky jet predictor` (Python)
Source: https://www.mycompiler.io/view/GE3ew3NU7TR
Published: 2025-02-14

Verified behavior:
- `generate_multiplier()` is explicitly random and uses three probability bands:
  - 70% -> random 1.00–2.00x
  - next 20% -> random 2.00–5.00x
  - final 10% -> random 5.00–15.00x
- A second section named `Lucky Jet Grosse Côte` sets a future time of +1 minute.
- Main target is generated randomly in 12.25–20.62x.
- `Assurance` = target / 2.
- `Fiable` = assurance / 2 (target / 4).
- No live Lucky Jet market endpoint is actually called in this code.

Classification: random/simulation, not a verified deterministic predictor and not API-backed.

### `LUCKYJET COMBINÉ` (Python)
Source: https://www.mycompiler.io/view/8gg0D7BkQy0

Verified behavior:
- Static historical list plus a recent-data deque with `maxlen=50`.
- Uses frequency counts to assign probabilities to values from the historical list.
- Future coefficients are sampled with `numpy.random.choice` from the historical list using those probabilities.
- Future timing is also random: 30–299 seconds between simulated rounds.
- Reports mean, median, min, max, and standard deviation for the recent window.

Classification: frequency-weighted stochastic simulation. It uses a 50-value recent window, but output remains random.

### `MONTANTE BOT BABEL V1` (Python)
Source: https://www.mycompiler.io/view/3PUZtnsZzZf

Verified behavior:
- Generates a random target from 1.20–2.00x.
- Randomly chooses one of several entry-condition labels, including patterns such as `3 violet`, `3 bleu`, `2 violet`, and mixed violet/blue conditions.
- It does not analyze an actual coefficient stream before choosing the condition.

Classification: random signal formatter carrying the BABEL name; not evidence of original BABEL prediction logic.

## Important conclusion

These files are useful lineage artifacts because they preserve names, ranges, timing conventions, insurance formulas, color-pattern labels, and a 50-round analysis window. However, the verified implementations above are stochastic/random and should not be treated as the original BABEL Predictor V2 algorithm.
