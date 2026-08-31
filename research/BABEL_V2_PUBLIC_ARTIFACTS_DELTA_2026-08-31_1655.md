# BABEL V2 public artifact delta — 2026-08-31 16:55 Europe/Kyiv

## Newly verified public artifact

Repository: `babelse/allpredictor-wa-manager`

A deleted-but-still-public Git history artifact was verified at commit:

`f4158aae0c3a38fc5161eab4263c71f2b2596819` — **Add files via upload** — 2026-03-23T12:21:21Z.

This root commit added exactly three files under `allpredictor-wa-manager-main/`:

- `Dockerfile`
- `package.json`
- `server.js`

The uploaded `server.js` is 439 lines and identifies itself internally as `server-whatsapp.js — AllPredictor WhatsApp Bot Manager (Baileys)`. The Dockerfile installs Python packages `requests`, `python-dotenv`, `schedule`, `aiohttp`, and `httpx` for user bots and creates `/app/wa_bots`.

The manager generates wrappers that execute uploaded Python user code with `spawn('python3', [USER_FILE])` or load JS user code. This confirms the original public upload was a bot-hosting/manager layer, not the LuckyJet prediction core.

A subsequent public commit `91ac1d34d8f6313bf68b6b12c5583931500e2134` deleted the whole `allpredictor-wa-manager-main` directory before files were re-uploaded at repository root.

## Original predictor status

No public `PREDICTORV2BBSY` implementation, LuckyJet history-to-target formula, history-window size, confidence weights, target-selection formula, or timing/wait calculation was present in this artifact.

Classification: **confirmed AllPredictor/BABEL infrastructure; not predictor logic**.

## Public source links

- https://github.com/babelse/allpredictor-wa-manager/commit/f4158aae0c3a38fc5161eab4263c71f2b2596819
- https://github.com/babelse/allpredictor-wa-manager/commit/91ac1d34d8f6313bf68b6b12c5583931500e2134

No credentials, tokens, session data, private endpoints, or personal contact data are preserved here.
