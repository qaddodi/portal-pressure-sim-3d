// The Lobule's welded junctions (lobule/welds.ts, micro3d/lobule-welded.ts; Mohammad, 20 Nov 2026: "how about junctions in the lobule? bile ducts, lymph ducts? all welded?"): every place two of the
// network's tubes meet is one closed mesh, the seam rings are the tubes' own rings (no crack), nothing of the network floats free of the rest, and the old overlapping tubes stay one switch away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BufferAttribute } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { DISC_R } from '../src/scene/lobule/widths.ts';
import { Lobule3D, LZ, OVER_Z, TUBE_SEG } from '../src/scene/micro3d/lobule3d.ts';
import { bileWeldCourses, bloodWeldCourses } from '../src/scene/lobule/weld-courses.ts';
import { planWelds, TOUCH, type V3, type WeldCourse, type WeldPlan } from '../src/scene/lobule/welds.ts';
import { tubeFrames } from '../src/scene/micro3d/cel3d.ts';
import { joinsMode } from '../src/scene/vessels/skin/joins-mode.ts';

const R = 3, HEIGHTS = { R, over: OVER_Z, tube: LZ.tube, bile: LZ.cellTop + 0.001 }, SEGS = { vessel: TUBE_SEG, bile: 6 };

/** A straight course of `n` samples from a to b at one height, radius r. */
function line(key: string, a: V3, b: V3, r: number, n = 40, family = 'blood'): WeldCourse {
  return { key, phase: 0, family, pts: Array.from({ length: n }, (_, i) => [a[0] + (b[0] - a[0]) * i / (n - 1), a[1] + (b[1] - a[1]) * i / (n - 1), a[2]] as V3), rad: new Array(n).fill(r), w: new Array(n).fill(0.5), seg: 10 };
}
/** The ring a planned course has at sample i (the tube builder's own frames and radius), as the float32 numbers the mesh holds. */
function ringOf(course: { pts: V3[]; rad: number[] }, i: number, seg: number): Float32Array {
  const fr = tubeFrames(course.pts), nn = fr.N[i]!, bn = fr.Bn[i]!, c = course.pts[i]!, r = course.rad[i]!, out = new Float32Array(3 * seg);
  for (let q = 0; q < seg; q++) { const a = (q / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a); for (let d = 0; d < 3; d++) out[3 * q + d] = c[d]! + (nn[d]! * ca + bn[d]! * sa) * r; }
  return out;
}
/** Every interior edge of a skin is shared by two triangles and every seam edge by one. */
function closedBetweenSeams(mesh: { index: Uint32Array; seamVerts: Uint32Array[] }): { open: number; bad: number } {
  const count = new Map<string, number>();
  const k = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (let i = 0; i < mesh.index.length; i += 3) for (let s = 0; s < 3; s++) { const e = k(mesh.index[i + s]!, mesh.index[i + (s + 1) % 3]!); count.set(e, (count.get(e) ?? 0) + 1); }
  const seam = new Set<string>();
  for (const ring of mesh.seamVerts) for (let q = 0; q < ring.length; q++) seam.add(k(ring[q]!, ring[(q + 1) % ring.length]!));
  let open = 0, bad = 0;
  for (const [e, c] of count) { if (seam.has(e)) { if (c !== 1) bad++; } else if (c !== 2) { open++; } }
  return { open, bad };
}

test('a Y of three tubes is one skin on the tubes\' own rings: closed, seams bit for bit, caps only on the free ends', () => {
  const plan = planWelds([line('a', [-1, 0.5, 0.03], [0, 0, 0.03], 0.03), line('b', [-1, -0.5, 0.03], [0, 0, 0.03], 0.03), line('c', [0, 0, 0.03], [1, 0, 0.03], 0.04)]);
  assert.equal(plan.skins.length, 1, `skipped: ${JSON.stringify(plan.skipped)}`);
  const skin = plan.skins[0]!;
  assert.equal(skin.arms.length, 3);
  assert.deepEqual(closedBetweenSeams(skin.mesh), { open: 0, bad: 0 });
  for (const arm of skin.arms) {
    const ring = ringOf(plan.courses.get(arm.key)!, arm.seam, 10), ids = skin.mesh.seamVerts[skin.arms.indexOf(arm)]!;
    for (let q = 0; q < 10; q++) for (let d = 0; d < 3; d++) assert.equal(skin.mesh.position[3 * ids[q]! + d], ring[3 * q + d], `${arm.key} seam vertex ${q}`);
  }
  // each tube is cut at its seam: no cap there, a cap at its far end
  for (const c of ['a', 'b']) { const p = plan.courses.get(c)!.pieces; assert.equal(p.length, 1); assert.ok(p[0]!.capStart && !p[0]!.capEnd, `${c}: ${JSON.stringify(p)}`); }
  const c = plan.courses.get('c')!.pieces; assert.ok(!c[0]!.capStart && c[0]!.capEnd);
});

