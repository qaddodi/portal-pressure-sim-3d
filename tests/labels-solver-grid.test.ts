// The label solver's stall (audit 22 Nov, build 4cd8c60c: 80 to 230 ms in one frame on leaving a talk, opening the Circuit, a patient glide): every candidate spot of every label was judged against EVERY line the figure
// draws (about 1,400 on the Anatomy, 760 in the Circuit, thousands in the lobule), so one solve cost candidates x lines. The lines now sit in a grid and a spot asks only the few near it. These tests pin that the grid
// never misses a line the exact tests would have hit (so the answer is the same), that a query reaches only a small part of the figure, and that the organ names' silhouettes answer as the plain loops did.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LineGrid, onLine, leaderTouches, type Line } from '../src/scene/labels/solver.ts';
import { segsCross, type Box } from '../src/scene/labels/geometry.ts';
import { silhouettes, onOtherOrgan } from '../src/scene/labels/organ-screen.ts';
// @ts-ignore copied plain JS
import { ORGANS } from '../src/scene/labels/organ2d/outlines.copied.js';
// @ts-ignore copied plain JS
import { flattenPath } from '../src/scene/labels/organ2d/flatten.js';
// @ts-ignore copied plain JS
import { NAME_ORGAN } from '../src/scene/labels/organ2d/organ-names.copied.js';

let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

const figureLines = (n: number): Line[] => {
  const out: Line[] = [];
  for (let i = 0; i < n; i++) { const x = rnd() * 1200, y = rnd() * 800, a = rnd() * 6.3, len = 5 + rnd() * 60; out.push([x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, rnd() < 0.5 ? rnd() * 12 : undefined as never] as Line); }
  out.push([0, 0, 1200, 800, 6], [-50, 400, 1250, 420]);   // (a line right across the figure: it is in many cells)
  return out.map((l) => (l[4] === undefined ? ([l[0], l[1], l[2], l[3]] as unknown as Line) : l));
};

test('a box query reaches every line the exact test would hit, with any air', () => {
  const lines = figureLines(1400), grid = new LineGrid(lines);
  for (let k = 0; k < 400; k++) {
    const x = rnd() * 1200, y = rnd() * 800, w = 20 + rnd() * 150, h = 10 + rnd() * 30, air = [0, 3][k % 2]!;
    const box: Box = { x0: x, y0: y, x1: x + w, y1: y + h };
    const want = new Set(lines.filter((l) => onLine(l, box, air)));
    const got = new Set<Line>();
    grid.some(box.x0, box.y0, box.x1, box.y1, air, (l) => { assert.ok(!got.has(l), 'a line is visited once'); got.add(l); return false; });
    for (const l of want) assert.ok(got.has(l), `a line the box lies on was not asked (${l.join(',')})`);
  }
});

test('a leader query reaches every line the leader crosses or comes within LEADER_AIR of', () => {
  const lines = figureLines(1400), grid = new LineGrid(lines);
  for (let k = 0; k < 400; k++) {
    const ax = rnd() * 1200, ay = rnd() * 800, a = rnd() * 6.3, len = 12 + rnd() * 100;
    const from: [number, number, number, number] = [ax, ay, ax + Math.cos(a) * len, ay + Math.sin(a) * len];
    const want = lines.filter((l) => segsCross(from, [l[0], l[1], l[2], l[3]]) || (l[4] !== undefined && leaderTouches(from, l, ax, ay)));
    const got = new Set<Line>();
    grid.some(Math.min(from[0], from[2]), Math.min(from[1], from[3]), Math.max(from[0], from[2]), Math.max(from[1], from[3]), 8, (l) => { got.add(l); return false; });
    for (const l of want) assert.ok(got.has(l), 'a line the leader meets was not asked');
  }
});

