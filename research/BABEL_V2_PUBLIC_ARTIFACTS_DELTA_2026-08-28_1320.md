# BABEL V2 public artifacts delta — 2026-08-28 13:20 Europe/Kyiv

## New verified public artifact

Source: public Telemetr archive for Telegram channel `@sportbet0011` (Sport bet pro plus)

Public source URL:
- https://telemetr.io/ar/channels/2102481591-sportbet0011/posts

Observed Lucky Jet signal format in the public archive:
- `LUCKY JET SIGNAL BOT`
- `COTE : 38.00`
- `ASSURANCE : 4.93`
- `HEURE : 13:36 - 13:38`
- `Signal généré avec la version v2025.10.13.8 le 20/10/2025 à 13:33`

A second signal in the same indexed archive shows:
- `COTE : 23.32`
- `ASSURANCE : 5.06`
- `HEURE : 13:27 - 13:29`
- the same version string `v2025.10.13.8`

## Assessment

Confirmed:
- This is a distinct public Lucky Jet signal-bot artifact with an explicit software/version identifier `v2025.10.13.8`.
- The output schema overlaps materially with the BABEL-family public format: target/cote, assurance, and a short time window.
- The archived channel also contains `LUCKY JET MONTANTE` posts with exact scheduled timestamps and low target multipliers, showing another timetable-style Lucky Jet mode in the same public surface.

Not confirmed:
- No public evidence currently ties `@sportbet0011` or version `v2025.10.13.8` directly to BABEL SEY, `PREDICTORV2BBSY`, `@allpredictorv4bot`, AllPredictor, or the original BABEL Predictor V2 codebase.
- No source code, WebApp URL, API endpoint, history window, formula, weights, thresholds, or deterministic/random implementation was exposed by this artifact.

## Security / handling

No credentials, tokens, passwords, session IDs, private repository data, or access-controlled resources were collected. Only publicly indexed content was recorded.
