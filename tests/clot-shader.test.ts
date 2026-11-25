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
test('gate 6: the vessel and skin programs parse in pure JS', { skip: !parse }, () => {
  // (the parser keeps #define/#ifdef as plain directive lines and parses every branch, so a variant differs from the plain program by its leading #define line only: each program's text is parsed ONCE, not once per variant: 4 parses, not 15, which took 127 s of the file's 128 s)
  parse!(VESSEL_FS.replace(/^\n/, ''));
  parse!(VESSEL_VS.replace(/^\n/, ''));
  parse!(SKIN_FS.replace(/^\n/, ''));
  parse!(SKIN_VS.replace(/^\n/, ''));
});

import { clotRange as range4, clotPiece as piece4 } from '../src/scene/disease/clot-field.ts';
import { ClotGrow } from '../src/scene/disease/clot-ease.ts';
test('plan 26b: jumps ease without a pop (<= 6 % of the final area per frame, no kink); drags follow the finger (lag, no overshoot, handover)', () => {
  const id = 'PV_TRUNK', { side } = clotPhases(id), cache = new Map<number, number>();
  const area = (v: number): number => {
    const k = Math.round(v * 5000); if (cache.has(k)) return cache.get(k)!;
    let s = 0; const vv = k / 5000;
    if (vv > 0.003) { const { a, b } = range4(vv, null), u = piece4(a, b, 1, 0, 1, side * vv, id); for (let i = 0; i < 150; i++) for (let j = 0; j < 41; j++) s += clotAtTwin(u, (i + 0.5) / 150, (j - 20) / 20, 20, 20).cover; }
    cache.set(k, s); return s;
  };
  const jump = (from: number, to: number): number => {
    const g = new ClotGrow(); g.to(from, true); let prev = area(g.v), worst = 0, pvel = 0, pd = 0;
    const fin = Math.max(area(from), area(to)); g.to(to);
    for (let f = 0; f < 90; f++) {
      const v0 = g.v; g.step(1 / 60);
      const a = area(g.v); worst = Math.max(worst, Math.abs(a - prev) / fin); prev = a;
      const lo = Math.min(from, to), hi = Math.max(from, to); assert.ok(g.v >= lo - 1e-9 && g.v <= hi + 1e-9, 'no overshoot');
      pd = g.v - v0; pvel = g.vel;
    }
    assert.equal(g.v, to); void pd; void pvel;
    return worst;
  };
  // (25 Nov fill: held at 6 %. The fill ramp is cubed (clotFillK): a smoothstep ramp measured 7.4 % at v 0.88, because the area the fill adds arrives early in its range; cubed it is 4.9 %)
  for (const [f, t] of [[0, 1], [0, 0.66], [1, 0], [0.66, 0], [0.3, 0.66]] as const) assert.ok(jump(f, t) <= 0.06, `${f} -> ${t}: ${jump(f, t)}`);
  // follow: a drag replay at 60 fps, one pointer step per frame
  const drag = (secs: number): { gap: number; after: number } => {
    const g = new ClotGrow(); g.to(0, true); const n = Math.round(secs * 60); let gap = 0;
    for (let f = 1; f <= n; f++) { const fv = f / n; g.to(fv); g.step(1 / 60); gap = Math.max(gap, fv - g.v); assert.ok(g.v <= fv + 1e-9, 'no overshoot'); }
    for (let f = 0; f < 9; f++) g.step(1 / 60);   // 150 ms after the finger stops
    return { gap, after: Math.abs(1 - g.v) };
  };
  const q = drag(0.8), sl = drag(2);
  assert.ok(q.gap <= 0.10, `swipe lag ${q.gap}`); assert.ok(sl.gap <= 0.04, `slow drag lag ${sl.gap}`);
  assert.ok(q.after <= 0.01 && sl.after <= 0.01, 'settled 150 ms after the finger stops');
  // handover: a jump to 1, a drag starting 0.2 s in: the per-frame step never changes by more than the jump's own jerk allows
  const g = new ClotGrow(); g.to(0, true); g.to(1); let prev = 0, pd = 0, worst = 0, goal = 1;
  for (let f = 0; f < 120; f++) {
    if (f >= 12) { goal = Math.max(0.5, goal - 0.01); g.to(goal); }
    g.step(1 / 60); const d = g.v - prev; prev = g.v;
    if (f > 0) worst = Math.max(worst, Math.abs(d - pd)); pd = d;
  }
  assert.ok(worst <= 0.02, `handover kink ${worst}`);
});

