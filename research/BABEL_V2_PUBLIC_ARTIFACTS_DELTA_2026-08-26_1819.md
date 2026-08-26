# BABEL V2 Deep Watch — public artifact delta

Date: 2026-08-26

## New public reference artifact

Repository: `magicgram/lucky-jet-predictor`

Public source:
- https://github.com/magicgram/lucky-jet-predictor
- https://github.com/magicgram/lucky-jet-predictor/blob/main/components/PredictorScreen.tsx
- https://ai.studio/apps/drive/1nneaBIuCdRyc6nr_sUmr1Teq2FUEYksB

### Confirmed facts

- The public repository is named `lucky-jet-predictor` and exposes an exact Google AI Studio app URL in its README.
- The repository contains React/TypeScript UI plus public API routes including `api/use-prediction.ts`, account/promo/postback routes, and `components/PredictorScreen.tsx`.
- Despite the repository name, the visible predictor UI is branded `Rocket Queen Predictor`.
- The visible client-side prediction output in `PredictorScreen.tsx` is random, not history-derived:
  - display animation uses `Math.random()`;
  - about `2/25` of final outputs are sampled from `2.20–3.10`;
  - otherwise outputs are sampled from `1.10–2.20`;
  - the result is revealed after about 3 seconds.
- The visible predictor path does not consume coefficient history, volatility, streaks, rounds, averages, thresholds, or a Lucky Jet market endpoint before selecting the final multiplier.

### Classification

Reference/control artifact only. No public evidence currently ties this repository to original BABEL Predictor V2, BABEL SEY, AllPredictor, `PREDICTORV2BBSY`, or `@allpredictorv4bot`.

This artifact is useful negative evidence: a repository named as a Lucky Jet predictor can still be a generic/random predictor shell, so it should not be treated as recovered BABEL logic without a direct lineage link.

### Security handling

No credentials, tokens, passwords, session identifiers, private endpoints, or secrets were copied into this manifest.
