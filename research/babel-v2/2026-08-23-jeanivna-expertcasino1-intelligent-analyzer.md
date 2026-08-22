# New public Lucky Jet analysis artifact — JeanIvna/EXPERTCASINO1

Date checked: 2026-08-23

## Status
- Public GitHub source found: `JeanIvna/EXPERTCASINO1/intelligent_bot.py` at commit `8b3623a261628cfb4d4596864d65bf398f9ace72`.
- This is a **comparative Lucky Jet/casino analysis implementation**. No direct BABEL / AllPredictor / BBSY identifier was found in the repository search, so lineage with BABEL V2 is **not confirmed**.
- Credentials/tokens from the upstream file are intentionally **not copied** here.

## Verified analysis architecture
- `IntelligentAnalyzer.tours_history = deque(maxlen=15000)`.
- Every accepted unique round triggers `_adaptive_learning()`.
- Adaptive learning starts once at least 10 rounds exist and analyzes the most recent 50 coefficients.
- `_detect_cycles()` requires at least 20 coefficients and records repeating patterns of lengths 3 through 9.
- Learning weights change by history size:
  - `<100`: short/medium/long = `0.60 / 0.30 / 0.10`
  - `<1000`: `0.45 / 0.35 / 0.20`
  - `>=1000`: `0.30 / 0.35 / 0.35`

## Signal entry requirements / windows
### Standard
- Minimum history: 5 rounds.
- Uses up to the last 100 coefficients.
- Target range: `2.1X–8.0X`.
- Selects one of 15 deterministic context-selected analysis methods; if it fails, falls back to trend analysis.
- Then applies anti-repetition, computes assurance, and calculates optimal timing.

### Premium
- Minimum history: 10 rounds.
- Uses up to the last 150 coefficients.
- Requires at least 3 coefficients `>=10X`; otherwise broadens to `>=7X` and requires at least 5.
- Target range in advanced methods: `10X–70X`.
- Candidate methods include pattern detection, volatility analysis, frequency prediction, cluster analysis, plus several named mathematical/ML methods.
- Fallback: `_pattern_detection_premium()`.
- Then anti-repetition, premium assurance, and optimal timing.

### Montante
- Minimum history: 15 rounds.
- Uses all collected rounds.
- Target range is constrained to `1.2X–1.5X`.
- Main function: `_ultra_reliable_montante_analysis()`; fallback: `_statistical_fallback_montante()`.
- Reliability factor: `min(1.0, total_tours / 50.0)`.

## Determinism
The file explicitly replaces Python `random` with helper functions based on `hash(context)`. That makes selections pseudo-deterministic for a given process/context rather than truly random, but Python hash randomization can vary across process runs unless `PYTHONHASHSEED` is fixed.

## Relation to BABEL
No verified BABEL/AllPredictor identifiers were found in this repo. Treat this as a useful public comparison artifact, **not original BABEL V2 code**.

## Public source
https://github.com/JeanIvna/EXPERTCASINO1/blob/8b3623a261628cfb4d4596864d65bf398f9ace72/intelligent_bot.py
