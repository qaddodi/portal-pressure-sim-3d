// Plan 24 (Mohammad 22 Nov: "why doesn't the fibrous bands inside the central vein look like the fibrous bands outside it"): the scar inside the vein is the plate's own collagen, one material.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry } from 'three';
import { buildCvScar } from '../src/scene/micro3d/lobule3d.ts';
import { CV_RING_N, CV_WALL, cvInner, paintIntima, cvScarGrowth } from '../src/scene/lobule/cv-intima.ts';
import { LOBULE_PLATE_FS, LOBULE_SCAR_VS, PLATE_S } from '../src/scene/lobule/plate.ts';
import { lookColours } from '../src/scene/lobule/lz-colours.ts';
import { paintLobule, useTokens } from '../src/scene/lobule/from2d/lobule-paint.generated.js';

/** A 2D context that records the path points of every clip and the colour of every fill/stroke. */
function rec() {
  const log: { clip: [number, number][][]; fills: string[]; strokes: string[] } = { clip: [], fills: [], strokes: [] };
  let path: [number, number][] = [];
  const t = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const base: Record<string, unknown> = {
    canvas: { width: 64, height: 64 }, getTransform: () => ({ ...t }),
    beginPath: () => { path = []; }, moveTo: (x: number, y: number) => path.push([x, y]), lineTo: (x: number, y: number) => path.push([x, y]),
    clip: () => log.clip.push(path.slice()),
    setFillRGBA: (r: number, g: number, b: number, a: number) => log.fills.push([r, g, b, a].join()), setStrokeRGBA: (r: number, g: number, b: number, a: number) => log.strokes.push([r, g, b, a].join()),
    createRadialGradient: () => ({ addColorStop: () => undefined }),
  };
  const ctx = new Proxy(base, { get(o, k: string) { return k in o ? o[k] : () => undefined; }, set(o, k: string, v) { o[k] = v; return true; } });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log };
}
const COL: [number, number, number] = [0.8, 0.7, 0.5];
const rw = 0.07 * PLATE_S;
const L = lookColours('light' as never); useTokens((n: string, a?: number | string) => L.tk(n, a));

test('the painter clips the 2D cuff painter to the mesh\'s own inner edge, within 1 plate px at every step of the angle', () => {
  const { ctx, log } = rec();
  const fibPost = 0.8, grow = cvScarGrowth(fibPost);
  paintIntima(ctx, { m: { fibPost }, G: { cx: 0, cy: 0 }, rgb: { col: COL }, cvIn: rw });
  assert.ok(log.clip.length >= 1, 'the ring is clipped first');
  const inner = log.clip[0]!.slice(-CV_RING_N);   // (the polygon's points, after the outer circle's own moveTo)
  const geo = new BufferGeometry(); buildCvScar(geo, rw, grow, 0);
  const pos = geo.getAttribute('position')!;
  assert.equal(inner.length, CV_RING_N);
  for (let i = 0; i < CV_RING_N; i++) {
    const mx = pos.getX(2 * i + 1), my = pos.getY(2 * i + 1);   // (the mesh's inner vertex i)
    assert.ok(Math.hypot(inner[i]![0] - mx, inner[i]![1] - my) < 1, `step ${i}: painter and mesh agree`);
    const t = (i / CV_RING_N) * Math.PI * 2, r = cvInner(rw, grow, t);
    assert.ok(Math.abs(Math.hypot(mx, my) - r) < 1e-3);
  }
  assert.ok(CV_WALL < 1);
});

test('the ring is the outer cuff\'s own collagen: the same painter, the same colour, the same strand alphas as the bands around the vein', () => {
  const fibPost = 1, a = rec(), b = rec();
  paintIntima(a.ctx, { m: { fibPost }, G: { cx: 0, cy: 0 }, rgb: { col: COL }, cvIn: rw });
  // the outer cuff, from the 2D painter itself (nothing else on: the only painted collagen is the cuff)
  const G = { R: 400, cx: 0, cy: 0, rt: 20, rs0: 4, rcv0: rw, lobules: [{ x: 0, y: 0, corners: [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1]] }], cells: [], hsc: [], septaPC: [] };
  paintLobule(b.ctx, { m: { congU: 0, septU: 0, fibSin: 0, act: 0, fibPre: 0, fibPost }, G, dark: false, zonesOn: false, rgb: { bg: COL, gap: COL, cell: COL, col: COL, dis: COL }, sin: [], cvIn: rw });
  const colour = (l: string[]) => new Set(l.map((x) => x.split(',').slice(0, 3).join()));
  const ring = [...colour(a.log.fills), ...colour(a.log.strokes)], out = new Set([...colour(b.log.fills), ...colour(b.log.strokes)]);
  assert.ok(ring.length > 0);
  for (const c of ring) assert.ok(out.has(c), `ring colour ${c} is a colour the outer cuff paints (one material, no mauve)`);
  assert.ok(a.log.fills.some((f) => b.log.fills.includes(f)), 'the same fill alpha at full growth');
});

test('no scar below the painter\'s own threshold, and none without a wall', () => {
  const a = rec();
  paintIntima(a.ctx, { m: { fibPost: 0.05 }, G: { cx: 0, cy: 0 }, rgb: { col: COL }, cvIn: rw });
  paintIntima(a.ctx, { m: { fibPost: 1 }, G: { cx: 0, cy: 0 }, rgb: { col: COL }, cvIn: 0 });
  assert.equal(a.log.clip.length, 0);
});

test('the scar\'s shader is the plate\'s: the plate textures and mix, laid whole over the tissue, from its own place on the plate', () => {
  assert.match(LOBULE_PLATE_FS, /uBase \* \(1\.0 - cu\.a\) \+ cu\.rgb/, 'the collagen laid over the tissue\'s tone, whole (no see-through)');
  assert.match(LOBULE_PLATE_FS, /fb \* smoothstep\(0\.0, 0\.08, cu\.a\)/, 'shown as far as the vein\'s growth has reached');
  assert.match(LOBULE_SCAR_VS, /vUv = position\.xy \/ uSide \+ 0\.5/);
});

test('the scar material has no flat tint and samples the plate\'s textures, shared with the marks', async () => {
  const { Lobule3D } = await import('../src/scene/micro3d/lobule3d.ts') as unknown as { Lobule3D?: unknown };
  void Lobule3D;
  const src = (await import('node:fs')).readFileSync(new URL('../src/scene/micro3d/lobule3d.ts', import.meta.url), 'utf8');
  assert.match(src, /\.\.\.this\.marksMat\.uniforms, opacity: \{ value: 0 \}, uBaseK: \{ value: 1 \}/);
  assert.doesNotMatch(src, /CV_SCAR_ALPHA/);
  assert.doesNotMatch(src, /mk\('central-vein-scar'/);
});

test('GLSL: the plate shader and the scar vertex shader parse', async () => {
  let parse: ((s: string) => unknown) | null = null;
  const name = '@shaderfrog/glsl-parser';
  try { const m = await import(name); parse = (s) => m.parser.parse(s, { quiet: true }); } catch { /* not installed */ }
  if (!parse) return;
  const { CEL_TISSUE_GLSL } = await import('../src/scene/lobule/cel.ts');
  void CEL_TISSUE_GLSL;
  parse(LOBULE_SCAR_VS.replace(/^\n/, ''));
  parse(LOBULE_PLATE_FS.replace(/^\n/, '').replace(/^#include.*$/gm, ''));
});
