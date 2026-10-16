# Public AllPredictor LuckyJet WebApp observation — 2026-10-16

## Scope and provenance
- Public, unauthenticated, first-party page: https://allpredictor.com/sites/luckyjet
- Observed on 2026-10-16 using public page extraction and a single browser interaction (clicked “Générer” once).
- This is an **original public AllPredictor WebApp surface**, **not** an extracted BABEL Predictor V2 implementation. No evidence establishes that its code is V2, BBSY, or identical to any historic V2 model.
- No login, ShieldWall bypass, private endpoint, source-map guessing, or protected resource access.

## Confirmed on-screen facts
- Title: `LuckyJet · AllPredictor`.
- Public page displayed a strip of recent LuckyJet-style coefficients.
- UI has “Générer”, “ANALYSE” (“Analyse des derniers tours…”), target time (“Heure cible”), confidence-like percentage, countdown, and outcome counters (“Validées”, “Échouées”, “Total”, “Réussite”).
- After one click, the page displayed **91%** and target time **10:50**, with countdown **2:01** (browser observation, not validated model accuracy).
- Coefficients visible after click included: 5.57x, 1.67x, 1.88x, 96.31x, 2.25x, 16.46x, 2.93x, 1.01x, 1.02x, 1.16x, 5.80x, 1.22x, 1.01x, 1.52x, 1.84x, 1.12x.
- “Chance théorique · cycle”, “Chance observée · 30 derniers”, and “Tour 0/3” appear in the public UI.
- The UI labels monitored motifs: crash 4.00–4.99 followed by ≥10x within 3 rounds; three successive ≥2x followed by ≥10x within 3 rounds; two <2x crashes in one minute followed by ≥2x in +4 to +6 minutes. These are **UI descriptions**, not verified predictive relationships.
- The history panel did not expose underlying calculation code.

## Classification
- **VERIFIED**: first-party public WebApp displays recent coefficients, an analysis sequence, a confidence-like 91%, and target timing.
- **UNVERIFIED**: whether those coefficients actually feed the displayed confidence/timing; whether coefficients are live/accurate; whether the model is deterministic, heuristic, API-returned, or random; whether it is the original BABEL V2.
- **NOT EXTRACTED**: input schema, history window size, formulas, weights, target-multiplier selection, thresholds, signal conditions, fallback logic, predictor JavaScript source, source map, JSON API response.

## Other checked public surfaces
- https://allpredictor.com/robots.txt — public policy disallows `/api/` and `/luckyjet.html`. Neither was crawled as source.
- https://allpredictor.com/sitemap.xml — public sitemap lists `/luckyjet-auto`, but that URL currently presents the general hosting homepage.
- https://allpredictor.com/app/servers.js — public JavaScript defines `window.allpredictorAppUpdate` for mobile-app update metadata; **not a predictor engine**. No sensitive values reproduced.
- https://allpredictor.com/coefficients — maintenance notice, no coefficient API output.
- Public `/api/v1/luckyjet/market` and `/api/v1/luckyjet/predict` page retrieval returned the general AllPredictor hosting homepage, **not verified JSON prediction responses**.

## Conclusion
This is a newly **verified observation of a public AllPredictor WebApp**, not a discovery of the original BABEL Predictor V2 source code. Do not derive/reconstruct a V2 formula from the displayed outputs. No trading or gambling actions were performed.
