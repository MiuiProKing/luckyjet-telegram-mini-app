# BABEL V2 public artifacts delta — 2026-08-27 01:19 Europe/Kyiv

## New verified artifact

### Official AllPredictor auth route

Public URL:
- https://allpredictor.com/auth

Verified public page content:
- Page title/SEO context identifies this as AllPredictor login/registration access for predictions.
- Login form: email + password + remember-device option.
- Registration form: full name + email + password + password confirmation.
- Password-reset flow is public and states that the reset link expires after 15 minutes.
- Resend countdown shown as 60 seconds.

## Relevance to BABEL / Lucky Jet V2 lineage

**Confirmed:** AllPredictor exposes a separate public authentication/account layer in front of prediction access.

**Inference only:** This may be the account/entitlement layer referenced by BABEL activation instructions and later in-app confirmation flow. It does not by itself prove how Lucky Jet predictions are calculated, nor does it expose the original BABEL V2 predictor formula.

## Predictor-logic status

No new verified public source in this pass exposed:
- original `predict/analyse/detection` implementation,
- Lucky Jet history-window size,
- formula weights/thresholds,
- target selection logic,
- `/api/v1/luckyjet/predict`,
- `/api/v1/luckyjet/market`,
- `/coefficients`,
- `/app/servers.js`.

## Safety

No authentication was bypassed. No private routes, hidden directories, credentials, tokens, passwords, session identifiers, or access-controlled resources were accessed or preserved.
