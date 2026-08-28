# BABEL V2 Public Artifacts Delta — 2026-08-28 06:21 EEST

## New verified public artifact

Source: https://allpredictor.com/roadmap

AllPredictor's current public roadmap explicitly lists a live **REST API AllPredictor** feature for integrating **LuckyJet & Rocket Queen signals** into external applications. The roadmap states that the API uses **API-key authentication**, **rate limiting**, and **JSON responses**.

The same page separately states that its LuckyJet predictor analyzes historical LuckyJet coefficients and produces a target multiplier, confidence score, optimal timing, with automatic validation over 3 consecutive rounds.

## Confirmed

- Public AllPredictor roadmap exposes a distinct REST API integration layer for LuckyJet and Rocket Queen signals.
- The publicly described transport/auth characteristics are API key + rate limiting + JSON responses.
- LuckyJet is described as history-based at the product level, with target, confidence, timing, and 3-round validation.

## Not confirmed / inference

- No exact LuckyJet REST path is exposed on this roadmap entry.
- No public proof was found in this pass for `/api/v1/luckyjet/predict`, `/api/v1/luckyjet/market`, `/coefficients`, `/app/servers.js`, or any `/api/v2/luckyjet/*` route.
- The currently documented `/api/v2` public docs are sports-oriented; therefore no LuckyJet v2 endpoint is inferred from their existence.
- No original `predict/analyse/detection` formula, history-window size, weights, or thresholds were recovered in this pass.

## Safety

No authentication bypass, hidden-path enumeration, private repository access, credential recovery, or secret material was used or preserved.
