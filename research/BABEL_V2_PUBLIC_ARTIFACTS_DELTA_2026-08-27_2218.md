# BABEL V2 Public Artifact Delta — 2026-08-27 22:18 Kyiv

## New verified public artifacts

### JOKERPCS / myCompiler — `MONTANTE BOT BABEL V1`
Public source: https://www.mycompiler.io/view/3PUZtnsZzZf

Confirmed behavior from the public Python source:
- `generate_cote()` returns a random multiplier in the range 1.20x–2.00x using `random.uniform`.
- The bot selects one betting condition at random from a fixed list referencing sequences such as 3 violet, 3 blue, 2 violet, 1 violet, 1 blue, etc.
- It prints two generated signals per run.
- The displayed label says `BOT MONTANTE MARC` even though the project title is `MONTANTE BOT BABEL V1`, suggesting code/template reuse.
- There is no history input, API call, round-state input, volatility calculation, streak detection from live data, or deterministic predictor formula in this artifact.

Classification: **BABEL-named public reference artifact; random/template logic, not verified original BABEL Predictor V2 core.**

### JOKERPCS / myCompiler — `LUCKYJET COMBINÉ`
Public source: https://www.mycompiler.io/view/8gg0D7BkQy0

Confirmed behavior:
- Keeps a recent window via `deque(maxlen=50)`.
- Uses hard-coded historical and recent coefficient arrays.
- Computes simple descriptive statistics: mean, median, min, max, standard deviation.
- Builds frequency weights from historical + recent values using `Counter`.
- Future simulated multipliers are sampled with `numpy.random.choice` from the historical coefficient list using those frequency weights.
- Future timestamps use random gaps of 30–299 seconds.

Classification: **history-weighted simulation, but still stochastic; no live Lucky Jet API and no evidence of direct BABEL V2 provenance.**

### JOKERPCS / myCompiler — `LUCKYJET GRAND SIGNAL`
Public source: https://www.mycompiler.io/view/EcdUY74h0Bl

Confirmed behavior:
- Signal time is current time + 1 minute.
- Main coefficient is randomly generated between 12.25x and 20.62x.
- `assurance = coefficient * 0.75`.
- `fiabilite = coefficient * 0.5`.
- The time availability condition covers the entire 24-hour day, so it does not actually gate execution.

Classification: **random GRAND-style generator with deterministic assurance/fiabilité ratios.**

## Lineage assessment

These artifacts are valuable because one is explicitly titled `MONTANTE BOT BABEL V1`, making it a new exact BABEL-named public code artifact. However, the visible code is clearly random/template-driven and does not establish the original BABEL Predictor V2 prediction core.

No credentials, tokens, passwords, session IDs, or private material are preserved here.
