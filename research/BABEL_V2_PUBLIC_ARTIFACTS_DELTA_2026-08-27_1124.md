# BABEL V2 public artifacts delta — 2026-08-27 11:24 Europe/Kyiv

## New verified artifact: PETIT dual-target tier expansion to 8x/10x

Public Telemetr snapshot for `@babelsey225` (BABEL OFFICIEL), crawled 2026-08-27, shows a new PETIT-style sequence that extends the previously observed `2x + 3x/4x` dual-target format to much higher second targets:

- `17h17 2x 10x`
- `17h23 2x 10x`
- `17h29 2x 8x`
- followed by `Assurance validé`
- a later post returns to `18h15 2x 4x`

Public source:
- https://telemetr.io/ch/channels/1993921907-babelsey225

## Confirmed facts

1. The public BABEL OFFICIEL stream now contains dual-target Lucky Jet outputs with a fixed-looking lower tier `2x` and a variable upper tier reaching at least `8x` and `10x`.
2. This broadens the previously verified dual-target PETIT family (`2x + 3x/4x`).
3. `Assurance validé` appears immediately in the same visible sequence after the `2x/8x` and `2x/10x` outputs, but the public snapshot does not unambiguously bind that validation text to a specific one of those three posts.

## Inference (not source-code confirmed)

The output format is consistent with a two-level signal layer where the lower target remains conservative (`2x`) while the second target can move across tiers (`3x`, `4x`, `8x`, `10x`). This may reflect a market-state/confidence tier selection, but no public source code currently proves the rule, thresholds, history window, or how the upper tier is chosen.

## Prediction-core status

No new verified original `PREDICTORV2BBSY` source, `predict/analyse/detection` implementation, exact history-window/weights/thresholds, or public implementation of `/api/v1/luckyjet/predict`, `/api/v1/luckyjet/market`, `/coefficients`, or `/app/servers.js` was found in this pass.

## Safety / sanitization

No credentials, tokens, passwords, session IDs, customer IDs, private repository data, or access-control bypass material are included.
