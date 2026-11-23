// Mohammad, 23 Nov 2026 (iPad, c0fd5543, Sites and causes 6/14): "why is it potato quality banded". ROOT CAUSES (collagen-field.ts): the relief's height was the SHARP painted layer at mip 3 with a gain that saturates at 0.01 alpha
// per plate px (every painted tier edge and fibre became a lit plus a shaded ridge: the washboard), the soft copy was ONE bilinear tap of mip 6 (a 64 px lattice: the blocks), and the arrival times were padded 32 px for a copy
// that reaches 76 to 80 (the rim). Every earlier test judged 1D profiles at plate scale through an ideal blur, so none could see it. This one judges at the iPad's screen scale (M = 2 and 1.4 device px per plate px, the
// photo's zoom) through the GPU's own path (tests/helpers/gpu-mips.ts: the 8 bit lattice aligned mip chain, bilinear fetches, the shader's 12 taps from the exported collFieldTaps), and it runs the same gates on the OLD rule,
// which must fail them: the harness has teeth.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOBULE_PLATE_FS, PLATE_PX, PLATE_S } from '../src/scene/lobule/plate.ts';
import { COLL_FIELD_GLSL, COLL_LOD, COLL_N, COLL_PX, SOFT_PAD_PX, bsplineD, bsplineW, collFieldTaps } from '../src/scene/lobule/collagen-field.ts';
import { RELIEF_G, reliefS } from '../src/scene/lobule/relief.ts';
import { CEL_LIGHT_UNIT } from '../src/scene/cel-glsl.ts';
import { bandFibreInto } from '../src/scene/lobule/from2d/lobule-paint.generated.js';
import { fieldAt, legacyAt, mipChain, bilinear, type Field, type Mips } from './helpers/gpu-mips.ts';
import { block, shaderText } from './shader-text.ts';
import { undeclared, badSamplers } from './gl-undeclared.ts';

const gen = readFileSync(new URL('../src/scene/lobule/from2d/lobule-paint.generated.js', import.meta.url), 'utf8');
const nums = (name: string): number[] => (new RegExp(`${name} = \\[([^\\]]+)\\]`).exec(gen)?.[1] ?? '').split(',').map(Number);
const PASS_K = nums('PASS_K'), PASS_A = nums('PASS_A');
test('the painter\'s passes are the three flat fills this test builds its bands from', () => { assert.deepEqual(PASS_K, [2.1, 1.45, 1]); assert.deepEqual(PASS_A, [0.12, 0.24, 0.5]); assert.equal(PLATE_PX, 2048); });

const n = PLATE_PX, sc = n / (2 * 1.22 * PLATE_S);   // plate px per world unit
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const Lx = CEL_LIGHT_UNIT[0], Ly = CEL_LIGHT_UNIT[1];
/** The magnifications of the photos: the iPad's lobule:sinusoid is 1.4 to 2.1 device px per plate px (2 and 1.4 here); an iPhone at DPR 3 shows the hexagon's corner to corner R as about 1100 device px, 1.3 per plate px (the cirrhosis slide 6/14
 *  photo, c0fd5543), and 3 when it is zoomed in. */
const MS = [3, 2, 1.4, 1.3];

