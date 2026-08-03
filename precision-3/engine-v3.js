(function (root, factory) {
  'use strict';

  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LuckyJetMathV3 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TARGET = 10;
  const MAX_ATTEMPTS = 3;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const MIN_MODEL_ROWS = 180;
  const MAX_STORED_ROWS = 12000;
  const MAX_BACKTEST_ROWS = 2500;

  const RULES = [
    {name: 'low_cluster', label: 'НИЗКИЙ КЛАСТЕР'},
    {name: 'deep_compression', label: 'СЖАТИЕ 5 РАУНДОВ'},
    {name: 'rebound_volatility', label: 'ОТКАТ ПОСЛЕ ВОЛАТИЛЬНОСТИ'},
    {name: 'long_dry', label: 'ДЛИННАЯ СЕРИЯ БЕЗ 10X'}
  ];

  function finiteNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseTime(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value < 100000000000 ? value * 1000 : value;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizeRows(items) {
    if (!Array.isArray(items)) return [];
    return items.map(function (item) {
      if (!item || typeof item !== 'object') return null;
      const coefficient = finiteNumber(
        item.topCoefficient !== undefined ? item.topCoefficient :
          item.coef !== undefined ? item.coef :
            item.coefficient !== undefined ? item.coefficient : item.value
      );
      const rawId = item.id || item.roundId || item.round_id || item.hash;
      if (!rawId || coefficient === null || coefficient < 1) return null;
      const sourceTime = parseTime(
        item.sourceTime || item.startTime || item.createdAt || item.created_at ||
        item.timestamp || item.time || item.date
      );
      return {
        id: String(rawId),
        coefficient: coefficient,
        sourceTime: sourceTime
      };
    }).filter(Boolean);
  }

  function cleanStoredRow(row, fallbackSequence) {
    if (!row || !row.id) return null;
    const coefficient = finiteNumber(row.coefficient);
    const observedAt = finiteNumber(row.observedAt);
    if (coefficient === null || coefficient < 1 || observedAt === null) return null;
    return {
      id: String(row.id),
      coefficient: coefficient,
      observedAt: observedAt,
      sourceTime: parseTime(row.sourceTime),
      sequence: finiteNumber(row.sequence) === null ? fallbackSequence : Number(row.sequence)
    };
  }

  function mergeDayHistory(existing, recentNewestFirst, now) {
    const currentTime = finiteNumber(now) === null ? Date.now() : Number(now);
    const cutoff = currentTime - DAY_MS;
    const map = new Map();
    let maxSequence = 0;

    (Array.isArray(existing) ? existing : []).forEach(function (row, index) {
      const clean = cleanStoredRow(row, index + 1);
      if (!clean) return;
      const rowTime = clean.sourceTime || clean.observedAt;
      if (rowTime < cutoff || rowTime > currentTime + 60000) return;
      maxSequence = Math.max(maxSequence, clean.sequence);
      map.set(clean.id, clean);
    });

    normalizeRows(recentNewestFirst).slice().reverse().forEach(function (row) {
      const stored = map.get(row.id);
      if (stored) {
        stored.coefficient = row.coefficient;
        if (row.sourceTime) stored.sourceTime = row.sourceTime;
        return;
      }
      maxSequence += 1;
      map.set(row.id, {
        id: row.id,
        coefficient: row.coefficient,
        observedAt: currentTime,
        sourceTime: row.sourceTime,
        sequence: maxSequence
      });
    });

    return Array.from(map.values())
      .sort(function (a, b) { return a.sequence - b.sequence; })
      .slice(-MAX_STORED_ROWS);
  }

  function mergeTopEvents(existing, dayTopRows, now) {
    const currentTime = finiteNumber(now) === null ? Date.now() : Number(now);
    const cutoff = currentTime - DAY_MS;
    const map = new Map();

    (Array.isArray(existing) ? existing : []).concat(normalizeRows(dayTopRows)).forEach(function (row) {
      if (!row || !row.id) return;
      const coefficient = finiteNumber(row.coefficient);
      const sourceTime = parseTime(row.sourceTime);
      if (coefficient === null || coefficient < TARGET || sourceTime === null) return;
      if (sourceTime < cutoff || sourceTime > currentTime + 60000) return;
      map.set(String(row.id), {
        id: String(row.id),
        coefficient: coefficient,
        sourceTime: sourceTime
      });
    });

    return Array.from(map.values()).sort(function (a, b) { return a.sourceTime - b.sourceTime; });
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = values.slice().sort(function (a, b) { return a - b; });
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function standardDeviation(values) {
    if (values.length < 2) return 0;
    const average = values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
    const variance = values.reduce(function (sum, value) {
      return sum + Math.pow(value - average, 2);
    }, 0) / values.length;
    return Math.sqrt(variance);
  }

  function featuresAt(rows, index) {
    const past = rows.slice(0, index);
    const last3 = past.slice(-3);
    const last5 = past.slice(-5);
    const last12 = past.slice(-12);
    let dryRounds = 0;
    for (let cursor = past.length - 1; cursor >= 0; cursor -= 1) {
      if (past[cursor].coefficient >= TARGET) break;
      dryRounds += 1;
    }
    const latest = past.length ? past[past.length - 1].coefficient : 0;
    return {
      historySize: past.length,
      latest: latest,
      dryRounds: dryRounds,
      lowInLast3: last3.filter(function (row) { return row.coefficient <= 2; }).length,
      lowInLast5: last5.filter(function (row) { return row.coefficient <= 2; }).length,
      maxLast5: last5.length ? Math.max.apply(null, last5.map(function (row) { return row.coefficient; })) : 0,
      maxLast12: last12.length ? Math.max.apply(null, last12.map(function (row) { return row.coefficient; })) : 0,
      medianLast12: median(last12.map(function (row) { return row.coefficient; })),
      logVolatility12: standardDeviation(last12.map(function (row) { return Math.log(row.coefficient); }))
    };
  }

  function ruleMatches(name, features) {
    if (!features || features.historySize < 12) return false;
    if (name === 'low_cluster') {
      return features.dryRounds >= 3 && features.latest <= 2 && features.lowInLast3 >= 2;
    }
    if (name === 'deep_compression') {
      return features.dryRounds >= 5 && features.lowInLast5 >= 4 && features.maxLast5 < 5;
    }
    if (name === 'rebound_volatility') {
      return features.dryRounds >= 3 && features.latest <= 2 &&
        features.lowInLast3 >= 2 && features.maxLast12 >= 5 && features.logVolatility12 >= 0.55;
    }
    if (name === 'long_dry') {
      return features.dryRounds >= 8 && features.latest <= 3;
    }
    if (name === 'sequential') return true;
    return false;
  }

  function wilsonLower(successes, total) {
    if (!total) return 0;
    const z = 1.96;
    const p = successes / total;
    const denominator = 1 + z * z / total;
    const centre = p + z * z / (2 * total);
    const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total);
    return Math.max(0, (centre - margin) / denominator);
  }

  function evaluateRule(rows, name, start, end) {
    const from = Math.max(12, start || 0);
    const until = Math.min(rows.length, end === undefined ? rows.length : end);
    let signals = 0;
    let successes = 0;
    let cursor = from;
    while (cursor + MAX_ATTEMPTS <= until) {
      const features = featuresAt(rows, cursor);
      if (!ruleMatches(name, features)) {
        cursor += 1;
        continue;
      }
      signals += 1;
      const hit = rows.slice(cursor, cursor + MAX_ATTEMPTS).some(function (row) {
        return row.coefficient >= TARGET;
      });
      if (hit) successes += 1;
      cursor += MAX_ATTEMPTS;
    }
    return {
      signals: signals,
      successes: successes,
      failures: signals - successes,
      rate: signals ? successes / signals : 0,
      lower95: wilsonLower(successes, signals)
    };
  }

  function selectValidatedRule(rows) {
    if (rows.length < MIN_MODEL_ROWS) return null;
    const split = Math.max(100, Math.min(rows.length - 60, Math.floor(rows.length * 0.67)));
    if (split < 100 || rows.length - split < 60) return null;

    const baselineTrain = evaluateRule(rows, 'sequential', 12, split);
    const training = RULES.map(function (rule) {
      return Object.assign({}, rule, {result: evaluateRule(rows, rule.name, 12, split)});
    }).filter(function (candidate) {
      return candidate.result.signals >= 8;
    }).sort(function (a, b) {
      if (b.result.lower95 !== a.result.lower95) return b.result.lower95 - a.result.lower95;
      return b.result.rate - a.result.rate;
    });

    if (!training.length) {
      return {
        validated: false,
        reason: 'На обучающей части недостаточно отдельных сигналов.',
        baselineTrain: baselineTrain,
        comparison: []
      };
    }

    const chosen = training[0];
    const validation = evaluateRule(rows, chosen.name, split, rows.length);
    const baselineValidation = evaluateRule(rows, 'sequential', split, rows.length);
    const lift = validation.rate - baselineValidation.rate;
    const validated = validation.signals >= 8 && lift >= 0.10 &&
      validation.lower95 > baselineValidation.lower95;

    return {
      name: chosen.name,
      label: chosen.label,
      validated: validated,
      training: chosen.result,
      validation: validation,
      baselineTrain: baselineTrain,
      baselineValidation: baselineValidation,
      lift: lift,
      reason: validated
        ? 'Фильтр выбран на первых данных и дал преимущество на отдельной проверочной части.'
        : 'Фильтр не подтвердил преимущество на отдельной проверочной части.',
      comparison: training.map(function (candidate) {
        return {
          name: candidate.name,
          label: candidate.label,
          signals: candidate.result.signals,
          rate: candidate.result.rate
        };
      })
    };
  }

  function analyzeDay(dayHistory, now) {
    const currentTime = finiteNumber(now) === null ? Date.now() : Number(now);
    const allRows = (Array.isArray(dayHistory) ? dayHistory : [])
      .map(function (row, index) { return cleanStoredRow(row, index + 1); })
      .filter(Boolean)
      .sort(function (a, b) { return a.sequence - b.sequence; });
    const rows = allRows.slice(-MAX_BACKTEST_ROWS);
    const sampleSize = rows.length;
    const hits = rows.filter(function (row) { return row.coefficient >= TARGET; }).length;
    const posteriorRoundRate = (hits + 1) / (sampleSize + 10);
    const threeRoundRate = 1 - Math.pow(1 - posteriorRoundRate, MAX_ATTEMPTS);
    const roundLower = wilsonLower(hits, sampleSize);
    const conservativeThreeRoundRate = 1 - Math.pow(1 - roundLower, MAX_ATTEMPTS);
    const currentFeatures = featuresAt(rows, rows.length);
    const model = selectValidatedRule(rows);
    const selectedReady = Boolean(model && model.validated && ruleMatches(model.name, currentFeatures));
    const warmupReady = sampleSize >= 20 && !(model && model.validated);
    const entryReady = selectedReady || warmupReady;
    const entryMode = selectedReady ? 'validated-filter' : warmupReady ? 'live-test-sequential' : 'collecting';
    const firstTime = rows.length ? rows[0].observedAt : currentTime;
    const lastTime = rows.length ? rows[rows.length - 1].observedAt : currentTime;

    let status = 'СБОР ДАННЫХ';
    if (sampleSize >= MIN_MODEL_ROWS && model && model.validated) {
      status = selectedReady ? 'УСЛОВИЯ ГОТОВЫ' : 'ЖДИ УСЛОВИЙ';
    } else if (sampleSize >= 20) {
      status = 'LIVE-ТЕСТ ГОТОВ';
    }

    return {
      target: TARGET,
      sampleSize: sampleSize,
      minimumRows: MIN_MODEL_ROWS,
      hits: hits,
      roundRate: posteriorRoundRate,
      threeRoundRate: threeRoundRate,
      conservativeThreeRoundRate: conservativeThreeRoundRate,
      dryRounds: currentFeatures.dryRounds,
      currentFeatures: currentFeatures,
      coverageMinutes: Math.max(0, Math.round((lastTime - firstTime) / 60000)),
      model: model,
      status: status,
      entryReady: entryReady,
      entryMode: entryMode,
      warmupReady: warmupReady,
      validatedReady: selectedReady,
      generatedAt: currentTime
    };
  }

  function summarizeTopEvents(events, now) {
    const currentTime = finiteNumber(now) === null ? Date.now() : Number(now);
    const rows = (Array.isArray(events) ? events : []).filter(function (row) {
      return row && parseTime(row.sourceTime) !== null && parseTime(row.sourceTime) >= currentTime - DAY_MS;
    }).sort(function (a, b) { return a.sourceTime - b.sourceTime; });
    const gaps = [];
    for (let index = 1; index < rows.length; index += 1) {
      gaps.push((rows[index].sourceTime - rows[index - 1].sourceTime) / 60000);
    }
    const last = rows.length ? rows[rows.length - 1] : null;
    return {
      count: rows.length,
      lastTime: last ? last.sourceTime : null,
      minutesSinceLast: last ? Math.max(0, Math.floor((currentTime - last.sourceTime) / 60000)) : null,
      medianGapMinutes: gaps.length ? median(gaps) : null,
      latest: rows.slice(-6).reverse()
    };
  }

  return {
    TARGET: TARGET,
    MAX_ATTEMPTS: MAX_ATTEMPTS,
    DAY_MS: DAY_MS,
    MIN_MODEL_ROWS: MIN_MODEL_ROWS,
    RULES: RULES,
    normalizeRows: normalizeRows,
    mergeDayHistory: mergeDayHistory,
    mergeTopEvents: mergeTopEvents,
    featuresAt: featuresAt,
    ruleMatches: ruleMatches,
    evaluateRule: evaluateRule,
    selectValidatedRule: selectValidatedRule,
    analyzeDay: analyzeDay,
    summarizeTopEvents: summarizeTopEvents,
    wilsonLower: wilsonLower
  };
});
