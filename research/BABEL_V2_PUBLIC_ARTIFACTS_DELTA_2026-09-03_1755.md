# BABEL V2 public artifacts delta — 2026-09-03 17:55 Europe/Kyiv

## Confirmed new public artifact

A public APKPure archive exposes the official Android package lineage for **Allpredictor / Babel sey**:

- Package: `com.allpredictorfree.app`
- Latest archived public build: `4.4.23` (version code 43), dated 2026-07-03
- Format: XAPK
- Publisher shown by archive: `Babel sey`
- Signing fingerprint shown by archive: `d97ed2f57d73243e13316a909af0cfa0191e7906`
- armeabi-v7a archive SHA-256: `2b1f169f2952a8431592f162a264a57eca847a4a6d26affb5baba2a04b5e1298`
- armeabi-v7a archive SHA-1: `e20b571c397ee784e16c9694088e1a942eae2cfc`
- arm64-v8a archive SHA-1: `414e1343a3c7de3e2a7da53acf4e11a72a444173`

The same public archive exposes older builds useful for historical comparison:

- `4.3.19` — 2026-05-27 — 54.3 MB
- `4.3.20` — 2026-05-30 — 54.4 MB
- `4.3.21` — 2026-06-24 — 55.6 MB
- `4.4.23` — 2026-07-03 — 58.2 MB (armeabi-v7a) / 60.0 MB (arm64-v8a)

Public archive URL:
https://apkpure.net/allpredictor/com.allpredictorfree.app/download

Google Play package URL:
https://play.google.com/store/apps/details?id=com.allpredictorfree.app

## Why this matters

This provides a verifiable binary lineage tied directly to Babel sey/AllPredictor and creates a clean target set for differential inspection of public client assets across versions, especially around the period where release notes mention prediction-system improvements.

## What is NOT yet confirmed

No original LuckyJet `history -> target/confidence/timing` implementation was extracted in this pass. No proprietary BABEL V2 formula, history-window size, weight set, threshold set, or original `/api/v1/luckyjet/predict` client implementation is claimed here.

## Safety

No credentials, tokens, session material, or private access data are stored in this manifest. Only public package metadata and public cryptographic hashes are recorded.