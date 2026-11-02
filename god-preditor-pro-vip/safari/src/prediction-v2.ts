/**
 * Isolated experimental fork. The arithmetic below is an unvalidated heuristic,
 * not a calibrated success probability or evidence of a predictive advantage.
 * No network, betting, storage, or application integrations are included.
 */

export const EVIDENCE_STATUS = "experimental-unvalidated" as const;
export const MIN_ROUNDS = 20;
export const MAX_FRESH_AGE_MS = 180_000;
export const POISSON_HORIZON_MS = 180_000;
const MIN = 60_000;
const MIN_HOLD_MS = MIN;
const MIN_TIMESTAMP = 946_684_800_000; // 2000-01-01: reject contemporary seconds/microseconds.
const MAX_TIMESTAMP = 8_640_000_000_000_000; // JavaScript Date's representable range.

export interface NormalizedRound {
  id: string;
  coefficient: number;
  timestamp: number;
}

export interface NormalizationDiagnostics {
  inputCount: number;
  acceptedCount: number;
  invalidCount: number;
  futureCount: number;
  estimatedCount: number;
  incompleteCount: number;
  duplicateCount: number;
  conflictingIdCount: number;
  conflictingRecordCount: number;
  freshestAgeMs: number | null;
  fresh: boolean;
  validInput: boolean;
}

export interface OpportunityCandidate {
  signal: "cycle" | "cluster";
  expectedAt: number;
  windowMs: number;
  estimatedCoef: number;
  heuristicScore: number;
  reason: string;
}

export interface BigOpportunity {
  expectedAt: number;
  /** Closure interval is [expectedAt, expectedAt + windowMs]. */
  windowMs: number;
  estimatedCoef: number;
  heuristicScore: number;
  generatedAt: number;
  expiresAt: number;
  evidenceStatus: typeof EVIDENCE_STATUS;
  reason: string;
}

export interface PoissonDiagnostic {
  model: "stationary-poisson-assumption";
  evidenceStatus: "assumption-only-not-calibrated";
  eventCount: number;
  observedSpanMs: number;
  lambdaPerMs: number;
  horizonMs: number;
  /** A conditional model calculation, never an empirically validated hit rate. */
  nextWindowProbabilityUnderStationaryModel: number;
}

export interface AdditionalDiagnostics {
  analyzedAt: number;
  candidateCount: number;
  cycleCandidate: OpportunityCandidate | null;
  clusterCandidate: OpportunityCandidate | null;
  overlap: { start: number; end: number } | null;
  decision: "insufficient-candidates" | "disjoint-windows" | "overlapping-heuristics";
  poisson: PoissonDiagnostic | null;
}

export interface ContinuityDiagnostics {
  gapThresholdMs: number;
  currentSegmentCount: number;
  discardedOlderSegmentRows: number;
  boundaryGapMs: number | null;
  status: "no-large-gap-observed" | "continuity-unknown-before-gap";
}

export interface Prediction {
  estimatedCoef: number;
  estimatedAt: number;
  windowMs: number;
  generatedAt: number;
  pattern: string;
  basis: string;
  /** An arbitrary legacy ranking score, not a percentage or calibrated probability. */
  heuristicScore: number;
  evidenceStatus: typeof EVIDENCE_STATUS;
  bigOpportunity: BigOpportunity | null;
  diagnostics: {
    analyzedAt: number;
    primaryHeld: boolean;
    additionalHeld: boolean;
    normalization: NormalizationDiagnostics;
    continuity: ContinuityDiagnostics;
    additional: AdditionalDiagnostics;
  };
}

type PrimaryPrediction = Omit<Prediction, "bigOpportunity" | "diagnostics">;
type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const validTimestamp = (value: unknown): value is number =>
  finite(value) && Number.isSafeInteger(value) && value >= MIN_TIMESTAMP && value <= MAX_TIMESTAMP;
const validNow = (value: unknown): value is number =>
  validTimestamp(value) && value <= MAX_TIMESTAMP - 30 * MIN;

