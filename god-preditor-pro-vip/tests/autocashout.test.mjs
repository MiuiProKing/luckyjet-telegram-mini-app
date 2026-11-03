import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutoCashout} from '../safari/src/autocashout.mjs';

function harness() {
  let time = 10000, mono = 1000, epoch = 0, value = 8, changedAt = time, sourceState = 'ready';
  let sourcePatch = {}, contextPatch = {}, clickHook = () => {}, changeHook = () => {}, readHook = () => {};
  const buttons = [{index: 0, state: 'waiting', label: 'Cancel'}, {index: 1, state: 'waiting', label: 'Cancel'}];
  const clicks = [], fatals = [];
  const controller = createAutoCashout({
    now: () => time, monotonic: () => mono,
    context: () => ({visible: true, fresh: true, autoBetArmed: true, autoBetMode: 'live', buttonsConfigured: [true, true], ...contextPatch}),
    readMultiplier: () => {readHook(); return {state: sourceState, value: sourceState === 'ready' ? value : null, epoch, at: time, changedAt, ...sourcePatch};},
    inspectCashout: button => ({state: button.state, label: button.label, reason: 'mock button unsafe'}),
    clickCashout: button => {clicks.push(button.index); clickHook(button);},
    onChange: () => changeHook(), onFatal: reason => fatals.push(reason)
  });
  return {
    controller, buttons, clicks, fatals,
    advance(ms = 100) {time += ms; mono += ms;},
    sample(next, ms = 100, {reset = false, tick = true} = {}) {
      this.advance(ms);
      if (reset) epoch++;
      if (next !== value) changedAt = time;
      value = next;
      sourceState = 'ready';
      if (tick) controller.tick();
    },
    tick(ms = 100) {this.advance(ms); controller.tick();},
    dispatch({index = 0, target = 2, windowKey = 'window-a', mode = controller.state.mode, ...extra} = {}) {
      return controller.onBetDispatched({index, target, windowKey, mode, at: time, button: buttons[index], ...extra});
    },
    arm(mode = 'live') {assert.equal(controller.arm(mode), true);},
    ready(index = 0) {buttons[index].state = 'ready'; buttons[index].label = 'Cashout';},
    start(index = 0) {this.ready(index); this.sample(1.01, 100, {reset: true});},
    setContext(patch) {contextPatch = {...contextPatch, ...patch};},
    setSource(patch) {sourcePatch = patch;},
    waiting() {sourceState = 'waiting';},
    unsafe() {sourceState = 'unsafe';},
    setClock(wallDelta, monoDelta) {time += wallDelta; mono += monoDelta;},
    onClick(fn) {clickHook = fn;},
    onChange(fn) {changeHook = fn;},
    onRead(fn) {readHook = fn;},
    get time() {return time;},
    get changedAt() {return changedAt;}
  };
}

test('OFF on construction and no enrollment of existing/manual Cashout stakes', () => {
  const h = harness();
  assert.equal(h.controller.state.armed, false);
  assert.equal(h.dispatch(), false);
  h.ready(); h.arm();
  h.sample(1.01, 100, {reset: true});
  h.sample(2); h.sample(70);
  assert.deepEqual(h.clicks, []);
  assert.deepEqual(h.controller.state.pending, []);
});

test('frozen target 2 uses two increasing changes and exactly one request', () => {
  const h = harness(); h.arm();
  const receipt = {index: 0, target: 2, windowKey: 'frozen', mode: 'live', at: h.time, button: h.buttons[0]};
  assert.equal(h.controller.onBetDispatched(receipt), true);
  receipt.target = 70;
  h.start();
  h.sample(2.1);
  assert.deepEqual(h.clicks, []);
  h.sample(2.2);
  assert.deepEqual(h.clicks, [0]);
  assert.equal(h.controller.state.pending.length, 0);
  assert.deepEqual(h.controller.state.consumed, ['frozen:0']);
  assert.equal(h.dispatch({windowKey: 'frozen', target: 80}), false);
  h.buttons[0].state = 'closed'; h.tick(); h.sample(90);
  assert.deepEqual(h.clicks, [0]);
  assert.equal(h.controller.state.armed, true);
  assert.match(h.controller.state.logs.at(-1).text, /кнопка изменилась/);
  assert.ok(h.controller.state.logs.every(x => !/выигрыш|выплачен/i.test(x.text)));
});

