# BABEL V2 Public Artifacts Delta — 2026-08-27 18:11 Europe/Kyiv

## New verified public infrastructure artifact

Source: https://allpredictor.com/

The current public AllPredictor homepage explicitly documents a unified hosting stack containing:

- Telegram bots (Python/JavaScript)
- Generic Workers
- Workers KV (persistent key-value storage)
- Pages / hosted sites
- Automatic hosted site URLs in the form `name.allpredictor.com`
- Dashboard controls for logs, API keys, Workers KV and custom domains
- Publicly described site-security features such as password protection, masked links and source-code obfuscation

## Confirmed facts

1. AllPredictor publicly exposes Workers, Workers KV and Pages as first-class hosting products.
2. Each published site can receive an automatic `name.allpredictor.com` hostname.
3. Workers KV is described as persistent storage accessible by scripts/workers.
4. The dashboard is described as managing logs, API keys, Workers KV and custom domains.

## Relevance to BABEL / Lucky Jet V2 lineage

This expands the verified set of public infrastructure surfaces that may have hosted historical Lucky Jet/BABEL artifacts. In particular, archived public subdomains and old indexed pages may have referenced Pages or Workers KV-backed data.

## Inference (not confirmed)

No evidence was found in this run that BABEL Predictor V2 or the retired Lucky Jet predictor actually used Workers KV, Pages, or a specific worker. The infrastructure is verified; the Lucky Jet linkage remains unproven.

## Security / scope notes

No authenticated dashboard access was attempted. No hidden paths were enumerated. No credentials, API keys, tokens, passwords, session IDs, or private storage data were accessed or preserved.

## Negative result for core logic

No new verified original `PREDICTORV2BBSY`, `predict/analyse/detection` implementation, exact `/api/v1/luckyjet/predict`, `/api/v1/luckyjet/market`, `/coefficients`, or `/app/servers.js` implementation was found in this run.