function stableId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0 && value.trim() === value) return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  return null;
}

function normalizeWithDiagnostics(input: unknown, now: number): {
  rounds: NormalizedRound[];
  diagnostics: NormalizationDiagnostics;
} {
  const diagnostics: NormalizationDiagnostics = {
    inputCount: Array.isArray(input) ? input.length : 0,
    acceptedCount: 0, invalidCount: 0, futureCount: 0, estimatedCount: 0,
    incompleteCount: 0, duplicateCount: 0, conflictingIdCount: 0,
    conflictingRecordCount: 0, freshestAgeMs: null, fresh: false,
    validInput: Array.isArray(input) && validNow(now),
  };
  if (!diagnostics.validInput || !Array.isArray(input)) return { rounds: [], diagnostics };

  const groups = new Map<string, { round: NormalizedRound; count: number; conflict: boolean }>();
  for (const value of input) {
    if (!isRecord(value)) { diagnostics.invalidCount++; continue; }
    const id = stableId(value.id);
    if (id === null || !finite(value.coefficient) || value.coefficient < 1 ||
        !validTimestamp(value.timestamp) ||
        (value.estimated !== undefined && typeof value.estimated !== "boolean") ||
        (value.completed !== undefined && typeof value.completed !== "boolean")) {
      diagnostics.invalidCount++;
      continue;
    }
    if (value.estimated === true) { diagnostics.estimatedCount++; continue; }
    if (value.completed === false) { diagnostics.incompleteCount++; continue; }
    if (value.timestamp > now) { diagnostics.futureCount++; continue; }

    const round = { id, coefficient: value.coefficient, timestamp: value.timestamp };
    const existing = groups.get(id);
    if (existing) {
      existing.count++;
      existing.conflict ||= existing.round.coefficient !== round.coefficient ||
        existing.round.timestamp !== round.timestamp;
    } else groups.set(id, { round, count: 1, conflict: false });
  }

  const rounds: NormalizedRound[] = [];
  for (const group of groups.values()) {
    if (group.conflict) {
      diagnostics.conflictingIdCount++;
      diagnostics.conflictingRecordCount += group.count;
    } else {
      rounds.push(group.round);
      diagnostics.duplicateCount += group.count - 1;
    }
  }
  rounds.sort((a, b) => b.timestamp - a.timestamp || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  diagnostics.acceptedCount = rounds.length;
  diagnostics.freshestAgeMs = rounds.length ? now - rounds[0].timestamp : null;
  diagnostics.fresh = diagnostics.freshestAgeMs !== null && diagnostics.freshestAgeMs <= MAX_FRESH_AGE_MS;
  return { rounds, diagnostics };
}

/** Strict canonical newest-first rows. Never mutates the input or coerces numeric strings. */
export function normalizeRounds(rounds: unknown, now = Date.now()): NormalizedRound[] {
  return normalizeWithDiagnostics(rounds, now).rounds;
}

function newestContiguousSegment(rounds: NormalizedRound[]): {
  rounds: NormalizedRound[];
  diagnostics: ContinuityDiagnostics;
} {
  let boundary = rounds.length;
  let boundaryGapMs: number | null = null;
  for (let index = 1; index < rounds.length; index++) {
    const gap = rounds[index - 1].timestamp - rounds[index].timestamp;
    if (gap > MAX_FRESH_AGE_MS) { boundary = index; boundaryGapMs = gap; break; }
  }
  return {
    rounds: rounds.slice(0, boundary),
    diagnostics: {
      gapThresholdMs: MAX_FRESH_AGE_MS, currentSegmentCount: boundary,
      discardedOlderSegmentRows: rounds.length - boundary, boundaryGapMs,
      status: boundaryGapMs === null ? "no-large-gap-observed" : "continuity-unknown-before-gap",
    },
  };
}

// Stable arithmetic also keeps legitimate finite extreme inputs from overflowing sums/variance.
const mean = (xs: number[]): number => {
  let value = 0;
  for (let i = 0; i < xs.length; i++) value += (xs[i] - value) / (i + 1);
  return value;
};
const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : sorted[middle - 1] / 2 + sorted[middle] / 2;
};
const safeMax = (xs: number[]): number => {
  let maximum = 0;
  for (const value of xs) if (value > maximum) maximum = value;
  return maximum;
};
const stddev = (xs: number[]): number => {
  if (xs.length < 2) return 0;
  const average = mean(xs);
  const scale = safeMax(xs);
  return scale ? scale * Math.sqrt(mean(xs.map((x) => ((x - average) / scale) ** 2))) : 0;
};
const emaNewestFirst = (xs: number[], alpha: number): number => {
  if (!xs.length) return 0;
  let value = xs[xs.length - 1];
  for (let i = xs.length - 2; i >= 0; i--) value = alpha * xs[i] + (1 - alpha) * value;
  return value;
};
const geoMean = (xs: number[]): number => xs.length ? Math.exp(mean(xs.map((x) => Math.log(Math.max(x, 1.001))))) : 0;
const mad = (xs: number[]): number => {
  if (xs.length < 2) return 0;
  const center = median(xs);
  return median(xs.map((x) => Math.abs(x - center)));
};
const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));

