# BABEL V2 / Lucky Jet — public artifact delta (2026-08-24 00:12 Europe/Kyiv)

This delta records public-only, newly verified architecture artifacts. No credentials, API keys, passwords, session IDs, private repository content, or access-control bypass material is included.

## Confirmed: AllPredictor public hosting architecture is Cloudflare Pages + host routing

The publicly indexed AllPredictor dashboard documentation states that published subdomains are **100% Cloudflare Pages** and that each subdomain is attached to the same Pages project. It explicitly documents routing different content per subdomain using the request `Host` header inside `functions/_middleware.js`.

Public source:
- https://allpredictor.com/dashbord

Relevant public statements currently indexed on 2026-08-24:
- published sites are available on `slug.allpredictor.com` immediately after publication;
- uploaded HTML can be published as `nom.allpredictor.com`;
- generic `.py`/`.js` Workers can run continuously;
- Workers KV is a persistent key-value store for Workers/scripts;
- subdomains are described as `100% Cloudflare Pages`;
- the same project can serve different subdomain content through `request.headers.get('Host')` in `functions/_middleware.js`.

Why this matters for the BABEL / Lucky Jet lineage:

This materially narrows the public-client search surface. A Lucky Jet or BABEL web app hosted on an AllPredictor subdomain does not necessarily require a separate repository or origin per hostname; multiple public slugs/subdomains can be routed by one Cloudflare Pages project and middleware. Therefore historical/public asset recovery should prioritize:

1. archived `*.allpredictor.com` hostnames and slugs;
2. public copies/history of `functions/_middleware.js` or equivalent host-routing code;
3. static assets referenced by each hostname;
4. public Workers/KV references exposed in client code.

This finding does **not** reveal the original Lucky Jet prediction formula and does not prove that prediction values are generated in Cloudflare Pages or KV.

## Prediction endpoint check

The same publicly indexed dashboard documentation currently lists public API families for AI, sports, and key validation, but contains no indexed Lucky Jet-specific `/predict`, `/market`, `/coefficients`, or `/history` endpoint in the documented API reference.

This is consistent with the previously captured `/sites/luckyjet` traffic, where gameplay history came from the separate public `crash-gateway-grm-cr.100hp.app/history` endpoint and no separate prediction endpoint was observed during capture.
