# BABEL V2 public artifact delta — 2026-08-27 15:15 Europe/Kyiv

## New verified artifact

A current public Telemetr snapshot of `@babelsey225` exposes a complete 22-point Lucky Jet prediction grid spanning exactly `19:10:00` through `20:00:00`.

Public source:
- https://telemetr.io/ch/channels/1993921907-babelsey225

Observed sequence:

| Time | Target |
|---|---:|
| 19:10:00 | 2.00x |
| 19:12:15 | 2.17x |
| 19:14:42 | 2.05x |
| 19:16:58 | 2.28x |
| 19:19:11 | 2.12x |
| 19:21:36 | 2.21x |
| 19:24:08 | 2.03x |
| 19:26:47 | 2.30x |
| 19:29:13 | 2.14x |
| 19:31:50 | 2.08x |
| 19:34:27 | 2.25x |
| 19:36:49 | 2.10x |
| 19:39:05 | 2.19x |
| 19:41:38 | 2.06x |
| 19:44:01 | 2.23x |
| 19:46:24 | 2.01x |
| 19:48:57 | 2.27x |
| 19:51:20 | 2.13x |
| 19:53:46 | 2.09x |
| 19:56:18 | 2.29x |
| 19:58:44 | 2.16x |
| 20:00:00 | 2.04x |

## Confirmed facts

- The grid contains 22 scheduled signals in a 50-minute window.
- Targets are tightly bounded between 2.00x and 2.30x.
- Inter-signal spacing is irregular but concentrated around roughly 2–3 minutes.
- The published schedule includes seconds, not just minute-level windows.

## Inference only

The sequence is consistent with a precomputed timetable layer rather than a signal emitted only after observing the immediately preceding round. However, the public snapshot does not prove how the timetable is generated, whether it is deterministic, API-returned, heuristic, or manually prepared.

No original `predict/analyse/detection` implementation, history-window formula, weights, thresholds, or confirmed `/api/v1/luckyjet/*` code was found in this run.

## Safety

No credentials, tokens, passwords, session IDs, customer IDs, private repositories, authentication bypasses, hidden-directory probing, or non-public material were used or preserved.
