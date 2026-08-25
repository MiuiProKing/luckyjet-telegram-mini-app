# BABEL V2 Public Artifacts Delta — 2026-08-25 20:15 Kyiv

## New verified artifact

A public myCompiler project by `Honoratwin` titled **Lucky jet predictor** was found:

- Source: https://www.mycompiler.io/view/Ic7BBbg6tVF
- Publicly visible code combines two distinct layers:
  1. a real Lucky Jet history collector that polls the public `crash-gateway-grm-cr.100hp.app` gateway, deduplicates rounds using `id` or `hash`, and reads the coefficient from `topCoefficient` with a fallback to `finalValues[0]`;
  2. a trailing GRAND-style signal print block using variables named `coefficientNumber`, `halfNumber`, and `fiabibily`.

Credential-like request values present in the public source were intentionally omitted from this manifest.

## Lineage match to older public code

The trailing signal block matches an older public myCompiler family almost verbatim:

- `GEDEON225` — Lucky jet predictor 2: https://www.mycompiler.io/view/JmeqQn8Pcaw
- anonymous Lucky jet variant: https://www.mycompiler.io/view/6qnsp2Q0AwS
- anonymous Lucky jet / Grosse Côte variant: https://www.mycompiler.io/view/DQK6Ken8m8G
- `GEDEON225` — Lucky jet predictor: https://www.mycompiler.io/view/BRd9Juhejdx

Those older versions generate `coefficientNumber` with `random.uniform(...)`, derive `halfNumber = coefficientNumber / 2`, and derive `fiabibily = halfNumber / 2`.

## Confirmed interpretation

The newly found `Honoratwin` file does **not** expose a complete deterministic prediction formula. The real gateway polling section only retrieves/deduplicates historical rounds. The GRAND-style output fragment is inherited from an older random-generator family and is not connected in the visible code to the fetched coefficient history.

Therefore, this artifact is best classified as a **hybrid/mash-up reference implementation** rather than evidence of the original BABEL Predictor V2 prediction engine.

## Inference

This materially lowers the evidentiary value of public scripts that merely combine a real Lucky Jet history endpoint with BABEL-like output text. Presence of the real gateway alone does not prove that a target/assurance/confidence value is history-derived.

For future lineage checks, priority should be given to code where fetched history is actually consumed by the target/confidence/timing calculation path.
