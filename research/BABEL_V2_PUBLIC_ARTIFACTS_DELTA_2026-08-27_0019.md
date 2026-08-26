# BABEL V2 Public Artifacts Delta — 2026-08-27 00:19 Kyiv

## New verified public artifact

Repository: `davisclby73-sketch/LUCKYJET-AND-MINES`

Source file: `src/utils/predictorEngine.ts`

Source commit: `6f0b4dd40beb2df283968454e3e82b94d10523f0`

Public links:
- https://github.com/davisclby73-sketch/LUCKYJET-AND-MINES/blob/6f0b4dd40beb2df283968454e3e82b94d10523f0/src/utils/predictorEngine.ts
- https://github.com/davisclby73-sketch/LUCKYJET-AND-MINES/commit/6f0b4dd40beb2df283968454e3e82b94d10523f0

## Confirmed Lucky Jet signal logic

`generateLuckyJetSignal(recentRounds)` uses the first 15 rounds from `recentRounds`.

Inputs/features:
- mean coefficient over up to 15 rounds;
- variance / standard deviation;
- consecutive leading rounds below `1.80x` (`lowStreak`);
- count of rounds at or above `5.0x` (`bigMultipliers`).

Decision branches:
1. `lowStreak >= 3` → recovery/compression mode; random target from `[5,6,7,8]`; reliability random `92–98%`.
2. `bigMultipliers >= 3` OR (`avg > 4.2` AND `stdDev > 3.0`) → ultra-bullish/high-volatility mode; random target `[6,7,8]`; reliability `88–94%`.
3. `avg > 2.8` → moderate/high-volatility mode; random target `[3,4,5,6]`; reliability `90–97%`.
4. otherwise → stable mode; random target `[2,3,4]`; reliability `92–98%`.

Safe target:
- random factor `0.42–0.58 × targetOdds`;
- lower clamp around `1.35–1.75x`;
- forced below main target.

Timing:
- random future offset `75–210 seconds`;
- exact HH:MM:SS is emitted as estimated round time.

Classification:
- Hybrid heuristic + random output.
- Market classification uses real history-derived statistics.
- Final target, reliability, safe multiplier, and exact timing include randomness.
- Therefore it is not deterministic and is not an API-returned prediction in the visible code path.

## Related commit

Commit `6f0b4dd...` also changes Mines timing to a fixed `+2 minutes` future slot and extends its 5-minute validity from that future target time. This specific change does not alter the Lucky Jet function above.

## Lineage assessment

Confirmed: this is a public Lucky Jet predictor implementation with explicit 15-round history analysis and threshold-based market states.

Not confirmed: any authorship, code reuse, or direct relationship to the original BABEL Predictor V2, PREDICTORV2BBSY, AllPredictor, `@allpredictorv4bot`, or BABEL SEY.

Treat as a reference/control artifact until independent lineage evidence is found.

No credentials, tokens, passwords, session IDs, customer IDs, or other secrets are preserved in this manifest.
