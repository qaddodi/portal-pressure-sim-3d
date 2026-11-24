// The devices, procedures and disease on THE PLACED ANATOMY (docs/approved/anatomy-placement.md, `?anatomy=new`): this file switches the source to 'placed' before anything is imported, so it checks what
// the app does with the switch on, against whatever courses and organs the shared accessors return (vessels/centreline.ts centrelineOf, shape.ts coursesOf, organs/meshes.ts): every route's catheter inside
// the lumen, the HVPG's tip wedged in the lower right hepatic branch (rhvb) with the WHVP's place ahead of it and the column tinting that branch, the TIPS and DIPS stents on their courses, the Budd-Chiari clot
// ostial and short of the fork, the EUS needle's point in the left portal and left hepatic veins, and the dive's place inside the liver, clear of every vessel.
// Run: node --test tests/anatomy-placed-devices.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';

process.env.PPS_ANATOMY = 'placed';
const { PLACED } = await import('../src/scene/anatomy/source.ts');
const { NETWORK, NETWORK_BY_ID } = await import('../src/scene/vessels/network.ts');
const { centrelineOf } = await import('../src/scene/vessels/centreline.ts');
const { ROUTE_KINDS, routeOf } = await import('../src/scene/procedures/route.ts');
const { route3d, routeVessels, courseDistance, drawnShare } = await import('../src/scene/procedures/route3d.ts');
const { rhvbId } = await import('../src/scene/procedures/route-placed.ts');
const { OSTIUM_U } = await import('../src/scene/procedures/ostium.ts');
const { catheterRoute } = await import('../src/scene/catheter-route.ts');
const { UNITS_PER_SCENE: U } = await import('../src/scene/frame2d.ts');
const { createShared } = await import('../src/scene/materials/cel.ts');
const { ProcedureLayer: ProcLayer } = await import('../src/scene/procedures/layer.ts');
const { ORGAN_MESHES, setOrganData } = await import('../src/scene/organs/meshes.ts');
const { LIVER_POINT } = await import('../src/scene/lobule/frames.ts');
const { drawnHost, cavaFarWallShare } = await import('../src/scene/disease/host.ts');
const { ostialEnds } = await import('../src/scene/disease/clots.ts');
const { EndoScope, scopeWay, wayShift } = await import('../src/scene/devices/probes/scope.ts');
const { glueTarget3 } = await import('../src/scene/devices/glue-cast.ts');

const bin = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
const STEP = 1.5;
const nearEnd = (r: { parts: { name: string; d0: number; d1: number }[] }, d: number): boolean => r.parts.some((q) => q.name !== 'lead' && (Math.abs(d - q.d0) <= STEP || Math.abs(d - q.d1) <= STEP));

test('the switch is on in this file', () => { assert.equal(PLACED, true); });

test('every route is laid in 3D on the drawn centrelines: the catheter inside 0.7 of the lumen at every sample of every leg, and narrower than it', () => {
  const report: string[] = [];
  for (const kind of ROUTE_KINDS) {
    const r3 = route3d(kind);
    if (!r3) { report.push(`${kind}: no route`); continue; }
    const r = r3.route, vs = routeVessels(r);
    assert.ok(r.raw3 && r.raw3.length === r.pts.length, `${kind}: the route carries its 3D centreline`);
    let out = 0, n = 0, worst = 0;
    for (let d = r.parts[1]!.d0; d <= r.total; d += 2) {
      if (nearEnd(r, d)) continue;
      const p = r3.point(d), dist = courseDistance(vs, p), lum = r3.lumen(d);
      if (!Number.isFinite(dist)) continue;
      n++; worst = Math.max(worst, dist / lum);
      if (dist >= 0.7 * lum) out++;
    }
    if (out) report.push(`${kind}: ${out} of ${n} samples outside 0.7 of the lumen (worst ${worst.toFixed(2)})`);
    const lumens = Array.from({ length: 40 }, (_, i) => r3.lumen(r.start + ((r.free - r.start) * i) / 39));
    if (!(r3.rc <= 0.7 * Math.min(...lumens) + 1e-9)) report.push(`${kind}: the catheter ${r3.rc.toFixed(4)} is not narrower than 0.7 of its lumen ${Math.min(...lumens).toFixed(4)}`);
  }
  assert.deepEqual(report, [], report.join('; '));
});

