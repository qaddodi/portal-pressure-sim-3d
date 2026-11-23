// Plan 47 (Mohammad, 23 Nov 2026: "why is the fibrosis looking like soft glow ... fibrosis should not be glowing"). ROOT CAUSE (e1b0d34c made it the design): every septum and tract was drawn twice, a crisp core and a blurred copy of itself (a cubic
// B-spline of mip 5, 32 plate px a texel, reaching 80 plate px past the painted edge) that showed wherever the field's alpha was under 0.7, and the rope's lit flank came from the copy's slope: a blurred copy laid round a shape is a glow by construction.
// Now a band is a shape with a one device pixel edge computed from its DISTANCE to that edge (collagen-edge.ts, baked into the arrival times' texels by collagen-tau.ts for the septa, analytic for the tracts). This test judges that
// through the texels as the GPU reads them (8 bit, bilinear) at the screens' magnifications, with the OLD rule as the twin the no-glow gate must fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parser } from '@shaderfrog/glsl-parser/index.js';
import { LOBULE_PLATE_FS, PLATE_BOX, PLATE_PX, PLATE_S, plateShape } from '../src/scene/lobule/plate.ts';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { collagenTau } from '../src/scene/lobule/collagen-tau.ts';
import { septaBands } from '../src/scene/lobule/collagen-paint.ts';
import { bandOutlineFlat } from '../src/scene/lobule/from2d/lobule-look.generated.js';
import { bandGeomInto } from '../src/scene/lobule/from2d/lobule-paint.generated.js';
import { COLL_A, CORE_K, EDGE_BOX, EDGE_PLATE_PX, E_LO, E_SPAN, TRACT_RT, TRACT_RT_PX, byteToEdge, byteToUnit, tractEdge, tractFrontPx, tractRamp } from '../src/scene/lobule/collagen-edge.ts';
import { ROPE_LIFT_MAX, ROPE_W, ropeColour, ropeS } from '../src/scene/lobule/relief.ts';
import { lookColours } from '../src/scene/lobule/lz-colours.ts';
import { LOOK_IDS } from '../src/looks/looks.ts';
import { undeclared, badSamplers, usedBeforeDeclared } from './gl-undeclared.ts';
import { shaderText } from './shader-text.ts';

const net = buildLobule(), G = plateShape(net);
const n = PLATE_PX, box = PLATE_BOX * PLATE_S, sc = n / (2 * box);   // plate px per world unit
const MS = [1.3, 2, 3, 5];   // device px per plate px: an iPhone at DPR 3 on the cirrhosis slide (1.3), an iPad (2), zoomed in (3, 5)
const smooth = (e0: number, e1: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
/** The septum's coverage the shader gives: one device pixel (half each side) about e = 0. */
const cover = (e: number, M: number): number => { const a = Math.max(0.5 / M, 0.02); return smooth(-a, a, e); };

test('the plate numbers the shader shares with the arrival times are the plate\'s own', () => {
  assert.equal(EDGE_PLATE_PX, PLATE_PX); assert.equal(EDGE_BOX, PLATE_BOX);
  assert.equal(TRACT_RT, net.rt, 'the tract radius');
  assert.ok(Math.abs(TRACT_RT_PX - net.rt * PLATE_S * sc) < 1e-9);
  assert.equal(net.corners.length, 6);
  net.corners.forEach(([x, y], k) => { assert.ok(Math.abs(x - Math.cos(k * Math.PI / 3)) < 1e-9 && Math.abs(y - Math.sin(k * Math.PI / 3)) < 1e-9, `corner ${k} is where the shader puts the tract`); });
});

// ---- the baked texels of the real lobule, read as the GPU reads them
const tex = collagenTau(G, 0, n, box);
/** Bilinear sample of one channel at plate px (x, y) on the canvas's rows (the texture is the canvas's rows; the shader's flip does not matter for a profile). */
function sample(ch: number, x: number, y: number): number {
  const fx = x - 0.5, fy = y - 0.5, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const g = (i: number, j: number): number => tex[4 * (Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))) + ch]!;
  return (g(ix, iy) * (1 - tx) + g(ix + 1, iy) * tx) * (1 - ty) + (g(ix, iy + 1) * (1 - tx) + g(ix + 1, iy + 1) * tx) * ty;
}
const edgeAt = (x: number, y: number): number => byteToEdge(sample(2, x, y));

