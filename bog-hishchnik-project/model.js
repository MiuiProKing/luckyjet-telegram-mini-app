/* Independent implementation of the observable statistical rules; see RESEARCH.md. */
(function (root, factory) {
  const model = factory();
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.BHModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MINUTE = 60000;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const mean = a => a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0;
  const median = a => { const b = [...a].sort((x, y) => x - y), k = b.length >> 1; return b.length ? (b.length % 2 ? b[k] : (b[k - 1] + b[k]) / 2) : 0; };
  const geo = a => a.length ? Math.exp(mean(a.map(n => Math.log(Math.max(1.001, n))))) : 0;
  const deviation = a => { const m = mean(a); return a.length > 1 ? Math.sqrt(mean(a.map(n => (n - m) ** 2))) : 0; };
  const mad = a => { const m = median(a); return a.length > 1 ? median(a.map(n => Math.abs(n - m))) : 0; };
  const ema = (a, alpha) => { if (!a.length) return 0; let n = a[a.length - 1]; for (let i = a.length - 2; i >= 0; i--) n = alpha * a[i] + (1 - alpha) * n; return n; };
  const max = a => a.reduce((m, n) => Math.max(m, n), 0);
  const ordered = rows => rows.filter(r => Number.isFinite(r.coefficient) && r.coefficient >= 1 && Number.isFinite(r.timestamp)).slice().sort((a, b) => b.timestamp - a.timestamp);

  function intervals(rows, threshold) {
    const hits = rows.filter(r => r.coefficient >= threshold).slice().sort((a, b) => a.timestamp - b.timestamp);
    const gaps = hits.slice(1).map((r, i) => r.timestamp - hits[i].timestamp);
    return { count: hits.length, last: hits.at(-1)?.timestamp || null, median: median(gaps), mad: mad(gaps) };
  }
  function bucket(rows, predicate) {
    const values = rows.filter(predicate).map(r => r.coefficient);
    return { count: values.length, geometric: geo(values), maximum: max(values) };
  }
  function finish(fields, now) {
    return { ...fields, target: Number(fields.target.toFixed(2)), score: Math.round(fields.score), generatedAt: now, endsAt: fields.at + fields.windowMs };
  }

  function predictNormal(input, now = Date.now()) {
    const rows = ordered(input);
    if (rows.length < 20) return null;
    const c = rows.map(r => r.coefficient), allGeo = geo(c), allMedian = median(c);
    const last50 = c.slice(0, 50), avg50 = mean(last50), sigma = deviation(last50), mad50 = mad(last50);
    const smooth20 = ema(c.slice(0, 20), .25), smooth50 = ema(last50, .12);
    const precise = rows.every(r => !r.estimated), current = new Date(now);
    const hour = precise ? bucket(rows, r => new Date(r.timestamp).getHours() === current.getHours()) : { count: 0, geometric: 0, maximum: 0 };
    const targetMinute = (current.getMinutes() + 2) % 60;
    const minute = precise ? bucket(rows, r => new Date(r.timestamp).getMinutes() === targetMinute) : { count: 0, geometric: 0, maximum: 0 };
    const recentLarge = rows.slice(0, 30).filter(r => r.coefficient >= 20);
    const base = { sample: rows.length, estimated: !precise };
    if (precise) {
      const cycle = intervals(rows, 10), delta = cycle.last + cycle.median - now;
      const width = clamp(cycle.mad * 1.4826 || cycle.median * .55, MINUTE, 4 * MINUTE);
      if (cycle.count >= 8 && cycle.median > 0 && cycle.mad > 0 && cycle.mad < cycle.median * .6 && Math.abs(delta) <= width * .6) {
        const divisor = recentLarge.length >= 3 ? 2 : recentLarge.length ? 3 : 4;
        const score = clamp(clamp(60 - Math.abs(delta) / width * 15, 40, 62) + (hour.geometric > allGeo ? 3 : 0) + clamp(cycle.count / 20, 0, 4), 40, 68);
        return finish({ ...base, rule: 'gold-cycle', pattern: 'Цикл результатов от 10×', target: clamp(max(c.slice(0, 80)) / divisor, 2, 20), score, at: now + (delta > 0 ? Math.max(delta, 90000) : 2 * MINUTE), windowMs: clamp(cycle.median * .25, 90000, 3 * MINUTE), basis: 'Медианный интервал ' + (cycle.median / MINUTE).toFixed(1) + ' мин; разброс MAD ' + (cycle.mad / MINUTE).toFixed(2) + ' мин.' }, now);
      }
    }
    if (c.slice(0, 15).every(n => n < 2)) {
      return finish({ ...base, rule: 'low-series', pattern: 'Серия из 15 результатов ниже 2×', target: clamp(allGeo * 2.5 + allMedian, 2.5, 15), score: clamp(70 + (precise ? Math.min(15, Math.max(0, (now - rows[14].timestamp) / MINUTE)) : 0), 65, 92), at: now + 90000, windowMs: 2 * MINUTE, basis: 'Геометрическое среднее ' + allGeo.toFixed(2) + '×; медиана ' + allMedian.toFixed(2) + '×.' }, now);
    }
    if (recentLarge.length >= 3) {
      const g = geo(recentLarge.map(r => r.coefficient)), divisor = recentLarge.length >= 5 ? 3 : recentLarge.length >= 4 ? 4 : 5;
      return finish({ ...base, rule: 'large-cluster', pattern: recentLarge.length + ' результатов от 20× за 30 раундов', target: clamp(g / divisor, 2, 12), score: Math.min(78, 60 + recentLarge.length * 3), at: now + 2 * MINUTE, windowMs: 2.5 * MINUTE, basis: 'Геометрическое среднее крупных результатов ' + g.toFixed(2) + '× / ' + divisor + '.' }, now);
    }
    const recent60 = c.slice(0, 60), zone = recent60.filter(n => n >= 5 && n < 10), lowRatio = recent60.filter(n => n < 2).length / recent60.length;
    if (zone.length >= 3) {
      const g = geo(zone), fragile = lowRatio > .55 || sigma > avg50 * 1.4;
      return finish({ ...base, rule: 'middle-zone', pattern: fragile ? 'Смешанная фаза 5–9,99×' : 'Фаза 5–9,99×', target: fragile ? clamp(g * .45, 2, 4.5) : clamp(g * .7, 3, 7), score: clamp(64 + zone.length * 4 + (fragile ? -6 : 6), 58, 90), at: now + 2 * MINUTE, windowMs: 2.5 * MINUTE, basis: zone.length + ' результатов в диапазоне; геометрическое среднее ' + g.toFixed(2) + '×; ниже 2×: ' + Math.round(lowRatio * 100) + '%.' }, now);
    }
    const hourRatio = hour.count >= 5 ? hour.geometric / Math.max(allGeo, .1) : 1;
    const minuteRatio = minute.count >= 5 ? minute.geometric / Math.max(allGeo, .1) : 1;
    let target = clamp((smooth20 * .5 + smooth50 * .3 + avg50 * .2) * hourRatio * .6 + minute.maximum * .1 + 1.6, 1.8, 12);
    const unstable = lowRatio > .6 || sigma > avg50 * 1.6;
    if (unstable) target = Math.min(target, 3.2); else if (lowRatio > .45) target = Math.min(target, 5);
    const score = clamp(52 + clamp(rows.length / 25, 0, 28) + clamp(Math.abs(hourRatio - 1) * 42, 0, 22) + clamp(Math.abs(minuteRatio - 1) * 32, 0, 16) + (mad50 > 0 && mad50 < avg50 * .6 ? 5 : 0) + (unstable ? -8 : 0), 50, 92);
    return finish({ ...base, rule: 'ema-time', pattern: hourRatio > 1.1 ? 'Сильнее среднего в этот час' : hourRatio < .9 ? 'Слабее среднего в этот час' : 'Сочетание статистических признаков', target, score, at: now + 2 * MINUTE + ((60 - current.getSeconds()) * 1000) % 45000, windowMs: 2.5 * MINUTE, basis: 'EMA20 ' + smooth20.toFixed(2) + '×; текущий час: ' + hour.count + ' раундов; минута +2: ' + minute.count + ' раундов; MAD ' + mad50.toFixed(2) + '.' }, now);
  }

  function predictVip(input, now = Date.now()) {
    const rows = ordered(input), candidates = [], precise = rows.every(r => !r.estimated);
    const recent = rows.slice(0, 80), n20 = recent.filter(r => r.coefficient >= 20).length, n50 = recent.filter(r => r.coefficient >= 50).length;
    const g = intervals(rows, 100);
    if (precise && g.count >= 5 && g.last && g.median > 0) {
      const delta = g.last + g.median - now, width = clamp(g.mad * 1.4826 || g.median * .35, 2 * MINUTE, 12 * MINUTE);
      if (g.mad > 0 && g.mad < g.median * .5 && (Math.abs(delta) <= width * .7 || now - g.last >= g.median * .9)) {
        const proximity = clamp(1 - Math.abs(delta) / width, 0, 1);
        candidates.push({ rule: 'vip-cycle', target: 100, score: clamp(55 + Math.min(10, g.count) + proximity * 12, 55, 82), at: delta > 0 ? g.last + g.median : now + Math.max(2 * MINUTE, width * .4), windowMs: clamp(width, 3 * MINUTE, 10 * MINUTE), pattern: 'Интервалы результатов от 100×', basis: g.count + ' событий; медианный интервал ' + (g.median / MINUTE).toFixed(1) + ' мин.' });
      }
    }
    if (n50 >= 3 && n20 >= 6) candidates.push({ rule: 'vip-cluster', target: 120, score: clamp(55 + n50 * 5 + n20, 55, 82), at: now + 3 * MINUTE, windowMs: 6 * MINUTE, pattern: 'Кластер крупных коэффициентов', basis: 'За 80 раундов: ' + n20 + ' от 20×, включая ' + n50 + ' от 50×.' });
    if (precise && rows.length >= 80 && g.count >= 4 && g.last) {
      const span = rows[0].timestamp - rows.at(-1).timestamp, rate = span > 0 ? g.count / span : 0;
      const delayScore = rate > 0 ? 1 - Math.exp(-rate * Math.max(0, now - g.last)) : 0;
      if (delayScore >= .75) {
        const interval = clamp(1 / rate, 90000, 8 * MINUTE);
        candidates.push({ rule: 'vip-interval', target: 100, score: clamp(50 + delayScore * 30, 50, 80), at: now + interval, windowMs: clamp(interval * .8, 3 * MINUTE, 7 * MINUTE), pattern: 'Оценка интервала по частоте 100×', basis: 'Пуассоновская эвристика; средний интервал ' + (1 / rate / MINUTE).toFixed(1) + ' мин. Это не вероятность следующего раунда.' });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    if (!candidates.length || (candidates.length < 2 && candidates[0].score < 75)) return null;
    const result = { ...candidates[0], sample: rows.length, estimated: !precise, supportingRules: candidates.length };
    if (candidates.length >= 2) result.score = Math.min(92, result.score + 5);
    result.hits = recent.filter(r => r.coefficient >= result.target).length;
    result.sampleRecent = recent.length;
    return finish(result, now);
  }
  function describeVip(input) {
    const recent = ordered(input).slice(0, 80);
    return { count: recent.length, above20: recent.filter(r => r.coefficient >= 20).length, above50: recent.filter(r => r.coefficient >= 50).length, above100: recent.filter(r => r.coefficient >= 100).length };
  }
  function stats(rows) {
    const values = rows.map(r => r.coefficient);
    return { count: values.length, average: mean(values), maximum: max(values), median: median(values), at2: values.length ? values.filter(n => n >= 2).length / values.length * 100 : 0, at10: values.length ? values.filter(n => n >= 10).length / values.length * 100 : 0 };
  }
  return { predictNormal, predictVip, describeVip, stats, intervals, mean, median, geo, ema, clamp };
});