test('the HVPG wedges in the lower right hepatic branch: the tip and the balloon behind it inside rhvb, the blocked tip at the vein\'s mouth, the slice\'s catheter on the same way', () => {
  const br = rhvbId();
  assert.ok(br && NETWORK_BY_ID.has(br), 'the network draws the lower right hepatic branch');
  const r3 = route3d('hvpg')!, r = r3.route, part = r.parts.find((q) => q.name === 'branch')!;
  assert.equal(part.id, br, 'the leg after the trunk is the lower branch');
  const tipD = r3.tipD(1);
  assert.ok(tipD > part.d0 && tipD < part.d1, 'the tip stops in the branch');
  const tip = r3.point(tipD), q = drawnShare(br!, tip.x, tip.y, tip.z)!;
  assert.ok(q.share < 0.5, `the tip is in the middle of the branch's lumen (${q.share.toFixed(2)} of its radius off the centreline)`);
  // the balloon: from the gap behind the tip back over its length (proc-catheter fitBalloon: 4.2 shaft radii, then 3.2 lumen radii), every point inside the branch
  const gap = r3.rc * U * 4.2, len = r3.lumen(r.free) * U * 3.2;
  for (let d = tipD - gap - len; d <= tipD - gap; d += 1) { const p = r3.centre(d), s: { share: number } = drawnShare(br!, p.x, p.y, p.z)!; assert.ok(s.share < 0.35, `the balloon's axis at ${d.toFixed(1)} is ${s.share.toFixed(2)} of rhvb's radius off its centreline`); }
  // the blocked vein's tip waits at the mouth of the right hepatic vein, in the cava, two figure units short of it
  const u = (r.hv0 - 2 - r.start) / (r.free - r.start);
  assert.ok(Math.abs(u - OSTIUM_U) < 1e-9 && u > 0 && u < 1);
  // the slice's own catheter (hidden, kept for its tests) runs the same way to the same tip
  const cr = catheterRoute(), end = cr[cr.length - 1]!;
  assert.ok(Math.hypot(end[0] - tip.x, end[1] - tip.y, end[2] - tip.z) < 1e-6, 'the slice catheter ends at the wedge');
});

test('the WHVP\'s place is ahead of the tip, inside the branch, and the amber column tints the branch from the balloon out', () => {
  const layer = new ProcLayer(createShared());
  layer.showHvpgState(1, 1, 'wedge', 0, 1);
  const tip = layer.tipPosition(new Vector3())!, ahead = layer.aheadPosition(new Vector3())!, br = rhvbId()!;
  const r3 = route3d('hvpg')!, r = r3.route, along = (p: Vector3): number => { let b = Infinity, bi = 0; r3.pos.forEach((q, i) => { const d = q.distanceToSquared(p); if (d < b) { b = d; bi = i; } }); return r.cum[bi]!; };
  assert.ok(along(ahead) > along(tip) + 1, `the reading hangs ahead of the tip (${along(ahead).toFixed(1)} vs ${along(tip).toFixed(1)})`);
  assert.ok(drawnShare(br, ahead.x, ahead.y, ahead.z)!.share < 0.6, 'and inside the branch it reads');
  const w = layer.wedgeTint()!;
  assert.ok(w && w.pieces.has(br), 'the column is on the branch the tip wedges in');
  for (const id of ['RHV_IVC', 'RHV_IVC_1']) assert.ok(!w.pieces.has(id) || w.pieces.get(id)!.d0 > 0, `${id} (downstream of the balloon) is not tinted from behind`);
  (layer as { dispose?: () => void }).dispose?.();
});

test('the TIPS and DIPS stents lie on their own courses, their ends inside the veins they join: the TIPS on the portal and right hepatic vein trunks, the DIPS on the portal trunk and the cava', () => {
  const inside = (p: readonly number[], ids: string[]): number => Math.min(...ids.filter((id) => NETWORK_BY_ID.has(id)).map((id) => drawnShare(id, p[0]!, p[1]!, p[2]!)?.share ?? Infinity));
  const tips = centrelineOf('TIPS')!, dips = centrelineOf('DIPS')!;
  assert.ok(inside(tips.pointAt(0), ['PVH_R', 'PVH_R_1', 'PVH_R_2', 'PV_TRUNK', 'PV_TRUNK_1']) < 1, 'the TIPS starts in the portal vein');
  assert.ok(inside(tips.pointAt(1), ['RHV_IVC', 'RHV_IVC_1']) < 1, 'and ends in the right hepatic vein');
  assert.ok(inside(dips.pointAt(0), ['PV_TRUNK', 'PV_TRUNK_1', 'PVH_R', 'PVH_L']) < 1, 'the DIPS starts in the portal vein');
  assert.ok(inside(dips.pointAt(1), ['IVC_IS', 'IVC_IS_1']) < 1, 'and ends in the cava');
  // the TIPS route's tract leg is the stent's course (the catheter crosses the liver where the stent will lie)
  const r3 = route3d('tips')!, tr = r3.route.parts.find((q) => q.name === 'tract')!;
  for (let d = tr.d0 + 3; d < tr.d1 - 3; d += 2) { const p = r3.centre(d), s = drawnShare('TIPS', p.x, p.y, p.z)!; assert.ok(s.share < 0.2, `the tract at ${d.toFixed(1)} is on the stent's course (${s.share.toFixed(2)})`); }
});

