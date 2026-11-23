// Mohammad, 23 Nov 2026: the fibrosis bands showed as stepped beige tiers; they must be ONE smooth gradient. ROOT CAUSE (collagen-soft.ts): the painter's band is three flat fills (PASS_K 2.1, 1.45, 1 x w; PASS_A .12, .24, .5) drawn
// twice, so the coverage across a septum is a staircase 0, .23, .55, .89 with 55 and 38 plate px tiers; the tracts' disc and cuff and the vein's cuff are flat fills too. An 8 px blur (mip 3) only rounded each tier's edge, and a
// switch on the SHARP alpha jumped with it. The plate now takes a soft copy at absolute level 6 (64 px) and mixes the painted layer in by the copy's OWN alpha. Judged here in node, from 1D profiles built from the painter's own
// constants, through the JS twin of the shader's rule (no GPU): no step over 1.5 % lightness per plate px with the worst look's contrast, no flat terrace outside a band's dense core, the arrival times reach as far as the copy spreads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOBULE_PLATE_FS, PLATE_BOX, PLATE_PX, PLATE_S, plateShape } from '../src/scene/lobule/plate.ts';
import { SOFT_E0, SOFT_E1, SOFT_LOD, SOFT_PAD_PX, SOFT_PLATE_PX, collagenSoft, softPadWorld } from '../src/scene/lobule/collagen-soft.ts';
import { RELIEF_LOD } from '../src/scene/lobule/relief.ts';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { collagenTau } from '../src/scene/lobule/collagen-tau.ts';
import { septaBands, tractCorners } from '../src/scene/lobule/collagen-paint.ts';
import { bandGeomInto } from '../src/scene/lobule/from2d/lobule-paint.generated.js';
import { NEVER } from '../src/scene/lobule/growth.ts';
import { DISC_R } from '../src/scene/lobule/widths.ts';
import { lookColours } from '../src/scene/lobule/lz-colours.ts';
import { toOklab } from '../src/scene/lenses/oklab.ts';
import { LOOK_IDS } from '../src/looks/looks.ts';
import { block, shaderText } from './shader-text.ts';
import { undeclared, badSamplers } from './gl-undeclared.ts';

// ---- the painter's own constants (the generated file keeps them private: read as numbers from its text, and pinned)
const gen = readFileSync(new URL('../src/scene/lobule/from2d/lobule-paint.generated.js', import.meta.url), 'utf8');
const nums = (name: string): number[] => (new RegExp(`${name} = \\[([^\\]]+)\\]`).exec(gen)?.[1] ?? '').split(',').map(Number);
const PASS_K = nums('PASS_K'), PASS_A = nums('PASS_A');
test('the painter\'s passes are the three flat fills this test models (a change of them is a change of the profile)', () => {
  assert.deepEqual(PASS_K, [2.1, 1.45, 1]); assert.deepEqual(PASS_A, [0.12, 0.24, 0.5]);
  assert.equal(SOFT_PLATE_PX, PLATE_PX, 'the arrival times\' pad is in plate px');
  assert.equal(2 ** SOFT_LOD / 2, SOFT_PAD_PX, 'the pad is half a texel of the soft copy\'s level');
  assert.ok(SOFT_LOD > RELIEF_LOD, 'the soft copy is coarser than the relief\'s height');
});

