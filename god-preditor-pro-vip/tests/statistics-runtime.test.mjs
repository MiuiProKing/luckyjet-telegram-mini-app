import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {createStatisticsRunner, publicStatisticsReport} from '../safari/src/statistics/runtime.mjs';

const NOW = Date.UTC(2026, 10, 3, 12);
const rows = n => Array.from({length: n}, (_, i) => ({id: 'r' + i, timestamp: NOW - (n - i) * 20000, coefficient: i % 8 === 0 ? 20 : 1.2}));
const result = n => ({modelId: 'independent-statistical-suite-v1', evidenceStatus: 'experimental-unvalidated', generatedAt: NOW,
  history: {acceptedCount: n}, validation: {models: [], consensus: [], frozenMembers: []}, estimates: [], zones: [],
  consensus: {status: 'abstain', signals: []}, fits: {privateArray: new Float64Array(10)}, rows: ['raw-private']});
const drain = () => new Promise(resolve => setImmediate(resolve));

function harness(options = {}) {
  const workers = [], revoked = [], changes = [];
  class FakeWorker {
    constructor(url) {this.url = url; this.messages = []; this.terminated = false; workers.push(this);}
    postMessage(value) {this.messages.push(value);}
    emit(value) {this.onmessage?.({data: value});}
    crash() {this.onerror?.({preventDefault() {}});}
    terminate() {this.terminated = true;}
  }
  class FakeBlob {constructor(parts, options) {this.parts = parts; this.type = options.type;}}
  const runner = createStatisticsRunner({WorkerClass: FakeWorker, BlobClass: FakeBlob,
    createObjectURL: () => 'blob:statistics-' + workers.length, revokeObjectURL: value => revoked.push(value),
    workerSource: 'self.onmessage = () => {};', now: () => NOW, onChange: value => changes.push(value), ...options});
  return {runner, workers, revoked, changes};
}

test('local worker receives training; aggregate report excludes fits and raw observations', async () => {
  const {runner, workers} = harness();
  const input = rows(20), original = structuredClone(input);
  assert.equal(await runner.train(input), true);
  assert.equal(runner.state.status, 'training');
  assert.equal(runner.state.mode, 'worker');
  assert.equal(workers[0].messages[0].type, 'train');
  const id = runner.state.generation;
  workers[0].emit({type: 'progress', generation: id, progress: {stage: 'walk-forward', fold: 2, folds: 10}});
  assert.equal(runner.state.progress.fold, 2);
  workers[0].emit({type: 'trained', generation: id, report: result(input.length)});
  assert.equal(runner.state.status, 'ready');
  assert.equal(runner.state.report.history.acceptedCount, input.length);
  assert.equal(runner.state.report.fits, undefined);
  assert.equal(runner.state.report.rows, undefined);
  assert.ok(Object.isFrozen(runner.state.report));
  assert.deepEqual(input, original);
  runner.stop();
});

test('only latest prediction response is published, with strict source and origin timestamps', async () => {
  const {runner, workers} = harness();
  await runner.train(rows(20));
  runner.predict(rows(4), {now: NOW});
  const id = runner.state.generation;
  workers[0].emit({type: 'trained', generation: id, report: result(20)});
  const first = workers[0].messages.at(-1);
  assert.equal(first.type, 'predict');
  runner.predict([...rows(4), {id: 'bad-future', timestamp: NOW + 1e6, coefficient: 100}], {now: NOW + 1000});
  const second = workers[0].messages.at(-1);
  workers[0].emit({type: 'predicted', generation: id, predictionId: first.predictionId, now: NOW, forecast: {estimates: ['old']}});
  assert.equal(runner.state.forecast, null);
  workers[0].emit({type: 'predicted', generation: id, predictionId: second.predictionId, now: NOW + 1e9,
    forecast: {estimates: ['latest'], consensus: {status: 'abstain'}, fits: 'private',
      sourceLastId: 'spoofed', sourceLastAt: NOW + 1e9, sourceHeadSignature: '["spoofed"]'}});
  assert.deepEqual(runner.state.forecast.estimates, ['latest']);
  assert.equal(runner.state.forecast.generatedAt, NOW + 1000);
  assert.equal(runner.state.forecast.sourceLastAt, NOW - 20000);
  assert.equal(runner.state.forecast.sourceLastId, 'r3');
  assert.equal(runner.state.forecast.sourceHeadSignature, '["r3"]');
  assert.equal(runner.state.forecast.fits, undefined);
  runner.stop();
});