test('the Budd-Chiari clot is ostial: about three vein widths, out to the cava\'s far wall and no further, and short of the right hepatic vein\'s fork', () => {
  const h = drawnHost('RHV_IVC')!;
  assert.ok(h);
  const e = ostialEnds(h, 1, 1)!, far = cavaFarWallShare(h)!;
  assert.ok((e.b0 - e.a) * h.length <= 3.1 * e.D, 'about three widths');
  assert.ok(e.b <= far + 1e-9, 'no further than the cava\'s far wall');
  // the fork: where the lower branch leaves the trunk, as a share of the drawn host
  const br = centrelineOf(rhvbId()!)!, a = br.pointAt(0), b = br.pointAt(1);
  const join = [a, b].map((p) => ({ p, d: Math.min(...h.pts.map((q) => Math.hypot(q.x - p[0], q.y - p[1], q.z - p[2]))) })).sort((x, y) => x.d - y.d)[0]!.p;
  let bi = 0, bd = Infinity; h.pts.forEach((q, i) => { const d = Math.hypot(q.x - join[0], q.y - join[1], q.z - join[2]); if (d < bd) { bd = d; bi = i; } });
  const fork = h.s[bi]! / h.length;
  assert.ok(e.a > fork, `the clot (from ${e.a.toFixed(3)}) stops before the fork (${fork.toFixed(3)})`);
});

test('the EUS needle crosses into the left portal vein and the left hepatic vein: its point is in their lumens; the glue\'s target is on the varix', () => {
  const sc = new EndoScope(createShared()), w = scopeWay();
  void wayShift(0);
  for (const [station, id] of [['pv', 'PVH_L'], ['hv', 'LHV_IVC']] as const) {
    const drive = { u: 1, tgt: station === 'hv' ? 1 : 0, aim: 1, fan: 1, needle: 1, flash: 0, read: 0 };
    let now = 0;
    for (let i = 0; i < 4; i++) { now += 16; sc.update(16, true, 'eus', station, undefined, undefined, drive, now); }
    assert.ok(Math.abs(sc.d - w.total) < 1e-6 || station === 'hv');
    const p = sc.pose.needleEnd, pieces = NETWORK.filter((v) => v.host === id || v.id === id).map((v) => v.id);
    const share = Math.min(...pieces.map((q) => drawnShare(q, p.x, p.y, p.z)?.share ?? Infinity));
    assert.ok(share < 1, `${station}: the needle's point is in the ${id} lumen (${share.toFixed(2)} of its radius off its centreline)`);
  }
  sc.dispose();
  // (a varix at rest is a bundle of strands round its own line, course 0 of its shape: the glue goes in on that line, as in 2D)
  const g = glueTarget3(), off = courseDistance(['C2'], g);
  assert.ok(off < 0.5 * NETWORK_BY_ID.get('C2')!.radius, `the glue goes into the varix C2 (${off.toFixed(4)} off its line)`);
});

test('the dive\'s place is inside the liver, clear of every vessel, between the right portal vein and the right hepatic vein', () => {
  const lg = ORGAN_MESHES.liver!(); lg.computeBoundingBox(); const bb = lg.boundingBox!;
  const p = LIVER_POINT;
  assert.ok(p[0] > bb.min.x + 0.05 && p[0] < bb.max.x - 0.05 && p[1] > bb.min.y + 0.05 && p[1] < bb.max.y - 0.05 && p[2] > bb.min.z && p[2] < bb.max.z, `inside the liver's box: ${p.map((x) => x.toFixed(3))}`);
  let m = Infinity;
  for (const v of NETWORK) { const c = centrelineOf(v.id); if (!c) continue; for (let i = 0; i <= 64; i++) { const q = c.pointAt(i / 64); m = Math.min(m, Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2])); } }
  assert.ok(m > 0.03, `clear of every vessel: ${m.toFixed(3)}`);
  const rpv = centrelineOf('PVH_R_2')!.pointAt(1), rhv = centrelineOf('RHV_IVC_1')!.pointAt(0);
  assert.ok(p[1] > Math.min(rpv[1], rhv[1]) && p[1] < Math.max(rpv[1], rhv[1]), 'between the right portal vein and the right hepatic vein');
});

test('every route kind the switch lays is there', () => { for (const k of ROUTE_KINDS) assert.ok(routeOf(k), k); });
