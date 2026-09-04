# BABEL V2 public artifact delta — 2026-09-04 03:04 Europe/Kyiv

## New verified artifact

Public repository: `akimijamil-eng/AllPredictor-sites-manager`

Direct links:
- https://github.com/akimijamil-eng/AllPredictor-sites-manager
- https://github.com/akimijamil-eng/AllPredictor-sites-manager/blob/main/server.js
- https://github.com/akimijamil-eng/AllPredictor-sites-manager/commit/19dacc0a4132c03812ab0af4e89ea317fef4d641
- https://github.com/akimijamil-eng/AllPredictor-sites-manager/commit/5eb446c85885f57bc66cd510581aba2fdf858f54
- https://github.com/akimijamil-eng/AllPredictor-sites-manager/commit/5fe670bbbcc59a325b9288727b3ea564512f5b3d

### Confirmed

The repository publicly exposes the AllPredictor Sites Manager implementation used to serve user-deployed sites from `slug.allpredictor.com`.

Current `server.js` confirms:
- static site root: local `sites/<slug>` directories;
- uploaded HTML/CSS/JS/JSON and source-map files are served directly when present;
- SPA fallback serves root `index.html` when a requested route does not match a file;
- deployment metadata stores the public URL as `https://<slug>.allpredictor.com`;
- hidden dotfiles are explicitly blocked;
- directory traversal is explicitly blocked;
- ShieldWall support is integrated for protected subdomains;
- public code references the ShieldWall validation service `https://shield-net-core.base44.app/api/functions/validateRequest`;
- ShieldWall payload contains site_id, IP, user agent, path, method, optional API key, optional bearer token, query string, and request body.

The public commit history shows:
- `19dacc0a4132c03812ab0af4e89ea317fef4d641` — original `server.js` creation on 2026-03-24;
- `5eb446c85885f57bc66cd510581aba2fdf858f54` — ShieldWall integration added on 2026-04-02;
- `5fe670bbbcc59a325b9288727b3ea564512f5b3d` — ShieldWall validation refactored to `fetch` on 2026-04-02;
- `93b45b763e4a5b9490cc9190840977c0de427caf` — SPA fallback/security enhancements;
- `8e135214062e4d65fa88f350646214ab40a1f36c` — latest formatting/cleanup commit in the public history inspected.

### Relevance to BABEL / Lucky Jet V2

This is a direct AllPredictor deployment-infrastructure artifact and gives a verified explanation for how exact WebApp slugs can expose original HTML/JS assets when a site is public. It also explains why some historical LuckyJet WebApps may have been served from arbitrary `*.allpredictor.com` subdomains and why protected ones route through ShieldWall.

### Not found in this artifact

No original `PREDICTORV2BBSY` predictor core was found here. There is no verified LuckyJet `history -> confidence -> target -> timing` formula, no confirmed history-window size, no target-selection weights, and no original `/api/v1/luckyjet/predict` implementation in this repository.

### Safety

No authentication was bypassed. No hidden files, protected site contents, tokens, API keys, session secrets, or private storage were accessed or copied. This manifest records only publicly visible repository code and public commit history.
