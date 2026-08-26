# BABEL V2 Public Artifacts Delta — 2026-08-26 11:13 Europe/Kyiv

## New verified artifact: Allpredictor 4.3.22 / Partner Space lineage

### Confirmed facts

- Apple App Store version history for Allpredictor shows version **4.3.22**, released **24 June 2026**.
- The 4.3.22 changelog states: **“Correction de la création de comptes clients depuis l'espace partenaire.”**
- The immediately preceding partner-related changelog describes an **Espace Partenaire** with reseller/client-management functions: partner dashboard, slot tracking, purchase history, client account management, ability to block/delete a client account, and partnership requests from Support.
- The same public App Store listing shows the broader release sequence around this branch: 4.3.19 → 4.3.20 → 4.3.21 → 4.3.22 → 4.4.23 → 4.4.24 → 4.5.25.
- APKPure independently exposes an Android Allpredictor artifact in the same late-June lineage and identifies package `com.allpredictorfree.app`; no credentials or private material are reproduced here.

### Relevance to BABEL / Lucky Jet V2 lineage

This is a **product/infrastructure lineage artifact**, not recovered prediction code. It establishes that by late June 2026 Allpredictor had a distinct account/partner-management layer capable of managing client accounts separately from the predictor UI. That matters for interpreting BBSY activation/gating posts: those posts may map to an account/entitlement workflow rather than to prediction logic itself.

### Inference only

- The public BBSY instructions about account activation may have been backed by this partner/client-management layer.
- This does **not** prove that BBSY promo-code gating was technically enforced inside the Lucky Jet prediction engine.
- No new original `predict` / `analyse` / `detection` function, Lucky Jet history-window formula, target-selection weights, thresholds, or verified `/api/v1/luckyjet/*` implementation was found in this pass.

## Public sources

- Apple App Store (US): https://apps.apple.com/us/app/allpredictor/id6762495082
- Apple App Store (Cameroon): https://apps.apple.com/cm/app/allpredictor/id6762495082
- Apple App Store (Côte d’Ivoire): https://apps.apple.com/ci/app/allpredictor/id6762495082
- APKPure Android lineage: https://apkpure.net/allpredictor/com.allpredictorfree.app/download/4.3.21

## Safety / provenance

Only publicly indexed pages and public app-store metadata were inspected. No authentication bypass, private repository access, hidden-directory enumeration, exploitative scanning, or credential recovery was performed. No tokens, passwords, session IDs, API keys, or account secrets are stored in this manifest.