/** A hex septum's middle: its centre point, its unit normal and its body's half width, in plate px (the painter's own geometry). */
function hexMiddle(): { x: number; y: number; nx: number; ny: number; half: number; paint: number } {
  const b = septaBands(G).find((s) => s.kind === 'hex')!;
  const g = { P: new Float64Array(54), N: new Float64Array(54), Wd: new Float64Array(27), n: 26, L0: 1 };
  bandGeomInto(g, b.A, b.B, b.o, b.o.path);
  const i = 13, px = (v: number): number => (v + box) * sc;
  return { x: px(g.P[2 * i]!), y: px(g.P[2 * i + 1]!), nx: g.N[2 * i]!, ny: g.N[2 * i + 1]!, half: (CORE_K / 2) * g.Wd[i]! * sc, paint: 2.1 / 2 * g.Wd[i]! * sc };
}

/** Where along the normal (plate px from the centre line, on `side`) the baked distance crosses 0: the band's edge on that side, found, not assumed (the painter's widths wander along a band). */
function crossing(m: ReturnType<typeof hexMiddle>, side: number): number {
  let d = 0;
  while (edgeAt(m.x + side * m.nx * d, m.y + side * m.ny * d) > 0 && d < 600) d += 0.02;
  return d;
}
/** The painter's own middle pass of a band (bandOutlineFlat, k 1.45) as a polygon in plate px, arcs sampled. */
function bodyPolygon(b: ReturnType<typeof septaBands>[number]): [number, number][] {
  const g = { P: new Float64Array(54), N: new Float64Array(54), Wd: new Float64Array(27), n: 26, L0: 1 }, pts: [number, number][] = [];
  bandGeomInto(g, b.A, b.B, b.o, b.o.path);
  const px = (v: number): number => (v + box) * sc;
  const ctx = {
    beginPath() {}, closePath() {},
    moveTo(x: number, y: number) { pts.push([px(x), px(y)]); }, lineTo(x: number, y: number) { pts.push([px(x), px(y)]); },
    arc(cx: number, cy: number, r: number, a0: number, a1: number, ccw: boolean) { let d = a1 - a0; if (ccw) { while (d > 0) d -= 2 * Math.PI; } else { while (d < 0) d += 2 * Math.PI; } for (let k = 1; k <= 24; k++) pts.push([px(cx + r * Math.cos(a0 + d * k / 24)), px(cy + r * Math.sin(a0 + d * k / 24))]); },
  };
  bandOutlineFlat(ctx, g.P, g.N, g.Wd, 1.45, 1.45);
  return pts;
}
const inside = (poly: [number, number][], x: number, y: number): boolean => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; }
  return c;
};
test('the septa\'s texels are the painter\'s own middle pass: inside it e is above 0 and outside below, every septum', () => {
  for (const b of septaBands(G)) {
    const poly = bodyPolygon(b), xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
    let wrong = 0, worst = 0, count = 0;
    for (let y = Math.floor(Math.min(...ys)) - 6; y <= Math.ceil(Math.max(...ys)) + 6; y += 3) for (let x = Math.floor(Math.min(...xs)) - 6; x <= Math.ceil(Math.max(...xs)) + 6; x += 3) {
      if (x < 1 || y < 1 || x > n - 2 || y > n - 2) continue;
      count++;
      const e = edgeAt(x + 0.5, y + 0.5), inn = inside(poly, x + 0.5, y + 0.5);
      // (other bands that overlap this one may hold a pixel inside their own body: only a pixel this band's body holds must be inside)
      if (inn && e < 0) { wrong++; worst = Math.max(worst, -e); }
    }
    assert.ok(count > 100);
    assert.ok(wrong / count < 0.002 && worst < 4, `${b.kind}: ${wrong} of ${count} pixels of the body read outside it (up to ${worst.toFixed(2)} px)`);
  }
});

test('the septum\'s texels hold a distance with a slope of 1 plate px per px across a band of even width', () => {
  const b = septaBands(G).find((s) => s.kind === 'pc')!, poly = bodyPolygon(b);
  // along a straight stretch the offset of the outline is the distance: find the e = 0 crossing along a normal and read the slope round it
  const m = hexMiddle();
  let slope = 0, k = 0;
  for (let d = m.half - 6; d < m.half + 2; d += 1) { const e0 = edgeAt(m.x + m.nx * d, m.y + m.ny * d), e1 = edgeAt(m.x + m.nx * (d + 0.5), m.y + m.ny * (d + 0.5)); slope += (e0 - e1) / 0.5; k++; }
  assert.ok(poly.length > 10);
  assert.ok(slope / k > 0.3 && slope / k < 3, `the edge distance changes ${(slope / k).toFixed(2)} plate px per px at the edge`);
});

