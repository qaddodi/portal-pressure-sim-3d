// Mohammad 23 Nov 2026 picked mock C "Raised relief" for the lobule's fibrosis bands. ROOT CAUSE of the flat, ringed bands: one flat colour per collagen layer, depth only from the painter's hard-edged passes, and the plate's
// cel step and edge line turning every terrace edge into a tone line (plate.ts, relief.ts). The fix: the collagen's own alpha (a mip-3 blur) is a rope's height, its slope against the world light lifts or deepens the colour smoothly,
// and the collagen is out of the cel step and the edge line, weighted by its coverage. These are the plan's gates, judged in node (no GPU): the numbers, the colours of every look, the raster twin, the shader's shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rasterCtx } from './helpers/raster-ctx.ts';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { LOBULE_PLATE_FS, LOBULE_PLATE_VS, LOBULE_SCAR_VS, PLATE_BOX, PLATE_PX, PLATE_S, paintPlateWorld, plateInput, plateShape } from '../src/scene/lobule/plate.ts';
import { collagenInput, paintCollagenWorld } from '../src/scene/lobule/collagen-paint.ts';
import { collagenTau } from '../src/scene/lobule/collagen-tau.ts';
import { front, growGoal, septaStrength } from '../src/scene/lobule/growth.ts';
import { lookColours } from '../src/scene/lobule/lz-colours.ts';
import { useTokens } from '../src/scene/lobule/from2d/lobule-paint.generated.js';
import { sinRadius, DISC_R } from '../src/scene/lobule/widths.ts';
import { celTissueJS, tissueTone } from '../src/scene/lobule/cel.ts';
import { CEL_LIGHT_UNIT } from '../src/scene/cel-glsl.ts';
import { RELIEF_D_PX, RELIEF_G, RELIEF_GLSL, RELIEF_LIT, RELIEF_SHADE, reliefColour, reliefS } from '../src/scene/lobule/relief.ts';
import { toOklab } from '../src/scene/lenses/oklab.ts';
import { LOOK_IDS } from '../src/looks/looks.ts';

const luma = (c: readonly number[]) => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;

test('the relief is 0 on flat ground, stays within [-1, 1], and a slope facing the light is lit', () => {
  assert.equal(reliefS(0, 0, -0.5, 0.62), 0);
  for (const [dx, dy] of [[1, 1], [-1, 3], [0.2, -0.7], [-5, -5], [0.0001, 0]] as const) for (const [lx, ly] of [[-0.5, 0.62], [0.7, -0.1], [1, 1]] as const) {
    const s = reliefS(dx, dy, lx, ly); assert.ok(s >= -1 && s <= 1, `s ${s}`);
  }
  // the light is up and to the left (plate x right, y up): height RISING toward the right and downward (the slope's face looks up-left) is lit; the opposite flank is in shade
  const L = [CEL_LIGHT_UNIT[0], CEL_LIGHT_UNIT[1]] as const;
  assert.ok(L[0] < 0 && L[1] > 0, 'the world light is up and to the left');
  assert.ok(reliefS(0.02, -0.02, L[0], L[1]) > 0.9, 'a flank facing up-left is lit');
  assert.ok(reliefS(-0.02, 0.02, L[0], L[1]) < -0.9, 'a flank facing down-right is shaded');
  assert.ok(Math.abs(reliefS(0.001, 0.001, L[0], L[1])) < 0.2, 'a gentle slope is gentle (no step)');
  // smooth through zero: no jump between the two sides of s = 0
  const a = reliefColour([0.78, 0.64, 0.44], 1e-6), b = reliefColour([0.78, 0.64, 0.44], -1e-6);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(a[i]! - b[i]!) < 1e-5);
});

test('reliefColour(c, 0) is c, the lit side lifts, the shade deepens, and no channel leaves 0..1', () => {
  for (const c of [[0.78, 0.64, 0.44], [0, 0, 0], [1, 1, 1], [0.2, 0.9, 0.5]] as const) {
    assert.deepEqual(reliefColour(c, 0), [...c]);
    for (let s = -1; s <= 1; s += 0.125) for (const v of reliefColour(c, s)) assert.ok(v >= 0 && v <= 1);
    const lit = reliefColour(c, 1), sh = reliefColour(c, -1);
    for (let i = 0; i < 3; i++) { assert.ok(lit[i]! >= c[i]! && sh[i]! <= c[i]!); }
  }
  assert.deepEqual([...RELIEF_LIT], [0.52, 0.38, 0.26]); assert.deepEqual([...RELIEF_SHADE], [0.18, 0.21, 0.36]); assert.equal(RELIEF_G, 100);
});