test('a T (a branch ending on the side of a tube) splits the host in two arms and welds all three', () => {
  const plan = planWelds([line('host', [-1, 0, 0.03], [1, 0, 0.03], 0.04), line('branch', [0.1, 0.8, 0.03], [0.1, 0, 0.03], 0.02)]);
  assert.equal(plan.skins.length, 1, `skipped: ${JSON.stringify(plan.skipped)}`);
  const skin = plan.skins[0]!, host = plan.courses.get('host')!;
  assert.equal(skin.arms.length, 3);
  assert.ok(skin.through && skin.host === 'host');
  assert.deepEqual(closedBetweenSeams(skin.mesh), { open: 0, bad: 0 });
  // the host is two pieces (a cap at each far end, none at the cut) with the junction point between them in its path
  assert.equal(host.pieces.length, 2, JSON.stringify(host.pieces));
  assert.ok(host.pieces[0]!.capStart && !host.pieces[0]!.capEnd && !host.pieces[1]!.capStart && host.pieces[1]!.capEnd);
  assert.equal(host.pts.length, 41);
  for (const arm of skin.arms) {
    const ring = ringOf(plan.courses.get(arm.key)!, arm.seam, 10), ids = skin.mesh.seamVerts[skin.arms.indexOf(arm)]!;
    for (let q = 0; q < 10; q++) for (let d = 0; d < 3; d++) assert.equal(skin.mesh.position[3 * ids[q]! + d], ring[3 * q + d]);
  }
});

test('tubes that merely cross, or run apart, are not a junction', () => {
  const plan = planWelds([line('a', [-1, 0, 0.03], [1, 0, 0.03], 0.03), line('b', [0, -1, 0.03], [0, 1, 0.03], 0.03), line('c', [-1, 2, 0.03], [1, 2, 0.03], 0.03)]);
  assert.equal(plan.skins.length, 0);
  assert.equal(plan.skipped.length, 0);
});

// ---- the real network -----------------------------------------------------------------------------------------------------------

const shared = createShared();
const flat = new LobuleView(shared);
const net = flat.net;
const mouthR: Partial<Record<string, number>> = { pv: DISC_R.pv, ha: DISC_R.ha * 1.7, bd: DISC_R.bd * 1.4, lv: DISC_R.lv, cv: DISC_R.cv };
const avoid = net.courses.filter((c) => mouthR[c.kind] !== undefined).map((c) => { const p = c.pts[Math.floor(c.pts.length / 2)]!; return { x: p[0] * R, y: -p[1] * R, r: mouthR[c.kind]! * R }; });
const courses = [...bloodWeldCourses(net, HEIGHTS, SEGS), ...bileWeldCourses(net, HEIGHTS, SEGS)];
const plan: WeldPlan = planWelds(courses, { avoid });

test('the real Lobule: the sinusoid tree, the inlets and the bile ducts are welded (most junctions, every one in the three kinds)', () => {
  const kinds = new Set(plan.skins.map((s) => s.node[0]));
  assert.ok(kinds.has('Y') && kinds.has('T'));
  assert.ok(plan.skins.length >= 100, `skins ${plan.skins.length}, skipped ${plan.skipped.length}`);
  for (const k of ['s0', 's1', 's2', 'an', 'in', 'bile']) assert.ok(plan.skins.some((s) => s.arms.some((a) => a.key.startsWith(k))), `no skin on ${k}`);
});

test('every skin of the real Lobule is closed, on the tubes\' own rings, and none is inside a vessel\'s mouth', () => {
  for (const s of plan.skins) {
    assert.deepEqual(closedBetweenSeams(s.mesh), { open: 0, bad: 0 }, s.node);
    s.arms.forEach((arm, i) => {
      const c = plan.courses.get(arm.key)!, seg = courses.find((k) => k.key === arm.key)!.seg, ring = ringOf(c, arm.seam, seg), ids = s.mesh.seamVerts[i]!;
      for (let q = 0; q < seg; q++) for (let d = 0; d < 3; d++) assert.equal(s.mesh.position[3 * ids[q]! + d], ring[3 * q + d], `${s.node} ${arm.key} seam`);
    });
    for (const d of avoid) assert.ok(Math.hypot(s.J[0] - d.x, s.J[1] - d.y) >= d.r, `${s.node} is inside a mouth`);
  }
});