test('frozen target 70 never follows a later lower forecast', () => {
  const h = harness(); h.arm();
  const receipt = {index: 0, target: 70, windowKey: 'seventy', mode: 'live', at: h.time, button: h.buttons[0]};
  h.controller.onBetDispatched(receipt); receipt.target = 2;
  h.start(); h.sample(2); h.sample(3);
  assert.deepEqual(h.clicks, []);
  h.sample(69.99); assert.deepEqual(h.clicks, []);
  h.sample(70); assert.deepEqual(h.clicks, [0]);
});

test('two fields keep independent targets and same selected button objects', () => {
  const h = harness(); h.arm(); h.dispatch({index: 0, target: 2}); h.dispatch({index: 1, target: 70});
  h.ready(0); h.ready(1); h.sample(1.01, 100, {reset: true});
  h.sample(1.5); h.sample(2);
  assert.deepEqual(h.clicks, [0]);
  assert.deepEqual(h.controller.state.pending.map(x => [x.index, x.target]), [[1, 70]]);
  h.buttons[0].state = 'closed'; h.sample(70);
  assert.deepEqual(h.clicks, [0, 1]);
});

test('old high multiplier and repeated reads cannot enroll or trigger', () => {
  const h = harness(); h.arm(); h.dispatch(); h.ready();
  h.sample(9); h.sample(10); h.sample(11);
  for (let i = 0; i < 10; i++) h.tick(100);
  assert.deepEqual(h.clicks, []);
  assert.equal(h.controller.state.pending[0].phase, 'waiting');
  assert.equal(h.controller.state.armed, true);
});

test('a pre-dispatch low value is not post-dispatch round evidence', () => {
  const h = harness(); h.sample(1.01, 100, {tick: false});
  h.arm(); h.dispatch(); h.ready();
  h.tick(); h.sample(1.5); h.sample(2); h.sample(3);
  assert.deepEqual(h.clicks, []);
  assert.equal(h.controller.state.pending[0].phase, 'waiting');
});

test('post-dispatch low evidence permits flight without an epoch increment', () => {
  const h = harness(); h.arm(); h.dispatch(); h.ready();
  h.sample(1.1); h.sample(1.5); h.sample(2);
  assert.deepEqual(h.clicks, [0]);
});

test('unchanged high reads do not count as the second increasing change', () => {
  const h = harness(); h.arm(); h.dispatch(); h.start(); h.sample(2.1);
  for (let i = 0; i < 7; i++) h.tick(100);
  assert.deepEqual(h.clicks, []);
  assert.equal(h.controller.state.pending[0].increases, 1);
  h.tick(100);
  assert.deepEqual(h.clicks, []);
  assert.equal(h.controller.state.armed, false);
  assert.equal(h.fatals.length, 1);
});

test('increases while waiting do not count toward the Cashout-ready proof', () => {
  const h = harness(); h.arm(); h.dispatch();
  h.sample(1.01, 100, {reset: true}); h.sample(1.5); h.sample(2.1);
  h.ready(); h.sample(2.2); h.sample(2.3);
  assert.deepEqual(h.clicks, []);
  h.sample(2.4); assert.deepEqual(h.clicks, [0]);
});

test('queued Bet during the previous low flight does not consume its next flight', () => {
  const h = harness(); h.sample(1.05, 100, {tick: false}); h.arm(); h.dispatch();
  h.sample(1.06); h.sample(1.07);
  assert.equal(h.controller.state.pending[0].phase, 'waiting');
  h.start();
  assert.equal(h.controller.state.pending[0].phase, 'tracking');
  h.sample(1.5); h.sample(2);
  assert.deepEqual(h.clicks, [0]);
});

test('reset closes the old target, keeps enabled, and needs a NEW signal receipt', () => {
  const h = harness(); h.arm(); h.dispatch({target: 70}); h.start(); h.sample(2); h.sample(3);
  h.sample(1.01, 100, {reset: true}); h.sample(70); h.sample(80);
  assert.deepEqual(h.clicks, []);
  assert.equal(h.controller.state.armed, true);
  assert.deepEqual(h.controller.state.pending, []);
  assert.equal(h.dispatch({target: 2}), false);
  assert.equal(h.dispatch({target: 2, windowKey: 'window-b'}), true);
  h.sample(1.01, 100, {reset: true}); h.sample(1.5); h.sample(2);
  assert.deepEqual(h.clicks, [0]);
});

