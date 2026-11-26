// The bleeding stream stays inside the esophagus and the stomach, and its splash stands on the pool's surface, for any fill, rate and site (Mohammad, 26 Nov: it started right of the esophagus and
// arced out over the gap beside it; and the splash stood above the blood's level). The rule is general, so it is judged for every fill from a puddle to full and every rate, against the real mesh.
(globalThis as { location?: unknown }).location = { search: '', pathname: '/', hostname: 'localhost' };
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { BufferAttribute } from 'three';
import { x2d, y2d, x3, y3 } from '../src/scene/frame2d.ts';
import { organsReady, setOrganData, ORGAN_MESHES } from '../src/scene/organs/meshes.ts';
import { FRONT_Z_ROWS, LUMEN_MASK_ROWS } from '../src/scene/disease/lumen-mask.generated.ts';
import { rasterFront, rasterMask } from '../src/scene/disease/lumen-raster.ts';
import { frontZ, insideLumen, lumenClearance, streamZ, STREAM_STANDOFF } from '../src/scene/disease/lumen.ts';
import { fitStream, streamDepth, marginAt, CARDIA_Y, BODY_MARGIN, SPLASH_MARGIN, STREAM_MARGIN, tearOf, FIT_STEPS, type BleedSite } from '../src/scene/disease/stream-fit.ts';
import { N_BLOB, N_SPLASH, N_SPRAY, BLOB_VERTS, TUBE_VERTS, pathAt, spurtOf, type JetParams } from '../src/scene/disease/jet.ts';
import { BleedLayer } from '../src/scene/disease/bleed.ts';
import { poolSurfaceY, poolUniforms } from '../src/scene/organs/pool-level.ts';
import { createShared } from '../src/scene/materials/cel.ts';

const organs = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(organs.buffer.slice(organs.byteOffset, organs.byteOffset + organs.byteLength) as ArrayBuffer);
await organsReady;
const stomach = ORGAN_MESHES.stomach!();
const FILLS = Array.from({ length: 23 }, (_, i) => 0.12 + (i * 0.88) / 22);
const RATES = [10, 30, 50, 90, 130];
const SITES: BleedSite[] = ['VAR', 'GV'];

test('the table the stream is judged against is the real stomach-and-esophagus mesh, as it covers the screen', () => {
  const pos = stomach.getAttribute('position'), idx = stomach.getIndex();
  assert.deepEqual(rasterMask(pos, idx, x2d, y2d), LUMEN_MASK_ROWS.map((r) => r.map((p) => [...p])), 'lumen-mask.generated.ts is the mesh (run scripts/gen-lumen-mask.mjs after the organs move)');
  assert.deepEqual(rasterFront(pos, idx, x2d, y2d), [...FRONT_Z_ROWS], 'and so is its front wall depth');
});

test('the notch beside the esophagus is outside, the esophagus and the stomach are inside', () => {
  assert.ok(insideLumen(791, 235) && insideLumen(900, 330) && insideLumen(880, 400), 'esophagus, fundus and body');
  assert.ok(!insideLumen(814, 246), 'the gap right of the esophagus where the stream used to cross');
  assert.ok(!insideLumen(700, 300) && !insideLumen(1000, 300), 'beside the organs');
  assert.ok(lumenClearance(792, 235) > lumenClearance(786, 235), 'the middle of the esophagus is deeper in than its wall');
});

test('the cardia: above CARDIA_Y the esophagus stands apart from the stomach (the notch), from it down they are one', () => {
  const runs = (y: number): number => LUMEN_MASK_ROWS[Math.floor((y - 200) / 2)]!.length;
  assert.ok(runs(246) >= 2, 'the notch is open beside the esophagus');
  for (let y = CARDIA_Y; y < 560; y += 2) assert.equal(runs(y), 1, `one organ at ${y}`);
  assert.ok(BODY_MARGIN > STREAM_MARGIN);
});

test('the esophageal varix bleeds from the esophagus\'s far left wall; the gastric one from the fundus', () => {
  const [x, y] = tearOf('VAR');
  assert.ok(insideLumen(x, y, STREAM_MARGIN - 0.01), 'inside, the stream\'s room from the wall');
  assert.ok(!insideLumen(x - 3, y, STREAM_MARGIN), 'and no more than a stream\'s room from the left wall: it is the far left');
  for (let dx = 1; dx < 12; dx++) assert.ok(!insideLumen(x - dx, y, STREAM_MARGIN), 'nothing further left has room');
  const [gx, gy] = tearOf('GV');
  assert.ok(insideLumen(gx, gy, STREAM_MARGIN), 'the fundus tear is inside the stomach');
});

/** The stream's path for a fit, as the jet draws it. */
function pathOf(site: BleedSite, rate: number, fill: number): { pts: [number, number][]; fit: ReturnType<typeof fitStream> } {
  const fit = fitStream(site, rate, poolSurfaceY(fill));
  const p: JetParams = { x0: fit.x0, y0: fit.y0, xl: fit.xl, yl: fit.yl, r0: 3, brk: 0.7, spurt: spurtOf(rate), lift: fit.lift };
  const q = { x: 0, y: 0, tx: 0, ty: 0 }, pts: [number, number][] = [];
  for (let i = 0; i <= 2 * FIT_STEPS; i++) { pathAt(p, i / (2 * FIT_STEPS), q); pts.push([q.x, q.y]); }
  return { pts, fit: { ...fit } };
}

