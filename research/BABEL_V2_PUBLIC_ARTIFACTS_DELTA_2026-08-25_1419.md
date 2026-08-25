# BABEL V2 public artifacts delta — 2026-08-25 14:19 Europe/Kyiv

## New verified official artifact

### AllPredictor Google Play description
Public Google Play listing for package `com.allpredictorfree.app` currently states that AllPredictor provides:

- real-time predictions based on statistical data;
- performance tracking;
- session history.

Public source:
https://play.google.com/store/apps/details?id=com.allpredictorfree.app

## Why this matters
This is an official product-description artifact, not a third-party reconstruction. It confirms that the current AllPredictor product publicly characterizes its prediction layer as statistics-based and explicitly retains performance/session history.

## What this does *not* prove
It does not expose the Lucky Jet-specific history-window size, formulas, weights, thresholds, target selection, timing rules, or any `/api/v1/luckyjet/*` implementation. It also does not prove that BABEL Predictor V2 uses the exact same algorithmic core as the current AllPredictor mobile app.

## Sanitization
No credentials, tokens, passwords, session IDs, customer IDs, private endpoints, or non-public secrets are included in this manifest.