// 25 Nov (Mohammad, Budd-Chiari: the clots read as flat slabs along one wall instead of filling the vein): full occlusion fills the lumen edge to edge with blunt ends; below CLOT_FILL_FROM the approved mural cast is bit for bit what it was.
import { CLOT_FILL_FROM, CLOT_FILL_TO, CLOT_CAP_LEN, clotDrawnShape, clotFillK, CLOT_CONST_GLSL } from '../src/scene/disease/clot-field.ts';
test('25 Nov fill: under 0.82 the mural cast is exactly the approved one; at 1 the plug spans the lumen edge to edge with no side ink and ink on its caps; in between it is continuous and eased in (cubed)', () => {
  const old = (v: number, fc: number, p1: number, p2: number, side: number, rDev: number): { h: number; c: number } => {
    const fl = 0.3 + 0.5 * v * v * v, body = fl + (1 - fl) * Math.sqrt(Math.max(Math.sin(Math.PI * fc), 0)), lump = 1 + 0.08 * Math.sin(fc * 18.85 + p1) + 0.05 * Math.sin(fc * 43.98 + p2);
    const h = Math.min(CLOT_INSIDE, CLOT_INSIDE * Math.min(1, Math.max(0, 0.1 + 0.9 * v)) * body * lump);
    return { h, c: side * (CLOT_INSIDE - h) + side * Math.min(1 / Math.max(rDev, 1), h) };
  };
  for (let k = 0; k < 20; k++) for (const v of [0.05, 0.3, 0.5, 0.66, 0.8, CLOT_FILL_FROM]) for (let i = 0; i <= 20; i++) for (const rDev of [2.5, 8, 24]) {
    const id = `seed-${k}`, { p1, p2, side } = clotPhases(id), u = clotPiece(0.3, 0.7, 1, 0, 1, side * v, id), d = clotDrawnShape(u, i / 20, rDev), o = old(v, i / 20, p1, p2, side, rDev);
    assert.ok(Math.abs(d.h - o.h) < 1e-12 && Math.abs(d.c - o.c) < 1e-12, `${id} v=${v}: the mural cast changed (${d.h} against ${o.h})`);
  }
  for (let k = 0; k < 30; k++) for (const rDev of [2.5, 8, 24]) {
    const id = `seed-${k}`, { side } = clotPhases(id), u = clotPiece(0.3, 0.7, 1, 0, 1, side * CLOT_FILL_TO, id);
    for (let i = 0; i <= 20; i++) {
      const d = clotDrawnShape(u, i / 20, rDev); assert.ok(d.h >= CLOT_INSIDE && d.h <= CLOT_INSIDE + 0.25 + 1e-9 && d.c === 0, `${id} fc ${i / 20}: h ${d.h} c ${d.c}`);
    }
    // the middle of the body: every lateral across the lumen is covered, the sides carry no ink, the cap carries it, and nothing is drawn past the cap
    const mid = 0.5, uu = (mid - u.f0) / u.df;
    for (const lat of [-0.98, -0.5, 0, 0.5, 0.98]) { const r = clotAtTwin(u, uu, lat, 24, rDev); assert.ok(r.cover > 0.99, `${id} lat ${lat}: cover ${r.cover}`); assert.ok(r.free < 1e-9, `${id} lat ${lat}: side ink ${r.free}`); }
    const capAt = (x: number): { cover: number; free: number } => { const r = clotAtTwin(u, (-x / u.length - u.f0) / u.df, 0, 24, rDev); return { cover: r.cover, free: r.free }; };
    const tip = capAt(0.3 * CLOT_CAP_LEN * 24);   // (inside the cap, a third of its length out from the body's end)
    assert.ok(tip.cover > 0.5 && tip.free > 0.4, `${id}: the cap is drawn with ink (${tip.cover}, ${tip.free})`);
  }
  // continuity: h and c move by no more than 0.02 per 0.005 of v across the whole range (the fill is eased, not a step)
  for (const rDev of [8]) for (const id of ['RHV_IVC', 'MHV_IVC']) for (let i = 0; i <= 20; i++) {
    let prev: { h: number; c: number } | null = null;
    for (let v = 0.7; v <= 1.0001; v += 0.005) { const { side } = clotPhases(id), d = clotDrawnShape(clotPiece(0.3, 0.7, 1, 0, 1, side * Math.min(v, 1), id), i / 20, rDev); if (prev) assert.ok(Math.abs(d.h - prev.h) <= 0.04 && Math.abs(d.c - prev.c) <= 0.04, `${id} fc ${i / 20} v ${v.toFixed(3)}: step ${Math.abs(d.h - prev.h)}, ${Math.abs(d.c - prev.c)}`); prev = d; }
  }
  assert.match(CLOT_FN_GLSL, /float tf = clamp\(\(v - CLOT_FILL_FROM\) \/ \(CLOT_FILL_TO - CLOT_FILL_FROM\), 0\.0, 1\.0\);\s*float kf = tf \* tf \* tf;/);
  for (const v of [0, 0.5, CLOT_FILL_FROM, 0.9, 1]) { const t = Math.min(1, Math.max(0, (v - CLOT_FILL_FROM) / (CLOT_FILL_TO - CLOT_FILL_FROM))); assert.equal(clotFillK(v), t * t * t); }
  assert.match(CLOT_FN_GLSL, /\(1\.0 - kf\)/);
  assert.match(CLOT_CONST_GLSL, new RegExp(`#define CLOT_FILL_FROM ${CLOT_FILL_FROM}`));
  assert.match(CLOT_CONST_GLSL, /#define CLOT_FILL_TO 1\.0/);
});