// ---- layers (plate alpha, as the painter lays them: passes drawn twice, fibres over them)
interface Band { m: Mips; ang: number; cx: number; cy: number; nx: number; ny: number; edge: number; wd: number }
const PHASE = 0.37;   // (a lattice phase that is not 0: the band does not sit on the mip lattice)
function bandLayer(angDeg: number, wd: number, amp = 1): Band {
  const ang = angDeg * Math.PI / 180, nx = -Math.sin(ang), ny = Math.cos(ang), cx = 1024.3 + PHASE * 7, cy = 997.7 + PHASE * 5, edge = PASS_K[0]! * wd;
  const a = new Float32Array(n * n);
  // fibres as the painter strokes them (bandFibreInto: offset, wobble, thickness, LITE alpha 0.55 and DEEP 0.32), straight along the band
  const FB = { off: 0, fp: 0, wav: 0, iA: 0, iB: 0, lw: 0, deep: false }, fib: { off: number; fp: number; wav: number; u0: number; u1: number; lw: number; al: number }[] = [];
  for (let f = 0; f < 8; f++) { bandFibreInto(FB, 7, f, wd / sc, 26); fib.push({ off: FB.off, fp: FB.fp, wav: FB.wav, u0: FB.iA / 26, u1: FB.iB / 26, lw: FB.lw * sc, al: FB.deep ? 0.32 : 0.55 }); }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const px = x + 0.5 - cx, py = y + 0.5 - cy, d = px * nx + py * ny;
    if (Math.abs(d) > edge + 2) continue;
    let t1 = 1;
    for (let q = 0; q < 3; q++) t1 *= 1 - amp * PASS_A[q]! * clamp(PASS_K[q]! * wd - Math.abs(d) + 0.5, 0, 1);
    let tt = (1 - (1 - t1)) , al = 1 - tt;   // (one pass of the three tiers)
    al = 1 - (1 - al) * (1 - al);            // (drawn twice)
    const t = -px * ny + py * nx, u = clamp((t + 400) / 800, 0, 1);
    for (const f of fib) {
      if (u < f.u0 || u > f.u1) continue;
      const h = wd * (f.off + f.wav * Math.sin(2 * Math.PI * 4 * u + f.fp)), cov = clamp(f.lw / 2 - Math.abs(d - h) + 0.5, 0, 1);
      if (cov > 0) { const s = amp * f.al * cov; al = 1 - (1 - al) * (1 - s) * (1 - s); }
    }
    a[y * n + x] = al;
  }
  return { m: mipChain(a, n), ang, cx, cy, nx, ny, edge, wd };
}
/** A radial layer: v(r) alpha at distance r from (cx, cy). */
function radialLayer(v: (r: number) => number, cx = 1024.3, cy = 1000.7): { m: Mips; cx: number; cy: number } {
  const a = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) a[y * n + x] = v(Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
  return { m: mipChain(a, n), cx, cy };
}
const pxR = n / (2 * 1.22), rtPx = 0.17 * pxR;
const bands: Band[] = [];
for (const ang of [0, 30, 45, 60]) // (the three kinds of septum collagen-paint.ts septaBands draws: the hex edges (half width 0.1 R, alpha 1), the portal-central bridges (0.07 R, 1) and the spurs (0.033 R, alpha 0.8))
for (const [wd, amp] of [[0.1 * pxR, 1], [0.07 * pxR, 1], [0.033 * pxR, 0.8]] as const) bands.push(bandLayer(ang, wd, amp));

// ---- the judges
const step = (M: number): number => 1 / M;   // one device pixel, in plate px
/** The relief s along the normal through the band at offset t along it. */
function reliefAcross(b: Band, rule: Rule, M: number, t: number, relief: (f: Field) => number): { d: number; s: number; soft: number }[] {
  const out = [];
  for (let d = -b.edge - 110; d <= b.edge + 110; d += step(M)) {
    const x = b.cx + b.nx * d - b.ny * t, y = b.cy + b.ny * d + b.nx * t, f = rule(b.m, x, y);
    out.push({ d, s: relief(f), soft: f.soft });
  }
  return out;
}
/** Direction changes of s with a prominence of 0.1 (one lit lobe and one shade lobe across a rope is 2). */
function reversals(s: number[]): number {
  let ext = 0, dir = 0, ref = s[0]!;
  for (const v of s) {
    if (Math.abs(v - ref) > 0.1) { const nd = Math.sign(v - ref); if (dir !== 0 && nd !== dir) ext++; dir = nd; ref = v; }
    if ((dir > 0 && v > ref) || (dir < 0 && v < ref)) ref = v;
  }
  return ext;
}
/** The longest run of |s| >= 0.999, in plate px. */
function saturatedRun(s: number[], M: number): number { let best = 0, run = 0; for (const v of s) { run = Math.abs(v) >= 0.999 ? run + 1 : 0; best = Math.max(best, run); } return best * step(M); }
const maxSecond = (a: number[]): number => { let k = 0; for (let i = 2; i < a.length; i++) k = Math.max(k, Math.abs(a[i]! - 2 * a[i - 1]! + a[i - 2]!)); return k; };