// the colour of a septum (its token) and of the portal tracts (collagen-paint.ts PRE_LIGHT / PRE_DARK) per look, against the cells
const PRE = { light: [0.78, 0.64, 0.44], dark: [0.86, 0.78, 0.6] } as const;
test('every look: the lit side stays under white, lifts by at least 0.06 L, the shade drops by at least 0.08 L, and in the dark looks the shade stays 0.1 L above the cells', () => {
  for (const look of LOOK_IDS) {
    const L = lookColours(look), cell = toOklab(L.rgb01('--og-liver-1') as [number, number, number])[0];
    for (const [name, c] of [['septa', L.rgb01('--lz-septum')], ['tracts', L.dark ? PRE.dark : PRE.light]] as const) {
      const l0 = toOklab([c[0]!, c[1]!, c[2]!])[0], lit = reliefColour(c, 1), sh = reliefColour(c, -1);
      assert.ok(Math.max(...lit) <= 0.95, `${look} ${name}: lit largest channel ${Math.max(...lit).toFixed(2)}`);
      assert.ok(toOklab(lit)[0] - l0 >= 0.06, `${look} ${name}: lit dL ${(toOklab(lit)[0] - l0).toFixed(3)}`);
      assert.ok(toOklab(sh)[0] - l0 <= -0.08, `${look} ${name}: shade dL ${(toOklab(sh)[0] - l0).toFixed(3)}`);
      if (L.dark) assert.ok(toOklab(sh)[0] >= cell + 0.1, `${look} ${name}: the shade side (${toOklab(sh)[0].toFixed(3)}) is above the cells (${cell.toFixed(3)}) by 0.1`);
    }
  }
});

// ---- the raster twin: the shader's composite, at N 512 (every pixel size of the shader's 2048 scaled by N / PLATE_PX)
const net = buildLobule(), shape = { ...plateShape(net), cells: [] };
const sins = net.courses.filter((c) => c.kind === 's0' || c.kind === 's1' || c.kind === 's2' || c.kind === 'an').map((c) => ({ c, r: sinRadius(c.kind as 's0', 0.5) * 1.15 }));
const N = 512, B = PLATE_BOX * PLATE_S, sc = N / (2 * B), cv = DISC_R.cv, K = N / PLATE_PX;
const tau = collagenTau(shape, cv * PLATE_S, N, B);
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ss = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** A separable box blur of a one-channel image, radius r px (the mip-3 stand-in: 8 px at 2048 is r = 8 K / 2 at N). */
function blur(src: Float32Array, r: number): Float32Array {
  const t = new Float32Array(N * N), o = new Float32Array(N * N), w = 2 * r + 1;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let a = 0; for (let j = -r; j <= r; j++) a += src[y * N + clamp(x + j, 0, N - 1)]!; t[y * N + x] = a / w; }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let a = 0; for (let j = -r; j <= r; j++) a += t[clamp(y + j, 0, N - 1) * N + x]!; o[y * N + x] = a / w; }
  return o;
}