test('a spot asks a small part of the figure, not all of it (the cost was candidates x every line)', () => {
  const lines = figureLines(1400).slice(0, 1400), grid = new LineGrid(lines);
  let visited = 0, asks = 0;
  for (let k = 0; k < 300; k++) {
    const x = rnd() * 1100, y = rnd() * 750;
    grid.some(x, y, x + 90, y + 16, 3, () => { visited++; return false; });
    asks++;
  }
  assert.ok(visited / asks < lines.length * 0.08, `a spot asked ${(visited / asks).toFixed(0)} of ${lines.length} lines on average`);
});

test('a grid with a line out of its reach (not finite, or longer than the grid takes) still asks it', () => {
  const lines: Line[] = [[0, 0, 5, 5], [Number.NaN, 0, 5, 5], [-1e6, 3, 1e6, 3]];
  const seen: Line[] = [];
  new LineGrid(lines).some(0, 0, 10, 10, 0, (l) => { seen.push(l); return false; });
  assert.ok(seen.includes(lines[1]!) && seen.includes(lines[2]!) && seen.includes(lines[0]!));
});

// (the plain loops of organ-screen.ts before 22 Nov: every vertex of every ring against the box, then a 5 by 3 grid against every ring's even-odd crossing count)
const to = (x: number, y: number): [number, number] => [x * 0.9 + 40, y * 0.9 + 60];
const OTHER = ['esophagus', 'heart', 'bowel', 'colon', 'kidney-l', 'spleen', 'stomach', 'liver'];
const ringsOf = (id: string): [number, number][][] => {
  const o = (ORGANS as { id: string; d?: string; ring?: string }[]).find((q) => q.id === id);
  const polys: { pts: number[] }[] = o ? flattenPath((o.ring ?? o.d)!, 4) : [];
  return polys.map((p) => Array.from({ length: p.pts.length / 2 }, (_, i) => to(p.pts[2 * i]!, p.pts[2 * i + 1]!))).filter((q) => q.length > 2);
};
const inRing = (x: number, y: number, P: [number, number][]) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i]![1] > y) !== (P[j]![1] > y) && x < ((P[j]![0] - P[i]![0]) * (y - P[i]![1])) / (P[j]![1] - P[i]![1]) + P[i]![0]) c = !c; return c; };
const boxOnPlain = (rings: [number, number][][], b: Box): boolean => {
  for (const P of rings) for (const [x, y] of P) if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) return true;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 2; j++) if (rings.reduce((n, P) => n + (inRing(b.x0 + ((b.x1 - b.x0) * i) / 4, b.y0 + ((b.y1 - b.y0) * j) / 2, P) ? 1 : 0), 0) % 2 === 1) return true;
  return false;
};
test('an organ name\'s box is judged on another organ exactly as the plain loops judged it', () => {
  const sil = silhouettes(to), fam = (id: string) => id.split('-')[0];
  const names = Object.keys(NAME_ORGAN as Record<string, string>);
  let on = 0, off = 0;
  for (let k = 0; k < 500; k++) {
    const x = 60 + rnd() * 1000, y = 40 + rnd() * 900, w = 30 + rnd() * 120, h = 12 + rnd() * 30, box: Box = { x0: x, y0: y, x1: x + w, y1: y + h };
    const name = names[k % names.length]!, own = fam((NAME_ORGAN as Record<string, string>)[name]!);
    const want = OTHER.some((id) => fam(id) !== own && boxOnPlain(ringsOf(id), box));
    assert.equal(onOtherOrgan(name, sil, box), want, `${name} at ${Math.round(x)},${Math.round(y)}`);
    if (want) on++; else off++;
  }
  assert.ok(on > 30 && off > 30, `the sample has both answers (${on} on, ${off} off)`);
});

import { solverWarmer } from '../src/scene/labels/solver-warm.ts';
test('the solver warm-up (a background slot job) runs its rounds, one small solve a step, and finishes', () => {
  const step = solverWarmer(5);
  let steps = 0, done = false;
  while (!done && steps < 20) { done = step(); steps++; }
  assert.equal(steps, 5);
  assert.equal(done, true);
});