type Rule = (m: Mips, x: number, y: number) => Field;
interface Verdict { reversals: number; satRun: number; weakest: number; block: number; second: number; jump: number }
/** Every gate's worst value over all the bands, both magnifications. `weakest`: the smallest peak |s| relative to the light's share across the band (the rope must show). */
function judge(rule: Rule, ideal: Rule, relief: (f: Field) => number): Verdict {
  const v: Verdict = { reversals: 0, satRun: 0, weakest: Infinity, block: 0, second: 0, jump: 0 };
  for (const b of bands) {
    const proj = Math.abs(b.nx * Lx + b.ny * Ly) / Math.hypot(Lx, Ly);
    for (const M of MS) {
      let peak = 0;
      for (let t = -96; t <= 96; t += 13.7) {
        const p = reliefAcross(b, rule, M, t, relief), s = p.map((q) => q.s);
        v.reversals = Math.max(v.reversals, reversals(s)); v.satRun = Math.max(v.satRun, saturatedRun(s, M));
        peak = Math.max(peak, ...s.map(Math.abs));
        if (t === 0 || t > 90) {
          const q = reliefAcross(b, ideal, M, t, relief).map((r) => r.soft);   // (the reconstruction itself: ideal bilinear weights)
          v.second = Math.max(v.second, maxSecond(q));
          for (let i = 0; i < p.length; i++) v.jump = Math.max(v.jump, Math.abs(p[i]!.soft - q[i]!));   // (what the GPU's 8 bit weights move it by)
        }
      }
      if (proj > 0.5) v.weakest = Math.min(v.weakest, peak / proj);
      if (process.env.DBG && M === 2) { let raw = 0, sr = 0; for (let t = -96; t <= 96; t += 13.7) { const p = reliefAcross(b, rule, M, t, relief); for (const q of p) raw = Math.max(raw, Math.abs(q.s)); sr = Math.max(sr, saturatedRun(p.map((q) => q.s), M)); } console.log(`# band ${(b.ang * 180 / Math.PI).toFixed(0)} deg wd ${b.wd.toFixed(0)}: proj ${proj.toFixed(2)} peak ${raw.toFixed(2)} satRun ${sr.toFixed(1)}`); }
    }
    // blockiness: along lines parallel to a DIAGONAL band the soft alpha should not move
    if (b.ang % 90 !== 0) for (let d = -b.edge - 80; d <= b.edge + 80; d += 3) {
      let lo = 9, hi = -9;
      for (let t = -128; t <= 128; t += 1) { const f = rule(b.m, b.cx + b.nx * d - b.ny * t, b.cy + b.ny * d + b.nx * t); lo = Math.min(lo, f.soft); hi = Math.max(hi, f.soft); }
      v.block = Math.max(v.block, hi - lo);
    }
  }
  return v;
}
const newRelief = (f: Field): number => reliefS(f.gx, f.gy, Lx, Ly);
const oldRelief = (f: Field): number => clamp(-100 * (f.gx * Lx + f.gy * Ly), -1, 1);   // (c0fd5543: a clamp at G 100)
const NEW = judge(fieldAt, (m, x, y) => fieldAt(m, x, y, false), newRelief), OLD = judge(legacyAt, (m, x, y) => legacyAt(m, x, y, false), oldRelief);
console.log(`# new rule: ${JSON.stringify(NEW)}\n# c0fd5543 rule: ${JSON.stringify(OLD)}`);

test('relief: across a band the relief is ONE lit flank and ONE shade flank (at most 2 reversals), never saturated for more than 4 plate px, and the rope still shows', () => {
  assert.ok(NEW.reversals <= 2, `${NEW.reversals} reversals`);
  assert.ok(NEW.satRun <= 4, `a run of |s| = 1 of ${NEW.satRun} plate px`);
  assert.ok(NEW.weakest >= 0.5, `peak |s| over the light's share is ${NEW.weakest.toFixed(2)}`);
});
test('blocks: along a diagonal band the soft alpha varies at most 0.02 (the lattice does not show)', () => { assert.ok(NEW.block <= 0.02, `${NEW.block.toFixed(4)}`); });
test('smoothness: the worst second difference of the soft alpha is at most 5e-4 per device px squared, and the GPU\'s 8 bit weights never move it by more than one 8 bit level (M = 3, 2, 1.4, 1.3)', () => {
  assert.ok(NEW.second <= 5e-4, `${NEW.second.toExponential(2)}`);
  assert.ok(NEW.jump <= 1 / 255 + 1e-9, `${NEW.jump.toExponential(2)}`);
});

