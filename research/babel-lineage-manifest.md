# BABEL Predictor lineage — public artifact manifest

Last updated: 2026-08-20

This file tracks only publicly verifiable artifacts related to the BABEL / AllPredictor Lucky Jet lineage. It intentionally excludes credentials, tokens, session IDs, private repository contents, access-controlled resources, and unverifiable claims.

## Confirmed Telegram bot accounts

| Bot | Status in public BABEL posts | Publicly observed role / note |
|---|---|---|
| `@allpredictorv4bot` | Confirmed | Listed repeatedly by BABEL alongside AllPredictor website/app; likely gateway/general predictor bot. Exact WebApp URL not yet verified. |
| `@luckyjetm1bot` | Confirmed | Repeatedly listed as Lucky Jet bot; older core lineup. |
| `@luckyjetfreebot` | Confirmed | Listed as a newer Lucky Jet bot in BABEL updates. |
| `@crashpredictorbbot` | Confirmed | Listed as a newer crash predictor bot. |
| `@luckyjetprojetbot` | Confirmed historical | Appears in older BABEL bot lineup. |
| `@montantegratuitbot` | Confirmed historical | Appears in older BABEL lineup / strategy context. |
| `@crash1winnbot` | Confirmed | Listed in BABEL bot updates. |
| `@metacrashv1bot` | Confirmed | Listed in BABEL bot updates. |
| `@luckyjetcraszybot` | Confirmed | Listed in BABEL bot updates. |
| `@aviatorwin2bot` | Confirmed | Listed in BABEL bot updates. |
| `@newrocketqueenbot` | Confirmed | Rocket Queen bot, useful for shared AllPredictor infrastructure lineage. |
| `@aviatorprobbsybot` | Confirmed | Aviator / BBSY bot, useful for shared infrastructure lineage. |
| `@crimeempirebbsbot` | Confirmed | Crime Empire / BBSY bot, useful for shared infrastructure lineage. |
| `@tropicanafreebot` | Confirmed | Later BABEL lineup. |
| `@astronautbbsybot` | Confirmed | Later BABEL lineup. |

## Confirmed behavior / algorithmic artifacts

### GRAND / PETIT format
Public BABEL posts show a signal format with:
- signal type: `GRAND` or `PETIT`
- target coefficient (`Côte`)
- `Assurance` for GRAND
- `Confiance` percentage
- short time window
- later validation against the actual Lucky Jet crash.

Observed public examples include:
- GRAND 25.48x / Assurance 4.43x / Confidence 62%
- PETIT 1.88x / Confidence 57%

### Timed strategy grid
Older BABEL posts expose a separate timed schedule strategy with exact seconds and target coefficients. Later points form a near-regular cadence around 432–433 seconds (~7m12–13s). Public text also states two attempts maximum and doubling after a loss. This schedule also appears in other channels, so treat it as a shared/copied strategy rather than proven proprietary BABEL backend logic.

### PRO 10x–100x windows
Recent BABEL posts expose short Lucky Jet PRO time windows labeled `COTE 10X — 100X`, including 22:27–30, 22:45–47, 22:55–57, 22:59–23:02 in the archived post. Treat these as an archived public timing pattern, not a guaranteed recurring schedule.

## Public sources

- https://telemetr.io/ru/channels/1963411992-babelseyy
- https://tlmtr.io/en/channels/1963411992-babelseyy
- https://telemetr.io/ru/cc/1YaeiK
- https://telemetr.io/fa/cc/1YaeiK
- https://telemetr.io/fa/channels/1824595312-babelseypro235
- https://telemetr.io/uz/channels/1993921907-babelsey225/posts

## Open targets / not yet verified

- exact public source for `BABEL PREDICTOR V2`
- exact public source for `PREDICTORV2BBSY`
- exact Lucky Jet V2 WebApp URL
- public source code for the original BABEL V2/V20 backend
- direct WebApp payload/url behind `@allpredictorv4bot`
- exact meaning of `Analyse...` / `Détection :` strings in the V2 lineage
- public AllPredictor subdomain/slug that maps directly to BABEL Predictor V2

## Handling rule

If original public HTML/JS/PY is found, preserve its structure as much as possible in a separate sanitized copy and remove or replace any credentials, tokens, passwords, session IDs, or other secrets before committing.
