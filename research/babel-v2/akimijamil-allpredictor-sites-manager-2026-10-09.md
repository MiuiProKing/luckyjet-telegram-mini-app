# Public-source review: AllPredictor Sites Manager (not Lucky Jet V2)

Reviewed: 2026-10-09 (Europe/Kyiv)
Classification: VERIFIED PUBLIC ALLPREDICTOR HOSTING INFRASTRUCTURE; NOT V2 PREDICTOR IMPLEMENTATION.
Source repository: https://github.com/akimijamil-eng/AllPredictor-sites-manager
Original public files:
- https://github.com/akimijamil-eng/AllPredictor-sites-manager/blob/main/server.js
- https://github.com/akimijamil-eng/AllPredictor-sites-manager/blob/main/server-ds.js
- https://github.com/akimijamil-eng/AllPredictor-sites-manager/blob/main/package.json
Latest inspected commit: https://github.com/akimijamil-eng/AllPredictor-sites-manager/commit/8e135214062e4d65fa88f350646214ab40a1f36c (2026-04-03)
Inspected default-branch blobs: server.js 36e06c97c18f6556fb541238d0cfd4ab529ab761; server-ds.js aa607a426fa56940b68582b063114750e8893411.

## Directly confirmed
- Node.js/Express site hosting service, including upload/deploy of static HTML and ZIP site content.
- Public source explicitly constructs URLs under https://<slug>.allpredictor.com and serves static sites with SPA fallback.
- Source includes site metadata and optional encryption of hosted files.
- The newer server.js includes a ShieldWall integration. No access-control bypass was attempted or assessed.

## Scope check for the original BABEL Predictor / Lucky Jet V2
- No LuckyJet coefficient/history ingestion found in the inspected source files.
- No target multiplier, confidence score, optimal timing, prediction window, signal condition, or model formula found.
- No evidence that this service implements or calls the original V2 prediction engine.
- No public LuckyJet prediction API response identified here.
- The AllPredictor hostname and repository name establish direct AllPredictor infrastructure lineage, **not** direct V2 prediction-code lineage.

## Classification
- Data source: hosted site files, not LuckyJet game history.
- Prediction method: N/A (neither deterministic heuristic, API-returned, nor random predictor).
- V2 implementation status: NOT FOUND.
- Avoid conflating site deployment endpoints with game prediction endpoints.

## Handling
This is a research-only manifest. No executable server copy, credentials, tokens, user data, ShieldWall internals, or non-public material is included. Public upstream source is linked rather than duplicated.