interface Bucket { count: number; avg: number; max: number; }
function bucketBy(rounds: NormalizedRound[], keyOf: (round: NormalizedRound) => number): Map<number, Bucket> {
  const grouped = new Map<number, number[]>();
  for (const round of rounds) {
    const key = keyOf(round);
    const values = grouped.get(key) ?? [];
    values.push(round.coefficient);
    grouped.set(key, values);
  }
  return new Map([...grouped].map(([key, values]) => [key, { count: values.length, avg: geoMean(values), max: safeMax(values) }]));
}

function gapAnalysis(rounds: NormalizedRound[], threshold: number) {
  const hits = rounds.filter((round) => round.coefficient >= threshold).sort((a, b) => a.timestamp - b.timestamp);
  const gaps: number[] = [];
  for (let i = 1; i < hits.length; i++) gaps.push(hits[i].timestamp - hits[i - 1].timestamp);
  return {
    medGap: median(gaps), madGap: mad(gaps), last: hits.at(-1)?.timestamp ?? null,
    count: hits.length, allGapsPositive: gaps.length > 0 && gaps.every((gap) => gap > 0),
  };
}

/** Fixed-horizon conditional model calculation; elapsed waiting time is deliberately not an input. */
export function poissonWindowProbability(lambdaPerMs: number, horizonMs: number): number | null {
  if (!finite(lambdaPerMs) || lambdaPerMs < 0 || !finite(horizonMs) || horizonMs < 0) return null;
  return -Math.expm1(-lambdaPerMs * horizonMs);
}

