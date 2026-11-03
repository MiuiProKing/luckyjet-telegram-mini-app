import {runStatisticalSuite, predictCurrentSuite} from './suite.mjs';
import {normalizeRounds} from '../prediction-v2.ts';

// The build injects the bundled worker as text. No remote source or eval is used.
const EMBEDDED_WORKER = typeof __STATISTICS_WORKER_SOURCE__ === 'string' ? __STATISTICS_WORKER_SOURCE__ : '';
const PUBLIC_KEYS = ['modelId', 'evidenceStatus', 'generatedAt', 'sourceLastAt', 'sourceLastId', 'sourceHeadSignature', 'history', 'validation', 'estimates', 'consensus', 'zones'];
const PRIVATE_KEYS = new Set(['fits', 'rows', 'rounds', 'rawRows', 'raw', 'samples', 'observations', 'losses', 'residuals', 'trainingRows']);

function safeValue(value, depth = 0) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (depth > 16 || !value || typeof value !== 'object' || ArrayBuffer.isView(value)) return null;
  if (Array.isArray(value)) return Object.freeze(value.map(item => safeValue(item, depth + 1)));
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return null;
  const result = {};
  for (const [key, item] of Object.entries(value)) if (!PRIVATE_KEYS.has(key)) result[key] = safeValue(item, depth + 1);
  return Object.freeze(result);
}

/** The export/public UI never receives fitted arrays, raw histories or losses. */
export function publicStatisticsReport(value) {
  const result = {};
  for (const key of PUBLIC_KEYS) if (value && Object.hasOwn(value, key)) result[key] = safeValue(value[key]);
  return Object.freeze(result);
}

const messageOf = error => String(error?.message || error || 'Ошибка статистического расчёта').slice(0, 350);
const interrupted = () => Object.assign(Error('Расчёт отложен, пока работают автонажатия'), {name: 'StatisticsDeferred'});
const cancelled = () => Object.assign(Error('Расчёт заменён или остановлен'), {name: 'StatisticsCancelled'});
const taskYield = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Expensive validation normally runs in a local embedded Worker. If Safari's
 * CSP disallows that worker, heavy cooperative work waits until auto is OFF.
 * No controller state or DOM binding is accepted by this module.
 */
