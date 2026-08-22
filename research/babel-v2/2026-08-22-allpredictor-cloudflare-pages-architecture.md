# AllPredictor public Cloudflare Pages architecture artifact — 2026-08-22

Source: https://allpredictor.com/dashbord

## Confirmed public facts

The public dashboard HTML exposes the following implementation details for AllPredictor subdomains:

- Subdomains are described as **100% Cloudflare Pages**.
- DNS, SSL and hosting are managed automatically.
- Each subdomain is attached to the same Cloudflare Pages project.
- The dashboard explicitly says that different content per subdomain can be served by adding host-based routing logic using:
  `request.headers.get('Host')`
  inside:
  `functions/_middleware.js`
- Example subdomain input shown publicly: `workers.allpredictor.com`.
- The public dashboard also documents generic hosted Workers (`.py` / `.js`) and Workers KV.

## Relevance to BABEL / Lucky Jet lineage

This confirms a plausible public deployment architecture for historical AllPredictor-hosted WebApps:

`slug.allpredictor.com -> Cloudflare Pages -> functions/_middleware.js host routing -> shared project code`

This does **not** prove that BABEL V2 or LuckyJet prediction logic lived in that middleware, and no original LuckyJet analysis function was recovered from this artifact.

## Security handling

The dashboard contains placeholder/admin configuration guidance mentioning secret variable names. No credential values, tokens, account IDs, session IDs or private endpoints are preserved here.

## Status

- Infrastructure architecture: CONFIRMED PUBLIC ARTIFACT
- BABEL V2 source function: NOT FOUND
- LuckyJet trigger function: NOT FOUND
- Exact LuckyJet endpoint: NOT FOUND