test('a new tied head clears the forecast even when the first normalized ID stays unchanged', async () => {
  const {runner, workers} = harness();
  await runner.train(rows(20));
  const generation = runner.state.generation, worker = workers[0];
  worker.emit({type: 'trained', generation, report: result(20)});
  const firstHead = {id: 'a-head', timestamp: NOW - 1000, coefficient: 2};
  runner.predict([firstHead]);
  const first = worker.messages.at(-1);
  worker.emit({type: 'predicted', generation, predictionId: first.predictionId, forecast: {estimates: ['first']}});
  assert.equal(runner.state.forecast.sourceHeadSignature, '["a-head"]');

  const tiedHead = {id: 'z-head', timestamp: firstHead.timestamp, coefficient: 3};
  runner.predict([tiedHead, firstHead, firstHead, {id: 'future', timestamp: NOW + 1, coefficient: 9}]);
  const latest = worker.messages.at(-1);
  assert.equal(runner.state.forecast, null);
  assert.equal(runner.state.forecastAt, null);
  assert.deepEqual(latest.rows.map(row => row.id), ['a-head', 'z-head']);
  worker.emit({type: 'predicted', generation, predictionId: first.predictionId, forecast: {estimates: ['stale']}});
  assert.equal(runner.state.forecast, null);
  worker.emit({type: 'predicted', generation, predictionId: latest.predictionId, forecast: {estimates: ['latest']}});
  assert.equal(runner.state.forecast.sourceLastId, 'a-head');
  assert.equal(runner.state.forecast.sourceLastAt, firstHead.timestamp);
  assert.equal(runner.state.forecast.sourceHeadSignature, '["a-head","z-head"]');
  assert.deepEqual(runner.state.forecast.estimates, ['latest']);
  runner.stop();
});

test('replacement terminates the old worker and ignores captured stale callbacks', async () => {
  const {runner, workers, revoked} = harness();
  await runner.train(rows(10));
  const staleHandler = workers[0].onmessage, oldId = runner.state.generation;
  await runner.train(rows(20));
  assert.equal(workers[0].terminated, true);
  assert.equal(revoked.length, 1);
  staleHandler({data: {type: 'trained', generation: oldId, report: result(10)}});
  assert.equal(runner.state.report, null);
  workers[1].emit({type: 'trained', generation: runner.state.generation, report: result(20)});
  assert.equal(runner.state.report.history.acceptedCount, 20);
  runner.predict(rows(3));
  const latest = workers[1].messages.at(-1);
  staleHandler({data: {type: 'predicted', generation: oldId, predictionId: latest.predictionId, forecast: {estimates: ['stale']}}});
  assert.equal(runner.state.forecast, null);
  workers[1].emit({type: 'predicted', generation: runner.state.generation, predictionId: latest.predictionId, forecast: {estimates: ['current']}});
  assert.deepEqual(runner.state.forecast.estimates, ['current']);
  runner.stop();
});

test('CSP failure defers all heavy fallback work until auto permits it', async () => {
  let allowed = false, calls = 0;
  const {runner, workers, revoked} = harness({canRunFallback: () => allowed,
    runSuite: async input => {calls++; return result(input.length);}, predictSuite: () => ({estimates: []}), yieldTask: async () => {}});
  await runner.train(rows(10));
  workers[0].crash();
  await drain();
  assert.equal(runner.state.status, 'waiting');
  assert.equal(calls, 0);
  assert.equal(workers[0].terminated, true);
  assert.equal(revoked.length, 1);
  assert.equal(runner.resume(), false);
  allowed = true;
  assert.equal(runner.resume(), true);
  assert.equal(runner.resume(), false);
  await drain();
  assert.equal(calls, 1);
  assert.equal(runner.state.mode, 'main-thread');
  assert.equal(runner.state.status, 'ready');
  runner.stop();
});

