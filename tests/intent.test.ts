import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, setLayer, clearLayer, useIntent, resolved, EMPTY_INTENT, LAYER_ORDER, type Layers, type LayerName, type FigureIntent } from '../src/scene/intent.ts';
import { reconcile, startReconciler, type ReconcileTarget } from '../src/scene/reconcile.ts';

// A scene stand-in: it records every call and keeps the state the calls leave (what the real scene would show).
function fakeScene() {
  const calls: string[] = [];
  const state = { named: [] as readonly string[], pins: [] as readonly string[], normalSpleen: false, sinceRef: null as ArrayLike<number> | null };
  const to: ReconcileTarget = {
    setNamedVessels(ids) { calls.push('named'); state.named = ids; },
    pinOrgans(ids, ns = false) { calls.push('pins'); state.pins = ids; state.normalSpleen = ns; },
    setSinceRef(P) { calls.push('since'); state.sinceRef = P; },
  };
  return { calls, state, to };
}
const reset = () => useIntent.setState({ layers: {} });

test('the topmost layer that says anything about a field decides it; a field no layer says is empty', () => {
  const l: Layers = { base: { named: ['a'], pins: ['p'] }, talk: { named: ['b'] }, tool: { pins: [] } };
  const r = resolve(l);
  assert.deepEqual(r.named, ['b'], 'talk over base');
  assert.deepEqual(r.pins, [], 'tool over base: an empty list is a statement');
  assert.equal(r.normalSpleen, false); assert.equal(r.sinceRef, null);
  assert.deepEqual(resolve({}), EMPTY_INTENT);
});

test('clearing a layer shows what was under it, with no cleanup code', () => {
  reset();
  setLayer('base', { named: ['pick'] });
  setLayer('talk', { named: ['slide'], pins: ['liver'] });
  assert.deepEqual(resolved().named, ['slide']);
  setLayer('tool', { named: ['target'] });
  assert.deepEqual(resolved().named, ['target'], 'the tool is on top');
  clearLayer('tool'); assert.deepEqual(resolved().named, ['slide']);
  clearLayer('talk'); assert.deepEqual(resolved().named, ['pick']); assert.deepEqual(resolved().pins, []);
  clearLayer('talk');   // (clearing what is not there is nothing)
  reset();
});

test('the reconciler calls only for what changed, and none for a repeat', () => {
  const f = fakeScene(); let a: FigureIntent = EMPTY_INTENT;
  a = reconcile(a, { ...EMPTY_INTENT, named: ['x'] }, f.to);
  a = reconcile(a, { ...EMPTY_INTENT, named: ['x'] }, f.to);            // (a new array with the same ids: nothing)
  a = reconcile(a, { ...EMPTY_INTENT, named: ['x'], pins: ['o'], normalSpleen: true }, f.to);
  const P = [1, 2];
  a = reconcile(a, { ...EMPTY_INTENT, named: ['x'], pins: ['o'], normalSpleen: true, sinceRef: P }, f.to);
  reconcile(a, { ...EMPTY_INTENT, named: ['x'], pins: ['o'], normalSpleen: true, sinceRef: P }, f.to);
  assert.deepEqual(f.calls, ['named', 'pins', 'since']);
  assert.deepEqual(f.state.pins, ['o']); assert.equal(f.state.normalSpleen, true); assert.equal(f.state.sinceRef, P);
});

test('property: random layers pushed and popped; the scene always shows the resolved intent, and base alone shows base', () => {
  let seed = 7; const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const ids = ['a', 'b', 'c', 'd'];
  const pick = () => ids.filter(() => rnd(2) === 0);
  for (let round = 0; round < 40; round++) {
    reset();
    const f = fakeScene(); const stop = startReconciler(f.to);
    setLayer('base', { named: pick(), pins: pick() });
    for (let step = 0; step < 30; step++) {
      const name = LAYER_ORDER[rnd(3)] as LayerName;
      if (rnd(3) === 0) clearLayer(name); else setLayer(name, rnd(2) ? { named: pick() } : { pins: pick(), normalSpleen: rnd(2) === 0, sinceRef: rnd(2) ? [rnd(9)] : null });
      const want = resolved();
      assert.deepEqual(f.state.named, want.named); assert.deepEqual(f.state.pins, want.pins);
      assert.equal(f.state.normalSpleen, want.normalSpleen); assert.equal(f.state.sinceRef, want.sinceRef);
    }
    clearLayer('talk'); clearLayer('tool');
    const left = resolve({ base: useIntent.getState().layers.base });   // (the walk may have written base too: what is left of it is what shows)
    assert.deepEqual(f.state.named, left.named, 'only base left: base shows');
    assert.deepEqual(f.state.pins, left.pins); assert.equal(f.state.normalSpleen, left.normalSpleen); assert.equal(f.state.sinceRef, left.sinceRef);
    stop();
  }
  reset();
});

test('open a talk, five slides, close: the scene ends as it began', () => {
  reset();
  const f = fakeScene(); const stop = startReconciler(f.to);
  setLayer('base', { named: ['picked'] });
  const before = JSON.stringify(f.state);
  for (let i = 0; i < 5; i++) setLayer('talk', { named: [`s${i}`], pins: [`o${i}`], normalSpleen: i % 2 === 0, sinceRef: i % 2 ? [i] : null });
  assert.deepEqual(f.state.named, ['s4']);
  clearLayer('talk');
  assert.equal(JSON.stringify(f.state), before);
  stop(); reset();
});
