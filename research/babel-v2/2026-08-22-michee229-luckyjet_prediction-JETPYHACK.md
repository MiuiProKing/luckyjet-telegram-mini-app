# Public Lucky Jet source artifact — Michee229/Luckyjet_prediction

Date recorded: 2026-08-22
Public source: https://github.com/Michee229/Luckyjet_prediction/blob/7c9e1829f8bc8360a3c10b15a1180399c3d3b060/JETPYHACK.PY
Source modified: 2025-05-03

## Status

Public Lucky Jet prediction code with a complete `history -> prediction -> signal` path. No verified connection to BABEL / AllPredictor has been established, so treat it as a related implementation candidate, not the original BABEL V2 source.

## Sanitization

The upstream file contains a Telegram bot token and numeric Telegram IDs. Those values are intentionally omitted here. The Cloudflare cookie is already a placeholder upstream.

## Confirmed analysis path

1. User presses the Signal button.
2. `handle_menu()` enforces a 2-minute per-user cooldown, then calls `send_prediction()`.
3. `send_prediction()` requests:
   - `GET https://crash-gateway-cc-cr.gamedev-tech.cc/history`
   - params: `id_n=1play_luckyjet`, `id_i=1`
4. It extracts the first 20 `top_coefficient` values.
5. If fewer than 20 values are present, prediction stops.
6. The 20 coefficients are standardized with `StandardScaler`.
7. If no serialized model is loaded, `train_model()` creates an `xgb.XGBRegressor(objective="reg:squarederror")` and fits adjacent normalized values.
8. Prediction input is the last 5 normalized coefficients: `model.predict([coefs_scaled[-5:]])[0]`.
9. Prediction is clamped to `2.1 <= target <= 7.0`.
10. Assurance is calculated from the target and the observed range:

   `assurance = 1.9 + (target - 2.1) * (3.5 - 1.9) / (max(coefs) - min(coefs))`

   then capped at `target - 0.1`.
11. Wait time is deterministic from target:

   `wait_minutes = 2 + int((target - 2.1) * 1.5)`

   so the signal time is current time + roughly 2–9 minutes depending on target.

## Exact analysis entry point

The functional entry point is `handle_menu()` -> `send_prediction()` when the user presses `🎯 Signal` and the cooldown/access checks pass.

This implementation does **not** contain an autonomous market trigger such as streak/volatility/time-window detection; analysis starts on the button event.

## Model / determinism assessment

- History window: 20 raw coefficients.
- Prediction feature window: last 5 normalized coefficients.
- Model: XGBoost regressor when first created.
- Training target: next normalized coefficient from the preceding normalized coefficient.
- Target output is model-returned then clamped; it is not directly random in `send_prediction()`.
- However, the model training shape appears inconsistent with the later 5-feature prediction call, so this public code may fail or require an unseen serialized model trained with 5 features. This is a significant implementation caveat.

## Lineage assessment

Confirmed: real/public Lucky Jet-style `/history` endpoint, 20-round history, last-5 prediction window, target/assurance/wait formulas, concrete analysis entry function.

Not confirmed: any relationship to BABEL V2, `@allpredictorv4bot`, BBSY, AllPredictor infrastructure, GRAND/PETIT/PRO4, or BABEL confidence logic.
