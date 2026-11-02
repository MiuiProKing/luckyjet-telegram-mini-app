# BABEL / AllPredictor V2 — public artifact verification (2026-11-02)

Scope: openly published sources only. This is **not** an original Lucky Jet V2 algorithm and contains **no prediction logic or secrets**.

## Newly directly retrieved artifacts

1. **Public JavaScript app-update configuration** — https://allpredictor.com/app/servers.js
   - Public response assigns `window.allpredictorAppUpdate`.
   - `latestVersion: "4.7.28"`, `latestBuildNumber: 51`, `enabled: true`, `forceUpdate: false`.
   - Lists public Android update and iOS App Store URLs. No Lucky Jet history, coefficient input, target, confidence, timing, thresholds, or predictive function. **Classification: deterministic static app-update configuration; NOT V2.**
2. **Public robots.txt** — https://allpredictor.com/robots.txt
   - `Allow: /`; excludes `/api/`, `/luckyjet.html`, `/sandbox` from crawler indexing; advertises sitemap URL. Exclusions were respected for subsequent exploration. **Classification: crawler directives; NOT V2.**
3. **Public sitemap.xml** — https://allpredictor.com/sitemap.xml
   - Lists 10 ordinary public pages: root, doc, bot-builder, hosting-bot, ai, auth, support, roadmap, privacy, terms. No V2 page or WebApp link. **Classification: navigation metadata; NOT V2.**

## Existing public statements (not proof of a working predictor)

- https://allpredictor.com/roadmap advertises historical Lucky Jet coefficients, target multiplier, confidence score, optimal timing and 3-round validation, but exposes no algorithm or sample API response.
- https://allpredictor.com/sandbox states that the LuckyJet/Rocket Queen game API and sandbox have been withdrawn.
- https://allpredictor.com/doc documents hosting and FIFA API, not an authenticated or public Lucky Jet V2 predictor implementation.

## GitHub lineage re-check

As of 2026-11-02, the public GitHub commit heads for `babelse/babelse.github.com` (`a6e38dc`), `babelse/allpredictor-wa-manager` (`81df0cd`), `akimijamil-eng/mes-bots-telegram` (`6ca2a3f`), `akimijamil-eng/AllPredictor-sites-manager` (`8e13521`), `akimijamil-eng/babellog` (`6bd6705`), and `akimijamil-eng/luckyjet-api` (`2d78fff`) were unchanged from the previous check. Searches for `PREDICTORV2BBSY` and `allpredictorv4bot` produced no matching indexed code.

## Evidence classification

- **Verified:** the above public resources and exact config values.
- **Inference only:** the update configuration may be consumed by a related AllPredictor mobile app; it does not establish which app component reads it or how any prediction is computed.
- **Not established:** original BABEL SEY/BBSY Lucky Jet V2 source code, live round-history feed, history window, model/formulas/weights, target selection, confidence calibration, wait/timing rules, or original Telegram WebApp URL.

No secrets were copied. No prediction code was reconstructed. No access controls were bypassed. Do not label this artifact as the original V2 engine.
