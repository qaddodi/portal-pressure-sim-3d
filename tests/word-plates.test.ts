// No box behind a chart word (Mohammad, 23 Nov 2026: "The word healthy doesn't really need a box behind it. An outline is enough."): a word that has to stay
// readable over a line or a tint carries a halo of the card's colour (TextShape.halo), never a plate (a small opaque rect) laid under it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csphFingerprint } from '../scripts/gen-engine-fixture.mjs';
import { SPANS, profileOf, goalOf, planProfile, type Fp } from '../src/ui/charts/profile/model.ts';
import { profileFrameAtRest } from '../src/ui/charts/profile/frame.ts';
import { measure } from '../src/ui/charts/measure.ts';
import { paletteOf } from '../src/ui/charts/palette.ts';
import { NODES } from '../src/engine/hales/portal/topology.js';
import { profileFrame, newLock } from '../src/ui/tests/profile/model.ts';
import { beatFrame } from '../src/ui/tests/slide/beat-frame.ts';
import { SampleFeed, CHANNELS } from '../src/ui/tests/feed.ts';
import { ctxOf, eachLook } from './charts-helpers.ts';
import type { Shape, TextShape } from '../src/ui/charts/scene.ts';

/** Every word (or those `only` picks) that has a small rect (under 6 times its own box) under its centre: a plate. */
function platesUnder(shapes: readonly Shape[], only?: (w: string) => boolean): string[] {
  const bad: string[] = [];
  const rects = shapes.filter((s): s is Extract<Shape, { k: 'rect' }> => s.k === 'rect');
  for (const t of shapes) {
    if (t.k !== 'text' || (only && !only(t.s))) continue;
    const tw = measure(t.s, t.size, t.weight), th = t.size * 1.2;
    const cx = t.anchor === 'start' ? t.x + tw / 2 : t.anchor === 'end' ? t.x - tw / 2 : t.x;
    const cy = t.baseline === 'middle' ? t.y : t.y - t.size * 0.3;
    for (const r of rects) {
      if (r.w * r.h >= 6 * tw * th) continue;
      if (cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) bad.push(t.s);
    }
  }
  return bad;
}
const textsOf = (shapes: readonly Shape[]) => shapes.filter((s): s is TextShape => s.k === 'text');
const hex = (c: readonly number[]) => c.map((v) => v.toFixed(3)).join(',');

test('the deck chart: "Healthy" has an outline of the card\'s colour, not a box, in every look', async () => {
  const fp = async (id: string) => profileOf((await csphFingerprint(id)) as Fp)!;
  const healthy = await fp('healthy'), csph = await fp('csph');
  eachLook((look) => {
    const c = ctxOf(look, 420, 'tablet-portrait'), plan = planProfile(420, 0, Math.max(12, c.type.sm), goalOf(csph, healthy, null), healthy, null, SPANS);
    const f = profileFrameAtRest(plan, c);
    // (the red block's rect round a reading is a state highlight, not a plate: only the line names are judged here)
    assert.deepEqual(platesUnder(f.shapes, (w) => w === 'Healthy'), [], `${look}: "Healthy" stands on a plate`);
    const t = textsOf(f.shapes).find((s) => s.s === 'Healthy');
    assert.ok(t, `${look}: the healthy line is named`);
    assert.ok(t!.halo, `${look}: "Healthy" has a halo`);
    assert.equal(hex(t!.halo!.color), hex(paletteOf(look).tok('surface')), `${look}: the halo is the card's colour`);
  });
});

const IDX = Object.fromEntries((NODES as { id: string }[]).map((n, i) => [n.id, i]));
const pressures = (over: Record<string, number>) => {
  const P = new Float32Array(NODES.length);
  const base: Record<string, number> = { INT: 19, CONF: 18, RPV: 17.5, SIN_R: 15, CV_R: 8.5, RHV: 7, IVCS: 5, RA: 3, ...over };
  for (const [k, v] of Object.entries(base)) P[IDX[k]!] = v;
  return P;
};

