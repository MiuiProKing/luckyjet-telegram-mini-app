# BABEL V2 public artifact delta — 2026-09-04 08:55 Europe/Kyiv

## New verified public artifact

Source: https://allpredictor.com/roadmap

The current public AllPredictor roadmap explicitly states that its LuckyJet prediction feature analyzes historical LuckyJet coefficients and generates a betting signal containing:

- a target multiplier,
- a confidence score,
- optimal timing,
- automatic validation over 3 consecutive rounds.

The same public page separately states that AllPredictor exposes documented REST endpoints for LuckyJet and Rocket Queen signals using JSON responses, API-key authentication and rate limiting.

## Exact public wording captured

> "Analyse les coefficients historiques de LuckyJet et génère un signal de mise avec multiplicateur cible, score de confiance et timing optimal. Validation automatique sur 3 tours consécutifs."

> "Endpoints documentés pour intégrer les signaux LuckyJet & Rocket Queen dans n'importe quelle application. Authentification par clé API, rate limiting, réponses JSON."

## Classification

- Provenance: **confirmed AllPredictor first-party public page**.
- History as input: **confirmed at product-behavior level**.
- Target selection: **confirmed output field, formula not published**.
- Confidence: **confirmed output field, formula/weights not published**.
- Timing/wait rule: **confirmed optimal-timing output, calculation not published**.
- Validation condition: **confirmed 3 consecutive rounds**.
- Algorithm class: **not enough public code to classify deterministic vs heuristic vs API-returned vs random**.
- Public REST signal API existence: **claimed by first-party roadmap**, but exact LuckyJet endpoint/schema not exposed on the currently indexed dashboard documentation.

## Cross-check

Current public `https://allpredictor.com/luckyjet` reports that the feature is no longer available, while the roadmap still labels LuckyJet predictions as available. Treat the roadmap as provenance/evidence of prior or product-level behavior, not proof that the LuckyJet service is currently callable.

The current indexed dashboard API documentation exposes IA and Sports endpoints but does not list a LuckyJet route, so `/api/v1/luckyjet/predict`, `/api/v1/luckyjet/market` and any specific JSON response schema remain unverified in this pass.

## Safety

No authentication was bypassed. No protected site, ShieldWall rule, private repository, hidden directory, credential, token or secret was accessed. This manifest contains public metadata and no secrets.