function additionalFromNormalized(rounds: NormalizedRound[], now: number): {
  bigOpportunity: BigOpportunity | null;
  diagnostics: AdditionalDiagnostics;
} {
  const sorted = [...rounds].sort((a, b) => a.timestamp - b.timestamp);
  const mega = gapAnalysis(sorted, 100);
  let cycleCandidate: OpportunityCandidate | null = null;
  let clusterCandidate: OpportunityCandidate | null = null;

  if (mega.count >= 5 && mega.last !== null && mega.medGap > 0) {
    const expected = mega.last + mega.medGap;
    const drift = expected - now;
    const tolerance = clamp(mega.madGap * 1.4826 || mega.medGap * 0.35, 2 * MIN, 12 * MIN);
    const sinceLast = now - mega.last;
    // MAD=0 is allowed for genuinely positive regular gaps; zero-time duplicates are not cycles.
    const stable = mega.allGapsPositive && mega.madGap < mega.medGap * 0.5;
    if (stable && (Math.abs(drift) <= tolerance * 0.7 || sinceLast >= mega.medGap * 0.9)) {
      const driftScore = clamp(1 - Math.abs(drift) / Math.max(tolerance, 1), 0, 1);
      cycleCandidate = {
        signal: "cycle",
        expectedAt: Math.ceil(drift > 0 ? expected : now + Math.max(2 * MIN, tolerance * 0.4)),
        windowMs: Math.ceil(clamp(tolerance, 3 * MIN, 10 * MIN)), estimatedCoef: 100,
        heuristicScore: Math.round(clamp(55 + Math.min(10, mega.count) + driftScore * 12, 55, 82)),
        reason: `Cycle 100x≈${(mega.medGap / MIN).toFixed(1)}min — dernier il y a ${(sinceLast / MIN).toFixed(1)}min (${mega.count} évts)`,
      };
    }
  }

  const recent = sorted.slice(-80);
  const big20 = recent.filter((round) => round.coefficient >= 20).length;
  const big50 = recent.filter((round) => round.coefficient >= 50).length;
  if (big50 >= 3 && big20 >= 6) {
    clusterCandidate = {
      signal: "cluster", expectedAt: now + 3 * MIN, windowMs: 6 * MIN, estimatedCoef: 120,
      heuristicScore: Math.round(clamp(55 + big50 * 5 + big20, 55, 82)),
      reason: `Cluster : ${big20}×≥20x + ${big50}×≥50x sur ${recent.length} tours`,
    };
  }

  let poisson: PoissonDiagnostic | null = null;
  const span = sorted.length ? sorted[sorted.length - 1].timestamp - sorted[0].timestamp : 0;
  if (mega.count >= 4 && sorted.length >= 80 && span > 0) {
    const lambdaPerMs = mega.count / span;
    poisson = {
      model: "stationary-poisson-assumption", evidenceStatus: "assumption-only-not-calibrated",
      eventCount: mega.count, observedSpanMs: span, lambdaPerMs, horizonMs: POISSON_HORIZON_MS,
      nextWindowProbabilityUnderStationaryModel: poissonWindowProbability(lambdaPerMs, POISSON_HORIZON_MS)!,
    };
  }

  const diagnostics: AdditionalDiagnostics = {
    analyzedAt: now, candidateCount: Number(cycleCandidate !== null) + Number(clusterCandidate !== null),
    cycleCandidate, clusterCandidate, overlap: null, decision: "insufficient-candidates", poisson,
  };
  if (!cycleCandidate || !clusterCandidate) return { bigOpportunity: null, diagnostics };
  const start = Math.max(cycleCandidate.expectedAt, clusterCandidate.expectedAt);
  const end = Math.min(cycleCandidate.expectedAt + cycleCandidate.windowMs, clusterCandidate.expectedAt + clusterCandidate.windowMs);
  if (end <= start) {
    diagnostics.decision = "disjoint-windows";
    return { bigOpportunity: null, diagnostics };
  }
  diagnostics.overlap = { start, end };
  diagnostics.decision = "overlapping-heuristics";
  return {
    bigOpportunity: {
      expectedAt: start, windowMs: end - start, estimatedCoef: Math.min(cycleCandidate.estimatedCoef, clusterCandidate.estimatedCoef),
      heuristicScore: Math.min(cycleCandidate.heuristicScore, clusterCandidate.heuristicScore),
      generatedAt: now, expiresAt: end, evidenceStatus: EVIDENCE_STATUS,
      reason: `${cycleCandidate.reason} ; ${clusterCandidate.reason} — fenêtres communes ; indices corrélés non validés`,
    },
    diagnostics,
  };
}

/** Standalone fresh-history diagnostics; observations before unknown-continuity gaps are excluded. */
export function analyzeAdditionalOpportunity(rounds: unknown, now = Date.now()): {
  bigOpportunity: BigOpportunity | null;
  diagnostics: AdditionalDiagnostics;
} | null {
  if (!validNow(now)) return null;
  const normalized = normalizeWithDiagnostics(rounds, now);
  const segment = newestContiguousSegment(normalized.rounds);
  if (!normalized.diagnostics.fresh || segment.rounds.length < MIN_ROUNDS) return null;
  return additionalFromNormalized(segment.rounds, now);
}

