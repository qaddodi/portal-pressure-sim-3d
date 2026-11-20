// The catheter's reading cards point at a hepatic vein, which only the Anatomy has: in the Lobule, the Sinusoid or the Circuit no card stands (Mohammad, 20 Nov: FHVP and WHVP pinned
// to the Lobule's bottom corners on HVPG slide 5). The controller solves with no catheter outside the Anatomy, and CathShow eases out what stood.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CathShow } from '../src/scene/labels/cath-show.ts';

const measure = (t: string, size: number) => t.length * size * 0.56;
const base = { vp: { w: 390, h: 844 }, cath: 'wedge' as const, measure, band: { x0: 0, y0: 56, x1: 390, y1: 700 }, blockers: [], tip: [200, 300] as [number, number], ahead: [230, 250] as [number, number], got: 2, text: { f: '5.2', w: '16.3', h: '11.1', hv: 11.1 } };

test('the controller gives the cards no catheter unless the Anatomy is the figure', () => {
  const c = readFileSync(new URL('../src/scene/labels/controller.ts', import.meta.url), 'utf8');
  assert.match(c, /const here = d\.anatomy \? d\.anatomy\(\) : true;/);
  assert.match(c, /cath: cathNow/);
  assert.doesNotMatch(c, /this\.show\.solve\(\{ vp: d\.vp\(\), cath: this\.state\.cath/);
  const l = readFileSync(new URL('../src/scene/labels/LabelLayer.tsx', import.meta.url), 'utf8');
  assert.match(l, /anatomy: \(\) => cel\.view === 'body'/);
});

test('leaving the Anatomy eases the cards out (no snap)', () => {
  const s = new CathShow();
  s.solve(base as never); for (let t = 0; t < 1500; t += 16) s.step(16, false);
  assert.ok(s.frame.pills.length > 0);
  s.solve({ ...base, cath: null } as never);
  s.step(16, false);
  assert.ok(s.frame.pills.length > 0 && s.frame.pills.every((p) => p.alpha < 1 && p.alpha > 0), 'still fading, not gone in a frame');
  for (let t = 0; t < 600; t += 16) s.step(16, false);
  assert.equal(s.frame.pills.length, 0);
});
