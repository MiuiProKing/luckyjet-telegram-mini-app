# Public artifact: CodePal Lucky Jet Prediction Bot Guide

Source: https://codepal.ai/chat/query/kwqy9kJX/lucky-jet-prediction-bot-guide
Checked: 2026-08-22

## Status
Public Lucky Jet implementation artifact. **No verified connection to BABEL / AllPredictor.** Preserve only as a comparison candidate for lineage/logic reconstruction.

## Confirmed source structure
- `src/config.js`
- `src/services/data-fetcher.js`
- `src/services/prediction-engine.js`
- `src/bot/telegram-bot.js`
- `src/index.js`
- `.env` placeholder only

## Data sources
The public example references:
- `https://crash-gateway-cc-cr.gamedev-tech.cc/history`
- `https://tipmanager.net/lucky-jet`
- `https://1win.com/lucky-jet`

History request parameters shown in the example:
- `id_n=1play_luckyjet`
- `id_i=1`
- a hard-coded example `round_id`

## Prediction rules shown in source
- prediction interval selected randomly from 3–15 minutes
- second prediction time = first prediction time + 78 seconds
- target coefficient randomly selected from 30–150X
- insurance randomly selected from 10–29.99X
- Telegram prediction cycle repeats every 5 minutes

## Classification
Despite comments describing "advanced prediction logic", the actual published target/insurance functions use `Math.random()`. The fetched sources are not used in those calculations. Therefore this is a **random generator with real-data fetch scaffolding**, not a demonstrated analytical predictor.

## Security note
No credentials were copied. The `.env` sample contains only a placeholder token string.
