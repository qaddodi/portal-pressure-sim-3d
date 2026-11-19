import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/engine/host/worker-core.js';
import { type HealthyRef, type LobuleModel, disseProfile, easeToward, lobuleModel, lymphProtein, lymphRate, lymphSeal, sinusoidTargets } from '../src/scene/lobule/model.ts';

// The lobule reads the engine as the 2D app does (lobule-model.js, sinusoid-model.js): same inputs, same targets.
interface Out { type: string; [k: string]: unknown }

async function patient(id: string) {
  const out: Out[] = [];
  const core = createCore((m: Out) => out.push(m));
  await core.handle({ type: 'init' });
  await core.handle({ type: 'run', running: false });
  await core.handle({ type: 'preset', id, reqId: 1 });
  await core.handle({ type: 'healthyProfile', reqId: 2 });
  core.dispose();
  const frame = out.filter((m) => m.type === 'frame').at(-1) as unknown as { P: Float32Array; Q: Float32Array; Qf: Float32Array; Pf: Float32Array; metrics: unknown };
  const params = (out.find((m) => m.type === 'presetLoaded') as unknown as { params: unknown }).params;
  const h = out.find((m) => m.type === 'healthy') as unknown as { P: Float32Array; Q: Float32Array; metrics: { ascites: { hepLymph: number } } };
  const healthy: HealthyRef = { P: h.P, Q: h.Q, hepLymph: h.metrics.ascites.hepLymph };
  return { frame, params, healthy };
}
const model = async (id: string): Promise<LobuleModel> => { const p = await patient(id); return lobuleModel({ P: p.frame.P, Q: p.frame.Q, metrics: p.frame.metrics }, p.healthy, p.params); };

test('a healthy liver: no resistance, no fibrosis, no congestion, flows as the healthy reference, nothing activated', async () => {
  const m = await model('healthy');
  assert.deepEqual(m.zone, { pre: 1, sin: 1, post: 1 });
  assert.equal(m.fibSin, 0); assert.equal(m.septU, 0); assert.equal(m.shuntU, 0); assert.equal(m.act, 0);
  assert.ok(m.congU < 0.05, `congestion ${m.congU}`);
  assert.ok(Math.abs(m.flow - 1) < 0.15, `sinusoid flow ${m.flow}`);
  assert.equal(m.rev.sin, false);
  const t = sinusoidTargets(m);
  assert.ok(t.por > 0.95, 'open pores'); assert.ok(t.col < 0.05); assert.ok(t.bm < 0.05); assert.ok(t.mv > 0.95); assert.ok(Math.abs(t.lum - 1) < 0.1);
});

test('decompensated cirrhosis: the sinusoid is capillarized (sealed pores, collagen, membrane, flat microvilli, activated stellate cell, narrow lumen), the septa and shunts are on, the lymph is thin and fast', async () => {
  const m = await model('cirr-decomp');
  assert.ok(m.s > 0.8);
  assert.ok(m.zone.sin > 5, 'sinusoidal resistance');
  assert.ok(m.septU > 0.9 && m.shuntU > 0.9 && m.act > 0.75);
  const t = sinusoidTargets(m);
  assert.ok(t.por < 0.25, `pores ${t.por}`); assert.ok(t.col > 0.5); assert.ok(t.bm > 0.8); assert.ok(t.mv < 0.5); assert.ok(t.act > 0.75); assert.ok(t.lum < 0.85); assert.ok(t.pinch > 0.15);
  assert.ok(t.filt > 3, `filtration ${t.filt}× healthy`);
  assert.ok(t.prot < 0.3, 'protein-poor lymph');
  assert.ok(lymphRate(m) > 3);
  assert.ok(lymphSeal(m) > 0.5, 'collagen lining of the space of Disse is sealed');
});

test('postsinusoidal block (SOS) and right heart failure congest the central end; the portal-side fibrosis stays off', async () => {
  const sos = await model('sos');
  assert.ok(sos.fibPost > 0.5, 'post fibrosis'); assert.equal(sos.fibPre, 0);
  assert.ok(sos.congU > 0.2, `SOS congestion ${sos.congU}`);
  const rhf = await model('rhf');
  assert.ok(rhf.congU > 0.2, `RHF congestion ${rhf.congU}`);
  assert.ok(sinusoidTargets(rhf).lum > 1, 'congestion dilates the sinusoid');
});

test('wet Disse: the filtered fluid has the model\'s own mean and rises toward the portal edge in cirrhosis', async () => {
  const m = await model('cirr-decomp');
  const lr = lymphRate(m);
  const prof = disseProfile(m, lr);
  const mean = prof.reduce((a, b) => a + b, 0) / prof.length;
  assert.ok(Math.abs(mean - lr) < 1e-3, `mean ${mean} vs rate ${lr}`);
  assert.ok(prof.length === 32);
  assert.ok(prof.at(-1)! > prof[0]!, 'heavier at the portal edge in cirrhosis');
});

test('lymph protein and seal run opposite ways', () => {
  assert.equal(lymphProtein({ lyProt: 0.88 }), 1); assert.equal(lymphProtein({ lyProt: 0.3 }), 0);
  assert.ok(lymphSeal({ lyProt: 0.43 }) > lymphSeal({ lyProt: 0.85 }));
});

test('states ease in and never jump; they land exactly', () => {
  const cur = { a: 0, b: 1 }, goal = { a: 1, b: 0 };
  let t = 0, steps = 0;
  while (easeToward(cur, goal, 16)) { t += 16; steps++; assert.ok(cur.a > 0 && cur.a <= 1); assert.ok(steps < 400); }
  assert.deepEqual(cur, { a: 1, b: 0 });
  assert.ok(t > 500 && t < 3000, `lands in ${t} ms`);
});