// ---- 1D profiles (plate px; the plate is 2048 px over 2.44 R)
const pxR = PLATE_PX / (PLATE_BOX * 2);
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
/** A box blur of one profile, `s` px wide (mip level log2 s): the soft copy. */
const boxBlur = (v: number[], s: number): number[] => v.map((_, i) => { let a = 0; for (let j = -s / 2; j < s / 2; j++) a += v[clamp(i + j, 0, v.length - 1)]!; return a / s; });
/** The profile through the shader's rule. */
const soften = (a: number[]): number[] => { const soft = boxBlur(a, 2 ** SOFT_LOD); return a.map((v, i) => collagenSoft(v, soft[i]!)); };
/** The worst contrast of the layer's colour against the cells, over every look (Oklab L). */
function worstContrast(layer: 'septa' | 'tracts'): number {
  let m = 0;
  for (const look of LOOK_IDS) {
    const L = lookColours(look), c = layer === 'septa' ? L.rgb01('--lz-septum') : (L.dark ? [0.86, 0.78, 0.6] : [0.78, 0.64, 0.44]);
    for (const bg of ['--og-liver-1', '--og-liver-2']) m = Math.max(m, Math.abs(toOklab([c[0]!, c[1]!, c[2]!])[0] - toOklab(L.rgb01(bg) as [number, number, number])[0]));
  }
  return m;
}
const maxStep = (a: number[], contrast: number): { step: number; at: number } => { let step = 0, at = 0; for (let i = 1; i < a.length; i++) { const d = Math.abs(a[i]! - a[i - 1]!) * contrast; if (d > step) { step = d; at = i; } } return { step, at }; };
/** Flat terraces: runs of 12+ px where the alpha stays between 0.02 and 0.8 and does not change, as [alpha, length, start]. */
function terraces(a: number[]): [number, number, number][] {
  const out: [number, number, number][] = []; let run = 1;
  for (let i = 1; i <= a.length; i++) {
    if (i < a.length && Math.abs(a[i]! - a[i - 1]!) < 2e-4) { run++; continue; }
    if (run >= 12 && a[i - 1]! > 0.02 && a[i - 1]! < 0.8) out.push([a[i - 1]!, run, i - run]);
    run = 1;
  }
  return out;
}

// a hex-edge septum (w 0.2 R) across its width, each band drawn twice (collagen-paint paintSepta), as coverage
const N = 700, c0 = 350;
const w = 0.2;
const septum = Array.from({ length: N }, (_, i) => { const x = (i - c0) / pxR; let t = 1; for (let q = 0; q < 3; q++) if (Math.abs(x) < PASS_K[q]! * w / 2) t *= 1 - PASS_A[q]!; const once = 1 - t; return 1 - (1 - once) * (1 - once); });
// a portal tract: the disc (a .24, r < rt) and its cuff (a .4, .62 rt to 1.08 rt) as coverage along a radius
const rt = 0.17;
const tract = Array.from({ length: 500 }, (_, i) => { const r = i / pxR, d = r < rt ? 0.24 : 0, c = r > rt * 0.62 && r < rt * 1.08 ? 0.4 : 0; return 1 - (1 - d) * (1 - c); });
// the vein's cuff: one flat annulus (a .4) from the wall outward, wider than the soft copy
const cuff = Array.from({ length: N }, (_, i) => (i > 150 && i < 450 ? 0.4 : 0));

test('the painted septum IS a staircase (the test sees what it must cure): tiers 0.23, 0.55 and 0.89, the outer ones tens of px wide', () => {
  const levels = [...new Set(septum.map((v) => v.toFixed(2)))];
  assert.deepEqual(levels, ['0.00', '0.23', '0.55', '0.89']);
  assert.ok(terraces(septum).length >= 4 && maxStep(septum, 0.68).step > 0.1, 'hard tiers as painted');
});

test('every look: the septum, the tract and the vein\'s cuff take no step over 1.5 % lightness per plate px', () => {
  for (const [name, prof, layer] of [['septum', septum, 'septa'], ['tract', tract, 'tracts'], ['vein cuff', cuff, 'tracts']] as const) {
    const contrast = worstContrast(layer), { step, at } = maxStep(soften([...prof]), contrast);
    console.log(`# ${name}: worst contrast ${contrast.toFixed(2)} L, max step ${(step * 100).toFixed(2)} % per px at ${at}`);
    assert.ok(contrast > 0.1, `${name}: the contrast is real (${contrast.toFixed(2)})`);
    assert.ok(step <= 0.015, `${name}: step ${(step * 100).toFixed(2)} % per plate px at px ${at}`);
  }
});

