# BABEL / Lucky Jet V2 public artifact delta — 2026-08-24 15:31 Europe/Kyiv

## New verified public artifact

Repository: `gamehubciv/GAMEHUB`

Files:
- `luckyjet-predictor.html`
- `luckyjet-predictor.js`
- `luckyjet-predictor-firebase.js`
- `luckyjet-predictor.css`

Public HTML URL:
https://github.com/gamehubciv/GAMEHUB/blob/main/luckyjet-predictor.html

### Confirmed structure

`luckyjet-predictor.html` is a standalone Lucky Jet Pro predictor shell. It loads:
- `luckyjet-predictor.css`
- `luckyjet-predictor-firebase.js` as an ES module
- `luckyjet-predictor.js` as the application/prediction script

The page contains distinct UI surfaces for:
- automatic coefficient retrieval (`Récupération Automatique`)
- predictor results
- global prediction statistics
- intelligent analysis (`Analyse Intelligence`)
- prediction history
- advanced settings

This is useful because it cleanly separates the predictor logic from license/auth code rather than embedding everything inline.

### Firebase/license layer — sanitized

`luckyjet-predictor-firebase.js` uses Firebase Auth + Firestore and checks a user-scoped collection path of the form:
`users/{uid}/purchases`

It filters purchases by `gameId == "luckyjet"`, requires an active non-expired license, and re-checks license state every 30 seconds. Predictor controls are disabled when no valid license exists.

Firebase configuration values, identifiers, API keys, user/session values and other credential-like strings are intentionally omitted from this manifest.

### Classification

Confirmed public related Lucky Jet predictor artifact.

Not confirmed as original proprietary BABEL Predictor V2 / AllPredictor source. The exact lineage remains unproven.

## Public Git history note

A public commit series for `luckyjet-predictor.html` on 2026-01-30/31 shows endpoint migration between Lucky Jet gateway hosts. Credential-like/session values were present in public history; they are intentionally not reproduced here.

Public commit example (sanitized context only):
https://github.com/gamehubciv/GAMEHUB/commit/f4e2be03e42a7741efe20c13528dee3c11019a1f

The useful verified change was the API host migration from the older Lucky Jet-specific gateway to the crash gateway. No secrets are preserved here.