function validPreviousOpportunity(previous: unknown, now: number): BigOpportunity | null {
  if (!isRecord(previous) || !isRecord(previous.bigOpportunity)) return null;
  const value = previous.bigOpportunity;
  if (value.evidenceStatus !== EVIDENCE_STATUS ||
      !finite(value.estimatedCoef) || value.estimatedCoef < 100 ||
      !finite(value.heuristicScore) || value.heuristicScore < 0 || value.heuristicScore > 100 ||
      !validTimestamp(value.generatedAt) || value.generatedAt > now ||
      !validTimestamp(value.expectedAt) || value.expectedAt < value.generatedAt + 3 * MIN ||
      !finite(value.windowMs) || !Number.isSafeInteger(value.windowMs) || value.windowMs <= 0 || value.windowMs > 6 * MIN ||
      !validTimestamp(value.expiresAt) || value.expiresAt !== value.expectedAt + value.windowMs ||
      value.expiresAt > value.generatedAt + 9 * MIN || now >= value.expiresAt ||
      typeof value.reason !== "string" || !value.reason.trim()) return null;
  return {
    expectedAt: value.expectedAt, windowMs: value.windowMs, estimatedCoef: value.estimatedCoef,
    heuristicScore: value.heuristicScore, generatedAt: value.generatedAt, expiresAt: value.expiresAt,
    evidenceStatus: EVIDENCE_STATUS, reason: value.reason,
  };
}

function validPrevious(previous: unknown, now: number): PrimaryPrediction | null {
  if (!isRecord(previous) || previous.evidenceStatus !== EVIDENCE_STATUS ||
      !finite(previous.estimatedCoef) || previous.estimatedCoef < 1 ||
      !finite(previous.heuristicScore) || previous.heuristicScore < 0 || previous.heuristicScore > 100 ||
      !validTimestamp(previous.generatedAt) || previous.generatedAt > now ||
      !validTimestamp(previous.estimatedAt) ||
      previous.estimatedAt < previous.generatedAt + 90_000 || previous.estimatedAt > previous.generatedAt + 3 * MIN ||
      !finite(previous.windowMs) || !Number.isSafeInteger(previous.windowMs) ||
      previous.windowMs < 90_000 || previous.windowMs > 3 * MIN ||
      typeof previous.pattern !== "string" || !previous.pattern.trim() ||
      typeof previous.basis !== "string" || !previous.basis.trim()) return null;
  // Reconstruct explicitly: never carry arbitrary legacy confidence/probability fields forward.
  return {
    estimatedCoef: previous.estimatedCoef, estimatedAt: previous.estimatedAt, windowMs: previous.windowMs,
    generatedAt: previous.generatedAt, pattern: previous.pattern, basis: previous.basis,
    heuristicScore: previous.heuristicScore, evidenceStatus: EVIDENCE_STATUS,
  };
}

