// Fibrosis is mock C "Raised relief" (Mohammad, 23 Nov 2026; docs/approved/fibrosis.md): the painter's soft cream passes and fibre streaks as painted, the faint passes' alpha
// softened by a coarser copy of itself, a subtle relief from the slope of the height against the one light, no cel step, no edge line and no glow on the collagen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOBULE_PLATE_FS } from '../src/scene/lobule/plate.ts';
import { COLL_EDGE_LO, COLL_RELIEF_G, RELIEF_D_PX, RELIEF_LOD, reliefColour } from '../src/scene/lobule/relief.ts';
import { badSamplers, usedBeforeDeclared } from './gl-undeclared.ts';
import { rasterCtx } from './helpers/raster-ctx.ts';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { PLATE_BOX, PLATE_S, plateShape } from '../src/scene/lobule/plate.ts';
import { collagenInput, paintCollagenWorld } from '../src/scene/lobule/collagen-paint.ts';
import { TRACT_REACH_PX } from '../src/scene/lobule/collagen-edge.ts';
import { lookColours } from '../src/scene/lobule/lz-colours.ts';
import { useTokens } from '../src/scene/lobule/from2d/lobule-paint.generated.js';
import { DISC_R } from '../src/scene/lobule/widths.ts';

test('the plate shader reads each declared name after its declaration, and every sampler call is well formed', () => {
  assert.deepEqual(usedBeforeDeclared(LOBULE_PLATE_FS), []);
  assert.deepEqual(badSamplers(LOBULE_PLATE_FS), []);
});

test('the collagen keeps the painter\'s own colour; its alpha is a smooth curve of a coarse copy (no terraces, no faint apron), the dense core as painted', () => {
  assert.match(LOBULE_PLATE_FS, /float collEdgeA\(float a\)/);
  assert.match(LOBULE_PLATE_FS, /vec4 softPass\(vec4 sharp, vec2 uvx, float lod\)/);
  assert.match(LOBULE_PLATE_FS, /smoothstep\(0\.45, 0\.65, soft\.a\)/, 'the painter\'s own alpha only deep inside a band');
  assert.match(LOBULE_PLATE_FS, /cs = softPass\(cs, uvS, 3\.0\)/);
  assert.match(LOBULE_PLATE_FS, /cu = softPass\(cu, uvT, 0\.0\)/);
  assert.equal(COLL_EDGE_LO > 0.0 && COLL_EDGE_LO < 0.2, true, 'the faint outer pass (0.12 of the painter\'s) drops out');
  assert.match(LOBULE_PLATE_FS, /hT = TRACT_SOFT \* fT;/, 'the tract front fades, it is never a crisp circle');
});

test('the painted tract has no rim and reaches no further than TRACT_REACH_PX (so the front and the field\'s cleared disc cover it all)', () => {
  const N = 512, B = PLATE_BOX * PLATE_S, sc = N / (2 * B), net = buildLobule(), shape = { ...plateShape(net), cells: [] }, cv = DISC_R.cv;
  const L = lookColours('dark' as never); useTokens((n: string, a?: number | string) => L.tk(n, a));
  const r = rasterCtx(N); paintCollagenWorld(r.ctx, N, sc, -B, -B, collagenInput(shape, cv, 'dark' as never), 'tracts');
  const corners = net.corners.map(([x, y]) => [(x * PLATE_S + B) * sc, (B - y * PLATE_S) * sc] as const);
  const step = 4, dens = new Float64Array(60), area = new Float64Array(60); let far = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.min(...corners.map(([cx, cy]) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy))) * (2048 / N), k = Math.floor(d / step);
    if (k >= 60) continue;
    area[k]! += 1; const a = r.alpha[y * N + x]!; dens[k]! += a; if (a >= 0.03) far = Math.max(far, d);
  }
  assert.ok(far <= TRACT_REACH_PX + 4, `reach ${far.toFixed(0)} px <= ${TRACT_REACH_PX}`);
  // (the painter's flat disc ended at a circle: the coverage fell from its plateau to the surround within one annulus; the bundles' ends fall over about 40 px)
  let worst = 0; for (let k = 20; k < 55; k++) worst = Math.max(worst, dens[k]! / Math.max(1, area[k]!) - dens[k + 1]! / Math.max(1, area[k + 1]!));
  assert.ok(worst < 0.3, `no circular rim (the mean coverage never falls by more than 0.3 in 4 px: ${worst.toFixed(2)})`);
});

test('the relief is read from a coarse mip before the dissolve\'s discard, and shades the collagen only by its coverage (no cel step, no edge line over it)', () => {
  const at = (re: RegExp): number => LOBULE_PLATE_FS.search(re);
  assert.ok(at(/reliefSlope\(vUv, fr\)/) > 0 && at(/reliefSlope\(vUv, fr\)/) < at(/if \(fadedOut\(\)\) discard;/), 'the relief samples come before the first discard');
  assert.match(LOBULE_PLATE_FS, /float kc = smoothstep\(0\.0, 0\.2, cov\)/);
  assert.match(LOBULE_PLATE_FS, /\(1\.0 - kc\)\);/, 'the plate edge line is weighted out over the collagen');
  assert.match(LOBULE_PLATE_FS, /cf = mix\(cf, reliefColour\(cf, rs\), kc\)/);
  assert.equal(RELIEF_LOD, 4);
  assert.equal(RELIEF_D_PX, 8, 'half a mip-4 texel: the slope never aliases into stripes');
  assert.ok(COLL_RELIEF_G > 0 && COLL_RELIEF_G < 100, 'the gain is the mock\'s subtle one');
});

test('healthy tissue is untouched: no relief colour change at s = 0, lit side lighter, shade side deeper, always in range', () => {
  const c = [0.76, 0.69, 0.57];
  assert.deepEqual(reliefColour(c, 0), c);
  const lit = reliefColour(c, 1), shade = reliefColour(c, -1);
  for (let i = 0; i < 3; i++) { assert.ok(lit[i]! >= c[i]! && lit[i]! <= 1); assert.ok(shade[i]! <= c[i]! && shade[i]! >= 0); }
  assert.ok(lit[0]! + lit[1]! + lit[2]! > c[0]! + c[1]! + c[2]!);
  assert.ok(shade[0]! + shade[1]! + shade[2]! < c[0]! + c[1]! + c[2]!);
});