test('GATE crisp: across a septum coverage goes from 0.02 to 0.98 in at most 1.2 device px, at every magnification', () => {
  const m = hexMiddle();
  for (const M of MS) {
    let lo = Infinity, hi = -Infinity;
    const x0 = crossing(m, 1);
    for (let d = x0 - 3; d <= x0 + 3; d += 0.01 / M) {
      const c = cover(edgeAt(m.x + m.nx * d, m.y + m.ny * d), M);
      if (c >= 0.02 && c <= 0.98) { lo = Math.min(lo, d); hi = Math.max(hi, d); }
    }
    assert.ok((hi - lo) * M <= 1.2, `M ${M}: ${((hi - lo) * M).toFixed(2)} device px`);
  }
});

/** What the e1b0d34c rule laid round a band: a cubic B-spline of the 32 plate px texels of its alpha (the soft copy), as the alpha one position past the painted edge. */
function oldGlowAlpha(past: number): number {
  const half = hexMiddle().paint, TEX = 32;   // (a hex septum's painted half width, plate px)
  const box32 = (i: number): number => { const a = i * TEX, b = a + TEX; return Math.max(0, Math.min(b, half) - Math.max(a, -half)) / TEX; };
  const x = half + past, c = x / TEX - 0.5, i = Math.floor(c), f = c - i, f2 = f * f, f3 = f2 * f;
  const w = [(1 - f) ** 3 / 6, (3 * f3 - 6 * f2 + 4) / 6, (-3 * f3 + 3 * f2 + 3 * f + 1) / 6, f3 / 6];
  return 0.89 * (w[0]! * box32(i - 1) + w[1]! * box32(i) + w[2]! * box32(i + 1) + w[3]! * box32(i + 2));
}
test('GATE no glow: one device pixel past a band\'s edge nothing of the collagen is drawn (and the old blurred copy was: the gate has teeth)', () => {
  assert.ok(oldGlowAlpha(20) > 1 / 255 && oldGlowAlpha(40) > 1 / 255, 'the old copy still had alpha 40 plate px past the painted edge: ' + oldGlowAlpha(40).toFixed(4));
  const m = hexMiddle();
  for (const M of MS) for (const side of [1, -1]) {
    const x0 = crossing(m, side);
    assert.ok(x0 > 20 && x0 < 400, 'the edge was found: ' + x0);
    for (let d = x0 + 1 / M + 0.02; d <= x0 + 40; d += 0.29) {
      const c = cover(edgeAt(m.x + side * m.nx * d, m.y + side * m.ny * d), M) * COLL_A;
      assert.ok(c === 0, `M ${M}: alpha ${c} at ${(d - x0).toFixed(2)} plate px past the edge`);
    }
  }
  // and nowhere in the layer: a texel more than a pixel outside every body has no coverage
  let bad = 0;
  for (let k = 0; k < n * n; k++) { const e = byteToEdge(tex[4 * k + 2]!); if (e < -1 && cover(e, 1.3) > 0) bad++; }
  assert.equal(bad, 0);
});

test('GATE no glow, tracts: the disc ends at its front, one pixel, at every growth, and grows as it did (nested, reversible)', () => {
  let last = -1;
  for (let p = 0; p <= 1.0001; p += 0.05) {
    const rf = tractFrontPx(p);
    for (const M of MS) {
      const a = 0.5 / M, r1 = rf + 1 / M + 0.02;
      assert.equal(smooth(-a, a, tractEdge(p, r1)), 0, `p ${p}: nothing a pixel past the front`);
      assert.equal(smooth(-a, a, tractEdge(p, rf - 1 / M - 0.02)), 1, `p ${p}: whole a pixel inside it`);
    }
    if (p > 0.1) assert.ok(rf > last, 'the front only moves out as the growth rises');
    last = rf;
  }
  assert.equal(tractRamp(0), 0, 'nothing before the first arrival'); assert.equal(tractRamp(0.2), 1);
  const full = tractFrontPx(1) / TRACT_RT_PX;
  assert.ok(full >= 1.7 && full <= 1.84, `the full disc reaches the cuff's edge, not past it: ${full.toFixed(3)} rt`);
});

