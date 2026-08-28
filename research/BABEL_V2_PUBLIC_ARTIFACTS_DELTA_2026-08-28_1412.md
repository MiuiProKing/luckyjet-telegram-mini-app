# BABEL V2 Public Artifacts Delta — 2026-08-28 14:12 Europe/Kyiv

## New public artifact

- Repository: https://github.com/magicgram/lucky-jet-predictor
- Exact file with prediction logic: https://github.com/magicgram/lucky-jet-predictor/blob/main/components/PredictorScreen.tsx
- Prediction-use API: https://github.com/magicgram/lucky-jet-predictor/blob/main/api/use-prediction.ts
- Public AI Studio reference in README: https://ai.studio/apps/drive/1nneaBIuCdRyc6nr_sUmr1Teq2FUEYksB

## Verified implementation details

This repository is named `lucky-jet-predictor`, but the current UI labels itself `Rocket Queen Predictor`.

The actual client-side prediction result is random rather than history-derived:

- While animating, every 50 ms it displays `(Math.random() * 9 + 1).toFixed(2)`.
- After 3 seconds, `isRare = Math.random() < 2 / 25`.
- Rare branch (8%): random result in 2.20x–3.10x.
- Common branch (92%): random result in 1.10x–2.20x.
- No coefficient history, streak, volatility, interval, average, market API, or deterministic predictor formula is consulted before choosing the result.
- `/api/use-prediction` only decrements `predictionsLeft` in Vercel KV for the given `playerId`; it does not generate the multiplier.

## Classification

CONFIRMED: public Lucky Jet-named predictor codebase with recoverable prediction implementation.

CONFIRMED: prediction value is client-side pseudo-random with fixed ranges/branch probability, not returned from a Lucky Jet market/predict API.

NOT CONFIRMED: any direct relationship to BABEL SEY, BABEL Predictor V2, PREDICTORV2BBSY, @allpredictorv4bot, akimijamil-eng, or AllPredictor infrastructure.

This is therefore a useful control/reference artifact, not evidence of the original BABEL V2 formula.

No credentials, tokens, passwords, session identifiers, or private endpoints are preserved here.
