// The variceal bleed's jet: the shape (src/scene/disease/jet.ts), how it eases, the layer that draws it, and the scope's jet (src/ui/tests/endo/jet.ts). Pure parts, no GPU.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BufferAttribute } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { x3, y3 } from '../src/scene/frame2d.ts';
import {
  JET_SEG, N_BLOB, N_SPRAY, TUBE_RINGS, TRIS, VERTS, fillJet, jetIndex, jetUv, makeJetBuffers, pathAt, radiusAt, reachOf, spurtOf, sprayDrop, splashDrop, type JetParams,
} from '../src/scene/disease/jet.ts';
import { JET_SEG as SCOPE_SEG, jetPath, jetReach, jetShapes, makeJetPath } from '../src/ui/tests/endo/jet.ts';
import { bleedShapes } from '../src/ui/tests/endo/bleed.ts';

const base: JetParams = { x0: 805, y0: 244, xl: 867, yl: 330, r0: 3, brk: 0.7, spurt: 1 };
const finite = (a: ArrayLike<number>) => { for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i]!)) return false; return true; };

test('the stream\'s path runs from the tear to the landing, and arcs: it is thrown out and up first, then falls', () => {
  const P = { x: 0, y: 0, tx: 0, ty: 0 };
  pathAt(base, 0, P); assert.equal(P.x, base.x0); assert.equal(P.y, base.y0);
  assert.ok(P.ty < 0 && P.tx > 0, 'leaves the tear moving out and up (y is down the page)');
  pathAt(base, 1, P); assert.ok(Math.abs(P.x - base.xl) < 1e-9 && Math.abs(P.y - base.yl) < 1e-9);
  assert.ok(P.ty > 0.5, 'it lands falling');
  pathAt(base, 0.5, P); assert.ok(P.y > base.y0 - 20 && P.x > base.x0 && P.x < base.xl);
  const ooze = { ...base, spurt: 0 }; pathAt(ooze, 0, P); assert.ok(P.ty > -0.6, 'an ooze is hardly thrown');
});