test('arming auto at a cooperative checkpoint defers the calculation without changing auto state', async () => {
  let allowed = true, calls = 0, entered, release;
  const enteredPromise = new Promise(resolve => {entered = resolve;});
  const blocked = new Promise(resolve => {release = resolve;});
  const {runner} = harness({WorkerClass: undefined, canRunFallback: () => allowed, yieldTask: async () => {},
    runSuite: async (input, options) => {
      calls++;
      if (calls === 1) {entered(); await blocked; await options.yieldTask();}
      return result(input.length);
    }, predictSuite: () => ({estimates: []})});
  await runner.train(rows(10)); await enteredPromise;
  allowed = false; release(); await drain();
  assert.equal(runner.state.status, 'waiting');
  assert.equal(allowed, false);
  assert.equal(runner.state.report, null);
  allowed = true; runner.resume(); await drain();
  assert.equal(calls, 2);
  assert.equal(runner.state.status, 'ready');
  assert.equal(allowed, true);
  runner.stop();
});

test('a replacement cooperative job waits for the old one to end and cannot publish its result', async () => {
  let entered, release, calls = 0;
  const enteredPromise = new Promise(resolve => {entered = resolve;});
  const blocked = new Promise(resolve => {release = resolve;});
  const {runner, changes} = harness({WorkerClass: undefined, yieldTask: async () => {}, runSuite: async input => {
    calls++; if (calls === 1) {entered(); await blocked;} return result(input.length);
  }, predictSuite: () => ({estimates: []})});
  await runner.train(rows(10)); await enteredPromise;
  await runner.train(rows(30)); release(); await drain(); await drain();
  assert.equal(calls, 2);
  assert.equal(runner.state.report.history.acceptedCount, 30);
  assert.ok(changes.every(change => change.report?.history?.acceptedCount !== 10));
  runner.stop();
});

test('fallback predictions retain private fits internally and expose only informational outputs', async () => {
  let capturedFit, capturedValidation;
  const fitted = result(10);
  const {runner} = harness({WorkerClass: undefined, yieldTask: async () => {}, runSuite: async () => fitted,
    predictSuite: (fit, input, options) => {capturedFit = fit; capturedValidation = options.validation;
      return {estimates: [{modelId: 'test', target: 10, horizon: 1, probability: .1}], consensus: {status: 'abstain', signals: []}, zones: []};}});
  runner.predict(rows(3));
  await runner.train(rows(10)); await drain();
  assert.equal(capturedFit, fitted.fits);
  assert.equal(capturedValidation, fitted.validation);
  assert.equal(runner.state.forecast.estimates[0].probability, .1);
  assert.equal(runner.state.report.fits, undefined);
  assert.equal(runner.state.forecast.sourceLastAt, NOW - 20000);
  assert.equal(runner.state.forecast.sourceLastId, 'r2');
  assert.equal(runner.state.forecast.sourceHeadSignature, '["r2"]');
  runner.stop();
});

test('oversized tied-head origins do not publish a truncated freshness signature', async () => {
  const {runner} = harness({WorkerClass: undefined, yieldTask: async () => {}, runSuite: async () => result(10),
    predictSuite: () => ({estimates: []})});
  await runner.train(rows(10)); await drain();
  runner.predict(Array.from({length: 40}, (_, i) => ({id: String(i).padStart(2, '0') + 'x'.repeat(80), timestamp: NOW - 1000, coefficient: 2})));
  assert.equal(runner.state.forecast.sourceLastAt, NOW - 1000);
  assert.equal(runner.state.forecast.sourceHeadSignature, null);
  runner.stop();
});

