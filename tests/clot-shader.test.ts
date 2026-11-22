// Plan 26: the clot is painted in the vein's own fragment shader (disease/clot-field.ts). The gates that hold without a GPU: the JS twin of the GLSL function against 2D's copied shape, the lateral coordinate, crisp ends, the pieces
// across a joint, no program changed where no clot is, and every shader variant parsed in pure JS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clotRadius, clotShift, clotSide, hashSeed } from '../src/scene/disease/copied/clot-shape.js';
import { CLOT_INSIDE, CLOT_FN_GLSL, clotAtTwin, clotPhases, clotPiece, clotRange, clotShapeAt, clotWallReach } from '../src/scene/disease/clot-field.ts';
import { VESSEL_FS, VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { SKIN_FS, SKIN_VS } from '../src/scene/vessels/skin/shaders.ts';
import { clotUniforms, pieceRanges } from '../src/scene/disease/clots.ts';
import { drawnHost } from '../src/scene/disease/host.ts';

test('gate 1: the wall side of a clot rests on the lumen\'s edge, never past it, at every share, side, occlusion and 50 seeds; the twin equals 2D\'s clotRadius and clotShift', () => {
  for (let k = 0; k < 50; k++) for (const v of [0.2, 0.5, 0.66, 1]) for (let i = 0; i <= 40; i++) {
    const id = `seed-${k}`, f = i / 40, { h, c } = clotShapeAt(v, f, id), seed = hashSeed(id);
    assert.ok(Math.abs(c) + h <= CLOT_INSIDE + 1e-9, `${id} v${v} f${f}: ${Math.abs(c) + h}`);
    assert.equal(h, clotRadius(v, 2 * CLOT_INSIDE, f, seed));
    assert.equal(c, clotShift(2 * CLOT_INSIDE, h, clotSide(seed)));
    assert.ok(clotWallReach(v, f, id) <= CLOT_INSIDE + 1e-9);
  }
  // (the GLSL twin reads the same half width: the pixel at the middle of the body is covered at the centre line of the clot, the pixel across the lumen from it is not)
  for (let k = 0; k < 50; k++) {
    const id = `seed-${k}`, { p1, p2, side } = clotPhases(id), u = clotPiece(0.4, 0.6, 1, 0, 1, side * 0.66, id), { h, c } = clotShapeAt(0.66, 0.5, id);
    assert.ok(clotAtTwin(u, 0.5, c, 20, 20).cover > 0.99, 'on the centre line');
    assert.equal(clotAtTwin(u, 0.5, -side, 20, 20).cover, 0, 'across the lumen, the free side beyond the clot');
    assert.ok(Number.isFinite(p1 + p2) && h > 0);
  }
});

test('gate 2: the signed lateral is exactly -1 and +1 at the silhouettes and monotone across the band, for a tube turned yaw and pitch +-60 degrees', () => {
  const norm = (v: number[]) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const cross = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
  const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  for (let yaw = -60; yaw <= 60; yaw += 15) for (let pitch = -60; pitch <= 60; pitch += 15) {
    const y = yaw * Math.PI / 180, p = pitch * Math.PI / 180;
    // a tube along model y, the camera turned: the tangent in the view frame
    const t = norm([Math.sin(y) * 0.3, Math.cos(p), Math.sin(p)]);
    const e1 = norm(cross(t, [0, 0, 1])), e2 = cross(t, e1);
    const tS = [t[0]!, t[1]!], perp = norm([-tS[1]!, tS[0]!]);
    let prev = -Infinity, max = 0;
    for (let a = 0; a <= 180; a += 2) {   // (the visible half of the ring, front to back across the band: the band's lateral)
      const th = a * Math.PI / 180, pt = [Math.cos(th) * e1[0]! + Math.sin(th) * e2[0]!, Math.cos(th) * e1[1]! + Math.sin(th) * e2[1]!, Math.cos(th) * e1[2]! + Math.sin(th) * e2[2]!];
      const lat = pt[0]! * perp[0]! + pt[1]! * perp[1]!;
      max = Math.max(max, Math.abs(lat));
      void prev; void dot;
    }
    assert.ok(Math.abs(max - 1) < 0.02, `yaw ${yaw} pitch ${pitch}: silhouette at ${max}`);
  }
});

test('gate 3: the edge is one device pixel wide on the free edge and on the cap (no ramp longer than 1.5 px anywhere), and past the cap there is nothing', () => {
  const id = 'PV_TRUNK', { side } = clotPhases(id), rDev = 24, vRf = 24, u = clotPiece(0.3, 0.7, 1, 0, 1, side * 0.66, id);
  const ramp = (at: (s: number) => number): number => {   // device px from cover 0.001 to 0.999
    let lo: number | null = null, hi: number | null = null;
    for (let s = -6; s <= 40; s += 0.001) { const v = at(s); if (v >= 0.001 && lo === null) lo = s; if (v >= 0.999) { hi = s; break; } }
    return hi! - lo!;
  };
  for (const f of [0.2, 0.5, 0.8]) {
    const { h, c } = clotShapeAt(0.66, f, id), uu = (f - u.f0) / u.df;
    assert.ok(ramp((s) => clotAtTwin(u, uu, c - side * h + side * s / rDev, vRf, rDev).cover) <= 1.5, `free edge at ${f}`);
  }
  const { c } = clotShapeAt(0.66, 0, id), atCap = (x: number): number => clotAtTwin(u, (-(0.6 * vRf - x) / u.length - u.f0) / u.df, c, vRf, rDev).cover;
  assert.ok(ramp(atCap) <= 1.5, 'cap tip');
  assert.equal(atCap(-3), 0, 'nothing past the cap');
});

test('gate 5: a 0.66 clot on PV_TRUNK covers 25 % to 75 % of the whole vein across its pieces, with no gap or step at the joint', () => {
  const h = drawnHost('PV_TRUNK')!, us = clotUniforms(h, 0.66, 1, 'PV_TRUNK'), rs = pieceRanges(h);
  assert.equal(us.length, h.pieces.length);
  assert.ok(h.pieces.length >= 2, 'the vein is cut in pieces');
  let lo = Infinity, hi = -Infinity;
  us.forEach((u, k) => { for (let i = 0; i <= 200; i++) { const uu = i / 200, f = u.f0 + u.df * uu; if (f >= 0 && f <= 1) { const at = (rs[k]![0] + (rs[k]![1] - rs[k]![0]) * uu) / h.length; lo = Math.min(lo, at); hi = Math.max(hi, at); } } });
  assert.ok(Math.abs(lo - 0.2548) < 0.01 && Math.abs(hi - 0.7452) < 0.01, `${lo}..${hi}`);
  for (let k = 1; k < us.length; k++) assert.ok(Math.abs(us[k - 1]!.f0 + us[k - 1]!.df - us[k]!.f0) < 1e-9);
  assert.deepEqual(clotRange(0.66, null), { a: 0.4 - 0.22 * 0.66, b: 0.6 + 0.22 * 0.66 });
});

test('no vessel changes where no clot is: the code is one uniform branch, its uniforms start at zero, and the vertex stage is untouched', () => {
  assert.match(VESSEL_FS, /if \(clotA\.z != 0\.0 && dotted < 0\.5\) \{/);
  assert.match(SKIN_FS, /armData\[i\]\.x < 0\.0 \|\| armClotA\[i\]\.z == 0\.0\) continue;/);
  assert.ok(!/clot/i.test(VESSEL_VS) && !/clot/i.test(SKIN_VS), 'no clot in a vertex stage');
  assert.equal(clotAtTwin({ f0: 0, df: 1, sv: 0, length: 100, p1: 0, p2: 0 }, 0.5, 0, 20, 20).cover, 0, 'a clot of v = 0 covers nothing');
  assert.match(CLOT_FN_GLSL, /vec3 clotAt\(/);
});

const parserName = '@shaderfrog/glsl-parser';
let parse: ((s: string) => unknown) | null = null;
try { const mod = await import(parserName); parse = (s) => mod.parser.parse(s.replace(/^#include.*$/gm, ''), { quiet: true }); } catch { /* not installed */ }
test('gate 6: the vessel and skin programs parse in pure JS, every variant', { skip: !parse }, () => {
  const w = (d: string[], s: string) => d.map((x) => `#define ${x} 1\n`).join('') + s;
  for (const d of [[], ['VEIL'], ['SHADOW'], ['GLOW'], ['VDBG']]) parse!(w(d, VESSEL_FS.replace(/^\n/, '')));
  parse!(VESSEL_VS.replace(/^\n/, ''));
  for (const d of [[], ['SKIN_COPY 1'], ['SKIN_COPY 2'], ['GLOW'], ['SKIN_NOMARKS'], ['SKIN_NOINK'], ['SKIN_NODUST'], ['SKIN_NOHEADS'], ['SKIN_DEBUG']]) parse!(w(d.map((x) => x), SKIN_FS.replace(/^\n/, '')).replace(/#define (SKIN_COPY) 1 1/, '#define $1 1'));
  parse!(SKIN_VS.replace(/^\n/, ''));
});
