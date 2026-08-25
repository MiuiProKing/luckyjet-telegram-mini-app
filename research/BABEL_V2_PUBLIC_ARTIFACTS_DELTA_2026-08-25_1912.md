# BABEL V2 Public Artifacts Delta — 2026-08-25 19:12 Kyiv

## New verified public infrastructure references

The current public AllPredictor homepage explicitly links three service subdomains:

- `https://dev.allpredictor.com/` — labeled as the developer/template-bot area.
- `https://status.allpredictor.com/` — labeled as the public service-status area.
- `https://changelog.allpredictor.com/` — labeled as the public changelog area.

At the time of verification, direct public fetches of all three roots returned HTTP 404. No authentication bypass, directory enumeration, exploit scan, or hidden-path probing was performed.

## Why this matters to the BABEL / Lucky Jet V2 lineage

These exact hostnames are useful passive infrastructure artifacts because they are linked by the live AllPredictor homepage itself. They narrow future public-only searches for archived snapshots, indexed historical pages, old static assets, and Wayback/search-engine traces around the period when LuckyJet predictor pages were still exposed.

## Confirmed vs inference

### Confirmed
- The live AllPredictor homepage publicly references `dev.allpredictor.com`, `status.allpredictor.com`, and `changelog.allpredictor.com`.
- All three root URLs returned 404 during this check.
- The homepage also still documents per-site hosting using `name.allpredictor.com` URLs.

### Inference
- These subdomains may have had public historical content or may be placeholders/routes for newer infrastructure. Their current 404 state does not prove prior content existed.
- No evidence was found in this run tying these hosts directly to the original BABEL Predictor V2 calculation logic or to a specific LuckyJet WebApp URL.

## Public sources

- https://allpredictor.com/
- https://dev.allpredictor.com/
- https://status.allpredictor.com/
- https://changelog.allpredictor.com/

## Safety / sanitization

No tokens, passwords, API keys, session identifiers, customer identifiers, private repository data, or non-public credentials are included in this manifest.