test('GATE a rope: one lit flank and one shade flank, a flat crown, nothing outside; the lift never passes ROPE_LIFT_MAX of lightness, in every look', () => {
  const L = [0.5, 0.6], Lh = Math.hypot(L[0]!, L[1]!);   // (a light that is not along the band)
  for (const ang of [0, 0.7, 1.9, 3.4, 5]) {
    const nx = Math.cos(ang), ny = Math.sin(ang);
    // across a band: the left flank has outward normal +n, the right -n; the crown between them (e >= ROPE_W) is flat
    const left = ropeS(0, nx, ny, L[0]!, L[1]!), right = ropeS(0, -nx, -ny, L[0]!, L[1]!), crown = ropeS(ROPE_W + 5, nx, ny, L[0]!, L[1]!);
    assert.ok(Math.abs(left + right) < 1e-12 && Math.abs(left) <= 1 + 1e-12, 'opposite flanks, opposite signs');
    assert.equal(crown, 0, 'the crown is flat'); assert.ok(Math.abs(ropeS(ROPE_W * 0.98, nx, ny, L[0]!, L[1]!)) < 0.01, 'and eases into it');
    // along the profile s moves smoothly from the edge into the crown without changing sign
    let sign = 0, flips = 0;
    for (let e = 0; e <= ROPE_W; e += 0.25) { const s = ropeS(e, nx, ny, L[0]!, L[1]!); if (Math.abs(s) > 1e-9) { const sg = Math.sign(s); if (sign && sg !== sign) flips++; sign = sg; } }
    assert.equal(flips, 0, 'one sign per flank');
  }
  assert.equal(Lh > 0, true);
  const lum = (c: readonly number[]): number => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;
  for (const look of LOOK_IDS) {
    const T = lookColours(look), cols = [T.rgb01('--lz-septum'), ...(T.dark ? [[0.86, 0.78, 0.6]] : [[0.78, 0.64, 0.44]])];   // (the septa's colour and the tracts' PRE tone)
    for (const c of cols) {
      assert.ok(lum(ropeColour(c, 1)) - lum(c) <= ROPE_LIFT_MAX + 1e-9, `${look}: the lit flank is at most ${ROPE_LIFT_MAX} lighter than the collagen`);
      assert.ok(lum(ropeColour(c, -1)) < lum(c), `${look}: the shade flank is darker`);
      assert.deepEqual(ropeColour(c, 0), [c[0], c[1], c[2]], 'the crown keeps exactly the painted colour');
    }
  }
});

test('the texels\' normals point out of the body (unit length, up is +y)', () => {
  const m = hexMiddle();
  const d = m.half - 3, x = m.x + m.nx * d, y = m.y + m.ny * d;
  const ox = byteToUnit(sample(1, x, y)), oy = byteToUnit(sample(3, x, y));   // (the canvas's y runs down: the texel's y is up)
  assert.ok(Math.abs(Math.hypot(ox, oy) - 1) < 0.03);
  assert.ok(ox * m.nx - oy * m.ny > 0.97, 'outward on the +n side');
});

// ---- the shader
test('GLSL: no blurred copy is left in the plate; the edge is the distance, taken before the discard; every name declared', () => {
  const t = shaderText(LOBULE_PLATE_FS);
  for (const gone of ['collField', 'COLL_FIELD', 'SOFT_E0', 'SOFT_E1', 'gFS', 'gFU', 'textureLod', 'gCov']) assert.ok(!t.includes(gone), `${gone} is gone`);
  assert.match(t, /smoothstep\(-aS, aS, eS\)/); assert.match(t, /smoothstep\(-aT, aT, eT\)/);
  assert.ok(t.indexOf('collagenAt(vUv)') < t.indexOf('if (fadedOut()) discard;'), 'the collagen\'s derivatives are read before the dissolve\'s discard');
  const fetches = (t.slice(t.indexOf('vec4 collagenAt('), t.indexOf('float plateEdge(')).match(/texture2D\(/g) ?? []).length;
  assert.ok(fetches <= 10, `the collagen costs ${fetches} fetches (the blurred copy cost 24 more)`);
  assert.deepEqual(undeclared(LOBULE_PLATE_FS, ['cameraPosition', 'modelMatrix', 'modelViewMatrix', 'projectionMatrix', 'viewMatrix', 'normalMatrix']), [], 'every name is declared before it is used');
  assert.deepEqual(usedBeforeDeclared(LOBULE_PLATE_FS), [], 'every name is declared BEFORE it is used (the driver reads top to bottom)');
  assert.deepEqual(badSamplers(LOBULE_PLATE_FS), [], 'every sampler is declared');
  parser.parse(LOBULE_PLATE_FS.replace(/^\n/, '').replace(/^#include.*$/gm, ''), { quiet: true });
});

test('the plate no longer reads the files of the blurred copy', () => {
  const src = readFileSync(new URL('../src/scene/lobule/plate.ts', import.meta.url), 'utf8');
  assert.ok(!/collagen-soft|collagen-field/.test(src));
  assert.ok(E_LO < 0 && E_SPAN > ROPE_W, 'the byte reaches the rope\'s whole shoulder');
});