test('any decrease closes old tracking even if a monitor epoch did not advance', () => {
  const h = harness(); h.arm(); h.dispatch({target: 70}); h.start(); h.sample(2); h.sample(3);
  h.sample(2.995); h.sample(80);
  assert.deepEqual(h.clicks, []);
  assert.deepEqual(h.controller.state.pending, []);
  assert.equal(h.controller.state.armed, true);
});

test('returning to Bet after Cashout clears the record without a payout claim', () => {
  const h = harness(); h.arm(); h.dispatch({target: 70}); h.start(); h.sample(2);
  h.buttons[0].state = 'closed'; h.tick();
  h.sample(80); h.sample(90);
  assert.deepEqual(h.clicks, []);
  assert.deepEqual(h.controller.state.pending, []);
  assert.equal(h.controller.state.armed, true);
  assert.match(h.controller.state.message, /результат не подтверждён/);
});

test('closed before Cashout readiness waits instead of attaching to an old stake', () => {
  const h = harness(); h.arm(); h.dispatch(); h.buttons[0].state = 'closed'; h.tick();
  assert.equal(h.controller.state.pending.length, 1);
  h.start(); h.sample(1.5); h.sample(2);
  assert.deepEqual(h.clicks, [0]);
});

test('test mode watches targets but invokes zero click callbacks', () => {
  const h = harness(); h.setContext({autoBetArmed: false, buttonsConfigured: [false, false]}); h.arm('test');
  assert.equal(h.dispatch({mode: 'live'}), false);
  assert.equal(h.dispatch({mode: 'test'}), true);
  h.start(); h.sample(2); h.sample(3);
  assert.deepEqual(h.clicks, []);
  assert.deepEqual(h.controller.state.pending, []);
  assert.deepEqual(h.controller.state.acknowledgements, []);
  assert.match(h.controller.state.message, /ТЕСТ.*нажатий нет/);
});

test('live mode ignores test receipts and requires auto betting plus both fields', () => {
  const h = harness(); h.arm();
  assert.equal(h.dispatch({mode: 'test'}), false);
  h.controller.disarm(); h.setContext({autoBetMode: 'test'});
  assert.equal(h.controller.arm('live'), false);
  h.setContext({autoBetMode: 'live', buttonsConfigured: [true, false]});
  assert.equal(h.controller.arm('live'), false);
  assert.deepEqual(h.clicks, []);
});

test('pre-Bet gate is live-only and never creates or consumes receipt ownership', () => {
  const h = harness();
  assert.equal(h.controller.canTrackBet(0), false);
  h.arm('test'); assert.equal(h.controller.canTrackBet(0), false);
  h.arm();
  assert.equal(h.controller.canTrackBet(0), true);
  assert.equal(h.controller.canTrackBet(1), true);
  assert.deepEqual(h.controller.state.pending, []);
  assert.deepEqual(h.controller.state.consumed, []);
  assert.equal(h.dispatch(), true);
  assert.equal(h.controller.canTrackBet(0), false);
  assert.equal(h.controller.state.armed, false);
  assert.equal(h.fatals.length, 1);
  assert.deepEqual(h.clicks, []);
});

test('pre-Bet gate rejects a delayed timer, unreadable source or read exception before dispatch', () => {
  for (const fault of ['delay', 'unsafe', 'throw']) {
    const h = harness(); h.arm();
    if (fault === 'delay') h.advance(1001);
    if (fault === 'unsafe') h.unsafe();
    if (fault === 'throw') h.onRead(() => {throw Error('mock read failure');});
    assert.equal(h.controller.canTrackBet(0), false);
    assert.equal(h.controller.state.armed, false);
    assert.equal(h.fatals.length, 1);
    assert.deepEqual(h.controller.state.pending, []);
    assert.deepEqual(h.controller.state.consumed, []);
    assert.deepEqual(h.clicks, []);
  }
});

test('pre-Bet gate rechecks the clock after reading the adapter', () => {
  const h = harness(); h.arm(); h.advance(900); h.onRead(() => h.advance(200));
  assert.equal(h.controller.canTrackBet(0), false);
  assert.equal(h.controller.state.armed, false);
  assert.equal(h.fatals.length, 1);
  assert.deepEqual(h.clicks, []);
});

test('old, future, invalid and duplicate receipts never create new ownership', () => {
  const h = harness(); h.arm();
  for (const extra of [{at: h.time - 1}, {at: h.time + 1}, {target: NaN}, {target: 0}, {index: 3}, {button: null}]) {
    assert.equal(h.dispatch(extra), false);
  }
  h.dispatch(); h.controller.disarm(); h.arm();
  assert.equal(h.dispatch(), false);
  assert.deepEqual(h.controller.state.pending, []);
  assert.deepEqual(h.clicks, []);
});

