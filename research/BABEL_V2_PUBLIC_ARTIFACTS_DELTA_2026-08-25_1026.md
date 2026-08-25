# BABEL V2 Public Artifact Delta — 2026-08-25 10:26 Europe/Kyiv

## New verified artifact: BBSY timing-window guidance

Public source:
- https://telemetr.io/es/channels/1824595312-onepiece_vostfr
- Mirror/index variant: https://telemetr.io/fa/channels/1824595312-babelseypro235

### Confirmed facts
A public archive associated with the BBSY/AllPredictor bot lineage publishes a specific Lucky Jet timing heuristic immediately alongside posts naming `@allpredictorv4bot` and the same bot family.

Published favorable hour ranges:
- 11:00–13:00
- 16:00–19:00
- 21:00–23:00
- 01:00–02:00

Published minute bands described as periods where large multipliers appear frequently:
- 59–02
- 04–07
- 07–10
- 14–17
- 17–20
- 27–30
- 30–33
- 45–47
- 50–52
- 57–59

The same archive also publishes a separate second-level schedule with two-attempt maximum and doubling after a loss, and describes newer bots as using connected APIs.

### Why this is useful
This is a previously unrecorded public timing layer in the BBSY lineage. It provides concrete candidate timing gates for reconstructing historical GRAND/PRO scheduling behavior.

### Inference (not proven original code)
The hour/minute grid may represent a hand-authored timing filter or a precomputed schedule used upstream of signal generation. There is no public source proving that these intervals are implemented directly in original BABEL Predictor V2 code, nor that they are statistically derived from the Lucky Jet market.

### Not found in this pass
No new verified public source for:
- `PREDICTORV2BBSY`
- `/api/v1/luckyjet/predict`
- `/api/v1/luckyjet/market`
- `/coefficients`
- `/app/servers.js`
- the original `predict/analyse/detection` function or its exact weights/thresholds

### Safety
No credentials, tokens, session identifiers, passwords, private repository content, authentication bypass material, or non-public secrets are included in this manifest.