test('nothing of the network floats free: the tubes, the skins and the contacts left unwelded make one blood network and one bile network', () => {
  const par = new Map<string, string>();
  const find = (a: string): string => { if (!par.has(a)) par.set(a, a); let r = a; while (par.get(r) !== r) r = par.get(r)!; par.set(a, r); return r; };
  const join = (a: string, b: string) => par.set(find(a), find(b));
  for (const s of plan.skins) for (const a of s.arms) join(`skin:${s.node}`, a.key);
  // a tube end within TOUCH of another tube is joined (a junction the planner left as it was keeps its overlap, which is still a join)
  const near = (p: V3, c: WeldCourse): number => { let m = Infinity; for (let i = 0; i < c.pts.length - 1; i++) { const a = c.pts[i]!, b = c.pts[i + 1]!, bx = b[0] - a[0], by = b[1] - a[1], bb = bx * bx + by * by; let t = bb > 0 ? ((p[0] - a[0]) * bx + (p[1] - a[1]) * by) / bb : 0; t = Math.min(1, Math.max(0, t)); m = Math.min(m, Math.hypot(p[0] - a[0] - t * bx, p[1] - a[1] - t * by)); } return m; };
  for (const c of courses) for (const e of [c.pts[0]!, c.pts[c.pts.length - 1]!]) for (const o of courses) if (o !== c && o.family === c.family && near(e, o) < TOUCH) join(c.key, o.key);
  for (const fam of ['blood', 'bile']) {
    const roots = new Set(courses.filter((c) => c.family === fam).map((c) => find(c.key)));
    assert.equal(roots.size, 1, `${fam}: ${roots.size} separate pieces`);
  }
  // every course keeps at least one tube
  for (const c of plan.courses.values()) assert.ok(c.pieces.length >= 1, `${c.key} has no tube left`);
});

// ---- laid into the scene ------------------------------------------------------------------------------------------------------

test('laid in, the Lobule\'s vessel parts stay finite and whole: attributes the length of their vertices, no triangle inside out, swell and colour places in range', () => {
  const l3 = new Lobule3D(flat, shared);
  l3.buildForTest('light');
  const before = l3.vertexCount;
  assert.equal(l3.weldCount, 0, 'no welds until a plan is laid in (and none with ?joins=old)');
  l3.layWeldsForTest(plan);
  assert.equal(l3.weldCount, plan.skins.length);
  assert.ok(l3.vertexCount > before && l3.vertexCount < 260_000, `vertices ${before} -> ${l3.vertexCount}`);
  for (const p of l3.partsForTest) {
    const g = p.geometry, n = (g.getAttribute('position') as BufferAttribute).count;
    for (const name of ['normal', 'color', 'aux', 'aux2', 'swell', 'fcourse']) { const a = g.getAttribute(name) as BufferAttribute | undefined; if (a) assert.equal(a.count, n, `${p.toonMesh.name} ${name}`); }
    for (const v of (g.getAttribute('position') as BufferAttribute).array) assert.ok(Number.isFinite(v), p.toonMesh.name);
    const sw = g.getAttribute('swell') as BufferAttribute | undefined;
    if (sw) for (const v of sw.array) assert.ok(Number.isFinite(v) && v >= 0, `${p.toonMesh.name} swell ${v}`);
    // the dust's place (cel3d fcourse): finite, a whole column, and ONE column over every triangle (an interpolated column would read a third course's lanes: specks)
    const fc = g.getAttribute('fcourse') as BufferAttribute | undefined, ix = g.getIndex();
    if (fc) {
      for (const v of fc.array) assert.ok(Number.isFinite(v), `${p.toonMesh.name} fcourse ${v}`);
      for (let i = 0; i < fc.count; i++) assert.equal(fc.getX(i), Math.round(fc.getX(i)));
      if (ix) for (let i = 0; i < ix.count; i += 3) { const a = fc.getX(ix.getX(i)); assert.ok(a === fc.getX(ix.getX(i + 1)) && a === fc.getX(ix.getX(i + 2)), `${p.toonMesh.name}: a triangle spans two dust columns`); }
    }
  }
  const part = l3.partsForTest.find((p) => p.toonMesh.name === 'lobule3d/sinusoids-0')!;
  const pos = part.geometry.getAttribute('position') as BufferAttribute, nor = part.geometry.getAttribute('normal') as BufferAttribute, ix = part.geometry.getIndex()!;
  let bad = 0;
  for (let i = 0; i < ix.count; i += 3) {
    const a = ix.getX(i), b = ix.getX(i + 1), c = ix.getX(i + 2);
    const e1 = [pos.getX(b) - pos.getX(a), pos.getY(b) - pos.getY(a), pos.getZ(b) - pos.getZ(a)], e2 = [pos.getX(c) - pos.getX(a), pos.getY(c) - pos.getY(a), pos.getZ(c) - pos.getZ(a)];
    const f = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    const d = f[0]! * (nor.getX(a) + nor.getX(b) + nor.getX(c)) + f[1]! * (nor.getY(a) + nor.getY(b) + nor.getY(c)) + f[2]! * (nor.getZ(a) + nor.getZ(b) + nor.getZ(c));
    if (d < 0) bad++;
  }
  assert.equal(bad, 0, `${bad} triangles inside out`);
});

test('?joins=old is the way back: it asks for no welds', () => {
  assert.equal(joinsMode('?joins=old'), 'old');
});