export function createStatisticsRunner({onChange = () => {}, now = Date.now, canRunFallback = () => true,
  WorkerClass = globalThis.Worker, BlobClass = globalThis.Blob,
  createObjectURL = value => URL.createObjectURL(value), revokeObjectURL = value => URL.revokeObjectURL(value),
  workerSource = EMBEDDED_WORKER, runSuite = runStatisticalSuite, predictSuite = predictCurrentSuite,
  yieldTask = taskYield} = {}) {
  let stopped = false, generation = 0, predictionId = 0, worker = null, workerURL = null;
  let workerDisabled = false, runningFallback = false, pending = null, latestPrediction = null;
  let fits = null, validation = null, status = 'idle', mode = null, progress = null;
  let report = null, forecast = null, forecastAt = null, message = 'Статистические модели ещё не рассчитаны';

  const current = id => !stopped && id === generation;
  const fallbackAllowed = () => {try {return canRunFallback() === true;} catch {return false;}};
  function state() {return {status, mode, progress, report, forecast, forecastAt, message, generation};}
  function notify() {if (!stopped) {try {onChange(state());} catch { /* UI cannot fail model work. */ }}}
  function disposeWorker() {
    if (worker) {worker.onmessage = null; worker.onerror = null; try {worker.terminate();} catch {} worker = null;}
    if (workerURL !== null) {try {revokeObjectURL(workerURL);} catch {} workerURL = null;}
  }
  function fail(error) {
    status = 'error'; message = messageOf(error); pending = null; fits = null; validation = null;
    forecast = null; forecastAt = null; disposeWorker(); notify();
  }
  function acceptForecast(value, request) {
    forecast = publicStatisticsReport({...value, generatedAt: request.now, sourceLastAt: request.lastAt,
      sourceLastId: request.lastId, sourceHeadSignature: request.headSignature}); forecastAt = request.now; notify();
  }
  function submitPrediction() {
    if (!latestPrediction || status !== 'ready' || stopped) return;
    const request = latestPrediction, id = generation;
    if (worker) {
      try {worker.postMessage({type: 'predict', generation: id, predictionId: request.id, rows: request.rows, now: request.now});}
      catch (error) {fail(error);}
    } else if (fits) {
      try {
        const result = predictSuite(fits, request.rows, {now: request.now, validation});
        if (current(id) && request.id === latestPrediction?.id) acceptForecast(result, request);
      } catch (error) {fail(error);}
    }
  }
  async function runMain(job) {
    if (!current(job.id) || runningFallback) return;
    if (!fallbackAllowed()) {
      status = 'waiting'; mode = 'main-thread'; message = 'Модели ждут: тяжёлый расчёт начнётся после выключения авто'; notify(); return;
    }
    runningFallback = true; status = 'training'; mode = 'main-thread';
    message = 'Статистическая проверка по дням'; notify();
    try {
      await yieldTask();
      if (!current(job.id)) throw cancelled();
      if (!fallbackAllowed()) throw interrupted();
      const result = await runSuite(job.rows, {now: job.now,
        onProgress(value) {if (current(job.id)) {progress = safeValue(value); notify();}},
        async yieldTask() {
          if (!current(job.id)) throw cancelled();
          if (!fallbackAllowed()) throw interrupted();
          await yieldTask();
          if (!current(job.id)) throw cancelled();
          if (!fallbackAllowed()) throw interrupted();
        },
      });
      if (!current(job.id)) return;
      if (!result?.fits) throw Error('Статистические модели не вернули рассчитанные параметры');
      fits = result.fits; validation = result.validation; report = publicStatisticsReport(result);
      job.rows = null;
      pending = null; status = 'ready'; message = 'Модели рассчитаны; преимущество подтверждается только отдельной проверкой'; notify();
      submitPrediction();
    } catch (error) {
      if (!current(job.id)) return;
      if (error?.name === 'StatisticsDeferred') {
        status = 'waiting'; message = 'Расчёт отложен, пока работают автонажатия'; notify();
      } else fail(error);
    } finally {
      runningFallback = false;
      // A replacement cannot overlap the previous cooperative calculation.
      if (!stopped && pending && pending.id !== job.id) void launch(pending);
    }
  }
  function launch(job) {
    if (!current(job.id) || runningFallback) return Promise.resolve(false);
    if (!workerDisabled && typeof WorkerClass === 'function' && typeof BlobClass === 'function' && workerSource) {
      try {
        workerURL = createObjectURL(new BlobClass([workerSource], {type: 'text/javascript'}));
        worker = new WorkerClass(workerURL);
        status = 'training'; mode = 'worker'; message = 'Статистическая проверка по дням'; notify();
        worker.onmessage = event => {
          const data = event?.data;
          if (!current(job.id) || data?.generation !== job.id) return;
          if (data.type === 'progress') {progress = safeValue(data.progress); notify();}
          else if (data.type === 'trained') {
            if (pending?.id === job.id) pending.rows = null;
            report = publicStatisticsReport(data.report); pending = null; status = 'ready';
            message = 'Модели рассчитаны; преимущество подтверждается только отдельной проверкой'; notify(); submitPrediction();
          } else if (data.type === 'predicted' && data.predictionId === latestPrediction?.id) acceptForecast(data.forecast, latestPrediction);
          else if (data.type === 'error') fail(data.message);
        };
        worker.onerror = event => {
          if (!current(job.id)) return;
          event?.preventDefault?.(); disposeWorker(); workerDisabled = true;
          if (pending) void runMain(pending);
          else fail('Фоновый расчёт остановлен браузером; пересчитай модели при выключенном авто');
        };
        worker.postMessage({type: 'train', generation: job.id, rows: job.rows, now: job.now});
        return Promise.resolve(true);
      } catch {
        disposeWorker(); workerDisabled = true;
      }
    }
    return runMain(job);
  }
  function train(rows, {now: at = now()} = {}) {
    if (stopped) return Promise.resolve(false);
    if (!Array.isArray(rows) || !Number.isSafeInteger(at) || at < 946684800000) {
      generation++; fail('Некорректная история или время статистического расчёта'); return Promise.resolve(false);
    }
    generation++; disposeWorker(); fits = null; validation = null;
    forecast = null; forecastAt = null; progress = null;
    const job = {id: generation, rows, now: at}; pending = job;
    if (runningFallback) {status = 'training'; message = 'Предыдущий расчёт завершается; новая история ожидает'; notify(); return Promise.resolve(true);}
    void launch(job); return Promise.resolve(true);
  }
  function predict(rows, {now: at = now()} = {}) {
    if (stopped || !Array.isArray(rows) || !Number.isSafeInteger(at) || at < 946684800000) return false;
    const normalized = normalizeRounds(rows, at), lastAt = normalized[0]?.timestamp ?? null;
    // Every tied head ID is part of the origin: a later ID may leave the first
    // normalized row unchanged. JSON preserves ID boundaries without collisions.
    const headIds = [...new Set(normalized.filter(row => row.timestamp === lastAt).map(row => row.id))].sort();
    const signature = headIds.length ? JSON.stringify(headIds) : null;
    // Oversized heads cannot certify freshness; never truncate into a match.
    const headSignature = signature !== null && signature.length <= 2000 ? signature : null;
    latestPrediction = {id: ++predictionId, rows: normalized, now: at, lastAt, lastId: normalized[0]?.id ?? null, headSignature};
    if (forecast && (forecast.sourceLastAt !== lastAt || forecast.sourceHeadSignature !== headSignature)) {
      forecast = null; forecastAt = null; notify();
    }
    submitPrediction(); return true;
  }
  function resume() {
    if (stopped || status !== 'waiting' || !pending || runningFallback || !fallbackAllowed()) return false;
    void launch(pending); return true;
  }
  function stop() {
    if (stopped) return;
    stopped = true; generation++; disposeWorker(); pending = null; latestPrediction = null; fits = null; validation = null;
    status = 'stopped'; forecast = null; forecastAt = null; report = null; progress = null;
  }
  return {train, predict, resume, stop, get state() {return state();}};
}
