import {runStatisticalSuite, predictCurrentSuite} from './suite.mjs';

// Local-only worker. Fitted arrays stay here; only aggregate reports and current
// informational estimates cross back to the overlay. There are no network calls.
let generation = null, fits = null, validation = null;
const publicKeys = ['modelId', 'evidenceStatus', 'generatedAt', 'history', 'validation', 'estimates', 'consensus', 'zones'];
const reportOf = result => Object.fromEntries(publicKeys.filter(key => Object.hasOwn(result, key)).map(key => [key, result[key]]));

self.onmessage = async event => {
  const data = event?.data;
  if (!data || !Number.isSafeInteger(data.generation) || !Array.isArray(data.rows)) return;
  try {
    if (data.type === 'train') {
      generation = data.generation; fits = null; validation = null;
      const id = generation;
      const result = await runStatisticalSuite(data.rows, {now: data.now,
        onProgress(progress) {if (generation === id) self.postMessage({type: 'progress', generation: id, progress});},
      });
      if (generation !== id) return;
      fits = result.fits; validation = result.validation;
      if (!fits) throw Error('Не удалось рассчитать параметры моделей');
      self.postMessage({type: 'trained', generation: id, report: reportOf(result)});
    } else if (data.type === 'predict' && generation === data.generation && fits) {
      const forecast = predictCurrentSuite(fits, data.rows, {now: data.now, validation});
      self.postMessage({type: 'predicted', generation, predictionId: data.predictionId, now: data.now, forecast});
    }
  } catch (error) {
    if (generation === data.generation) self.postMessage({type: 'error', generation,
      message: String(error?.message || error || 'Ошибка статистического расчёта').slice(0, 350)});
  }
};