test('no flat terrace is left outside a band\'s dense core: the septum has none, the tract only its dense centre (r < 0.07 R)', () => {
  assert.deepEqual(terraces(soften([...septum])).map(([a, n, at]) => `${a.toFixed(2)} x ${n} px at ${at}`), [], 'the septum');
  const left = terraces(soften([...tract])).filter(([, , at]) => at / pxR >= 0.07);
  assert.deepEqual(left.map(([a, n, at]) => `${a.toFixed(2)} x ${n} px at ${(at / pxR).toFixed(2)} R`), [], 'the tract beyond its centre');
  // the vein's cuff is one flat fill: the soft copy must still ramp (no step), which the step test holds; its flat middle is the fill itself, not a terrace beside a step
});

test('the dense core keeps the painted fibres (the soft copy only takes over where it is faint) and a faint edge is the soft copy', () => {
  assert.equal(collagenSoft(0.9, 0.95) > 0.9 - 0.05, true);
  assert.ok(Math.abs(collagenSoft(0.9, 1)) - 0.9 < 1e-9, 'a dense soft copy shows the painted alpha whole');
  assert.equal(collagenSoft(0.55, 0.3), 0.3, 'a faint soft copy IS the soft copy (the sharp tier is gone)');
  assert.equal(collagenSoft(0, 0), 0, 'nothing stays nothing (healthy tissue)');
  for (let s = 0; s <= 1; s += 0.01) assert.ok(Math.abs(collagenSoft(0.7, s + 0.01) - collagenSoft(0.7, s)) < 0.05, 'smooth in the soft alpha');
  assert.equal(SOFT_E0 < SOFT_E1, true);
});

// ---- the arrival times reach as far as the soft copy spreads
const net = buildLobule(), shape = { ...plateShape(net), cells: [] };
const n = 512, box = PLATE_BOX * PLATE_S, sc = n / (2 * box), cvR = DISC_R.cv * PLATE_S, pad = softPadWorld(box);
const tau = collagenTau(shape, cvR, n, box);
const at = (x: number, y: number, ch: number): number => { const px = Math.floor((x + box) * sc), py = Math.floor((y + box) * sc); return tau[4 * (py * n + px) + ch]!; };

test('the pad is 32 plate px in world units', () => { assert.ok(Math.abs(pad - SOFT_PAD_PX * 2 * box / PLATE_PX) < 1e-9 && pad > 10 && pad < 25, `pad ${pad}`); });

test('arrival times: the tracts reach the soft copy\'s spread (2 rt + pad) and not past it', () => {
  for (const [cx, cy] of tractCorners(shape)) {
    const out = Math.atan2(cy - shape.cy, cx - shape.cx), ux = Math.cos(out), uy = Math.sin(out);
    for (const [r, want] of [[2 * shape.rt + 0.8 * pad, true], [2 * shape.rt + 1.4 * pad, false]] as const) {
      const x = cx + ux * r, y = cy + uy * r; if (Math.abs(x) > box - 2 || Math.abs(y) > box - 2) continue;
      assert.equal(at(x, y, 1) !== NEVER, want, `tract at (${cx.toFixed(0)}, ${cy.toFixed(0)}), r ${(r - 2 * shape.rt).toFixed(1)} past 2 rt`);
    }
  }
});

test('arrival times: the vein\'s cuff reaches its painted edge plus the pad and not past it', () => {
  const rOut = (cvR + shape.rcv0 * 0.95) * 1.08;
  assert.notEqual(at(shape.cx + rOut + 0.8 * pad, shape.cy, 2), NEVER, 'the soft copy past the cuff has an arrival time');
  assert.equal(at(shape.cx + rOut + 1.4 * pad, shape.cy, 2), NEVER);
});

