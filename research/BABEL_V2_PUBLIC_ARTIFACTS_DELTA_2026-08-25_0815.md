# BABEL V2 public artifacts delta — 2026-08-25 08:15 Europe/Kyiv

## New verified artifact

Public Telemetrio archive for `@babelseyy` contains a PETIT Lucky Jet signal followed by an explicit validation message:

- Signal: target `3.79x`, confidence `55%`, time `07:36`.
- Validation text states the `3.79x` target was validated because the best coefficient of that minute was `3.81x`.
- Public source: https://tlmtr.io/en/channels/1963411992-babelseyy

## Confirmed logic evidence

This is direct public evidence that, for this PETIT output path, validation is performed against the best observed coefficient inside the named minute. The observed rule is consistent with:

`validated = max(coefficient during target minute) >= target`

For the captured example: `3.81 >= 3.79`, therefore the signal is marked validated.

This does **not** establish the original prediction formula that generated `3.79x` or the `55%` confidence value. It only confirms the downstream validation behavior visible in the public archive.

## Lineage status

- Confirmed: artifact is from public `BABEL OFFICIEL` / `@babelseyy` material and uses the PETIT signal format.
- Inference only: this validation rule may also be used by other BABEL V2 PETIT signals; no source code proving a universal implementation has been recovered yet.
- Not found in this pass: original `predict/analyse/detection` formula, exact history window, weights/thresholds, `/api/v1/luckyjet/predict`, `/api/v1/luckyjet/market`, `/coefficients`, or `/app/servers.js` implementation.

## Safety

No credentials, Telegram bot tokens, session IDs, passwords, private endpoints, or access-control bypass material are included.
