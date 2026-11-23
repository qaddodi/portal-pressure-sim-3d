// Zone 3's ghost tiles are a smooth amount, not a coin toss per cell (Mohammad, 23 Nov 2026, the SOS slide: the ghosts mottled zone 3). 2D's rule gave 37 % of neighbouring pairs one dead tile beside one live one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { deadAmount, deadEdge } from '../src/scene/lobule/dead-cells.ts';

const net = buildLobule(7), cells = net.cells;
const dk = (cu: number) => cells.map((k) => deadAmount(cu, k.q, Math.atan2(k.y, k.x)));

/** The neighbour pairs (centres within 1.3 cell lengths) in zone 3 (q < 0.5). */
function pairs(cu: number): number[] {
  const d = dk(cu), out: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    const a = cells[i]!; if (a.q >= 0.5) continue;
    for (let j = i + 1; j < cells.length; j++) {
      const b = cells[j]!; if (b.q >= 0.5) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) < 1.3 * Math.max(a.l, b.l)) out.push(Math.abs(d[i]! - d[j]!));
    }
  }
  return out;
}

test('neighbouring zone-3 cells differ by a little, never one dead beside one live (mean <= 0.15, max <= 0.35 at SOS and at full congestion)', () => {
  for (const cu of [0.73, 1]) {
    const p = pairs(cu), mean = p.reduce((a, b) => a + b, 0) / p.length, max = Math.max(...p);
    assert.ok(p.length > 50, `pairs ${p.length}`);
    assert.ok(mean <= 0.15, `cu ${cu}: mean ${mean.toFixed(3)}`);
    assert.ok(max <= 0.35, `cu ${cu}: max ${max.toFixed(3)}`);
  }
});

test('graded from the vein: the band means do not rise with q, exactly 0 from q 0.45, 0 with no congestion, 0 below the onset', () => {
  const d = dk(0.73), means: number[] = [];
  for (const [q0, q1] of [[0.1, 0.2], [0.2, 0.3], [0.3, 0.4], [0.4, 0.5]]) {
    const v = d.filter((_, i) => cells[i]!.q >= q0 && cells[i]!.q < q1);
    means.push(v.reduce((a, b) => a + b, 0) / Math.max(1, v.length));
  }
  for (let i = 1; i < means.length; i++) assert.ok(means[i]! <= means[i - 1]! + 1e-9, `band ${i}: ${means.map((m) => m.toFixed(2))}`);
  assert.ok(means[0]! > 0.7 && means[3]! < 0.02, `${means.map((m) => m.toFixed(2))}`);
  for (let th = 0; th < 6.3; th += 0.1) for (const q of [0.45, 0.5, 0.8, 1]) assert.equal(deadAmount(1, q, th), 0, `q ${q}`);
  for (const q of [0, 0.2, 0.4]) assert.equal(deadAmount(0, q, 1), 0, 'cu 0');
  assert.equal(deadAmount(0.08, 0.1, 0), 0, 'below the onset');
  assert.ok(deadEdge(0) > 0.3 && deadEdge(1) < 0.42, 'the edge is organic and stays in zone 3');
});

test('the amount eases with congestion: no step at the old cu 0.12 (a tile\'s change over 0.01 of cu is small everywhere)', () => {
  for (const k of cells) { const th = Math.atan2(k.y, k.x); for (let cu = 0; cu < 1; cu += 0.01) assert.ok(Math.abs(deadAmount(cu + 0.01, k.q, th) - deadAmount(cu, k.q, th)) < 0.2); }
});

test('the tiles use it: fill, alpha, size, height and nucleus interpolate by it, and no per-cell random `drop` decides deadness (source)', () => {
  const src = readFileSync(new URL('../src/scene/micro3d/lobule3d.ts', import.meta.url), 'utf8');
  const i = src.indexOf('private *cellSteps'), body = src.slice(i, src.indexOf('this.cellNext = { cb, nb }', i));
  assert.match(body, /deadAmount\(cu, k\.q, Math\.atan2\(k\.y, k\.x\)\)/);
  assert.doesNotMatch(body, /k\.drop/, 'no coin toss');
  assert.doesNotMatch(body, /\bdead\b ?[?&|]/, 'no boolean dead');
  for (const w of ['* dk', '- 0.6 * dk', '(1 - dk)', '0.3 * dk']) assert.ok(body.includes(w), w);
});
