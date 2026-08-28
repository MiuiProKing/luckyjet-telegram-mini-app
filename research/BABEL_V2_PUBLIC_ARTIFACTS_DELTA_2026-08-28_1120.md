# BABEL V2 Public Artifacts Delta — 2026-08-28 11:20 EEST

## New verified public artifact

### Anonymous myCompiler project: `Lucky jet predictor`

Public URL: https://www.mycompiler.io/view/BzFpu4fW4s2
Published: 2025-02-11
Language: Python 3.11

This artifact was not previously present in this repository's research manifests.

## Confirmed code behavior

The script maintains a JSON history file named `historique_cotes.json` and retains only the last 50 values.

Core functions:

- `charger_historique()` loads prior values from JSON.
- `sauvegarder_historique()` persists only the last 50 values.
- `moyenne_mobile(historique, fenetre=50)` computes a moving average over up to 50 values.
- `detecter_meilleur_moment(historique)` compares the latest value against the 50-value moving average:
  - latest > average × 1.2 => favorable/high trend
  - latest < average × 0.8 => caution/down trend
  - otherwise => stable trend
- `generer_cote()` derives bounds from the 50-value average:
  - `min_cote = max(2.0, moyenne * 0.8)`
  - `max_cote = min(25.0, moyenne * 1.5)`
  - `hack_cote = (min_cote + max_cote) / 2`
  - generated coefficient = random uniform between `hack_cote` and `max_cote`
  - `assurance = coefficient * 0.75`
  - `fiabilite = coefficient * 0.5`
- Signal time is `now + 1 minute`.
- Execution is gated to hours from 22:00 through 07:59; otherwise analysis is paused.

## Classification

This predictor is a **history-shaped random heuristic**.

History affects the random range and trend label, but the target itself is generated using `random.uniform()`. There is no public game API, live round feed, deterministic next-round computation, model inference, or server-returned prediction in this code.

## Relation to BABEL / AllPredictor

Confirmed: public Lucky Jet predictor source using French labels, 50-session history, target/assurance/fiabilite terminology, and a +1 minute signal time.

Not confirmed: any direct relationship to BABEL SEY, BABEL Predictor V2, `PREDICTORV2BBSY`, `@allpredictorv4bot`, AllPredictor, or the original BABEL predictor core. Treat this as a **reference/control artifact**, not recovered BABEL V2 source.

## Security handling

No credentials, tokens, passwords, session IDs, private endpoints, or access-control bypass material were copied into this manifest.