test('every point of the stream is inside the esophagus and the stomach, and the splash lands clear of the wall, at every fill, rate and site', () => {
  let worst = Infinity;
  for (const site of SITES) for (const rate of RATES) for (const fill of FILLS) {
    const { pts, fit } = pathOf(site, rate, fill);
    for (const [x, y] of pts) {
      const c = lumenClearance(x, y);
      worst = Math.min(worst, c);
      assert.ok(c >= marginAt(y) - 0.5, `${site} rate ${rate} fill ${fill.toFixed(2)}: (${x.toFixed(1)}, ${y.toFixed(1)}) is ${c.toFixed(1)} from the wall, wants ${marginAt(y)}`);
    }
    assert.ok(fit.landClear >= SPLASH_MARGIN - 0.5, `${site} rate ${rate} fill ${fill.toFixed(2)}: the landing is ${fit.landClear.toFixed(1)} from the wall`);
    assert.equal(fit.yl, poolSurfaceY(fill), 'it lands at the pool\'s surface');
  }
  assert.ok(worst > 0, 'never outside');
});

test('a shallow arc: it never rises more than a few units above the tear, and starts nearer the wall than it ends', () => {
  for (const rate of RATES) for (const fill of FILLS) {
    const { pts, fit } = pathOf('VAR', rate, fill);
    const top = Math.min(...pts.map((p) => p[1]));
    assert.ok(fit.y0 - top < 1, `rate ${rate} fill ${fill.toFixed(2)}: the arch rises ${(fit.y0 - top).toFixed(2)} units`);
    assert.ok(fit.xl >= fit.x0 && fit.xl - fit.x0 < 90, 'thrown right of the wall, not far');
  }
});

test('the ripples run out from where the stream lands: the pool\'s landing is the stream\'s', () => {
  const box = [x3(700), y3(200), 400 / 300, 400 / 300] as const;
  for (const fill of [0.2, 0.5, 0.9]) for (const rate of [30, 90]) {
    const u = poolUniforms(box, fill, { site: 'VAR', rate, total: 700 }), fit = fitStream('VAR', rate, poolSurfaceY(fill));
    assert.ok(Math.abs(u.landX * box[2] + box[0] - x3(fit.xl)) < 1e-9, 'one landing');
  }
});

// The lens of blood the stream lands in is centred ON the pool's surface, and the splash's drops rise from it: the stream's landing is the same number as the pool shader's level.
test('the splash stands on the pool\'s surface: its level is the fill\'s level, at every fill', () => {
  const box = [x3(700), y3(200), 400 / 300, 400 / 300] as const;
  for (const fill of FILLS) {
    const layer = new BleedLayer(createShared());
    layer.set({ active: true, site: 'VAR', rate: 90, total: 600 }, 0.05, true, fill);
    const pos = (layer as unknown as { geo: { getAttribute(n: string): BufferAttribute } }).geo.getAttribute('position');
    // (the lens is the blob after the spray and the splash; its first vertex is its nose, on the axis through its centre)
    const lens = TUBE_VERTS + (N_SPRAY + N_SPLASH) * BLOB_VERTS;
    assert.ok(N_BLOB > N_SPRAY + N_SPLASH);
    const level = poolUniforms(box, fill, { site: 'VAR', rate: 90, total: 600 }).level;
    const shaderY = box[1] - level * box[3];
    assert.ok(Math.abs(pos.getY(lens) - y3(poolSurfaceY(fill))) < 1e-5, `fill ${fill.toFixed(2)}: the lens is at the surface`);
    assert.ok(Math.abs(pos.getY(lens) - shaderY) < 1e-5, `fill ${fill.toFixed(2)}: and it is where the pool's shader puts its level`);
    layer.dispose();
  }
});

test('the stream rides just in front of the organ wall under it (leaving the vein at its own depth at the tear: tests/bleed-on-vessel.test.ts), so a turned or tilted camera cannot slide it off the organ', () => {
  for (const site of SITES) {
    const layer = new BleedLayer(createShared());
    layer.set({ active: true, site, rate: 90, total: 600 }, 0.05, true, 0.6);
    const pos = (layer as unknown as { geo: { getAttribute(n: string): BufferAttribute } }).geo.getAttribute('position');
    // (ring 0 is at the tear and the last ring at the landing: each ring's mean z is the depth at its centre)
    for (const ring of [0, 12, 24]) {
      let x = 0, y = 0, z = 0;
      for (let j = 0; j < 7; j++) { const i = ring * 8 + j; x += pos.getX(i) / 7; y += pos.getY(i) / 7; z += pos.getZ(i) / 7; }
      const fx = x2d(x), fy = y2d(y);
      assert.ok(Math.abs(z - streamDepth(site, fx, fy)) < 0.012, `${site} ring ${ring}: z ${z.toFixed(3)} is the shared depth ${streamDepth(site, fx, fy).toFixed(3)}`);
      if (ring === 24) assert.ok(Math.abs(z - streamZ(fx, fy)) < 0.012, `${site} at the landing: z ${z.toFixed(3)} is the wall's ${frontZ(fx, fy).toFixed(3)} + ${STREAM_STANDOFF}`);
    }
    layer.dispose();
  }
});
