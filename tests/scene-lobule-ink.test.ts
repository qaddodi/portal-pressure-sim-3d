// The lobule's vessels wear the colour lens along their length, as the 2D lobule colours its lumen (lobule-zoom-field.js inkOf / tubeRGB), instead of one flat tone.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createShared } from '../src/scene/materials/cel.ts';
import { samplerFor } from '../src/scene/lenses/model.ts';
import { inkAt, lobuleDelta, sinW } from '../src/scene/lobule/ink.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import type { LobuleModel } from '../src/scene/lobule/model.ts';
import type { BufferAttribute } from 'three';

const model = (o: Partial<LobuleModel> = {}): LobuleModel => ({
  zone: { pre: 1, sin: 1, post: 1 }, Qs: { pre: 18, sin: 9, post: 18 }, Q0: { pre: 18, sin: 9, post: 18 }, oxy: [0.85, 0.8, 0.7], P1: 20, P2: 14, P3: 6, P4: 4,
  flow: 1, portal: 1, art: 1, rev: { pre: false, sin: false, post: false },
  lymph: 0.9, lymph0: 0.9, lyProt: 0.87, sigma: 0.15, iap: 5, alb: 4, s: 0, cong: 0, fibSin: 0, fibPre: 0, fibPost: 0, congU: 0, shuntU: 0, septU: 0, act: 0, ...o,
});
const ctx = (o = {}) => ({ lens: 'pressure' as const, look: 'light' as const, model: model(), ref: null, fibSin: 0, ...o });
const near = (a: readonly number[], b: readonly number[], e = 1e-9) => a.every((v, i) => Math.abs(v - b[i]!) < e);

test('under the pressure lens a vessel wears the ramp\'s colour at its pressure: the portal venule and inlet at the portal pressure, the sinusoids from the sinusoidal to the central, the central vein at its own', () => {
  const c = ctx(), pr = samplerFor('light', 'pressure'), out: [number, number, number] = [0, 0, 0];
  assert.ok(near(inkAt(c, 'pv', 0, out), pr.at(20)));
  assert.ok(near(inkAt(c, 'cv', 1, out), pr.at(6)));
  assert.ok(near(inkAt(c, 'in', 0, out), pr.at(20)), 'the inlet starts at the portal pressure');
  assert.ok(near(inkAt(c, 'in', 1, out), pr.at(16.5)), 'and reaches 60% of the way to the sinusoidal (to the half mmHg)');
  assert.ok(near(inkAt(c, 'sin', 1, out), pr.at(14)) && near(inkAt(c, 'sin', 0, out), pr.at(6)));
  assert.ok(!near(inkAt(c, 'sin', 1, [0, 0, 0]), inkAt(c, 'sin', 0, [0, 0, 0]), 0.05), 'the two ends differ: the vessel runs from one colour to the other');
});

test('the lenses the 2D lobule has each colour it: change from the reference, oxygen, drop, flow, direction, velocity, neutral; the origin lenses grey it', () => {
  const out: [number, number, number] = [0, 0, 0], base = inkAt(ctx(), 'sin', 1, [0, 0, 0]);
  const ref = new Float32Array(200).fill(5);
  for (const lens of ['delta', 'since', 'heat', 'oxygen', 'drop', 'flow', 'direction', 'velocity', 'neutral', 'origin', 'firstpass', 'system'] as const) {
    const c = inkAt(ctx({ lens, ref }), 'sin', 1, out);
    assert.ok(c.every((v) => Number.isFinite(v) && v >= 0 && v <= 1), lens);
  }
  assert.ok(!near(inkAt(ctx({ lens: 'oxygen' }), 'sin', 1, out), base, 0.02), 'oxygen is not the pressure colour');
  const rev = inkAt(ctx({ lens: 'direction', model: model({ rev: { pre: false, sin: true, post: false } }) }), 'sin', 1, [0, 0, 0]);
  assert.ok(!near(rev, inkAt(ctx({ lens: 'direction' }), 'sin', 1, [0, 0, 0]), 0.05), 'a reversed bed wears the reversed colour');
  assert.deepEqual(lobuleDelta({ P1: 7, P2: 6, P3: 5 }, null), [0, 0, 0]);
});

test('capillarized sinusoids are drained toward the lobule\'s shade, never brighter (dullSinusoidInto)', () => {
  const lum = (c: number[]) => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;
  const a = inkAt(ctx(), 'sin', 1, [0, 0, 0]), b = inkAt(ctx({ fibSin: 1 }), 'sin', 1, [0, 0, 0]);
  assert.ok(!near(a, b, 1e-3) && lum(b) <= lum(a) + 0.02);
  assert.ok(near(inkAt(ctx({ fibSin: 1 }), 'pv', 0, [0, 0, 0]), inkAt(ctx(), 'pv', 0, [0, 0, 0])), 'only the sinusoids dull');
  assert.ok(sinW(1) === 1 && sinW(0.05) === 0 && sinW(0.5) > 0 && sinW(0.5) < 1);
});

test('the sinusoids\' geometry carries a colour per vertex, from the portal end\'s to the central end\'s, and a lens switch eases it', () => {
  const v = new LobuleView(createShared());
  v.setVisible(true); v.snapModel(model());
  let t = 0; do { v.update(t += 16); } while (t < 2000);
  const obj = v.objects.find((o) => o.toonMesh.geometry.getAttribute('ink') && v.set.get('sinusoids').group.children.includes(o.group))!;
  assert.ok(obj && (obj.toon as { defines?: Record<string, string> }).defines?.VERTEX_INK !== undefined, 'a part with the attribute reads it');
  assert.equal(obj.toon.uniforms.inkAmount!.value, 1);
  const a = obj.toonMesh.geometry.getAttribute('ink') as BufferAttribute;
  const s0 = v.net.courses.find((c) => c.kind === 's0')!;
  const start = (lens: 'pressure' | 'oxygen') => inkAt({ ...ctx(), lens }, 'sin', sinW(s0.rho[0]!), [0, 0, 0]);
  const at0 = () => Array.from(a.array.slice(0, 3));
  assert.ok(near(at0(), start('pressure'), 1e-5), 'the first vertex wears the pressure colour of the tube\'s outer end');
  v.setLens('oxygen'); v.update(t += 16);
  assert.ok(!near(at0(), start('pressure'), 1e-6) && !near(at0(), start('oxygen'), 1e-6), 'moving between the two lenses');
  do { v.update(t += 16); } while (t < 4000);
  assert.ok(near(at0(), start('oxygen'), 1e-3), 'landed on the oxygen colour');
  const last = a.count - 1;
  assert.ok(last > 100 && Array.from(a.array.slice(last * 3, last * 3 + 3)).every((x) => x >= 0 && x <= 1));
});