for (const [name, patch] of [
  ['stale read time', h => ({at: h.time - 751})],
  ['future read time', h => ({at: h.time + 1})],
  ['future change time', h => ({changedAt: h.time + 1})],
  ['unknown numeric value', () => ({value: NaN})],
  ['missing epoch', () => ({epoch: undefined})]
]) test(`${name} fails closed and stops future auto bets`, () => {
  const h = harness(); h.arm(); h.dispatch(); h.start(); h.sample(1.5);
  h.setSource(patch(h)); h.controller.tick();
  assert.equal(h.controller.state.armed, false);
  assert.deepEqual(h.clicks, []);
  assert.equal(h.fatals.length, 1);
  assert.deepEqual(h.controller.state.pending, []);
});

test('arming requires a readable numeric source, including in test mode', () => {
  const h = harness(); h.waiting();
  assert.equal(h.controller.arm('test'), false);
  assert.deepEqual(h.clicks, []);
  assert.equal(h.fatals.length, 1);
});

test('adapter read timestamps may advance the clock a few milliseconds', () => {
  const h = harness(); h.onRead(() => h.advance(2));
  h.arm(); h.dispatch(); h.start(); h.sample(1.5); h.sample(2);
  assert.deepEqual(h.clicks, [0]);
  assert.equal(h.fatals.length, 0);
  assert.equal(h.controller.state.armed, true);
});

test('a blocked or backwards-clock adapter read fails closed', () => {
  for (const delta of [1001, -1]) {
    const h = harness(); h.arm(); h.dispatch(); h.start(); h.sample(1.5);
    h.onRead(() => h.advance(delta)); h.sample(2);
    assert.deepEqual(h.clicks, []);
    assert.equal(h.fatals.length, 1);
    assert.equal(h.controller.state.armed, false);
  }
});

test('unsafe source or detached selected button fails closed', () => {
  for (const fault of ['source', 'button']) {
    const h = harness(); h.arm(); h.dispatch(); h.start(); h.sample(1.5);
    if (fault === 'source') h.unsafe(); else h.buttons[0].state = 'unsafe';
    h.tick();
    assert.equal(h.controller.state.armed, false);
    assert.equal(h.fatals.length, 1);
    assert.deepEqual(h.clicks, []);
  }
});

test('source waiting is bounded before flight and is unsafe during tracking', () => {
  const h = harness(); h.arm(); h.dispatch(); h.waiting();
  for (let i = 0; i < 120; i++) h.tick(1000);
  assert.equal(h.controller.state.armed, true);
  h.tick(1);
  assert.equal(h.controller.state.armed, false);
  assert.deepEqual(h.clicks, []);
  const active = harness(); active.arm(); active.dispatch(); active.start(); active.waiting(); active.tick();
  assert.equal(active.controller.state.armed, false);
});

for (const [name, ctx] of [
  ['hidden', {visible: false}], ['stale connection', {fresh: false}],
  ['auto betting stopped', {autoBetArmed: false}], ['auto betting changed mode', {autoBetMode: 'test'}],
  ['button binding lost', {buttonsConfigured: [true, false]}]
]) test(`${name} clears pending and calls the fatal callback`, () => {
  const h = harness(); h.arm(); h.dispatch(); h.start(); h.sample(1.5);
  h.setContext(ctx); h.sample(2);
  assert.equal(h.controller.state.armed, false);
  assert.deepEqual(h.clicks, []);
  assert.equal(h.fatals.length, 1);
});

for (const [name, wall, mono] of [
  ['delayed timer', 1001, 1001], ['wall clock jump', 2000, 100],
  ['wall clock reversal', -1, 100], ['monotonic reversal', 100, -1], ['monotonic delay', 100, 1001]
]) test(`${name} cannot trigger a late request`, () => {
  const h = harness(); h.arm(); h.dispatch(); h.start(); h.sample(1.5);
  h.setClock(wall, mono); h.controller.tick();
  assert.equal(h.controller.state.armed, false);
  assert.deepEqual(h.clicks, []);
  assert.equal(h.fatals.length, 1);
});

