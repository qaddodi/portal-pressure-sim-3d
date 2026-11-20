// The lobule's vessels wear the colour lens along their length, as the 2D lobule colours its lumen (lobule-zoom-field.js inkOf / tubeRGB), instead of one flat tone.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { samplerFor } from '../src/scene/lenses/model.ts';
import { inkAt, inkLanes, lobuleDelta, sinW } from '../src/scene/lobule/ink.ts';
import type { LobuleModel } from '../src/scene/lobule/model.ts';

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

test('under Blood origin the sources run as lanes side by side across the vessel (the 2D streams), each as wide as its share, the systemic remainder last; other lenses give one colour three times', () => {
  const lanes = { pre: [[1, 0, 0, 0], [1, 0, 0, 0]], sin: [[0.5, 0.25, 0, 0], [0, 0, 0, 0.25]], post: [[0, 0, 0, 0], [0, 0, 0, 0]] } as const;
  const m = model({ lanes: { origin: lanes as never, pass: lanes as never } });
  const out = new Array(9).fill(0);
  // the portal inflow is all SMV: three samples of the one colour
  inkLanes(ctx({ lens: 'origin', model: m }), 'pv', 0, out);
  assert.ok(near(out.slice(0, 3), out.slice(3, 6)) && near(out.slice(3, 6), out.slice(6, 9)));
  // the sinusoid's portal end (w = 1) is half SMV, a quarter IMV, a quarter systemic: its lanes differ across the vessel
  inkLanes(ctx({ lens: 'origin', model: m }), 'sin', 1, out);
  assert.ok(!near(out.slice(0, 3), out.slice(6, 9), 0.05), 'two sides, two sources');
  // its central end (w = 0) is a quarter hepatic artery, three quarters systemic
  const a = out.slice(); inkLanes(ctx({ lens: 'origin', model: m }), 'sin', 0, out);
  assert.ok(!near(a.slice(0, 3), out.slice(0, 3), 0.05), 'the blend changes along the sinusoid');
  inkLanes(ctx({ model: m }), 'sin', 1, out);
  assert.ok(near(out.slice(0, 3), out.slice(3, 6)) && near(out.slice(3, 6), out.slice(6, 9)), 'pressure lens: one colour');
});

test('the arteriole\'s twig wears one tone whatever the lens (the skin that welds it to its sinusoid eases from it): the palette\'s artery, under every lens and look', async () => {
  const { LOBULE_PALETTES } = await import('../src/scene/lobule/tones.ts');
  const { hexToRgb01 } = await import('../src/scene/lenses/oklab.ts');
  for (const look of ['light', 'dark'] as const) for (const lens of ['pressure', 'oxygen', 'flow', 'neutral'] as const) {
    const want = hexToRgb01((LOBULE_PALETTES[look].tones as Record<string, string>).artery!);
    assert.ok(near(inkAt(ctx({ look, lens }), 'art', 0.3, [0, 0, 0]), want), `${look} ${lens}`);
  }
});