test('arrival times: a pixel has a septum arrival time exactly when it lies within the painted half width (2.1 x the width) plus the pad of some band', () => {
  const g = { P: new Float64Array(54), N: new Float64Array(54), Wd: new Float64Array(27), n: 26, L0: 1 };
  const slack = new Float32Array(n * n).fill(Infinity);   // the smallest (distance - painted half width) to any band segment
  for (const b of septaBands(shape)) {
    bandGeomInto(g, b.A, b.B, b.o, b.o.path);
    for (let i = 0; i < g.n; i++) {
      const ax = g.P[2 * i]!, ay = g.P[2 * i + 1]!, bx = g.P[2 * i + 2]!, by = g.P[2 * i + 3]!, reach = 2.1 * Math.max(g.Wd[i]!, g.Wd[i + 1]!, 0.5) + 2 * pad;
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach + box) * sc)), x1 = Math.min(n - 1, Math.ceil((Math.max(ax, bx) + reach + box) * sc));
      const y0 = Math.max(0, Math.floor((Math.min(ay, by) - reach + box) * sc)), y1 = Math.min(n - 1, Math.ceil((Math.max(ay, by) + reach + box) * sc));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const wx = (x + 0.5) / sc - box, wy = (y + 0.5) / sc - box, t = clamp(((wx - ax) * dx + (wy - ay) * dy) / L2, 0, 1);
        const d = Math.hypot(ax + t * dx - wx, ay + t * dy - wy), half = 2.1 * Math.max(0.5, g.Wd[i]! + (g.Wd[i + 1]! - g.Wd[i]!) * t);
        slack[y * n + x] = Math.min(slack[y * n + x]!, d - half);
      }
    }
  }
  const px = 2 / sc;   // (a pixel's own size in world units: the boundary pixels are not judged)
  let inside = 0, outside = 0, padRing = 0;
  for (let k = 0; k < n * n; k++) {
    const sl = slack[k]!, has = tau[4 * k]! !== NEVER;
    if (sl <= pad - px) { assert.ok(has, `px ${k}: ${sl.toFixed(1)} past the painted edge, inside the spread, has no arrival time`); inside++; if (sl > 2) padRing++; }
    else if (sl >= pad + px) { assert.ok(!has, `px ${k}: ${sl.toFixed(1)} past the painted edge, beyond the spread, has an arrival time`); outside++; }
  }
  assert.ok(inside > 10000 && outside > 10000 && padRing > 500, `the check saw the band (${inside}), the far field (${outside}) and the pad ring (${padRing})`);
});

// ---- the shader
test('shader text: plateAt softens at SOFT_LOD and switches on the soft alpha; the old 8 px copy and its switch on the sharp alpha are gone; it declares what it uses', () => {
  const t = shaderText(LOBULE_PLATE_FS), pa = block(t, 'vec4 plateAt(');
  assert.ok(pa.includes('collLod(vec2(0.5 + uvK.x * 0.5, uvK.y), SOFT_LOD)') && pa.includes('collLod(vec2(uvK.x * 0.5, uvK.y), SOFT_LOD)'), 'both layers read the soft copy at SOFT_LOD');
  assert.ok(pa.includes('cs = mix(sS, cs, smoothstep(SOFT_E0, SOFT_E1, sS.a));') && pa.includes('cu = mix(sU, cu, smoothstep(SOFT_E0, SOFT_E1, sU.a));'), 'the switch is on the soft copy\'s own alpha');
  assert.ok(pa.includes('clamp(uv, vec2(SOFT_EDGE), vec2(1.0 - SOFT_EDGE))'), 'the copy is kept half a texel inside its plate (the atlas seam)');
  assert.ok(!t.includes('bias + 3.0') && !/smoothstep\(0\.35, 0\.75, c[su]\.a\)/.test(t) && !t.includes('collAt('), 'the old rule is gone');
  assert.ok(pa.indexOf('if (uP.x + uP.y + uP.z <= 0.0)') < pa.indexOf('collLod('), 'healthy tissue returns before any soft sample');
  for (const [name, v] of [['SOFT_LOD', SOFT_LOD], ['SOFT_E0', SOFT_E0], ['SOFT_E1', SOFT_E1]] as const) assert.match(t, new RegExp(`const float ${name} = ${v.toFixed(1)};`));
  assert.match(t, new RegExp(`const float SOFT_EDGE = ${(SOFT_PAD_PX / PLATE_PX).toFixed(6)};`));
  assert.deepEqual(undeclared(LOBULE_PLATE_FS, ['cameraPosition', 'modelMatrix', 'modelViewMatrix', 'projectionMatrix', 'viewMatrix', 'normalMatrix']), [], 'every name resolves');
  assert.deepEqual(badSamplers(LOBULE_PLATE_FS), [], 'every sampler is declared');
});
