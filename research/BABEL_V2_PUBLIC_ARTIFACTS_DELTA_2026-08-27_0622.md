# BABEL V2 Public Artifacts Delta — 2026-08-27 06:22 Europe/Kyiv

## New verified artifact: AllPredictor `/sites/<slug>` is used by another app from the same developer

### Confirmed facts

Apple's public App Store metadata for **Fomesoutra 1** lists the developer/provider as **Ndouffou Ahiman Jean jaures**, the same developer/provider publicly listed for **Allpredictor**.

The Fomesoutra App Store listing publishes this exact privacy-policy URL:

`https://allpredictor.com/sites/fomesoutra`

Public source:
- https://apps.apple.com/us/app/fomesoutra-1/id6769413105
- https://apps.apple.com/ci/app/allpredictor/id6762495082

This confirms that the `allpredictor.com/sites/<slug>` namespace is not limited to the LuckyJet page and is used as a generic hosted-site/application route by the same developer ecosystem.

### Relevance to BABEL / LuckyJet lineage

This strengthens the interpretation that historical paths such as `allpredictor.com/sites/luckyjet` may have been managed through a generic hosted-sites layer rather than being a unique hard-coded LuckyJet route.

### Inference only

It is plausible that a common sites-manager or hosted-site registry controls multiple `/sites/<slug>` entries, but no public source in this pass exposes that manager's source code, storage schema, or LuckyJet-specific implementation.

### Not found in this pass

No new verified original `PREDICTORV2BBSY` source, `predict/analyse/detection` implementation, LuckyJet formula/weights/history-window/thresholds, or confirmed public implementation of:

- `/api/v1/luckyjet/predict`
- `/api/v1/luckyjet/market`
- `/coefficients`
- `/app/servers.js`

### Safety / sanitization

No credentials, tokens, passwords, session IDs, private repository data, hidden directories, authentication bypasses, or non-public storage contents were accessed or preserved.
