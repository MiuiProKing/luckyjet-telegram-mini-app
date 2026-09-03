# BABEL V2 public-artifact delta — 2026-09-03 19:03 Kyiv

## New verified artifact

### Public AllPredictor dashboard HTML exposes a Firestore-backed global bot inventory layer

Public source: https://allpredictor.com/dashbord

Verified text visible in the public HTML response:
- "Admin · Bots globaux"
- "Vue globale — Tous les bots"
- "Bots déployés par l'ensemble des utilisateurs AllPredictor"
- "Lecture en temps réel depuis Firestore"

This establishes a direct public AllPredictor infrastructure reference to Firestore for the platform-wide bot inventory/admin view.

## Relevance to BABEL / Lucky Jet V2 search

Confirmed:
- AllPredictor currently references Firestore as a real-time backend for its global deployed-bot inventory view.
- The same public HTML documents hosting of user `.py` / `.js` bots and workers and `slug.allpredictor.com` pages.

Not confirmed:
- No original BABEL V2 / PREDICTORV2BBSY source code was exposed in this artifact.
- No LuckyJet history window, target formula, confidence weights, timing rule, or retired `/api/v1/luckyjet/*` response schema was recovered.
- No attempt was made to access Firestore directly, enumerate collections, bypass authentication, or inspect private/admin-only endpoints.

## Classification

- Artifact type: public infrastructure/storage reference
- Direct lineage: AllPredictor
- Predictor-core status: NOT RECOVERED
- Safe handling: no credentials, tokens, sessions, private data, or secret endpoints included
