// Plan 48b (Mohammad, 23 Nov 2026: "the glow of fibrosis is back and now it's worse"): Plan 48's edge at the OUTER pass with a 0.12 rim laid a 63 device px soft ramp round the hexagon (120 device px outside it on his iPhone). Now the edge is the MIDDLE pass (1.45 x w / 2),
// its coverage the painter's own 0.55, and nothing at all lies past it: every fade is inside the band.
// Plan 48 (Mohammad, 23 Nov 2026: "not just one color, not the variation roped we agreed on, not that faded and beautiful"): the bands FADE from a faint rim to the dense core over the painter's own fade width, with the rope's relief across the whole fade, never glowing outside the edge.
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
import { COLL_A, COLL_A0, EDGE_BOX, EDGE_PLATE_PX, E_LO, E_SPAN, K_IN, K_MID, K_OUT, K_OUT_END, STRIA_K, STRIA_MAX, TRACT_FADE, TRACT_RT, TRACT_RT_PX, angleToByte, byteToAngle, byteToEdge, coverageAt, edgeToByte, tToByte, tractEdge, tractFrontPx, tractRamp } from '../src/scene/lobule/collagen-edge.ts';
import { ROPE_LIFT_MAX, ropeColour, ropeS } from '../src/scene/lobule/relief.ts';
import { lookColours } from '../src/scene/lobule/lz-colours.ts';
import { LOOK_IDS } from '../src/looks/looks.ts';
import { undeclared, badSamplers, usedBeforeDeclared } from './gl-undeclared.ts';
import { shaderText } from './shader-text.ts';

