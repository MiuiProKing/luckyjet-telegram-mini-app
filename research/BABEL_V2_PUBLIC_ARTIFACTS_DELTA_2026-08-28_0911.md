# BABEL V2 public artifacts delta — 2026-08-28 09:11 Europe/Kyiv

## New verified finding: repeated 22-point Lucky Jet timetable shifted by exactly +2 hours

### Confirmed facts
A fresh public Telemetr snapshot for `@babelseypro235` / current archived BABEL-related channel shows the same 22-point Lucky Jet timetable sequence previously observed in a public BABEL archive, but every timestamp is shifted forward by exactly 2 hours while every published target multiplier remains identical.

Fresh sequence starts:
- 21:10:00 → 2.00x
- 21:12:15 → 2.17x
- 21:14:42 → 2.05x
- 21:16:58 → 2.28x
- 21:19:11 → 2.12x

…and ends:
- 21:53:46 → 2.09x
- 21:56:18 → 2.29x
- 21:58:44 → 2.16x
- 22:00:00 → 2.04x

The previously preserved sequence used the same target list and offsets from 19:10:00 through 20:00:00. Thus the new public snapshot is an exact +02:00:00 time translation of the earlier timetable, not merely a similar pattern.

Public source:
https://telemetr.io/uk/channels/1824595312-babelseypro235/posts

### Inference
This materially weakens the hypothesis that each timetable is freshly derived from live Lucky Jet round history. Exact reuse of all 22 target multipliers and second-level spacing with only a fixed clock shift is more consistent with a reusable/precomputed schedule template, manual reposting, or a deterministic timetable generator with a movable start time.

This does **not** prove how the original BABEL Predictor V2 generated GRAND/PETIT or other signals. It only applies to this public 22-point timetable format.

### Security / scope
Only publicly indexed material was inspected. No authentication bypass, hidden-directory probing, secret recovery, or protected content access was attempted. No credentials or session material were copied.
