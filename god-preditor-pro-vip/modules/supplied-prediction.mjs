// ../modules/public-forecast.mjs
var ARCHIVE_PROFILE = Object.freeze({ low: 2, cycle: 10, cluster: 20, confirmation: 50, midMin: 5, midMax: 10, opportunity: 100 });
function m(s, i = 300, e = 1 / 0) {
  const n = /* @__PURE__ */ new Set();
  return [...s].sort((t, a) => a.timestamp - t.timestamp).filter(
    (t) => !Number.isFinite(t.coefficient) || t.coefficient < 1 || !Number.isFinite(t.timestamp) || t.timestamp <= 0 || t.timestamp > e || t.id && n.has(t.id) ? false : (t.id && n.add(t.id), true)
  ).slice(0, i);
}
function f(s, i = Date.now()) {
  const e = s[0]?.timestamp;
  return e !== void 0 && e <= i + 3e4 && i - e <= 18e4;
}

// ../modules/supplied/analysis-data.ts
var orderedAnalysisRounds = m;
var analysisIsFresh = f;

// ../modules/supplied/prediction.ts
var MIN = 6e4;
var MIN_HOLD_MS = 6e4;
var mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
var median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m2 = Math.floor(s.length / 2);
  return s.length % 2 ? s[m2] : (s[m2 - 1] + s[m2]) / 2;
};
var stddev = (xs) => {
  if (xs.length < 2) return 0;
  const m2 = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m2) ** 2)));
};
var emaNewestFirst = (xs, alpha) => {
  if (!xs.length) return 0;
  let v = xs[xs.length - 1];
  for (let i = xs.length - 2; i >= 0; i--) v = alpha * xs[i] + (1 - alpha) * v;
  return v;
};
var geoMean = (xs) => {
  if (!xs.length) return 0;
  const logs = xs.map((x) => Math.log(Math.max(x, 1.001)));
  return Math.exp(mean(logs));
};
var safeMax = (xs) => {
  let m2 = -Infinity;
  for (const x of xs) if (x > m2) m2 = x;
  return m2 === -Infinity ? 0 : m2;
};
var mad = (xs) => {
  if (xs.length < 2) return 0;
  const m2 = median(xs);
  return median(xs.map((x) => Math.abs(x - m2)));
};
var clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
function bucketBy(rounds, keyOf) {
  const tmp = /* @__PURE__ */ new Map();
  for (const r of rounds) {
    const k = keyOf(r);
    const b = tmp.get(k) ?? { coefs: [], g: 0, mg: 0 };
    b.coefs.push(r.coefficient);
    if (r.coefficient >= 10) b.g++;
    if (r.coefficient >= 100) b.mg++;
    tmp.set(k, b);
  }
  const out = /* @__PURE__ */ new Map();
  for (const [k, b] of tmp) {
    out.set(k, {
      count: b.coefs.length,
      goldenCount: b.g,
      megaCount: b.mg,
      avg: geoMean(b.coefs),
      max: safeMax(b.coefs)
    });
  }
  return out;
}
function gapAnalysis(rounds, threshold) {
  const hits = rounds.filter((r) => r.coefficient >= threshold).sort((a, b) => a.timestamp - b.timestamp);
  if (hits.length < 2) {
    return { avgGap: 0, medGap: 0, stdGap: 0, madGap: 0, last: hits[0]?.timestamp ?? null, count: hits.length };
  }
  const gaps = [];
  for (let i = 1; i < hits.length; i++) gaps.push(hits[i].timestamp - hits[i - 1].timestamp);
  return {
    avgGap: mean(gaps),
    medGap: median(gaps),
    stdGap: stddev(gaps),
    madGap: mad(gaps),
    last: hits[hits.length - 1].timestamp,
    count: hits.length
  };
}
function detectBigOpportunity(rounds, now) {
  const sorted = [...rounds].sort((a, b) => a.timestamp - b.timestamp);
  const candidates = [];
  const mega = gapAnalysis(sorted, 100);
  if (mega.count >= 5 && mega.last && mega.medGap > 0) {
    const expected = mega.last + mega.medGap;
    const drift = expected - now;
    const tol = clamp(mega.madGap * 1.4826 || mega.medGap * 0.35, 2 * MIN, 12 * MIN);
    const sinceLast = now - mega.last;
    const stable = mega.madGap > 0 && mega.madGap < mega.medGap * 0.5;
    if (stable && (Math.abs(drift) <= tol * 0.7 || sinceLast >= mega.medGap * 0.9)) {
      const driftScore = clamp(1 - Math.abs(drift) / Math.max(tol, 1), 0, 1);
      const sampleBoost = Math.min(10, mega.count);
      const conf = clamp(55 + sampleBoost + driftScore * 12, 55, 82);
      candidates.push({
        expectedAt: drift > 0 ? expected : now + Math.max(2 * MIN, tol * 0.4),
        windowMs: clamp(tol, 3 * MIN, 10 * MIN),
        estimatedCoef: 100,
        confidence: Math.round(conf),
        reason: `Cycle 100x≈${(mega.medGap / MIN).toFixed(1)}min — dernier il y a ${(sinceLast / MIN).toFixed(1)}min (${mega.count} évts)`
      });
    }
  }
  const recent = sorted.slice(-80);
  let big20 = 0, big50 = 0;
  for (const r of recent) {
    if (r.coefficient >= 20) big20++;
    if (r.coefficient >= 50) big50++;
  }
  if (big50 >= 3 && big20 >= 6) {
    const conf = clamp(55 + big50 * 5 + big20, 55, 82);
    candidates.push({
      expectedAt: now + 3 * MIN,
      windowMs: 6 * MIN,
      estimatedCoef: 120,
      confidence: Math.round(conf),
      reason: `Cluster chaud : ${big20}×≥20x + ${big50}×≥50x sur 80 tours`
    });
  }
  const allMega = sorted.filter((r) => r.coefficient >= 100);
  if (allMega.length >= 4 && mega.last && sorted.length >= 80) {
    const sinceLast = now - mega.last;
    const span = sorted[sorted.length - 1].timestamp - sorted[0].timestamp;
    const lambda = span > 0 ? allMega.length / span : 0;
    if (lambda > 0) {
      const overdueProb = 1 - Math.exp(-lambda * sinceLast);
      if (overdueProb >= 0.75) {
        const eta = clamp(1 / lambda, 9e4, 8 * MIN);
        const conf = clamp(50 + overdueProb * 30, 50, 80);
        candidates.push({
          expectedAt: now + eta,
          windowMs: clamp(eta * 0.8, 3 * MIN, 7 * MIN),
          estimatedCoef: 100,
          confidence: Math.round(conf),
          reason: `Hazard Poisson : P(retard)=${(overdueProb * 100).toFixed(0)}% (λ⁻¹≈${(1 / lambda / MIN).toFixed(1)}min)`
        });
      }
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.confidence - a.confidence);
  const top = candidates[0];
  if (candidates.length < 2 && top.confidence < 75) return null;
  if (candidates.length >= 2) {
    top.confidence = Math.min(92, top.confidence + 5);
  }
  return top;
}
function generatePrediction(rounds, previous, now = Date.now()) {
  rounds = orderedAnalysisRounds(rounds, rounds.length, now);
  if (!analysisIsFresh(rounds, now)) return null;
  if (rounds.length < 20) return null;
  if (previous) {
    const holdUntil = Math.max(
      previous.estimatedAt + previous.windowMs,
      previous.generatedAt + MIN_HOLD_MS
    );
    if (now < holdUntil) {
      return previous;
    }
  }
  const sorted = [...rounds].sort((a, b) => b.timestamp - a.timestamp);
  const coefs = sorted.map((r) => r.coefficient);
  const avgAll = mean(coefs);
  const medAll = median(coefs);
  const geoAll = geoMean(coefs);
  const last20 = coefs.slice(0, 20);
  const last50 = coefs.slice(0, 50);
  const avg20 = mean(last20);
  const avg50 = mean(last50);
  const ema20 = emaNewestFirst(last20, 0.25);
  const ema50 = emaNewestFirst(last50, 0.12);
  const sd50 = stddev(last50);
  const mad50 = mad(last50);
  const goldenC = gapAnalysis(sorted, 10);
  const sinceGolden = goldenC.last ? now - goldenC.last : Infinity;
  const hourBuckets = bucketBy(sorted, (r) => new Date(r.timestamp).getUTCHours());
  const minuteBuckets = bucketBy(sorted, (r) => new Date(r.timestamp).getUTCMinutes());
  const nowDate = new Date(now);
  const hb = hourBuckets.get(nowDate.getUTCHours());
  const nextMinute = (nowDate.getUTCMinutes() + 2) % 60;
  const mbNext = minuteBuckets.get(nextMinute);
  const last15 = coefs.slice(0, 15);
  const lowStreak = last15.length === 15 && last15.every((c) => c < 2);
  const recentBig = sorted.slice(0, 30).filter((r) => r.coefficient >= 20);
  const bigOpportunity = detectBigOpportunity(rounds, now);
  if (goldenC.medGap > 0 && goldenC.last) {
    const expected = goldenC.last + goldenC.medGap;
    const drift = expected - now;
    const tol = clamp(goldenC.madGap * 1.4826 || goldenC.medGap * 0.55, 6e4, 4 * MIN);
    const cycleStable = goldenC.count >= 8 && goldenC.madGap > 0 && goldenC.madGap < goldenC.medGap * 0.6;
    const tightDrift = Math.abs(drift) <= tol * 0.6;
    if (cycleStable && tightDrift) {
      const bigDensity = recentBig.length;
      const divisor = bigDensity >= 3 ? 2 : bigDensity >= 1 ? 3 : 4;
      const baseGolden = safeMax(sorted.slice(0, 80).map((r) => r.coefficient));
      const estimated2 = clamp(baseGolden / divisor, 2, 20);
      const cycleScore = clamp(60 - Math.abs(drift) / tol * 15, 40, 62);
      const hourBoost = hb && hb.avg > geoAll ? 3 : 0;
      const sampleBoost = clamp(goldenC.count / 20, 0, 4);
      const reliability2 = Math.round(clamp(cycleScore + hourBoost + sampleBoost, 40, 68));
      return {
        estimatedCoef: +estimated2.toFixed(2),
        confidence: reliability2 >= 66 ? "Moyen" : "Faible",
        reliability: reliability2,
        estimatedAt: drift > 0 ? now + Math.max(drift, 9e4) : now + 2 * MIN,
        windowMs: clamp(goldenC.medGap * 0.25, 9e4, 3 * MIN),
        pattern: "Cycle des cotes d'or détecté",
        basis: `Cycle médian ${(goldenC.medGap / MIN).toFixed(1)} min — dernier ${(sinceGolden / MIN).toFixed(1)} min — MAD ${(goldenC.madGap / MIN).toFixed(2)}min`,
        generatedAt: now,
        bigOpportunity
      };
    }
  }
  if (lowStreak) {
    const estimated2 = clamp(geoAll * 2.5 + medAll, 2.5, 15);
    const reliability2 = Math.round(clamp(70 + Math.min(15, (now - sorted[14].timestamp) / 6e4), 65, 92));
    return {
      estimatedCoef: +estimated2.toFixed(2),
      confidence: reliability2 >= 82 ? "Élevé" : "Moyen",
      reliability: reliability2,
      estimatedAt: now + 9e4,
      windowMs: 2 * MIN,
      pattern: "Série basse — rebond statistique",
      basis: `15 tours <2x — moy géo ${geoAll.toFixed(2)}x, médiane ${medAll.toFixed(2)}x`,
      generatedAt: now,
      bigOpportunity
    };
  }
  if (recentBig.length >= 3) {
    const avgBig = geoMean(recentBig.map((r) => r.coefficient));
    const divisor = recentBig.length >= 5 ? 3 : recentBig.length >= 4 ? 4 : 5;
    const estimated2 = clamp(avgBig / divisor, 2, 12);
    const reliability2 = Math.min(78, 60 + recentBig.length * 3);
    return {
      estimatedCoef: +estimated2.toFixed(2),
      confidence: reliability2 >= 72 ? "Élevé" : "Moyen",
      reliability: reliability2,
      estimatedAt: now + 2 * MIN,
      windowMs: 2.5 * MIN,
      pattern: `${recentBig.length} cotes ≥20x récentes`,
      basis: `Moy. géo grosses cotes ${avgBig.toFixed(2)}x ÷ ${divisor}`,
      generatedAt: now,
      bigOpportunity
    };
  }
  const recent60 = sorted.slice(0, 60);
  const midZone = recent60.filter((r) => r.coefficient >= 5 && r.coefficient < 10);
  const smallShare60 = recent60.length ? recent60.filter((r) => r.coefficient < 2).length / recent60.length : 0;
  if (midZone.length >= 3) {
    const midGeo = geoMean(midZone.map((r) => r.coefficient));
    const cautious = smallShare60 > 0.55 || sd50 > avg50 * 1.4;
    const target = cautious ? clamp(midGeo * 0.45, 2, 4.5) : clamp(midGeo * 0.7, 3, 7);
    const reliability2 = Math.round(
      clamp(64 + midZone.length * 4 + (cautious ? -6 : 6), 58, 90)
    );
    return {
      estimatedCoef: +target.toFixed(2),
      confidence: reliability2 >= 82 ? "Élevé" : reliability2 >= 68 ? "Moyen" : "Faible",
      reliability: reliability2,
      estimatedAt: now + 2 * MIN,
      windowMs: 2.5 * MIN,
      pattern: cautious ? `Phase mixte — ${midZone.length} cotes 5x-9x sur base fragile` : `Phase favorable — ${midZone.length} cotes 5x-9x récentes`,
      basis: `Zone 5x-9x géo ${midGeo.toFixed(2)}x — <2x: ${(smallShare60 * 100).toFixed(0)}% — σ50 ${sd50.toFixed(2)}`,
      generatedAt: now,
      bigOpportunity
    };
  }
  const hourFactor = hb && hb.count >= 5 ? hb.avg / Math.max(geoAll, 0.1) : 1;
  const minuteFactor = mbNext && mbNext.count >= 5 ? mbNext.avg / Math.max(geoAll, 0.1) : 1;
  const blended = ema20 * 0.5 + ema50 * 0.3 + avg50 * 0.2;
  let estimated = clamp(blended * hourFactor * 0.6 + (mbNext?.max ?? 0) * 0.1 + 1.6, 1.8, 12);
  const fragile = smallShare60 > 0.6 || sd50 > avg50 * 1.6;
  if (fragile) estimated = Math.min(estimated, 3.2);
  else if (smallShare60 > 0.45) estimated = Math.min(estimated, 5);
  const sampleScore = clamp(rounds.length / 25, 0, 28);
  const biasScore = clamp(Math.abs(hourFactor - 1) * 42, 0, 22);
  const minuteScore = clamp(Math.abs(minuteFactor - 1) * 32, 0, 16);
  const stabilityBoost = mad50 > 0 && mad50 < avg50 * 0.6 ? 5 : 0;
  const fragilePenalty = fragile ? -8 : 0;
  const reliability = Math.round(clamp(52 + sampleScore + biasScore + minuteScore + stabilityBoost + fragilePenalty, 50, 92));
  const etaOffset = 2 * MIN + (60 - nowDate.getUTCSeconds()) * 1e3 % 45e3;
  return {
    estimatedCoef: +estimated.toFixed(2),
    confidence: reliability >= 82 ? "Élevé" : reliability >= 66 ? "Moyen" : "Faible",
    reliability,
    estimatedAt: now + etaOffset,
    windowMs: 2.5 * MIN,
    pattern: hourFactor > 1.1 ? "Plage horaire favorable" : hourFactor < 0.9 ? "Plage horaire faible" : "Analyse multi-signaux",
    basis: `EMA20 ${ema20.toFixed(2)}x — H${nowDate.getUTCHours()}h UTC: géo ${hb?.avg.toFixed(2) ?? "—"}x (${hb?.count ?? 0}) — MAD ${mad50.toFixed(2)} — σ ${sd50.toFixed(2)} — ${rounds.length} tours`,
    generatedAt: now,
    bigOpportunity
  };
}
function formatHM(ts) {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}h${d.getMinutes().toString().padStart(2, "0")}`;
}
export {
  formatHM,
  generatePrediction
};