const net = buildLobule(), G = plateShape(net);
const n = PLATE_PX, box = PLATE_BOX * PLATE_S, sc = n / (2 * box);   // plate px per world unit
const MS = [0.68, 1.3, 2, 3, 5];   // device px per plate px: his iPhone, whole lobule (0.68: radius 568 device px over 839 plate px), an iPhone at DPR 3 on the cirrhosis slide (1.3), an iPad (2), zoomed in (3, 5)
const smooth = (e0: number, e1: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
/** The septum's coverage the shader gives: one device pixel (half each side) about e = 0. */
const cover = (e: number, M: number, slope = 1): number => { const a = Math.max(0.5 * slope / M, 0.02); return smooth(-a, a, e); };   // (the shader's aS is half a device pixel of e itself: slope is how many plate px of e one plate px of the plate moves it, 1 along a true distance)

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
function hexMiddle(): { x: number; y: number; nx: number; ny: number; half: number; core: number; paint: number } {
  const b = septaBands(G).find((s) => s.kind === 'hex')!;
  const g = { P: new Float64Array(54), N: new Float64Array(54), Wd: new Float64Array(27), n: 26, L0: 1 };
  bandGeomInto(g, b.A, b.B, b.o, b.o.path);
  const i = 13, px = (v: number): number => (v + box) * sc;
  return { x: px(g.P[2 * i]!), y: px(g.P[2 * i + 1]!), nx: g.N[2 * i]!, ny: g.N[2 * i + 1]!, half: (K_MID / 2) * g.Wd[i]! * sc, core: (K_IN / 2) * g.Wd[i]! * sc, paint: K_OUT / 2 * g.Wd[i]! * sc };
}

/** Where along the normal (plate px from the centre line, on `side`) the baked distance crosses 0: the band's edge on that side, found, not assumed (the painter's widths wander along a band). */
function crossing(m: ReturnType<typeof hexMiddle>, side: number): number {
  let d = 0;
  while (edgeAt(m.x + side * m.nx * d, m.y + side * m.ny * d) > 0 && d < 600) d += 0.02;
  return d;
}
/** The painter's own MIDDLE pass of a band (bandOutlineFlat, k 1.45, the band's edge) as a polygon in plate px, arcs sampled. */
function bodyPolygon(b: ReturnType<typeof septaBands>[number]): [number, number][] {
  const g = { P: new Float64Array(54), N: new Float64Array(54), Wd: new Float64Array(27), n: 26, L0: 1 }, pts: [number, number][] = [];
  bandGeomInto(g, b.A, b.B, b.o, b.o.path);
  const px = (v: number): number => (v + box) * sc;
  const ctx = {
    beginPath() {}, closePath() {},
    moveTo(x: number, y: number) { pts.push([px(x), px(y)]); }, lineTo(x: number, y: number) { pts.push([px(x), px(y)]); },
    arc(cx: number, cy: number, r: number, a0: number, a1: number, ccw: boolean) { let d = a1 - a0; if (ccw) { while (d > 0) d -= 2 * Math.PI; } else { while (d < 0) d += 2 * Math.PI; } for (let k = 1; k <= 24; k++) pts.push([px(cx + r * Math.cos(a0 + d * k / 24)), px(cy + r * Math.sin(a0 + d * k / 24))]); },
  };
  bandOutlineFlat(ctx, g.P, g.N, g.Wd, K_MID, K_MID);
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
      const x = m.x + m.nx * d, y = m.y + m.ny * d, sl = Math.abs(edgeAt(x + m.nx * 0.01, y + m.ny * 0.01) - edgeAt(x - m.nx * 0.01, y - m.ny * 0.01)) / 0.02;   // (dFdx of the filtered e, as the shader reads it)
      const c = cover(edgeAt(x, y), M, sl);
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

test('GATE a rope: one lit flank and one shade flank across the whole fade, a flat crown, nothing at the rim; the lift never passes ROPE_LIFT_MAX of lightness, in every look', () => {
  const L = [0.5, 0.6];   // (a light that is not along the band)
  for (const ang of [0, 0.7, 1.9, 3.4, 5]) {
    const nx = Math.cos(ang), ny = Math.sin(ang);
    // across a band: the left flank has outward normal +n, the right -n; the crown (t = 1) is flat, the rim (t = 0) too, the relief swells between
    const left = ropeS(0.5, nx, ny, L[0]!, L[1]!), right = ropeS(0.5, -nx, -ny, L[0]!, L[1]!);
    assert.ok(Math.abs(left + right) < 1e-12 && Math.abs(left) <= 1 + 1e-12, 'opposite flanks, opposite signs');
    assert.equal(ropeS(1, nx, ny, L[0]!, L[1]!), 0, 'the crown is flat'); assert.equal(ropeS(0, nx, ny, L[0]!, L[1]!), 0, 'and so is the rim');
    assert.ok(Math.abs(ropeS(0.98, nx, ny, L[0]!, L[1]!)) < 0.08 && Math.abs(ropeS(0.02, nx, ny, L[0]!, L[1]!)) < 0.08, 'it eases into both');
    let sign = 0, flips = 0;
    for (let t = 0; t <= 1; t += 0.01) { const sv = ropeS(t, nx, ny, L[0]!, L[1]!); if (Math.abs(sv) > 1e-9) { const sg = Math.sign(sv); if (sign && sg !== sign) flips++; sign = sg; } }
    assert.equal(flips, 0, 'one sign per flank');
  }
  // facing the light squarely, the relief is whole at the middle of the fade
  const Lh = Math.hypot(L[0]!, L[1]!);
  assert.ok(Math.abs(ropeS(0.5, L[0]! / Lh, L[1]! / Lh, L[0]!, L[1]!) - 1) < 1e-12);
  const lum = (c: readonly number[]): number => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;
  for (const look of LOOK_IDS) {
    const T = lookColours(look), cols = [T.rgb01('--lz-septum'), ...(T.dark ? [[0.86, 0.78, 0.6]] : [[0.78, 0.64, 0.44]])];   // (the septa's colour and the tracts' PRE tone)
    for (const c of cols) {
      assert.ok(lum(ropeColour(c, 1)) - lum(c) <= ROPE_LIFT_MAX + 1e-9, `${look}: the lit flank is at most ${ROPE_LIFT_MAX} lighter than the collagen`);
      assert.ok(lum(ropeColour(c, -1)) < lum(c), `${look}: the shade flank is darker`);
      assert.deepEqual(ropeColour(c, 0), [c[0], c[1], c[2]], 'the crown keeps exactly the flat colour');
    }
  }
});

// ---- Plan 48: the fade, judged as the shader composites it (the JS twins of collCoverage and ropeColour over the look's cells)
const lumOf = (c: readonly number[]): number => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;
const over = (col: readonly number[], a: number, under: readonly number[]): number[] => [0, 1, 2].map((i) => col[i]! * a + under[i]! * (1 - a));
test('GATE fade (Plan 48b): the edge is the middle pass, 0.55 at the edge, nothing past it, a smooth climb INSIDE to 0.89 at fw_in, and the composite over Dark cells spans at least 0.08 from coverage alone', () => {
  const m = hexMiddle();
  // the painter's depth here: the middle pass's half width minus the core's (0.225 x the width)
  const fw = m.half - m.core;
  assert.ok(Math.abs(fw / (m.half * 2) - (K_MID - K_IN) / 2 / K_MID) < 1e-9 && fw > 15 && fw < 60, `a hex septum's fade depth is ${fw.toFixed(1)} plate px (0.225 of its width, which the painter's lump varies along the band)`);
  assert.equal(TRACT_FADE, 0.15); assert.equal(COLL_A0, 0.55);
  for (const M of MS) for (const side of [1, -1]) {
    const x0 = crossing(m, side);
    // GATE anti-glow: the edge sits at the middle pass (1.45 x w / 2), never the outer pass (2.1 x w / 2, ${m.paint - m.half} plate px further). The bake measures the distance to the centre line against the width interpolated along it, so where the painter's lump makes the width change 10% over one 32 px segment
    // the offset polygon's edge (what the painter draws, at the node) and the bake's differ by up to 1.5 px at this node (0.94 measured); that is far from the outer pass, which is what the gate is about
    assert.ok(Math.abs(x0 - m.half) <= 1.5, `M ${M}: the edge is ${x0.toFixed(2)} plate px from the centre line, the middle pass is ${m.half.toFixed(2)}`);
    assert.ok(m.paint - m.half > 20 && x0 < m.half + 3, 'the outer pass lies far beyond the edge, and nothing is drawn there');
    // no halo: nothing beyond the middle pass + 1 px, at any depth value the texels hold there
    for (let d = x0 + 1 / M + 0.02; d <= m.paint + 20; d += 0.37) {
      const x = m.x + side * m.nx * d, y = m.y + side * m.ny * d;
      assert.equal(cover(edgeAt(x, y), M) * coverageAt(sample(3, x, y) / 255), 0, `M ${M}: coverage past the edge at ${(d - x0).toFixed(2)} px`);
    }
    // the edge: one pixel inside it the coverage is the painter's middle tier
    const xr = m.x + side * m.nx * (x0 - 1), yr = m.y + side * m.ny * (x0 - 1);
    const rim = cover(edgeAt(xr, yr), M) * coverageAt(sample(3, xr, yr) / 255);
    assert.ok(rim >= 0.54, `M ${M}: edge coverage ${rim.toFixed(4)} one plate px inside`);
    // from the edge to the core: monotonic to 0.89 by e = fw, the steepest step between adjacent DEVICE pixels small (no band, no terrace)
    let prev = -1, steepest = 0, reached = -1;
    for (let d = x0 - 1; d >= x0 - fw - 20; d -= 1 / M) {
      const x = m.x + side * m.nx * d, y = m.y + side * m.ny * d;
      const c = cover(edgeAt(x, y), M) * coverageAt(sample(3, x, y) / 255);
      if (prev >= 0) { assert.ok(c >= prev - 1e-3, `M ${M}: the coverage never falls going in (${prev.toFixed(4)} then ${c.toFixed(4)} at ${(x0 - d).toFixed(1)} px)`); steepest = Math.max(steepest, Math.abs(c - prev)); }
      if (reached < 0 && c >= COLL_A - 0.005) reached = x0 - d;
      prev = c;
    }
    assert.ok(reached > 0 && reached <= fw + 1.5, `M ${M}: whole (0.89) by ${reached.toFixed(1)} plate px in, fw ${fw.toFixed(1)}`);
    // (the painter's lump makes this stretch of the hex septum the NARROWEST (w 87, fw_in 19.6 plate px): 1.5 x 0.34 / fw = 0.026 per plate px, so 0.038 per device px at M 0.68 (1.5 plate px); at the plan's w 168 (fw_in 38) it is 0.02. No terrace either way)
    assert.ok(steepest <= 0.04, `M ${M}: the steepest step is ${steepest.toFixed(4)}`);
  }
  // the core: on the centre line the coverage is whole
  assert.ok(Math.abs(coverageAt(sample(3, m.x, m.y) / 255) - COLL_A) < 1e-6, 'the core is whole on the centre line');
  // the composite over Dark cells: coverage alone spans at least 0.08 (the plan: 0.66 at the edge to 0.76 at the core), climbing
  for (const look of ['dark', 'navy', 'black'] as const) {
    const T = lookColours(look), tok = T.rgb01('--lz-septum'), cell = T.rgb01('--og-liver-1');
    const Ls = [0, 0.25, 0.5, 0.75, 1].map((t) => lumOf(over(tok, coverageAt(t), cell)));
    assert.ok(Ls[4]! - Ls[0]! >= 0.08, `${look}: composite spans ${(Ls[4]! - Ls[0]!).toFixed(3)} (edge ${Ls[0]!.toFixed(3)}, core ${Ls[4]!.toFixed(3)}, cells ${lumOf(cell).toFixed(3)})`);
    for (let i = 1; i < Ls.length; i++) assert.ok(Ls[i]! > Ls[i - 1]!, `${look}: lightness climbs edge to core`);
  }
});

test('Plan 48b profile across a hex septum at his zoom (568 device px lobule radius, 0.68 device px per plate px), from the border outward', () => {
  const M = 0.68, R = 839;
  assert.ok(Math.abs(568 / R - M) < 0.01);
  // (1) the plan's table, by the JS twins, for the plan's septum (w = 0.2 R = 168 plate px: edge 1.45 w / 2 = 122, core 84): coverage by device px from the hexagon's border
  const w = 0.2 * R, edge = K_MID * w / 2, core = K_IN * w / 2, fwIn = edge - core;
  const prof = (devPx: number): number => { const e = edge - devPx / M; return cover(e, M) * coverageAt(e / fwIn); };
  const rows = [0, 57, 70, 83, 84, 100, 120].map((dev) => `${dev} device px (${(dev / M).toFixed(0)} plate px): ${prof(dev).toFixed(3)}`);
  console.log('plan table, w 168:\n' + rows.join('\n'));
  assert.ok(Math.abs(fwIn - 0.225 * w) < 1e-9 && Math.abs(fwIn - 37.8) < 0.1);
  assert.equal(prof(0), COLL_A); assert.ok(Math.abs(prof(57) - COLL_A) < 0.01, 'the core, whole, to 84 plate px (57 device px)');
  assert.ok(prof(70) > 0.55 && prof(70) < COLL_A, 'the inner fade, smooth');
  assert.ok(prof(edge * M - 1) >= 0.54, 'a device px inside the edge: the painter\'s 0.55');
  assert.equal(prof(edge * M + 1), 0, 'a device px past the edge: exactly 0'); assert.equal(prof(120), 0); assert.equal(prof(100), 0);
  // (2) the baked texels at the narrowest stretch of the real band (w 87 plate px, its edge 63 plate px = 43 device px out): nothing past the edge + 1 device px, the edge 0.55 or more
  const m = hexMiddle();
  const at = (dev: number): number => { const d = dev / M, x = m.x + m.nx * d, y = m.y + m.ny * d; return cover(edgeAt(x, y), M) * coverageAt(sample(3, x, y) / 255); };
  const x0 = crossing(m, 1) * M;
  console.log(`real node (w ${(2 * m.half / K_MID).toFixed(0)} plate px): edge at ${x0.toFixed(1)} device px; ` + [0, 20, 30, x0 - 1, x0 + 1.5, x0 + 30, x0 + 60].map((d) => `${d.toFixed(0)}: ${at(d).toFixed(3)}`).join(', '));
  assert.equal(at(x0 + 1.5), 0); assert.equal(at(x0 + 60), 0); assert.ok(at(x0 - 1) >= 0.54);
});

test('GATE relief: the lit flank lifts at least 0.06 and the shade flank deepens at least 0.08 at the middle of the fade, never past the lift cap, no channel past 0.95; the crown is flat', () => {
  for (const look of LOOK_IDS) {
    const T = lookColours(look), cols = [T.rgb01('--lz-septum'), ...(T.dark ? [[0.86, 0.78, 0.6]] : [[0.78, 0.64, 0.44]])];
    for (const c of cols) {
      const lit = ropeColour(c, 1), sh = ropeColour(c, -1);
      assert.ok(lumOf(lit) - lumOf(c) >= 0.06 - 1e-9 && lumOf(lit) - lumOf(c) <= ROPE_LIFT_MAX + 1e-9, `${look}: lit dL ${(lumOf(lit) - lumOf(c)).toFixed(3)}`);
      assert.ok(lumOf(sh) - lumOf(c) <= -0.08, `${look}: shade dL ${(lumOf(sh) - lumOf(c)).toFixed(3)}`);
      assert.ok(Math.max(...lit, ...sh) <= 0.95 || T.dark === false, `${look}: no channel past 0.95 (${Math.max(...lit).toFixed(3)})`);
    }
  }
  // in Dark the shade flank stays clear of the cells where the band is dense (the lower half of the fade is mostly cells and is judged by the span above)
  const T = lookColours('dark'), tok = T.rgb01('--lz-septum'), cell = T.rgb01('--og-liver-1');
  const shadeCore = lumOf(over(ropeColour(tok, -1), coverageAt(0.85), cell)) - lumOf(cell);
  assert.ok(shadeCore >= 0.1, `Dark: the shade flank near the core is ${shadeCore.toFixed(3)} above the cells`);
});

test('GATE striations: a fibre or a nucleus moves the lightness by at most STRIA_MAX x STRIA_K, so no dark worm is possible (the speckle gate)', () => {
  assert.ok(STRIA_MAX * STRIA_K <= 0.036 + 1e-12, 'the striation is at most 3.6% of the colour');
  for (const look of LOOK_IDS) {
    const T = lookColours(look), cols = [T.rgb01('--lz-septum'), ...(T.dark ? [[0.86, 0.78, 0.6]] : [[0.78, 0.64, 0.44]])];
    for (const c of cols) {
      const dark = c.map((v) => v * (1 - STRIA_MAX * STRIA_K));   // (the worst striation on the flat colour: a nucleus at its darkest)
      assert.ok(lumOf(c) - lumOf(dark) <= 0.05, `${look}: the darkest striation is ${(lumOf(c) - lumOf(dark)).toFixed(4)} below the band's token (the plan's gate: under 0.05)`);
    }
  }
});

test('the bake round-trips: the edge to 0.15 plate px through the square-root byte and the bilinear filter, the normal to 1 degree, t to a byte', () => {
  let worst = 0;
  for (let e = E_LO; e <= 5; e += 0.013) worst = Math.max(worst, Math.abs(byteToEdge(edgeToByte(e)) - e));
  assert.ok(worst <= 0.15, `the byte's own error near the edge is ${worst.toFixed(3)} (near the edge)`);
  // two neighbouring texels of a ramp of slope 1 (a plate px each), read bilinearly at every fraction, across the rim (from 1 px outside to 3 px in) where the coverage is decided: farther out nothing is drawn, deeper the depth t, a linear byte, is what is read
  let bil = 0;
  for (let e0 = -2; e0 < 3; e0 += 0.07) for (let f = 0; f <= 1; f += 0.05) {
    const b0 = edgeToByte(e0), b1 = edgeToByte(e0 + 1), b = b0 + (b1 - b0) * f;
    bil = Math.max(bil, Math.abs(E_LO + E_SPAN * (b / 255) ** 2 - (e0 + f)));
  }
  assert.ok(bil <= 0.15, `the filtered edge is off by ${bil.toFixed(3)} plate px`);
  let ang = 0;
  for (let a = -Math.PI; a <= Math.PI; a += 0.0037) { let d = Math.abs(byteToAngle(angleToByte(a)) - a); d = Math.min(d, 2 * Math.PI - d); ang = Math.max(ang, d); }
  assert.ok(ang * 180 / Math.PI <= 1, `the angle byte is off by ${(ang * 180 / Math.PI).toFixed(2)} degrees`);
  assert.equal(tToByte(0), 0); assert.equal(tToByte(1), 255); assert.equal(tToByte(2), 255);
});

test('the painter\'s passes are the ones the bake measures (PASS_K)', () => {
  const src = readFileSync(new URL('../src/scene/lobule/from2d/lobule-paint.generated.js', import.meta.url), 'utf8');
  assert.match(src, new RegExp(`PASS_K = \\[${K_OUT}, ${K_MID}, ${K_IN}\\]`));
  assert.equal(K_OUT_END, K_MID);
});

test('the texels\' normals point out of the body (the angle byte; up is +y)', () => {
  const m = hexMiddle();
  for (const side of [1, -1]) {
    const d = m.half * 0.6, x = m.x + side * m.nx * d, y = m.y + side * m.ny * d;
    const k = 4 * (Math.floor(y) * n + Math.floor(x)), a = byteToAngle(tex[k + 1]!);
    const ox = Math.cos(a), oy = Math.sin(a);   // (the canvas's y runs down: the texel's y is up)
    assert.ok(ox * (side * m.nx) - oy * (side * m.ny) > 0.99, `outward on the ${side > 0 ? '+' : '-'}n side`);
  }
});

// ---- the shader
test('GLSL: no blurred copy is left in the plate; the edge is the distance, taken before the discard; every name declared', () => {
  const t = shaderText(LOBULE_PLATE_FS);
  for (const gone of ['collField', 'COLL_FIELD', 'SOFT_E0', 'SOFT_E1', 'gFS', 'gFU', 'textureLod', 'gCov']) assert.ok(!t.includes(gone), `${gone} is gone`);
  assert.match(t, /smoothstep\(-aS, aS, eS\)/); assert.match(t, /smoothstep\(-aT, aT, eT\)/);
  assert.ok(t.indexOf('collagenAt(vUv)') < t.indexOf('if (fadedOut()) discard;'), 'the collagen\'s derivatives are read before the dissolve\'s discard');
  const body = t.slice(t.indexOf('vec4 collagenAt('), t.indexOf('float plateEdge('));
  const fetches = (body.match(/texture2D\(/g) ?? []).length + (body.match(/texelFetch\(/g) ?? []).length;
  assert.ok(fetches <= 10, `the collagen costs ${fetches} fetches (the blurred copy cost 24 more; Plan 48: 4 atlas reads, the arrival texel and its nearest angle, 4 more only while a look crossfades)`);
  // Plan 48: the flat tokens are the base colour; the atlas's colour is never un-premultiplied into it (a nucleus then was an opaque dark worm); healthy tissue reads nothing
  assert.ok(!t.includes('collColour'), 'collColour (the un-premultiplied atlas colour) is gone');
  assert.match(t, /ropeColour\(baseS,/); assert.match(t, /ropeColour\(baseT,/); assert.match(t, /collCoverage\(tm\.a\)/); assert.match(t, /collCoverage\(tT\)/);
  assert.match(t, /uP\.x \+ uP\.y \+ uP\.z <= 0\.0\) return vec4\(0\.0\)/, 'healthy tissue (no growth) takes no collagen fetch: bit-identical');
  assert.ok(body.indexOf('texelFetch(') < body.indexOf('return vec4(colT * covT'), 'the angle is read inside the collagen');
  assert.deepEqual(undeclared(LOBULE_PLATE_FS, ['cameraPosition', 'modelMatrix', 'modelViewMatrix', 'projectionMatrix', 'viewMatrix', 'normalMatrix']), [], 'every name is declared before it is used');
  assert.deepEqual(usedBeforeDeclared(LOBULE_PLATE_FS), [], 'every name is declared BEFORE it is used (the driver reads top to bottom)');
  assert.deepEqual(badSamplers(LOBULE_PLATE_FS), [], 'every sampler is declared');
  parser.parse(LOBULE_PLATE_FS.replace(/^\n/, '').replace(/^#include.*$/gm, ''), { quiet: true });
});

test('the plate no longer reads the files of the blurred copy', () => {
  const src = readFileSync(new URL('../src/scene/lobule/plate.ts', import.meta.url), 'utf8');
  assert.ok(!/collagen-soft|collagen-field/.test(src));
  assert.ok(E_LO < 0 && E_SPAN >= 60, 'the byte reaches the fade\'s depth');
});
