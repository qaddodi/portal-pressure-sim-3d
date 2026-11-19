import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fibroFrame, layoutOf, driftOf, CAP, MAP_RADIUS } from '../src/ui/tests/fibro/model.ts';
import { ORGAN, ORGAN_WORDS, DEPTH_TXT, TIME_TXT, WIN0, WIN1, DEPTH0, DEPTH_SPAN, shearSpeed, elastogramPixels, elastogramInputs } from '../src/ui/tests/fibro/copied/fibro-model.copied.js';
import { paletteOf } from '../src/ui/charts/palette.ts';
import { BUILT_PANES } from '../src/ui/tests/panes.ts';
import type { TextShape, LineShape } from '../src/ui/charts/scene.ts';

const pal = paletteOf('light');
const words = (f: ReturnType<typeof fibroFrame>) => f.shapes.filter((s): s is TextShape => s.k === 'text');

test('the two exams are the 2D app\'s: the liver\'s orange at 50 Hz, the spleen\'s violet at 100 Hz, switched Liver / Spleen', () => {
  assert.equal(ORGAN.liver.name, 'LIVER · 50 Hz'); assert.equal(ORGAN.spleen.name, 'SPLEEN · 100 Hz');
  assert.deepEqual(ORGAN.liver.lo, [20, 10, 8]); assert.deepEqual(ORGAN.spleen.hi, [168, 104, 220]);
  assert.equal(ORGAN.liver.widest, '88.8'); assert.equal(ORGAN.spleen.widest, '100.0');
  assert.deepEqual(ORGAN_WORDS, [['liver', 'Liver'], ['spleen', 'Spleen']]);
  assert.ok(BUILT_PANES.includes('fibroscan'));
});

test('the shear speed is E = 3 rho c^2, and the CPU reference map is the right size and opaque', () => {
  assert.equal(Math.round(shearSpeed(12) * 1000) / 1000, 2);
  const d = elastogramPixels(12, shearSpeed(10), 1.5);
  assert.equal(d.length, 12 * 12 * 4);
  for (let i = 3; i < d.length; i += 4) assert.equal(d[i], 255);
  const { F, NB, t0 } = elastogramInputs();
  assert.equal(NB, 104); assert.equal(t0, 8); const a1 = (F as unknown as { a1: { gw: number; cell: number } }).a1; assert.equal(a1.gw * a1.cell >= NB * 4, true);
});

test('the words stand where 2D puts them: depth 30, 45 mm, 60 inside the left edge; 0 ms to 80 along the foot; the reading, kPa and the exam in the top right and lower right', () => {
  const w = 460, h = 280, L = layoutOf(w, h, ORGAN.liver.widest);
  const f = fibroFrame({ organ: 'liver', txt: '21.4', kpa: 21.4, t: 3 }, w, h, pal, L);
  const t = words(f), by = (k: string) => t.find((s) => s.key === k)!;
  assert.deepEqual(DEPTH_TXT.map((_, i) => by(`d${30 + 15 * i}`).s), DEPTH_TXT);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => by(`t${i}`).s), TIME_TXT);   // a 460 px box has room for every tick
  assert.equal(by('read').s, '21.4'); assert.equal(by('unit').s, 'kPa'); assert.equal(by('organ').s, 'LIVER · 50 Hz');
  assert.equal(by('d30').x, L.m); assert.equal(L.m, Math.round(CAP * 0.7));
  const y = (d: number) => ((d - DEPTH0) / DEPTH_SPAN) * h;
  assert.ok(Math.abs(by('d45').y - (y(45) + L.TK * 0.35)) < 1e-9);
  assert.ok(by('read').size >= 24 && by('read').size <= 72, 'the number is big but fits');
  assert.ok(by('read').x < by('unit').x && by('unit').x === w - (w - L.ux) );
  // every word has a halo and is white
  for (const s of t) { assert.ok(s.halo, `${s.key} has no halo`); assert.equal(s.color[0], 1); }
  // the window lines and the fitted line
  const lines = f.shapes.filter((s): s is LineShape => s.k === 'line');
  assert.equal(lines.filter((l) => l.pen.dash).length, 2);
  assert.ok(Math.abs(lines.find((l) => l.key === 'win0')!.y1 - y(WIN0)) < 1e-9 && Math.abs(lines.find((l) => l.key === 'win1')!.y1 - y(WIN1)) < 1e-9);
  const fit = lines.find((l) => l.key === 'fit')!;
  assert.ok(fit.x2 > fit.x1 && fit.y2 > fit.y1, 'the fitted line runs down and to the right');
  assert.equal(f.shapes.find((s) => s.k === 'rect')!.k, 'rect');
  assert.equal((f.shapes.find((s) => s.k === 'rect') as { r: number }).r, MAP_RADIUS);
});

test('a stiffer liver has a faster wave and a shallower fitted line; the wave drifts a few percent around the median', () => {
  const at = (k: number) => { const f = fibroFrame({ organ: 'liver', txt: String(k), kpa: k, t: 0 }, 460, 280, pal); return f.shapes.find((s) => s.k === 'line' && s.key === 'fit') as LineShape; };
  assert.ok(at(30).x2 < at(6).x2, 'a faster wave crosses the window sooner: the fitted line is shorter');
  for (let t = 0; t < 20; t += 0.7) { const d = driftOf(100, t); assert.ok(d > 91 && d < 109); }
});

test('a narrow box names every other tick and the number steps smaller to keep clear of the depth words', () => {
  const narrow = layoutOf(70, 200, ORGAN.spleen.widest), wide = layoutOf(500, 300, ORGAN.spleen.widest);
  assert.equal(narrow.tstep, 40); assert.equal(wide.tstep, 20);
  assert.ok(narrow.big <= wide.big);
  const f = fibroFrame({ organ: 'spleen', txt: '–', kpa: 40, t: 0 }, 70, 200, pal, narrow);
  assert.equal(words(f).filter((s) => s.key?.startsWith('t')).length, 3);
  assert.match(f.label, /FibroScan, spleen: no reading/);
});

test('the pane draws only on the one clock, takes the map from the chart pool\'s context, and the copy is current', () => {
  const pane = readFileSync(new URL('../src/ui/tests/fibro/FibroPane.tsx', import.meta.url), 'utf8');
  assert.ok(!/requestAnimationFrame|getContext\(|new WebGL|createElement\('canvas'\)/.test(pane));
  assert.ok(/clock\.hold\(TAG\)/.test(pane) && /setUnder\(under\)/.test(pane));
  const gl = readFileSync(new URL('../src/ui/charts/gl.ts', import.meta.url), 'utf8');
  assert.ok(/under\(gl, pw, ph, this\.gen\)/.test(gl), 'the drawer calls the picture under the shapes');
  const two = process.env.PPS_2D_DIR;
  if (two && existsSync(`${two}/src/ui/fibroscan.js`)) execFileSync('node', ['scripts/copy-b11-fibro.mjs', '--from', two, '--check'], { stdio: 'pipe' });
});