/** The plate shader's output at N for a state and a look (tones and collagen only; the cells' own tones go through celTissueJS as they do on the GPU), and how many pixels of collagen sit on a hard tone edge. */
function twin(look: 'light' | 'dark', S: { septU: number; fibSin: number; act: number; fibPre: number; fibPost: number; congU: number }, relief: boolean) {
  const L = lookColours(look); useTokens((n: string, a?: number | string) => L.tk(n, a));
  const tissueR = rasterCtx(N); tissueR.skipFills(2); paintPlateWorld(tissueR.ctx, N, sc, -B, -B, { ...plateInput(shape, sins, cv, S, look), zonesOn: false });
  const tr = rasterCtx(N); paintCollagenWorld(tr.ctx, N, sc, -B, -B, collagenInput(shape, cv, look), 'tracts');
  const sp = rasterCtx(N); paintCollagenWorld(sp.ctx, N, sc, -B, -B, collagenInput(shape, cv, look), 'septa');
  const goal = growGoal(S), grown = goal[0] + goal[1] + goal[2] > 0, M = N * N;
  const smooth = (a: Float32Array) => (relief ? blur(a, Math.max(1, Math.round(4 * K))) : a);   // (8 px at 2048: the soft copy of the faint edge)
  const sA = smooth(sp.alpha), tA = smooth(tr.alpha);
  const img = new Float32Array(M * 3), cov = new Float32Array(M), alpha = new Float32Array(M), h = new Float32Array(M);
  for (let i = 0; i < M; i++) {
    let a = tissueR.alpha[i]!, r = tissueR.rgb[3 * i]! / 255, g = tissueR.rgb[3 * i + 1]! / 255, b = tissueR.rgb[3 * i + 2]! / 255;
    if (grown) {
      const fs = front(tau[4 * i]!, goal[0]) * septaStrength(goal[0]), ft = Math.max(front(tau[4 * i + 1]!, goal[1]), front(tau[4 * i + 2]!, goal[2]));
      // (a layer's own alpha, softened where faint: the shader's `mix(blurred, own, smoothstep(0.35, 0.75, a))`)
      const as = relief ? sA[i]! + (sp.alpha[i]! - sA[i]!) * ss(0.35, 0.75, sp.alpha[i]!) : sp.alpha[i]!, au = relief ? tA[i]! + (tr.alpha[i]! - tA[i]!) * ss(0.35, 0.75, tr.alpha[i]!) : tr.alpha[i]!;
      const ps = sp.alpha[i]! > 0 ? sp.rgb[3 * i]! / 255 / sp.alpha[i]! : 0, pu = tr.alpha[i]! > 0 ? tr.rgb[3 * i]! / 255 / tr.alpha[i]! : 0;   // (straight red of each layer, for the grey of the stand-in below)
      void ps; void pu;
      const cs = [0, 1, 2].map((k) => (sp.alpha[i]! > 0 ? sp.rgb[3 * i + k]! / 255 / sp.alpha[i]! : 0) * as), cu = [0, 1, 2].map((k) => (tr.alpha[i]! > 0 ? tr.rgb[3 * i + k]! / 255 / tr.alpha[i]! : 0) * au);
      r = cs[0]! * fs + r * (1 - as * fs); g = cs[1]! * fs + g * (1 - as * fs); b = cs[2]! * fs + b * (1 - as * fs); a = as * fs + a * (1 - as * fs);
      r = cu[0]! * ft + r * (1 - au * ft); g = cu[1]! * ft + g * (1 - au * ft); b = cu[2]! * ft + b * (1 - au * ft); a = au * ft + a * (1 - au * ft);
      cov[i] = Math.max(as * fs, au * ft); h[i] = sp.alpha[i]! * fs + tr.alpha[i]! * ft;
    }
    alpha[i] = a; img[3 * i] = r / Math.max(a, 1e-4); img[3 * i + 1] = g / Math.max(a, 1e-4); img[3 * i + 2] = b / Math.max(a, 1e-4);
  }
  const lum = new Float32Array(M); for (let i = 0; i < M; i++) lum[i] = luma([img[3 * i]!, img[3 * i + 1]!, img[3 * i + 2]!]);
  const lb = blur(lum, Math.max(1, Math.round(4 * K)));   // (the plate's mip-3 local lightness)
  const kc = new Float32Array(M), out = new Float32Array(M * 3); const tone = new Int8Array(M).fill(-1);
  for (let i = 0; i < M; i++) {
    if (alpha[i]! < 0.002) continue;
    const c0: [number, number, number] = [img[3 * i]!, img[3 * i + 1]!, img[3 * i + 2]!];
    const cel = celTissueJS(c0, lb[i]!);
    const k = relief ? ss(0, 0.2, cov[i]!) : 0;
    kc[i] = k; for (let j = 0; j < 3; j++) out[3 * i + j] = cel[j]! + (c0[j]! - cel[j]!) * k;
    // the tone the cel step gave this pixel (a hard tone edge needs the step to still rule: its weight (1 - kc) over a half)
    tone[i] = 1 - k > 0.5 ? tissueTone(luma(c0), lb[i]!) : -1;
  }
  // the hard tone edges ON collagen: neighbouring pixels (covered by the collagen to any degree) whose cel tones differ
  let edges = 0, collagen = 0, healthyDiff = 0;
  for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) {
    const i = y * N + x; if (cov[i]! <= 0.002) continue; collagen++;
    for (const j of [i + 1, i + N]) if (tone[i]! >= 0 && tone[j]! >= 0 && tone[i] !== tone[j]) { edges++; break; }
  }
  for (let i = 0; i < M; i++) if (cov[i]! === 0 && kc[i]! !== 0) healthyDiff++;
  return { edges, collagen, healthyDiff, out, cov, h, alpha };
}

