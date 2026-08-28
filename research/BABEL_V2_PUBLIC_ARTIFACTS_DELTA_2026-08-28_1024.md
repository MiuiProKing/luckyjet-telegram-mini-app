# BABEL V2 public artifacts delta — 2026-08-28 10:24 Europe/Kyiv

## New verified artifact: manual validation fallback during connection failure

Public BABEL OFFICIEL archive snapshot:
- https://tlmtr.io/uk/channels/1963411992-babelseyy

The public snapshot shows this sequence in the BABEL OFFICIEL Lucky Jet flow:

1. `Grosse cote en cours…`
2. `GROSSE COTE LUCKY JET` with a published window `08:44 - 46` and target range `10X - 40X`.
3. A subsequent message says the author had a connection problem, could not play, and asks users who did play to say or send screenshots showing whether it was validated.

## Confirmed

- At least in this publicly archived incident, result confirmation had a **manual/community fallback** when the author could not observe the game because of a connection problem.
- Therefore not every historical BABEL Lucky Jet validation event can be assumed to have been produced by an always-online automatic verifier.
- This is compatible with later public BABEL statements that the confirmation problem with the bot was fixed and that confirmation moved into the application, but it does not prove the exact implementation.

## Inference only

- There may have been multiple result-validation paths over time: bot/app automatic verification under normal operation plus screenshot/manual confirmation during outages.
- This artifact does **not** reveal the upstream prediction formula, history-window size, weights, thresholds, target generation, or API endpoint.

## Security / scope

Only publicly indexed material was inspected. No authentication bypass, hidden-path enumeration, private content, credentials, session values, or protected assets were accessed or preserved.
