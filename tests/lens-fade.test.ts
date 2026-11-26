// One fade for a lens change, in every view (lenses/fade.ts; owner, 26 Nov: the Lobule switched lenses at once while the vessels crossfaded). The vessels' GPU crossfade, the Lobule's
// vertex colours and the Sinusoid's lumen and red cells all step a LensFade: the same 420 ms, the same curve, the same "a view coming back lands at once". Node only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { LENS_MS, LensFade, lensMix } from '../src/scene/lenses/fade.ts';
import { LensField } from '../src/scene/lenses/field.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { Lobule3D } from '../src/scene/micro3d/lobule3d.ts';
import type { LobuleModel } from '../src/scene/lobule/model.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import { sinusoidLumen } from '../src/scene/sinusoid/lens.ts';
import { frameFor } from './b3-frames.ts';

const lane = (a: number[]): [number[], number[]] => [a, a];
const model = (o: Partial<LobuleModel> = {}): LobuleModel => ({
  zone: { pre: 1, sin: 1, post: 1 }, Qs: { pre: 18, sin: 9, post: 18 }, Q0: { pre: 18, sin: 12, post: 18 }, oxy: [0.85, 0.78, 0.7], P1: 20, P2: 14, P3: 6, P4: 4,
  flow: 1, portal: 1, art: 1, rev: { pre: false, sin: false, post: false },
  lymph: 0.9, lymph0: 0.9, lyProt: 0.87, sigma: 0.15, iap: 5, alb: 4, s: 0, cong: 0, fibSin: 0, fibPre: 0, fibPost: 0, congU: 0, shuntU: 0, septU: 0, act: 0,
  lanes: { origin: { pre: lane([0.5, 0.1, 0.2, 0.2]), sin: lane([0.4, 0.1, 0.2, 0.3]), post: lane([0.4, 0.1, 0.2, 0.3]) }, pass: { pre: lane([0.8, 0, 0, 0.2]), sin: lane([0.4, 0.4, 0, 0.2]), post: lane([0, 0.8, 0, 0.2]) } },
  ...o,
} as LobuleModel);
const HALF = LENS_MS / 2, K = lensMix(0.5);

test('the one fade: 420 ms, one curve, it ends on the frame it lands, an instant change lands at once', () => {
  const f = new LensFade();
  assert.equal(f.moving, false); assert.equal(f.mix, 1);
  f.start(1000, false);
  assert.equal(f.mix, 0); assert.equal(f.moving, true);
  assert.equal(f.step(1000 + HALF), K);
  assert.ok(K > 0.4 && K < 0.6);
  assert.equal(f.step(1000 + LENS_MS), 1); assert.equal(f.moving, false);
  f.start(2000, true); assert.equal(f.mix, 1); assert.equal(f.moving, false);
});

test('the vessels (Anatomy, Circuit) crossfade by it', async () => {
  const h = await frameFor('healthy');
  const field = new LensField();
  field.setContext({ healthy: h.healthy, ref: Float32Array.from(h.healthy.P) });
  field.onFrame(h.frame as never);
  field.setLens('pressure', 0, true); field.step(0);
  field.setLens('oxygen', 1000);
  field.step(1000 + HALF);
  assert.equal(field.shared.lensMix.value, K);
  field.step(1000 + LENS_MS);
  assert.equal(field.shared.lensMix.value, 1); assert.equal(field.fading, false);
});

test('the Lobule fades its vessels\' colours from the old lens to the new by it (it switched at once)', () => {
  const flat = new LobuleView(createShared()), l3 = new Lobule3D(flat, createShared());
  flat.snapModel(model()); flat.setVisible(true); flat.setLens('pressure');
  l3.buildForTest('light');
  let t = 1000;
  for (let i = 0; i < 5; i++) { t += 16; flat.update(t); l3.update(true, 0, t, 1, true); }
  const arr = () => ((l3 as unknown as { sin: { s0: { geometry: { getAttribute(k: string): { array: Float32Array } } } } }).sin.s0.geometry.getAttribute('color').array).slice();
  const before = arr();
  flat.setLens('oxygen');
  const t0 = t + 16; flat.update(t0); assert.equal(l3.update(true, 0, t0, 1, true), true, 'the lobule asks for frames while it fades');
  flat.update(t0 + HALF); l3.update(true, 0, t0 + HALF, 1, true);
  const mid = arr();
  for (let i = 0; i < 30; i++) { flat.update(t0 + HALF + 16 * i); l3.update(true, 0, t0 + HALF + 16 * i, 1, true); }
  const after = arr();
  let checked = 0;
  for (let i = 0; i < before.length; i++) {
    const d = after[i]! - before[i]!;
    if (Math.abs(d) < 0.05) continue;
    assert.ok(Math.abs((mid[i]! - before[i]!) / d - K) < 1e-4, `vertex value ${i} is at the fade's share halfway`);
    checked++;
  }
  assert.ok(checked > 100, `the lens changed the colours (${checked})`);
});

test('the Lobule shown again after a lens change while hidden lands at once (no fade from a lens nobody saw)', () => {
  const src = readFileSync(new URL('../src/scene/micro3d/lobule3d.ts', import.meta.url), 'utf8');
  assert.match(src, /if \(hide \|\| !shown\) \{ this\.inkLens = null; return changed; \}/);
});

test('the Sinusoid\'s lumen fades by it, on the same share as the vessels', () => {
  const v = new SinusoidView(createShared(), { look: 'light' });
  const ctx = { lens: 'pressure' as const, look: 'light' as const, model: model(), ref: null, fibSin: 0 };
  v.setVisible(true); v.setInk(ctx);
  for (let t = 0; t <= 200; t += 16) v.update(t);
  const from = sinusoidLumen(ctx, 'pressure', [0, 0, 0]), to = sinusoidLumen(ctx, 'oxygen', [0, 0, 0]);
  v.setInk(ctx, 'oxygen'); v.update(1000); v.update(1000 + HALF);
  const mid = (v.colours(false) as { cLumen: number[] }).cLumen;
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(mid[i]! - (from[i]! + (to[i]! - from[i]!) * K)) < 1e-6, `channel ${i}`);
  v.setInk(ctx, 'origin'); v.update(2000); v.update(2000 + HALF);
  assert.equal(v.cellColours?.mix, K, 'the red cells fade to their sources on the same share');
  assert.equal(v.cellColours?.from, null, 'from their own red');
});

test('no view keeps a lens timer or curve of its own', () => {
  for (const f of ['../src/scene/lenses/field.ts', '../src/scene/sinusoid/view.ts', '../src/scene/micro3d/lobule3d.ts']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.match(src, /new LensFade\(\)/, `${f} steps the one fade`);
    assert.doesNotMatch(src, /\/ LENS_MS/, `${f} divides no time of its own by LENS_MS`);
    assert.doesNotMatch(src, /easeInOutCubic/, `${f} has no curve of its own`);
  }
});
