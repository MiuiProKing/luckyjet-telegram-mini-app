# BABEL V2 Public Artifacts Delta — 2026-08-27 10:28 Europe/Kyiv

## New verified finding: Android publisher/contact provenance

Source: Chrome-Stats public metadata page for `com.allpredictorfree.app` (data ingested 2026-08-24), cross-checkable against the current Google Play listing.

### Confirmed facts

- Android package: `com.allpredictorfree.app`.
- Public publisher/developer label: `Babel sey`.
- Publicly indexed Android version: `4.4.23`, last updated 2026-07-03.
- Chrome-Stats records a **publisher contact change on 2026-07-05** from a masked Gmail address to a masked address on the `allpredictor.com` domain.
- Current public metadata links the package to `https://allpredictor.com`.

### Interpretation

This strengthens the already established public linkage between the Android AllPredictor package and the BABEL/AllPredictor domain infrastructure. It is a provenance/ownership-infrastructure signal only; it does **not** reveal the original Lucky Jet prediction algorithm, server-side code, credentials, or private ownership data.

### Not found in this pass

No new verified public occurrence of:

- `PREDICTORV2BBSY`
- original `predict/analyse/detection` implementation
- `/api/v1/luckyjet/predict`
- `/api/v1/luckyjet/market`
- `/coefficients`
- `/app/servers.js`

No authentication bypass, hidden-directory probing, credential recovery, or non-public access was attempted.

## Public sources

- https://chrome-stats.com/d/com.allpredictorfree.app
- https://play.google.com/store/apps/details?id=com.allpredictorfree.app
