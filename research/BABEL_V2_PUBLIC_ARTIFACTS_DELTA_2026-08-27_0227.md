# BABEL V2 public artifact delta — 2026-08-27 02:27 Europe/Kyiv

## New public artifact

A newly surfaced public GitHub repository contains a `TROPICANA/script.js` implementation that talks to the same Lucky Jet/100hp crash gateway family seen in other public predictor projects:

- Repository: `alanrake225/malithinas.github.io`
- File: `TROPICANA/script.js`
- Public source: https://github.com/alanrake225/malithinas.github.io/blob/48411c37057bb80bdbffd1c658247ed0dd6b7c4f/TROPICANA/script.js
- Repository created: 2025-07-30
- File snapshot modified: 2025-07-30

## Confirmed behavior

The client performs a public game-launch/auth flow and then polls the crash gateway `/state` endpoint once per second. It reads the current coefficient from `currentСoefficients` and the round state from `currentState`.

The visible prediction path is **not history-based**. When `currentState === "betting"` and at least 5 seconds have passed since the previous output, it generates:

```text
prediction = random uniform(1.10, 5.00)
```

and displays that value. During `ending` it displays `Waiting..`.

Therefore this artifact is a **state-gated random signal generator**, not a recovered deterministic statistical Lucky Jet predictor.

## Lineage relevance

`TROPICANA` is relevant as a related-name artifact because `@tropicanafreebot` appears in the public BBSY/BABEL bot family. However, no direct repository-level evidence currently links `alanrake225`, this repo, or this exact script to BABEL SEY, AllPredictor, `PREDICTORV2BBSY`, or `@allpredictorv4bot`.

Classification: **reference / related-name artifact, lineage unconfirmed**.

## Sanitization

The public source contains credential-like launch material. This manifest intentionally omits all secretKey/token/session/customer values and does not reproduce reusable authentication material.
