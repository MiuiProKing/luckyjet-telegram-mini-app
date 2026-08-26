# BABEL V2 Public Artifacts Delta — 2026-08-26 19:27 Europe/Kyiv

## New verified public artifact

### magicgram/lucky-jet-predictor-pro
- Public repository: https://github.com/magicgram/lucky-jet-predictor-pro
- Public deployment/homepage: https://lucky-jet-predictor-pro.vercel.app
- Created: 2025-11-23T09:27:07Z
- Last pushed: 2025-11-24T04:42:49Z
- Language: TypeScript
- Source file of interest: `components/PredictorScreen.tsx`

## Prediction-path findings

The visible client prediction path is random, not history-driven:

1. `usePrediction(user.playerId)` is called first as an entitlement/usage gate.
2. During the three-second animation, display values are generated with `Math.random()`.
3. Final selection uses `isRare = Math.random() < 2 / 25`.
4. Rare branch: random multiplier in `[2.20, 3.10)`.
5. Normal branch: random multiplier in `[1.10, 2.20)`.
6. No history, coefficient series, volatility, streak, average, market state, round history, confidence score, threshold, or external prediction response is used in the visible final target calculation.

Therefore this implementation is classified as **random client-side generation with a server-side usage/entitlement gate**, not a deterministic or API-returned market prediction.

## Provenance assessment

**Confirmed:** this is a distinct public `lucky-jet-predictor-pro` repository and exact Vercel deployment URL from the same `magicgram` account as the previously catalogued `lucky-jet-predictor` repository.

**Inference / not confirmed:** no evidence currently links this project to original BABEL Predictor V2, AllPredictor, `PREDICTORV2BBSY`, `@allpredictorv4bot`, or the proprietary BABEL prediction logic. Treat it as a control/reference artifact rather than recovered lineage code.

## Security handling

No credentials, tokens, passwords, session IDs, API keys, or private access material were copied into this manifest.
