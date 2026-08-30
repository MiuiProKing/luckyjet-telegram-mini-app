# BABEL V2 / AllPredictor public delta — 2026-08-31 00:53 Europe/Kyiv

## New verified artifact

### Retired AllPredictor game API sandbox

Public URL: https://allpredictor.com/sandbox

Current public page states that the game API for **LuckyJet and Rocket Queen has been removed** and that its test sandbox is therefore no longer available. It also states that AllPredictor now focuses on hosting Telegram/Discord bots and websites.

This is important provenance evidence because it explicitly confirms that AllPredictor previously exposed a distinct **game API** for LuckyJet/Rocket Queen, separate from the currently documented sports API.

## Current API docs cross-check

Public dashboard HTML: https://allpredictor.com/dashbord

The public dashboard shell currently advertises `https://allpredictor.com/api/v1` as the generic API base and links to the public documentation. The visible public docs expose IA endpoints and Sports API v2, but no current LuckyJet predictor endpoint.

Public docs: https://allpredictor.com/doc

Current `/doc` documents only sports endpoints under `/api/v2/sports/{sport}` and `/api/v2/sports/{sport}/{id}` plus current auth/API-key behavior. No current public LuckyJet formula, history window, target calculation, confidence formula, or timing logic is exposed there.

## Classification

- Confirmed: AllPredictor previously had a LuckyJet/Rocket Queen **game API sandbox**.
- Confirmed: that game API is now publicly marked as removed.
- Confirmed: current public docs do not disclose the original LuckyJet predictor core.
- Inference: archived versions of `/sandbox`, `/doc`, or the old game-API client code are now higher-priority provenance targets for locating the original BABEL/AllPredictor LuckyJet implementation.

No credentials, API keys, session IDs, or private material are included in this manifest.