test('stop terminates and revokes, ignores later callbacks and never restarts', async () => {
  const {runner, workers, changes, revoked} = harness();
  await runner.train(rows(5));
  const callback = workers[0].onmessage, id = runner.state.generation, count = changes.length;
  runner.stop();
  callback({data: {type: 'trained', generation: id, report: result(5)}});
  assert.equal(runner.state.status, 'stopped');
  assert.equal(changes.length, count);
  assert.equal(workers[0].terminated, true);
  assert.equal(revoked.length, 1);
  assert.equal(await runner.train(rows(5)), false);
  assert.equal(runner.predict(rows(5)), false);
  assert.equal(runner.resume(), false);
});

test('invalid training and computation errors fail closed without inventing a consensus', async () => {
  const {runner} = harness({WorkerClass: undefined, yieldTask: async () => {}, runSuite: async () => {throw Error('test fit error');}});
  assert.equal(await runner.train(null), false);
  assert.equal(runner.state.status, 'error');
  await runner.train(rows(5)); await drain();
  assert.equal(runner.state.status, 'error');
  assert.equal(runner.state.forecast, null);
  assert.match(runner.state.message, /test fit error/);
  runner.stop();
});

test('public reports recursively omit raw records, fitted arrays and per-observation loss vectors', () => {
  const input = {...result(3), validation: {models: [{key: 'valid', days: [{n: 20, hits: 3, losses: [1, 2]}],
    fits: {raw: ['bad']}, typed: new Float64Array(100)}]}, secretExtra: 'not a public field'};
  const value = publicStatisticsReport(input);
  assert.equal(value.secretExtra, undefined);
  assert.equal(value.validation.models[0].fits, undefined);
  assert.equal(value.validation.models[0].days[0].losses, undefined);
  assert.equal(value.validation.models[0].typed, null);
  assert.ok(Object.isFrozen(value.validation.models[0].days));
  assert.equal(value.validation.models[0].days[0].n, 20);
});

test('the actual local worker keeps fits private and predicts from its completed calculation', async () => {
  const before = globalThis.self, sent = [], scope = {postMessage: value => sent.push(value)};
  globalThis.self = scope;
  try {
    await import('../safari/src/statistics/worker.mjs?contract-test');
    await scope.onmessage({data: {type: 'train', generation: 17, rows: rows(30), now: NOW}});
    const trained = sent.find(value => value.type === 'trained');
    assert.ok(trained, sent.find(value => value.type === 'error')?.message);
    assert.equal(trained.report.fits, undefined);
    assert.equal(trained.report.history.acceptedCount, 30);
    await scope.onmessage({data: {type: 'predict', generation: 17, predictionId: 3, rows: rows(10), now: NOW}});
    const prediction = sent.find(value => value.type === 'predicted');
    assert.equal(prediction.predictionId, 3);
    assert.ok(Array.isArray(prediction.forecast.estimates));
    assert.equal(prediction.forecast.consensus.status, 'abstain');
  } finally {if (before === undefined) delete globalThis.self; else globalThis.self = before;}
});

test('Safari-targeted bundled source runs as a classic local worker without imports', async () => {
  const {build} = createRequire(new URL('../safari/package.json', import.meta.url))('esbuild');
  const bundle = await build({entryPoints: [new URL('../safari/src/statistics/worker.mjs', import.meta.url).pathname],
    bundle: true, platform: 'browser', format: 'iife', target: ['safari15'], write: false});
  const sent = [], scope = {postMessage: value => sent.push(value)};
  vm.runInNewContext(bundle.outputFiles[0].text, {self: scope, setTimeout, clearTimeout});
  await scope.onmessage({data: {type: 'train', generation: 91, rows: rows(30), now: NOW}});
  const trained = sent.find(value => value.type === 'trained');
  assert.ok(trained, sent.find(value => value.type === 'error')?.message);
  assert.equal(trained.report.fits, undefined);
  assert.equal(trained.report.history.acceptedCount, 30);
  assert.equal(typeof scope.onmessage, 'function');
});