const DECOMP = { congU: 0, septU: 1, fibSin: 0.7, act: 0.8, fibPre: 1, fibPost: 1 }, HEALTHY = { congU: 0, septU: 0, fibSin: 0, act: 0, fibPre: 0, fibPost: 0 };

test('the raster twin, decompensated cirrhosis, Light and Dark: the hard tone edges on collagen fall by at least 75 %, and the relief spans lit and shade', () => {
  for (const look of ['light', 'dark'] as const) {
    const before = twin(look, DECOMP, false), after = twin(look, DECOMP, true);
    console.log(`# ${look}: hard tone edges on collagen ${before.edges} -> ${after.edges} (${before.collagen} collagen px at N ${N})`);
    assert.ok(before.collagen > 2000 && before.edges > 100, `${look}: the collagen is there to judge (${before.collagen} px, ${before.edges} edges)`);
    assert.ok(after.edges <= before.edges * 0.25, `${look}: ${before.edges} -> ${after.edges} (at least 75 % fewer)`);
  }
});

test('healthy tissue is bit-identical: no collagen coverage, no change of weight, and the shader returns the tissue before it takes a single extra sample', () => {
  for (const look of ['light', 'dark'] as const) {
    const a = twin(look, HEALTHY, false), b = twin(look, HEALTHY, true);
    assert.equal(b.healthyDiff, 0); assert.equal(b.collagen, 0);
    assert.deepEqual(Array.from(b.out), Array.from(a.out), `${look}: every pixel of the healthy plate is as it was`);
  }
  // the shader: the early return of "no growth anywhere" comes before the soft edges and the relief samples, and the relief reads nothing where there is no collagen
  const fs = LOBULE_PLATE_FS;
  assert.ok(fs.indexOf('if (uP.x + uP.y + uP.z <= 0.0)') < fs.indexOf('cs = mix(collAt(uvS, bias + 3.0), cs'), 'the early return is before the soft edge');
  assert.match(fs, /if \(cov > 0\.002\) rs = reliefS\(reliefSlope\(vUv, fr\), vL\);/);
});

test('every look: the relief on collagen pixels is flat in the middle of a band and lit or shaded on its flanks', () => {
  // the twin's own slope, with the world light turned into the plate's axes as the vertex shader does it for a plate facing the camera (y up here, rows go down)
  const after = twin('light', DECOMP, true), d = Math.max(1, Math.round(RELIEF_D_PX * K)), h = blur(after.h, Math.max(1, Math.round(4 * K)));
  const lx = CEL_LIGHT_UNIT[0], ly = CEL_LIGHT_UNIT[1], ss2: number[] = [];
  for (let y = d; y < N - d; y++) for (let x = d; x < N - d; x++) {
    const i = y * N + x; if (after.cov[i]! < 0.2) continue;
    // (image rows go down, the plate's y goes up: the sign of dy flips; the slope is per plate pixel at 2048, so per twin pixel divided by K)
    const dhx = (h[i + d]! - h[i - d]!) / (2 * d) * K, dhy = -(h[i + d * N]! - h[i - d * N]!) / (2 * d) * K;
    ss2.push(reliefS(dhx, dhy, lx, ly));
  }
  ss2.sort((p, q) => p - q);
  const at = (p: number) => ss2[Math.floor(p * (ss2.length - 1))]!;
  console.log(`# relief s on collagen: p5 ${at(0.05).toFixed(2)}, p50 ${at(0.5).toFixed(2)}, p95 ${at(0.95).toFixed(2)}`);
  assert.ok(ss2.length > 2000);
  assert.ok(at(0.05) < -0.3 && at(0.95) > 0.3, 'both flanks are there');
  assert.ok(Math.abs(at(0.5)) < 0.3, 'the middle of a band stays flat');
});

