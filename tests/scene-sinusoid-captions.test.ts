// The sinusoid's name layer (SinusoidCaptions.tsx) through its pure parts: the names stand only while the sinusoid is the view; a tap in a talk takes the card of the name under it (2D's explain rule);
// a tall screen's names are level; the readings read as 2D writes them.
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView, U } from '../src/scene/sinusoid/view.ts';
import { restScale, framePoint, PORTRAIT_ANGLE } from '../src/scene/sinusoid/portrait.ts';
import { SV_NOTE, SV_TARGET } from '../src/scene/sinusoid/names.ts';
import { buildSinusoidNames, linesOf, namesOn, placeOf, readings } from '../src/scene/sinusoid/captions.ts';
import { clearSinusoidExplain, setSinusoidPlaced, sinusoidTap, useSinusoidNames } from '../src/scene/sinusoid/explain-store.ts';
import type { SinusoidTargets } from '../src/scene/lobule/model.ts';

const targets = (): SinusoidTargets => ({ por: 1, col: 0, bm: 0, mv: 1, act: 0, lum: 1, pinch: 0, v: 1, filt: 1, prot: 1 });
const measure = (t: string, size: number) => t.length * size * 0.55;
const MODEL = { P1: 17, P2: 10, P3: 3, lymph: 0.5, lyProt: 0.91 };

function build(W: number, H: number, explain: Parameters<typeof buildSinusoidNames>[0]['explain'] = null) {
  const v = new SinusoidView(createShared());
  v.setVisible(true); v.snapTargets(targets()); v.update(0);
  const portrait = W < H * 0.95;
  v.setPortrait(portrait);
  const free = { l: 12, t: 90, r: W - 12, b: H - 80 }, short = portrait ? free.r - free.l : free.b - free.t, k = restScale(short);
  const C: [number, number] = [(free.l + free.r) / 2, (free.t + free.b) / 2];
  // (a plane seen square on: a place of the plane on the canvas, turned as the view is, the way the layer projects it)
  const proj = (x: number, y: number): [number, number] => { const f: [number, number, number] = [0, 0, 0]; framePoint(x, y, U, portrait ? PORTRAIT_ANGLE : 0, f); return [C[0] + (f[0] / U) * k, C[1] - (f[1] / U) * k]; };
  const placed = buildSinusoidNames({ view: v, proj, vp: { w: W, h: H }, measure, stage: { w: W, h: H }, free, insTop: 70, model: MODEL, explain });
  return { placed, v, free, W, H };
}

beforeEach(() => { clearSinusoidExplain(); setSinusoidPlaced([]); });

test('the names stand only while the sinusoid is the view and drawn', () => {
  assert.equal(namesOn('sinusoid', true), true);
  for (const view of ['body', 'lobule', 'circuit', 'organ']) assert.equal(namesOn(view, true), false, view);
  assert.equal(namesOn('sinusoid', false), false);
});

test('wide: eleven names, readings as 2D writes them, and each name box is on the screen', () => {
  const { placed, W, H } = build(1440, 900);
  assert.equal(placed.length, 11);
  const by = (k: string) => placed.find((p) => p.key === k)!;
  assert.match(by('in').value, /^17\.0/); assert.match(by('out').value, /^3\.0/); assert.match(by('sin').value, /^10\.0/);
  assert.match(by('lymph').value, /Protein 91%/);
  for (const p of placed) { const b = placeOf(p); assert.ok(b.x >= -1 && b.x + b.w <= W + 1 && b.y >= -1 && b.y + b.h <= H + 1, p.key); }
});

test('tall: the names run level (no turn on a name, only positions) and the ends sit top and bottom', () => {
  const { placed, H } = build(390, 844);
  const by = (k: string) => placed.find((p) => p.key === k)!;
  assert.ok(by('in').cy < H / 2 && by('out').cy > H / 2, 'the portal venule above, the central vein below');
  for (const p of placed) assert.ok(p.w > 0 && p.hh > 0 && !('angle' in p), p.key);
});

test('readings: "?" before the model, the porosity as a percentage open', () => {
  assert.equal(readings(null, 0.5).sin, '?');
  assert.equal(readings(MODEL, 0.5).fen, '50%~open');
  assert.equal(readings(MODEL, 1.4).fen, '100%~open');
});

test('an explained name takes one more line, the one 2D says; the others do not', () => {
  const on = linesOf('Kupffer cell', '', 'kup', 'kup'), off = linesOf('Kupffer cell', '', 'kup', 'hep');
  assert.equal(on.note, SV_NOTE.kup); assert.equal(off.note, null);
  const a = build(1440, 900).placed.find((p) => p.key === 'kup')!, b = build(1440, 900, 'kup').placed.find((p) => p.key === 'kup')!;
  assert.ok(b.hh > a.hh, 'its box grows by the note');
});

test('a tap in a talk takes the card of the name under it, and a second tap puts it away', () => {
  const { placed } = build(1440, 900);
  setSinusoidPlaced(placed);
  const kup = placed.find((p) => p.key === 'kup')!;
  assert.equal(sinusoidTap(kup.cx, kup.cy, true), true);
  assert.equal(useSinusoidNames.getState().explain, 'kup');
  assert.equal(useSinusoidNames.getState().target, `sinusoid:${SV_TARGET.kup}`);
  assert.equal(sinusoidTap(kup.cx, kup.cy, true), true);
  assert.equal(useSinusoidNames.getState().explain, null);
});

test('outside a talk, and on nothing, a tap is not taken', () => {
  const { placed } = build(1440, 900);
  setSinusoidPlaced(placed);
  const kup = placed.find((p) => p.key === 'kup')!;
  assert.equal(sinusoidTap(kup.cx, kup.cy, false), false);
  assert.equal(useSinusoidNames.getState().explain, null);
  assert.equal(sinusoidTap(-500, -500, true), false);
});

test('a leader ends in 2D\'s ringed dot on the part it names: the layer draws one at every leader\'s end, and across a wide screen the names that stand on their part (the cells, the Disse) have none', async () => {
  const { placed } = build(1440, 900);
  const led = placed.filter((p) => p.leader).map((p) => p.key).sort();
  for (const k of led) assert.ok(['fen', 'lymph', 'bc', 'alb'].includes(k), `${k} has a leader across a wide screen`);   // (2D: layoutTags gives the lymph and the fenestrae one, the bile canaliculus's own function its short one)
  assert.ok(led.includes('fen'), 'the fenestrae are tied to their pore');
  assert.ok(led.includes('alb'), 'the Protein is a callout: tied to what it names');
  assert.ok(!led.includes('sin'), 'the Sinusoid stands inside the lumen with its reading, no leader (Mohammad, 26 Nov: "keep sinusoid with number INSIDE the sinusoid as it was always")');
  for (const p of placed.filter((q) => q.leader)) assert.ok(Number.isFinite(p.leader!.x2) && Number.isFinite(p.leader!.y2), `${p.key}'s dot has a place`);
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/scene/sinusoid/SinusoidCaptions.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /className = 'lb-anchor'/, 'no ring at the leader\'s end (it read as a white circle on the Kupffer cell, Mohammad 20 Nov)');
  assert.match(src, /translate\(\$\{Math\.round\(p\.leader\.x2/, 'put at the leader\'s end');
});