test('the instrument profile: the HVPG and PPG words have no box, an outline, and no bar runs through them', () => {
  const healthy = pressures({ INT: 8, CONF: 7, RPV: 6.5, SIN_R: 5, CV_R: 4, RHV: 3.5, IVCS: 3, RA: 2 });
  const metrics = { whvp: 15, fhvp: 7, hvpg: 8, pv: 18, ivc: 5, ppg: 13 };
  for (const look of ['light', 'dark', 'navy'] as const) {
    const pal = paletteOf(look);
    for (const size of [{ w: 700, h: 300 }, { w: 420, h: 280 }]) {
      const o = profileFrame({ P: pressures({}), metrics, healthy }, { ...size, pal }, newLock());
      const shapes = o.frame.shapes;
      assert.deepEqual(platesUnder(shapes), [], `${look} ${size.w}: a word stands on a plate`);
      const lines = shapes.filter((s): s is Extract<Shape, { k: 'line' }> => s.k === 'line' && s.y1 === s.y2 && s.x2 > s.x1 + 0.5);
      for (const name of ['HVPG ', 'PPG ']) {
        const t = textsOf(shapes).find((s) => s.s === name);
        if (!t) continue;
        assert.ok(t.halo, `${look}: "${name}" has a halo`);
        const x0 = t.x - 6, x1 = t.x + measure(t.s, t.size, t.weight) + 4;   // (its own box, less the plate's padding)
        for (const l of lines) if (Math.abs(l.y1 - t.y) < 2) assert.ok(l.x2 <= x0 + 0.01 || l.x1 >= x1 - 0.01, `${look}: a bar runs through "${name}" (${l.x1}–${l.x2} over ${x0}–${x1})`);
      }
    }
  }
});

test('the beat chart: the old state\'s name and "HVPG x" have no plate, an outline of the panel\'s colour', () => {
  const f = new SampleFeed(), o: Record<string, number[]> = { t: [] }, lv: Record<string, number> = { whvp: 20, RHV: 8, CONF: 21 };
  for (const k of CHANNELS) o[k] = [];
  for (let i = 0; i < 3000; i++) {
    const t = i / 100, ph = (t / 0.8) % 1, b = Math.sin(2 * Math.PI * ph);
    o.t!.push(t); o.ph!.push(ph);
    for (const k of CHANNELS) if (k !== 'ph') o[k]!.push(k in lv ? lv[k]! + b : 0);
  }
  f.adopt({ jump: false, samples: o } as never);
  const rec = { t: f.t, ch: f.ch, binT: f.binT, bin: f.bin, beats: f.beat.times, days: f.days, calm: (k: string) => f.calmOf(k) };
  const now = { whvp: 20, fhvp: 8, pv: 21, hr: 72, hvpg: 12 };
  const before = { r: { whvp: 26, fhvp: 8, pv: 27, hr: 70, hvpg: 18 }, label: 'before the bleed' };
  for (const look of ['light', 'dark'] as const) {
    const out = beatFrame({ rec: rec as never, head: f.last, now, before, ekg: true, noPv: false }, { w: 520, h: 300, pal: paletteOf(look) });
    const keys = out.frame.shapes.map((s) => (s as { key?: string }).key);
    assert.ok(!keys.includes('was-plate') && !keys.includes('gap-plate'), `${look}: the plates are gone`);
    assert.deepEqual(platesUnder(out.frame.shapes), [], `${look}: a word stands on a plate`);
    for (const key of ['was-label', 'gap-label']) {
      const t = out.frame.shapes.find((s) => (s as { key?: string }).key === key) as TextShape | undefined;
      assert.ok(t, `${look}: ${key} is drawn`);
      assert.equal(hex(t!.halo!.color), hex(paletteOf(look).tok('surface-2')), `${look}: ${key} halo is the panel's colour`);
    }
  }
});