test('off switch clears pending and acknowledgements and does not resurrect on rearm', () => {
  const h = harness(); h.arm(); h.dispatch(); h.start(); h.sample(1.5);
  h.controller.disarm(); h.sample(2); h.sample(3);
  assert.deepEqual(h.clicks, []);
  assert.deepEqual(h.controller.state.pending, []);
  assert.deepEqual(h.controller.state.acknowledgements, []);
  assert.equal(h.fatals.length, 0);
  h.arm(); assert.equal(h.dispatch(), false); h.sample(5);
  assert.deepEqual(h.clicks, []);
});

test('a running Cashout amount change is not an acknowledgement; no retries', () => {
  const h = harness(); h.arm(); h.dispatch(); h.start(); h.sample(1.5); h.sample(2);
  assert.deepEqual(h.clicks, [0]);
  h.buttons[0].label = 'Cashout 999';
  h.tick(1000); h.tick(1000); h.tick(500);
  assert.equal(h.controller.state.armed, false);
  assert.deepEqual(h.clicks, [0]);
  assert.equal(h.fatals.length, 1);
  assert.match(h.controller.state.message, /не подтвердила/);
});

test('button waiting or closed acknowledges only a sent request', () => {
  for (const state of ['waiting', 'closed']) {
    const h = harness(); h.arm(); h.dispatch(); h.start(); h.sample(1.5); h.sample(2);
    h.buttons[0].state = state; h.tick();
    assert.deepEqual(h.clicks, [0]);
    assert.deepEqual(h.controller.state.acknowledgements, []);
    assert.equal(h.controller.state.armed, true);
    assert.match(h.controller.state.message, /запрос отправлен, кнопка изменилась/);
  }
});

test('a synchronous throwing click is reserved and never retried', () => {
  const h = harness(); h.onClick(() => {throw Error('mock dispatch failure');});
  h.arm(); h.dispatch(); h.start(); h.sample(1.5); h.sample(2);
  assert.deepEqual(h.clicks, [0]);
  assert.equal(h.controller.state.armed, false);
  h.arm(); assert.equal(h.dispatch(), false); h.sample(3);
  assert.deepEqual(h.clicks, [0]);
});

test('synchronous reentrant tick and disarm cannot dispatch a second field', () => {
  const h = harness(); h.arm(); h.dispatch(); h.dispatch({index: 1});
  h.ready(1); h.start(); h.sample(1.5);
  h.onClick(() => {h.controller.tick(); h.controller.disarm('manual off');});
  h.sample(2);
  assert.deepEqual(h.clicks, [0]);
  assert.deepEqual(h.controller.state.pending, []);
  assert.deepEqual(h.controller.state.acknowledgements, []);
  assert.equal(h.controller.state.armed, false);
});

test('each field rechecks context after the other field sends its request', () => {
  const h = harness(); h.arm(); h.dispatch(); h.dispatch({index: 1});
  h.ready(1); h.start(); h.sample(1.5);
  h.onClick(() => h.setContext({visible: false}));
  h.sample(2);
  assert.deepEqual(h.clicks, [0]);
  assert.equal(h.controller.state.armed, false);
  assert.equal(h.fatals.length, 1);
});

test('observer exceptions fail closed without recursive callback hazards', () => {
  const h = harness(); h.arm(); h.dispatch();
  let calls = 0;
  h.onChange(() => {calls++; throw Error('mock observer failure');});
  h.controller.disarm();
  assert.equal(h.controller.state.armed, false);
  assert.equal(h.fatals.length, 1);
  assert.equal(calls, 1);
  assert.deepEqual(h.clicks, []);
});


test('queued field closing before Cashout appears ends tracking and waits for NEW forecast',()=>{
 const h=harness();h.arm();h.dispatch({windowKey:'queued-loss',target:70});h.tick();
 h.buttons[0].state='closed';h.tick();
 assert.equal(h.controller.state.armed,true);assert.deepEqual(h.controller.state.pending,[]);assert.deepEqual(h.clicks,[]);
 assert.equal(h.dispatch({windowKey:'queued-loss'}),false);
 assert.equal(h.dispatch({windowKey:'next-forecast',target:2}),true);
 h.start();h.sample(1.5);h.sample(2.01);assert.deepEqual(h.clicks,[0]);
});


test('verified selected counter may wait between flights before a new Bet; cashout waits for live proof',()=>{
 const h=harness();h.arm();h.waiting();assert.equal(h.controller.canTrackBet(0),true);
 assert.equal(h.dispatch({windowKey:'between-flights'}),true);h.tick();assert.deepEqual(h.clicks,[]);
 h.start();h.sample(1.5);h.sample(2.02);assert.deepEqual(h.clicks,[0]);
});
