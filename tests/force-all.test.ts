// Show everything (engine/force-all.ts; the inspector's "Show everything"): every collateral and every fixed shunt open by forging a COPY of the engine frame, the live model untouched, a frame held by Compare never taken, and
// nothing left behind when it is switched off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import type { EngineFrame } from '../src/engine/protocol.ts';
import { adoptFrame, holdFrame, latest, live } from '../src/engine/store.ts';
import { COLLATERAL_IDS, FORCE_FLOW, FORCE_SHUNTS, forceState, forgeFrame, forcing, setForce } from '../src/engine/force-all.ts';
import { SHUNT_IDS, presenceOf } from '../src/scene/vessels/network.ts';
import { NETWORK } from '../src/scene/vessels/network.ts';

const N = (EDGES as unknown[]).length;
const ix = (id: string) => (EDGES as { id: string }[]).findIndex((e) => e.id === id);
const frame = (gen = 1): EngineFrame => ({
  type: 'frame', changed: true, gen, jump: false, t: gen, day: 0, running: true, speed: 1, clock: 'hemo', pulsing: false, morphing: false, settling: false, phase: 0,
  P: new Float32Array(60), Pf: new Float32Array(60), Q: new Float32Array(N).fill(1), Qf: new Float32Array(N).fill(1), ext: new Float32Array(N), D: new Float32Array(N).fill(5),
  metrics: { hvpg: 5, whvp: 10, fhvp: 5 } as never, events: [],
});

test('forgeFrame opens every collateral to its full diameter and every fixed shunt, on a copy', () => {
  const f = frame();
  for (const id of [...COLLATERAL_IDS, ...FORCE_SHUNTS.map(([i]) => i)]) { f.D[ix(id)] = 0; f.Qf[ix(id)] = 0; f.Q[ix(id)] = 0; }
  f.Qf[ix('C6')] = -1;   // a collateral that runs backwards keeps its direction
  const D0 = Float32Array.from(f.D);
  const g = forgeFrame(f, { collaterals: true, shunts: true });
  assert.notEqual(g, f); assert.deepEqual([...f.D], [...D0], 'the model\'s frame is untouched');
  for (const e of EDGES as { id: string; kind: string; dMax?: number }[]) if (e.kind === 'collateral') assert.equal(g.D[ix(e.id)], e.dMax, e.id);
  for (const [id, d] of FORCE_SHUNTS) assert.equal(g.D[ix(id)], d, id);
  assert.equal(g.Qf[ix('C2')], FORCE_FLOW); assert.equal(g.Qf[ix('C6')], -FORCE_FLOW);
  assert.equal(g.D[ix('PV_TRUNK')], 5, 'no other vessel changes');
  // and the scene's own rule draws them all
  const shown = (id: string) => { const v = NETWORK.find((n) => n.id === id); return v ? presenceOf(v, g, { collaterals: false }) : 'missing'; };
  for (const id of COLLATERAL_IDS) { const v = NETWORK.find((n) => n.id === id); if (v) assert.equal(shown(id), 'shown', id); }
  for (const id of SHUNT_IDS) assert.equal(shown(id), 'shown', id);
  const none = forgeFrame(f, { collaterals: false, shunts: false });
  assert.equal(none, f, 'nothing forced: the same frame');
  const only = forgeFrame(f, { collaterals: false, shunts: true });
  assert.equal(only.D[ix('C2')], 0); assert.equal(only.D[ix('TIPS')], 8);
  assert.ok(COLLATERAL_IDS.length >= 10, 'C1a, C1b, C2 to C9');
});

test('the held frame follows the model, a frozen one does not, Compare\'s is never taken, and off puts the live frame back', () => {
  adoptFrame(frame(1));
  const live1 = live.frame!;
  assert.equal(latest.frame, live1);
  assert.equal(setForce({ collaterals: true }), true);
  assert.equal(forcing(), true); assert.notEqual(latest.frame, live1); assert.equal(latest.frame!.D[ix('C2')], 6);
  assert.deepEqual(forceState(), { collaterals: true, shunts: false, freeze: false });
  const v = latest.version;
  adoptFrame(frame(2));
  assert.equal(latest.frame!.gen, 2, 'the next live frame is forged in its turn'); assert.equal(latest.frame!.D[ix('C2')], 6); assert.ok(latest.version > v);
  assert.equal(setForce({ freeze: true }), true);
  const frozen = latest.frame;
  adoptFrame(frame(3));
  assert.equal(latest.frame, frozen, 'frozen: later frames are not shown'); assert.equal(live.frame!.gen, 3, 'the model goes on');
  assert.equal(setForce({ shunts: true }), true);
  assert.equal(latest.frame!.gen, 3, 'a change of what is forced remakes the frozen frame from the newest'); assert.equal(latest.frame!.D[ix('TIPS')], 8);
  assert.equal(setForce({ collaterals: false, shunts: false, freeze: false }), true);
  assert.equal(forcing(), false); assert.equal(latest.frame, live.frame);
  // Compare's Then view holds a frame: not taken over
  const then = frame(0); holdFrame(then);
  assert.equal(setForce({ collaterals: true }), false); assert.equal(latest.frame, then);
  adoptFrame(frame(4)); assert.equal(latest.frame, then);
  holdFrame(null);
  assert.equal(latest.frame, live.frame);
  assert.equal(forceState().collaterals, false);
});

test('only forged frames are copies: the live frame\'s arrays are never written', () => {
  adoptFrame(frame(5));
  const D = Float32Array.from(live.frame!.D);
  setForce({ collaterals: true, shunts: true });
  adoptFrame(frame(6));
  assert.deepEqual([...live.frame!.D], new Array(N).fill(5));
  assert.notDeepEqual([...latest.frame!.D], [...D]);
  setForce({ collaterals: false, shunts: false, freeze: false });
});
