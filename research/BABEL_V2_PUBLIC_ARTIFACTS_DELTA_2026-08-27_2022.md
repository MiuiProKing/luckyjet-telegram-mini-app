# BABEL V2 Public Artifacts Delta — 2026-08-27 20:22 Kyiv

## New verified public AllPredictor API surface

Official AllPredictor documentation currently exposes a new API v2 surface:

- Base URL: `https://allpredictor.com/api/v2`
- Sports list: `GET /api/v2/sports/{sport}`
- Match detail: `GET /api/v2/sports/{sport}/{id}`
- Supported public sport names shown in the docs: `football`, `basketball`
- Authentication contract: `X-API-Key`
- Docs state responses are cached server-side for tens of seconds and recommend not polling the same match more than once per minute.
- Error contract shown publicly: 401 missing/invalid API key, 404 unknown sport/match, 502 upstream provider unavailable, 503 service not configured.
- The example payload identifies `api-sports.io` as an upstream data provider for sports metadata.

Public source: https://allpredictor.com/doc
Current homepage notice: https://allpredictor.com/

## Relation to BABEL / Lucky Jet lineage

Confirmed: this is a genuine new public AllPredictor API generation (`/api/v2`) and therefore a new infrastructure/API artifact in the same AllPredictor ecosystem.

Not confirmed: no Lucky Jet route is documented under `/api/v2` in the current public docs. This does **not** prove that `/api/v2/luckyjet`, `/api/v2/luckyjet/predict`, or equivalent exists. No such route was probed or inferred as live.

No new verified original `PREDICTORV2BBSY` source, BABEL `predict/analyse/detection` implementation, or public `/api/v1/luckyjet/predict`, `/api/v1/luckyjet/market`, `/coefficients`, `/app/servers.js` implementation was found in this pass.

## Safety

No credentials, tokens, session IDs, passwords, private repositories, access-controlled content, or hidden endpoints were collected or tested.