test('the radius: a narrow mouth that widens, never negative, beads pinch it in the lower half', () => {
  const r = (s: number, t = 0) => radiusAt(base, s, 120, t);
  assert.ok(r(0) < r(0.3), 'narrow at the tear, wider a little way out');
  let lo = Infinity, hi = 0;
  for (let i = 0; i <= 200; i++) { const v = r(0.5 + 0.5 * (i / 200), i * 0.01); assert.ok(v > 0 && Number.isFinite(v)); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  assert.ok(lo < 0.45 * hi, 'necks into beads below');
  let top = Infinity; for (let i = 0; i <= 50; i++) top = Math.min(top, r(0.1 * (i / 50), i * 0.02));
  assert.ok(top > 0.4 * r(0.3), 'no beads near the tear');
  assert.ok(spurtOf(10) === 0 && spurtOf(120) === 1 && spurtOf(undefined) === spurtOf(50), 'the 2D\'s rate to strength');
});

test('it eases: grows out of the tear, drains off its tail, thick at no end of it', () => {
  let prev = -1;
  for (let g = 0; g <= 1.0001; g += 0.05) { const r = reachOf({ grow: g, drain: 0 }); assert.ok(r.hi >= prev - 1e-9, 'the head only runs out'); prev = r.hi; assert.equal(r.lo, 0); }
  assert.equal(reachOf({ grow: 0, drain: 0 }).thick, 0, 'nothing at the start');
  assert.equal(reachOf({ grow: 1, drain: 0 }).thick, 1);
  assert.equal(reachOf({ grow: 1, drain: 0 }).hi, 1);
  let lo = -1, th = 2;
  for (let d = 0; d <= 1.0001; d += 0.05) { const r = reachOf({ grow: 1, drain: d }); assert.ok(r.lo >= lo - 1e-9 && r.thick <= th + 1e-9, 'the tail only leaves; it thins'); lo = r.lo; th = r.thick; }
  assert.ok(reachOf({ grow: 1, drain: 1 }).thick < 1e-9, 'gone at the end');
});

test('the drops: an ooze sheds few, a fast bleed all; every one stays in its life, small and finite', () => {
  const seen = (spurt: number) => { let n = 0; for (let j = 0; j < N_SPRAY; j++) { let big = 0; for (let k = 0; k < 40; k++) big = Math.max(big, sprayDrop({ ...base, spurt }, j, k * 0.05, 1, 1).r); if (big > 0.3) n++; } return n; };
  assert.ok(seen(0) < seen(1) && seen(1) === N_SPRAY && seen(0) >= 3, `${seen(0)} to ${seen(1)}`);
  for (let k = 0; k < 100; k++) for (let j = 0; j < 6; j++) {
    const d = splashDrop(base, j, k * 0.03, 1), s = sprayDrop(base, j, k * 0.03, 1, 1);
    assert.ok(Number.isFinite(d.dx + d.dy + d.r + s.r + s.s) && d.r >= 0 && s.r >= 0 && s.s >= 0.5 && s.s <= 1);
    assert.ok(Math.abs(d.dx) < 60 && d.dy < 4 && d.dy > -30, 'a splash stays near where it lands');
  }
});

test('the geometry: the sizes agree, every vertex is finite and lies by the path, and a stopped jet is nothing', () => {
  const idx = jetIndex(); assert.equal(idx.length, TRIS * 3); assert.ok(Math.max(...idx) < VERTS);
  assert.equal(jetUv().length, VERTS * 2);
  assert.ok(TRIS < 1000, `${TRIS} triangles`);
  const b = makeJetBuffers();
  for (const t of [0, 0.37, 2.9, 41.5]) {
    const thick = fillJet(b, base, { grow: 1, drain: 0 }, t, 0.36);
    assert.equal(thick, 1); assert.ok(finite(b.pos) && finite(b.nor) && finite(b.tang) && finite(b.ik));
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (let i = 0; i < VERTS; i++) { minx = Math.min(minx, b.pos[3 * i]!); maxx = Math.max(maxx, b.pos[3 * i]!); miny = Math.min(miny, b.pos[3 * i + 1]!); maxy = Math.max(maxy, b.pos[3 * i + 1]!); }
    assert.ok(minx > x3(base.x0 - 40) && maxx < x3(base.xl + 70) && maxy < y3(base.y0 - 40) + 0.2 && miny > y3(base.yl + 40), 'the jet stays about its path');
    for (let i = 0; i < VERTS; i++) assert.ok(Math.abs(Math.hypot(b.nor[3 * i]!, b.nor[3 * i + 1]!, b.nor[3 * i + 2]!) - 1) < 1e-4, 'unit normals');
  }
  fillJet(b, base, { grow: 0, drain: 0 }, 1, 0.36);
  const nose = (i: number) => Math.hypot(b.pos[3 * (TUBE_RINGS * 8 + 2 + i * 18)]! - x3(base.x0), 0);
  assert.ok(nose(N_BLOB - 1) < 0.01, 'the swell at the tear is the tear');
  // grown out only part of the way: its head is short of the landing
  fillJet(b, base, { grow: 0.4, drain: 0 }, 1, 0.36);
  const head = TUBE_RINGS * 8 + 1;
  assert.ok(b.pos[3 * head + 1]! > y3(base.yl), 'the head has not landed yet');
  assert.equal(JET_SEG, 24);
});

test('the layer: it eases in on a rupture, stays whole while it runs, drains off when it stops, and holds still under Reduce Motion', () => {
  const s = new CelScene(); const b = s.disease.bleed;
  const on = { active: true, site: 'VAR' as const, rate: 90, total: 400 };
  const pos = () => (b as unknown as { geo: { getAttribute(n: string): BufferAttribute } }).geo.getAttribute('position').array as Float32Array;
  assert.equal(b.set({ ...on, active: false }, 0.016, true), false); assert.equal(b.group.visible, false);
  assert.equal(b.set(on, 0.016), true); assert.equal(b.group.visible, true); assert.equal(b.meshed, true);
  const spread = () => { const p = pos(), h = TUBE_RINGS * 8 + 1; return Math.hypot(p[3 * h]! - x3(805), p[3 * h + 1]! - y3(244)); };   // (the head of the stream: how far it has run from the tear)
  const first = spread();
  for (let i = 0; i < 20; i++) b.set(on, 0.016);
  const mid = spread();
  for (let i = 0; i < 200; i++) assert.equal(b.set(on, 0.016), true, 'a running jet asks for its next frame');
  const full = spread();
  assert.ok(first < mid && mid < full, `grows out: ${first} ${mid} ${full}`);
  b.set({ ...on, active: false }, 0.016); assert.equal(b.group.visible, true, 'still draining');
  for (let i = 0; i < 600; i++) b.set({ ...on, active: false }, 0.016);
  assert.equal(b.group.visible, false);
  assert.equal(b.set(on, 0.016), true); assert.equal(b.group.visible, true, 'it comes again');
  b.still = true;
  for (let i = 0; i < 400; i++) b.set(on, 0.016);
  assert.equal(b.set(on, 0.016), false, 'under Reduce Motion a settled jet asks for nothing');
  const a = Float32Array.from(pos()); b.set(on, 0.016); assert.deepEqual(Array.from(pos()), Array.from(a), 'and holds still');
  s.dispose?.();
});

test('the scope\'s jet: a path from the tear that arcs down and widens, an outline, a lit band and a spray; nothing when it has eased out or there is no spurt', () => {
  const o = { jx: 150, jy: 100, cx: 200, cy: 200, R: 190, t: 1.3, a: 1, spurt: 1, k: 1 };
  const p = makeJetPath(); jetPath(o, p);
  assert.equal(p.n, SCOPE_SEG + 1); assert.equal(p.pts[0], 150); assert.equal(p.pts[1], 100);
  const tipY = p.pts[2 * SCOPE_SEG + 1]!, tipX = p.pts[2 * SCOPE_SEG]!;
  assert.ok(Math.hypot(tipX - 150, tipY - 100) > 0.2 * 190, 'a long stream');
  assert.ok(tipX > 150 && p.width[3]! > p.width[0]!, 'it goes toward the axis and widens from its mouth');
  for (let i = 0; i < p.n; i++) assert.ok(p.width[i]! >= 0 && p.ink[i]! > 0 && p.ink[i]! <= 1 && Number.isFinite(p.pts[2 * i]!));
  assert.ok(p.ink[SCOPE_SEG]! < p.ink[0]!, 'the outline fades toward the tip');
  const inside = () => true;
  const col = { jet: [0.6, 0, 0.1, 1] as [number, number, number, number], fresh: [0.8, 0.1, 0.1, 1] as [number, number, number, number], ink: [0.1, 0, 0.02, 1] as [number, number, number, number] };
  const shapes = (q: typeof o) => { const out: never[] = []; jetShapes(q, col, out, inside); return out.length; };
  assert.ok(shapes(o) >= 5, 'outline (3), fill, lit band, spray');
  assert.equal(shapes({ ...o, a: 0 }), 0);
  assert.equal(shapes({ ...o, spurt: 0 }), 0, 'an ooze has no jet (the 2D\'s own)');
  assert.ok(jetReach(0.2) < jetReach(0.6) && jetReach(1) === 1, 'it grows out as the bleed comes in');
  const lit = bleedShapes({ cx: 200, cy: 200, R: 190, jx: 150, jy: 100, t: 1.3, a: 1, rate: 90, fill: 0.5, hr: 80 });
  const none = bleedShapes({ cx: 200, cy: 200, R: 190, jx: 150, jy: 100, t: 1.3, a: 1, rate: 10, fill: 0.5, hr: 80 });
  assert.ok(lit.length > none.length);
});