function primaryFromNormalized(sorted: NormalizedRound[], now: number): PrimaryPrediction {
  const coefs = sorted.map((round) => round.coefficient);
  const medAll = median(coefs);
  const geoAll = geoMean(coefs);
  const last20 = coefs.slice(0, 20);
  const last50 = coefs.slice(0, 50);
  const avg50 = mean(last50);
  const ema20 = emaNewestFirst(last20, 0.25);
  const ema50 = emaNewestFirst(last50, 0.12);
  const sd50 = stddev(last50);
  const mad50 = mad(last50);
  const golden = gapAnalysis(sorted, 10);
  const sinceGolden = golden.last === null ? Infinity : now - golden.last;
  const hourBuckets = bucketBy(sorted, (round) => new Date(round.timestamp).getUTCHours());
  const minuteBuckets = bucketBy(sorted, (round) => new Date(round.timestamp).getUTCMinutes());
  const nowDate = new Date(now);
  const hb = hourBuckets.get(nowDate.getUTCHours());
  const mbNext = minuteBuckets.get((nowDate.getUTCMinutes() + 2) % 60);
  const lowStreak = coefs.slice(0, 15).length === 15 && coefs.slice(0, 15).every((coefficient) => coefficient < 2);
  const recentBig = sorted.slice(0, 30).filter((round) => round.coefficient >= 20);
  const finish = (value: Omit<PrimaryPrediction, "generatedAt" | "evidenceStatus">): PrimaryPrediction =>
    ({ ...value, generatedAt: now, evidenceStatus: EVIDENCE_STATUS });

  if (golden.medGap > 0 && golden.last !== null) {
    const drift = golden.last + golden.medGap - now;
    const tolerance = clamp(golden.madGap * 1.4826 || golden.medGap * 0.55, MIN, 4 * MIN);
    const stable = golden.count >= 8 && golden.allGapsPositive && golden.madGap < golden.medGap * 0.6;
    if (stable && Math.abs(drift) <= tolerance * 0.6) {
      const divisor = recentBig.length >= 3 ? 2 : recentBig.length >= 1 ? 3 : 4;
      const estimated = clamp(safeMax(sorted.slice(0, 80).map((round) => round.coefficient)) / divisor, 2, 20);
      const cycleScore = clamp(60 - (Math.abs(drift) / tolerance) * 15, 40, 62);
      const hourBoost = hb && hb.avg > geoAll ? 3 : 0;
      const sampleBoost = clamp(golden.count / 20, 0, 4);
      return finish({
        estimatedCoef: +estimated.toFixed(2), heuristicScore: Math.round(clamp(cycleScore + hourBoost + sampleBoost, 40, 68)),
        estimatedAt: Math.ceil(drift > 0 ? now + Math.max(drift, 90_000) : now + 2 * MIN),
        windowMs: Math.ceil(clamp(golden.medGap * 0.25, 90_000, 3 * MIN)),
        pattern: "Cycle des cotes d'or détecté",
        basis: `Cycle médian ${(golden.medGap / MIN).toFixed(1)} min — dernier ${(sinceGolden / MIN).toFixed(1)} min — MAD ${(golden.madGap / MIN).toFixed(2)}min`,
      });
    }
  }

  if (lowStreak) return finish({
    estimatedCoef: +clamp(geoAll * 2.5 + medAll, 2.5, 15).toFixed(2),
    heuristicScore: Math.round(clamp(70 + Math.min(15, (now - sorted[14].timestamp) / MIN), 65, 92)),
    estimatedAt: now + 90_000, windowMs: 2 * MIN,
    pattern: "Série basse — heuristique de rebond non validée",
    basis: `15 tours <2x — moy géo ${geoAll.toFixed(2)}x, médiane ${medAll.toFixed(2)}x`,
  });

  if (recentBig.length >= 3) {
    const averageBig = geoMean(recentBig.map((round) => round.coefficient));
    const divisor = recentBig.length >= 5 ? 3 : recentBig.length >= 4 ? 4 : 5;
    return finish({
      estimatedCoef: +clamp(averageBig / divisor, 2, 12).toFixed(2),
      heuristicScore: Math.min(78, 60 + recentBig.length * 3),
      estimatedAt: now + 2 * MIN, windowMs: 2.5 * MIN,
      pattern: `${recentBig.length} cotes ≥20x récentes`, basis: `Moy. géo grosses cotes ${averageBig.toFixed(2)}x ÷ ${divisor}`,
    });
  }

  const recent60 = sorted.slice(0, 60);
  const midZone = recent60.filter((round) => round.coefficient >= 5 && round.coefficient < 10);
  const smallShare60 = recent60.filter((round) => round.coefficient < 2).length / recent60.length;
  if (midZone.length >= 3) {
    const midGeo = geoMean(midZone.map((round) => round.coefficient));
    const cautious = smallShare60 > 0.55 || sd50 > avg50 * 1.4;
    const target = cautious ? clamp(midGeo * 0.45, 2, 4.5) : clamp(midGeo * 0.7, 3, 7);
    return finish({
      estimatedCoef: +target.toFixed(2), heuristicScore: Math.round(clamp(64 + midZone.length * 4 + (cautious ? -6 : 6), 58, 90)),
      estimatedAt: now + 2 * MIN, windowMs: 2.5 * MIN,
      pattern: cautious ? `Phase mixte — ${midZone.length} cotes 5x-9x sur base fragile` : `Heuristique — ${midZone.length} cotes 5x-9x récentes`,
      basis: `Zone 5x-9x géo ${midGeo.toFixed(2)}x — <2x: ${(smallShare60 * 100).toFixed(0)}% — σ50 ${sd50.toFixed(2)}`,
    });
  }

  const hourFactor = hb && hb.count >= 5 ? hb.avg / Math.max(geoAll, 0.1) : 1;
  const minuteFactor = mbNext && mbNext.count >= 5 ? mbNext.avg / Math.max(geoAll, 0.1) : 1;
  const blended = ema20 * 0.5 + ema50 * 0.3 + avg50 * 0.2;
  let estimated = clamp(blended * hourFactor * 0.6 + (mbNext?.max ?? 0) * 0.1 + 1.6, 1.8, 12);
  const fragile = smallShare60 > 0.6 || sd50 > avg50 * 1.6;
  if (fragile) estimated = Math.min(estimated, 3.2);
  else if (smallShare60 > 0.45) estimated = Math.min(estimated, 5);
  const sampleScore = clamp(sorted.length / 25, 0, 28);
  const biasScore = clamp(Math.abs(hourFactor - 1) * 42, 0, 22);
  const minuteScore = clamp(Math.abs(minuteFactor - 1) * 32, 0, 16);
  const stabilityBoost = mad50 > 0 && mad50 < avg50 * 0.6 ? 5 : 0;
  return finish({
    estimatedCoef: +estimated.toFixed(2),
    heuristicScore: Math.round(clamp(52 + sampleScore + biasScore + minuteScore + stabilityBoost + (fragile ? -8 : 0), 50, 92)),
    estimatedAt: Math.ceil((now + 120_000) / MIN) * MIN, windowMs: 2.5 * MIN,
    pattern: hourFactor > 1.1 ? "Plage horaire — moyenne supérieure" : hourFactor < 0.9 ? "Plage horaire — moyenne inférieure" : "Analyse multi-signaux",
    basis: `EMA20 ${ema20.toFixed(2)}x — H${nowDate.getUTCHours()}h UTC: géo ${hb?.avg.toFixed(2) ?? "—"}x (${hb?.count ?? 0}) — MAD ${mad50.toFixed(2)} — σ ${sd50.toFixed(2)} — ${sorted.length} tours`,
  });
}

/** Valid, fresh completed history is mandatory even while holding a previous primary estimate. */
export function generatePrediction(rounds: unknown, previous: unknown = null, now = Date.now()): Prediction | null {
  const normalized = normalizeWithDiagnostics(rounds, now);
  const segment = newestContiguousSegment(normalized.rounds);
  if (!normalized.diagnostics.fresh || segment.rounds.length < MIN_ROUNDS) return null;
  const additional = additionalFromNormalized(segment.rounds, now);
  const prior = validPrevious(previous, now);
  const priorAdditional = validPreviousOpportunity(previous, now);
  const primaryHeld = prior !== null && now < Math.max(prior.estimatedAt + prior.windowMs, prior.generatedAt + MIN_HOLD_MS);
  const primary = primaryHeld ? prior : primaryFromNormalized(segment.rounds, now);
  return {
    ...primary,
    // Publication holds independently; diagnostics above always analyze the current observation segment.
    bigOpportunity: priorAdditional ?? additional.bigOpportunity,
    diagnostics: {
      analyzedAt: now, primaryHeld, additionalHeld: priorAdditional !== null,
      normalization: normalized.diagnostics, continuity: segment.diagnostics, additional: additional.diagnostics,
    },
  };
}