test('shader shape: the relief, the collagen kept out of the cel step and of the edge line, the samples before the first discard, both vertex shaders carry the light, and it parses', async () => {
  const fs = LOBULE_PLATE_FS, main = fs.slice(fs.indexOf('void main() {'));
  assert.match(fs, /float reliefS\(vec2 dh, vec2 L\)/);
  assert.match(main, /c = mix\(c, c0, kc\);/);
  assert.match(main, /c = mix\(c, reliefColour\(c, rs\), kc\);/);
  assert.match(main, /PLATE_EDGE_K \* smoothstep\(CEL_EDGE_LO, CEL_EDGE_HI, edge\) \* \(1\.0 - kc\)/, 'no edge line on the collagen');
  assert.ok(main.indexOf('reliefSlope(vUv, fr)') > 0 && main.indexOf('reliefSlope(vUv, fr)') < main.indexOf('discard;'), 'the relief samples come before the first discard');
  assert.ok(main.indexOf('plateTex(vUv)') < main.indexOf('reliefSlope(vUv, fr)') && main.indexOf('float cov = gCov;') < main.indexOf('plateEdge('), 'the coverage is read before plateEdge overwrites it');
  assert.match(fs, /textureLod\(mapC, uvT, 3\.0\)/, 'the height is read at one explicit level (the same relief at every zoom)');
  assert.match(fs, /cu = mix\(collAt\(uvT, bias \+ 3\.0\), cu, smoothstep\(0\.35, 0\.75, cu\.a\)\)/, 'the pass edges are softened');
  for (const vs of [LOBULE_PLATE_VS, LOBULE_SCAR_VS]) { assert.match(vs, /varying vec2 vL;/); assert.match(vs, /vL = plateLight\(\);/); assert.match(vs, /CEL_LIGHT/, 'the one world light'); assert.match(vs, /mat3|modelMatrix/); }
  assert.ok(RELIEF_GLSL.includes('reliefColour'));
  let parse: ((s: string) => unknown) | null = null;
  const name = '@shaderfrog/glsl-parser';
  try { const m = await import(name); parse = (s) => m.parser.parse(s, { quiet: true }); } catch { /* not installed */ }
  assert.ok(parse, 'the parser is installed');
  for (const src of [LOBULE_PLATE_FS, LOBULE_PLATE_VS, LOBULE_SCAR_VS]) parse!(src.replace(/^\n/, '').replace(/^#include.*$/gm, ''));
});

test('the atlas seam: the relief never reads across it (a septum\'s corner band reaches the plate\'s left and right edge, so the samples are kept half a mip-3 texel inside), and the top and bottom edges are clear in every look', () => {
  assert.match(LOBULE_PLATE_FS, /uv = clamp\(uv, vec2\(RELIEF_EDGE\), vec2\(1\.0 - RELIEF_EDGE\)\);/);
  assert.match(LOBULE_PLATE_FS, new RegExp(`const float RELIEF_EDGE = ${(RELIEF_D_PX / PLATE_PX).toFixed(6)};`), 'half a mip-3 texel (4 px of 2048): the first bilinear footprint that holds only its own plate');
  const n = 512, sc2 = n / (2 * B), m = Math.ceil(16 * n / PLATE_PX);   // (16 px at 2048)
  for (const look of LOOK_IDS) {
    const L = lookColours(look); useTokens((nm: string, a?: number | string) => L.tk(nm, a));
    for (const which of ['septa', 'tracts'] as const) {
      const r = rasterCtx(n); paintCollagenWorld(r.ctx, n, sc2, -B, -B, collagenInput(shape, cv, look), which);
      let worst = 0;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (y < m || y >= n - m) worst = Math.max(worst, r.alpha[y * n + x]!);
      assert.equal(worst, 0, `${look} ${which}: alpha at the plate's top and bottom edge is ${worst}`);
    }
  }
});
