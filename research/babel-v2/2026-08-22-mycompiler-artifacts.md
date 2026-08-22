# BABEL / Lucky Jet lineage — public artifacts collected 2026-08-22

## Confirmed public artifacts

### Lucky jet predictor — JOKERPCS — 2025-02-14
Source: https://www.mycompiler.io/view/GE3ew3NU7TR

Observed logic:
- future signal time: current time + 1 minute
- target range: random.uniform(12.25, 20.62)
- Assurance = target / 2
- Fiable = Assurance / 2 (= target / 4)
- explicitly stochastic/random; not proven BABEL V2 logic

### Lucky jet predictor — anonymous — 2025-02-11
Source: https://www.mycompiler.io/view/F5m48mjzmfd

Observed logic:
- persisted history capped at 50 generated values
- moving average window = 10
- min_cote = max(2.0, moving_average * 0.8)
- max_cote = min(25.0, moving_average * 1.5)
- midpoint/hack = (min_cote + max_cote) / 2
- target = random.uniform(midpoint, max_cote)
- Assurance = target * 0.75
- Fiabilite = target * 0.5
- signal time = current time + 1 minute
- active only when future hour is between 08:00 and 22:00
- stochastic/heuristic; not proven BABEL V2 logic

### Lucky jet predictor 2 — GEDEON225
Source: https://www.mycompiler.io/view/JmeqQn8Pcaw

Observed logic:
- future signal time: current time + 2 minutes
- target range: random.uniform(12.00, 20.00)
- Assurance = target / 2
- Fiable = Assurance / 2 (= target / 4)
- output label includes HACK225
- stochastic/random; no verified connection to BABEL/AllPredictor

## Important inference boundaries

The `225` suffix in GEDEON225 resembles public BABEL handles such as `babelsey225`, but this is NOT sufficient evidence of common authorship or shared backend. Treat it only as a search lead.

No credentials, tokens, session secrets, or suspicious strings from public snippets are preserved here.