test('the harness has teeth: the rule of c0fd5543 fails the relief, the blocks and the smoothness gates', () => {
  assert.ok(OLD.reversals > 2, `old reversals ${OLD.reversals}`);
  assert.ok(OLD.satRun > 4, `old saturated run ${OLD.satRun}`);
  assert.ok(OLD.block > 0.02, `old block ${OLD.block.toFixed(3)}`);
  assert.ok(OLD.second > 5e-4, `old second difference ${OLD.second.toExponential(2)}`);
  assert.ok(OLD.second > 10 * NEW.second, 'and the new field is far smoother');
});

test('reach: past the painted edge by SOFT_PAD_PX the field is under 1/255 for the septum, the tract and the vein\'s cuff (so the arrival times\' pad covers it)', () => {
  assert.equal(SOFT_PAD_PX, 80);
  let worst = 0;
  for (const b of bands) for (let t = -128; t <= 128; t += 8) for (const sg of [-1, 1]) {
    const d = sg * (b.edge + SOFT_PAD_PX), f = fieldAt(b.m, b.cx + b.nx * d - b.ny * t, b.cy + b.ny * d + b.nx * t);
    worst = Math.max(worst, f.soft);
  }
  // the tract: the disc (0.24) and its cuff (0.4) as the terraces test builds them; the vein's cuff: one flat annulus (0.4) from the wall outward
  const tract = radialLayer((r) => { const d = r < rtPx ? 0.24 : 0, c = r > rtPx * 0.62 && r < rtPx * 1.08 ? 0.4 : 0; return 1 - (1 - d) * (1 - c); }), cuff = radialLayer((r) => (r > 90 && r < 260 ? 0.4 : 0));
  for (const [name, L, edge] of [['tract', tract, rtPx * 1.08], ['cuff', cuff, 260]] as const) {
    let w = 0;
    for (let a = 0; a < 2 * Math.PI; a += 0.07) w = Math.max(w, fieldAt(L.m, L.cx + Math.cos(a) * (edge + SOFT_PAD_PX), L.cy + Math.sin(a) * (edge + SOFT_PAD_PX)).soft);
    console.log(`# ${name}: field alpha at the edge + ${SOFT_PAD_PX} px: ${w.toExponential(2)}`);
    worst = Math.max(worst, w);
    // and it is smooth round them as well: no kink at the radius
    for (const M of MS) { const p: number[] = []; for (let r = 0; r < edge + 120; r += step(M)) p.push(fieldAt(L.m, L.cx + r, L.cy, false).soft); assert.ok(maxSecond(p) <= 5e-4, `${name} M ${M}: second difference ${maxSecond(p).toExponential(2)}`); }
  }
  assert.ok(worst <= 1 / 255, `${worst}`);
});

test('the field\'s twin: weights sum to 1 and their derivatives to 0, the taps keep inside their plate, and the value and slope match a direct B-spline of the texels', () => {
  for (let f = 0; f <= 1; f += 0.125) {
    assert.ok(Math.abs(bsplineW(f).reduce((a, b) => a + b) - 1) < 1e-12); assert.ok(Math.abs(bsplineD(f).reduce((a, b) => a + b)) < 1e-12);
    const d = bsplineD(f); assert.ok(d[0] <= 0 && d[1] <= 0 && d[2] >= 0 && d[3] >= 0 && Math.abs(d[0] + d[1]) > 0.4, 'the pair trick holds');
  }
  // against the direct sum (no bilinear trick), on the first band
  const b = bands[3]!, k = COLL_LOD, s = 2 ** k;
  const tex = (i: number, j: number): number => { const sz = n >> k; return b.m.lv[k]![clamp(j, 0, sz - 1) * sz + clamp(i, 0, sz - 1)]!; };
  for (const [x, y] of [[b.cx + 40.3, b.cy + 11.1], [b.cx - 70.9, b.cy + 5.5], [333.3, 222.2]] as const) {
    const u = x / s - 0.5, v = y / s - 0.5, i = Math.floor(u), j = Math.floor(v), wu = bsplineW(u - i), wv = bsplineW(v - j), du = bsplineD(u - i), dv = bsplineD(v - j);
    let h = 0, gx = 0, gy = 0;
    for (let q = 0; q < 4; q++) for (let p = 0; p < 4; p++) { const t = tex(i - 1 + p, j - 1 + q); h += wu[p]! * wv[q]! * t; gx += du[p]! * wv[q]! * t; gy += wu[p]! * dv[q]! * t; }
    const f = fieldAt(b.m, x, y, false);
    assert.ok(Math.abs(f.soft - h) < 1e-9 && Math.abs(f.gx - gx / s) < 1e-9 && Math.abs(f.gy - gy / s) < 1e-9, `at ${x},${y}: ${f.soft} vs ${h}, ${f.gx} vs ${gx / s}`);
  }
  for (const [u, v] of [[0.001, 0.5], [0.999, 0.002], [0.5, 0.5], [0, 1]] as const) {
    const t = collFieldTaps(u, v);
    for (const k2 of [...t.val, ...t.dx, ...t.dy]) assert.ok(k2.u >= 0.5 / COLL_N - 1e-12 && k2.u <= 1 - 0.5 / COLL_N + 1e-12 && k2.v >= 0.5 / COLL_N - 1e-12 && k2.v <= 1 - 0.5 / COLL_N + 1e-12, 'a tap stays on its own plate (the atlas seam)');
    assert.ok(Math.abs(t.val.reduce((a, q) => a + q.w, 0) - 1) < 1e-12 && Math.abs(t.dx.reduce((a, q) => a + q.w, 0)) < 1e-12);
  }
  assert.equal(COLL_N, 64); assert.equal(COLL_PX, 32); assert.ok(RELIEF_G > 0); void bilinear;
});

test('shader text: the field is read once in main before the first discard and only where something grew, plateAt reuses it, and the old samplers are gone; it declares what it uses', () => {
  const t = shaderText(LOBULE_PLATE_FS), pa = block(t, 'vec4 plateAt('), main = t.slice(t.indexOf('void main() {'));
  assert.ok(t.includes('CollF collField(vec2 uv, float plate0)') && COLL_FIELD_GLSL.includes('textureLod(mapC'), 'the field is in the plate');
  assert.ok(!pa.includes('textureLod(mapC') && !pa.includes('collField('), 'plateAt takes no fetch of its own');
  assert.ok(pa.includes('cs = mix(gFS.v, cs, smoothstep(SOFT_E0, SOFT_E1, gFS.v.a));') && pa.includes('cu = mix(gFU.v, cu, smoothstep(SOFT_E0, SOFT_E1, gFU.v.a));'), 'the switch is on the field\'s own alpha');
  for (const gone of ['reliefH', 'reliefSlope', 'RELIEF_EDGE', 'SOFT_EDGE', 'collLod', 'SOFT_LOD', 'RELIEF_LOD']) assert.ok(!t.includes(gone), `${gone} is gone`);
  assert.match(main, /if \(uP\.x \+ uP\.y \+ uP\.z > 0\.0\) \{ gFS = collField\(vUv, 0\.5\); gFU = collField\(vUv, 0\.0\); \}/, 'healthy tissue takes no fetch');
  const first = main.indexOf('collField('), disc = main.indexOf('discard;');
  assert.ok(first > 0 && first < main.indexOf('plateTex(vUv)') && main.lastIndexOf('collField(') < disc, 'every field read comes before the first discard');
  assert.match(main, /rs = reliefS\(gFS\.g \* fr\.x \+ gFU\.g \* fr\.y, vL\);/);
  assert.deepEqual(undeclared(LOBULE_PLATE_FS, ['cameraPosition', 'modelMatrix', 'modelViewMatrix', 'projectionMatrix', 'viewMatrix', 'normalMatrix']), [], 'every name resolves');
  assert.deepEqual(badSamplers(LOBULE_PLATE_FS), [], 'every sampler is declared');
});
