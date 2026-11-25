// The shunts and collaterals the owner ruled on, on THE PLACED ANATOMY (Mohammad, 24 Nov 2026, on his iPhone): "Umbilical vein should grow from more proximal LPV, varices should be surrounding the esophagus, DIPS just bad".
//  - the paraumbilical vein (C3) and the Meso-Rex bypass (REX) leave the left portal vein at its umbilical portion, in its proximal half, on its last piece (the one the engine joins them to), never at its fading tip;
//  - the oesophageal varices' strands lie round the oesophagus, on its wall, in at least three of its four quadrants at every station of their run, each smooth;
//  - the DIPS is the course he drew and picked (25 Nov, docs/approved/dips.md): a tract from the portal bifurcation, away from the left portal vein, to the cava: its ends inside the portal vein's and the cava's lumens, crossing no other drawn vessel, smooth, its stent on its course end to end;
//  - the TIPS ends inside the right hepatic vein's trunk and never reaches the cava.
// Run: node --test tests/anatomy-placed-shunts.test.ts (it switches the source to 'placed' itself)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { PLACED_EDGE_3D, WHOLE_PIECES, DIPS_DRAWN } = await import('../src/scene/anatomy/placed-network.ts');
const { PLACED_COURSES } = await import('../src/scene/anatomy/placement.generated.ts');
const { NETWORK, NETWORK_BY_ID } = await import('../src/scene/vessels/network.ts');
const { centrelineOf } = await import('../src/scene/vessels/centreline.ts');
const { REST, coursesOf } = await import('../src/scene/vessels/shape.ts');
const { setSmoothJoins } = await import('../src/scene/vessels/join-mode.ts');
const { drawnShare, route3d } = await import('../src/scene/procedures/route3d.ts');
const { ESO_ROWS, aroundEso, ESO_VARIX_GAP } = await import('../src/scene/anatomy/eso-wall.ts');
const { CAUDATE_HOST } = await import('../src/scene/vessels/caudate-veins.ts');
const { ORGAN_MESHES, setOrganData } = await import('../src/scene/organs/meshes.ts');
const { StentDevice } = await import('../src/scene/devices/stent/stent-device.ts');
const { createShared } = await import('../src/scene/materials/cel.ts');
const { BAR } = await import('./anatomy/smooth.ts');
const { Vector3, CatmullRomCurve3 } = await import('three');

type V = readonly [number, number, number];
const dist = (a: V, b: V): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const lenOf = (c: readonly V[]): number => { let s = 0; for (let i = 1; i < c.length; i++) s += dist(c[i]!, c[i - 1]!); return s; };
/** Where along `c` (length from its start) the point nearest `p` lies, and how far it is. */
function along(c: readonly V[], p: V): { s: number; d: number } {
  let best = { s: 0, d: Infinity }, acc = 0;
  for (let i = 1; i < c.length; i++) {
    const a = c[i - 1]!, b = c[i]!, ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const, l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2, l = Math.sqrt(l2);
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / l2)) : 0;
    const d = dist(p, [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]]);
    if (d < best.d) best = { s: acc + t * l, d };
    acc += l;
  }
  return best;
}
/** The sharpest turn and the biggest change of turn over 0.01 steps of a course (tests/anatomy/smooth.ts measures the drawn vessels so). */
function bends(pts: readonly V[]): { turn: number; jerk: number } {
  const cur = new CatmullRomCurve3(pts.map((p) => new Vector3(p[0], p[1], p[2]))), n = Math.ceil(cur.getLength() / 0.01), P = Array.from({ length: n + 1 }, (_, i) => cur.getPointAt(i / n));
  let turn = 0, jerk = 0, prev = -1;
  for (let i = 1; i < n; i++) { const t = (P[i]!.clone().sub(P[i - 1]!).angleTo(P[i + 1]!.clone().sub(P[i]!)) * 180) / Math.PI; turn = Math.max(turn, t); if (prev >= 0) jerk = Math.max(jerk, Math.abs(t - prev)); prev = t; }
  return { turn, jerk };
}


test('the umbilical vein and the Rex bypass leave the left portal vein at its umbilical portion: in its proximal half, where the placement draws them, on its last piece (Mohammad 24 Nov: "more proximal LPV")', () => {
  const lpv = WHOLE_PIECES.lpv!.flatMap((id, i) => (i ? PLACED_EDGE_3D[id]!.slice(1) : PLACED_EDGE_3D[id]!)) as V[], L = lenOf(lpv);
  for (const [id, end] of [['C3', 0], ['REX', 1]] as const) {
    const c = centrelineOf(id)!, p = c.pointAt(end) as V, h = along(lpv, p), placed = PLACED_COURSES[id]!, pp = (end ? placed[placed.length - 1]! : placed[0]!) as V;
    // the bound: within the first half of the vein by length from the bifurcation (the placement's root is at 0.40; the fading tip, where it was, at 1)
    assert.ok(h.s / L <= 0.5, `${id} leaves the left portal vein at ${(h.s / L).toFixed(2)} of its length (at most 0.5)`);
    assert.ok(h.d < 0.25 * NETWORK_BY_ID.get('PVH_L_1')!.radius, `${id}'s end is on the vein's centreline (${h.d.toFixed(4)})`);
    // (C3 only: 0.08. The owner's rule that every join is smooth outranks a mouth exactly where the mock draws it. The paraumbilical vein is drawn 0.9 radii from the Meso-Rex bypass's mouth, and the ridge between them shaded 19 degrees off its
    //  neighbours (bound 12), so it opens 5 radii up the vein from the bypass (placed-network.ts PAIR_GAP_R), 0.075 from its drawn mouth. The bypass stays within 0.03)
    const tol = id === 'C3' ? 0.08 : 0.03;
    assert.ok(dist(p, pp) < tol, `${id} leaves where the placement draws it (${dist(p, pp).toFixed(3)} away, at most ${tol})`);
    // (on the engine's piece: C3 and REX join the left portal vein at LPV, the end of PVH_L_1)
    const share = drawnShare('PVH_L_1', p[0], p[1], p[2])!.share;
    assert.ok(share < 0.5, `${id} lands on PVH_L_1 (${share.toFixed(2)} of its radius off it)`);
    assert.ok(bends(coursesOf(NETWORK_BY_ID.get(id)!, REST)[0]!.pts as V[]).turn <= BAR.vessel.turn, `${id} runs smoothly from there`);
  }
});

test('the oesophagus table is the placed stomach mesh\'s oesophagus: its middle and half-widths per slice within 6 thousandths', () => {
  const bin = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
  setOrganData(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
  const pos = ORGAN_MESHES.stomach!().getAttribute('position');
  for (const [y, cx, cz, rx, rz] of ESO_ROWS) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < pos.count; i++) { if (Math.abs(pos.getY(i) - y) > 0.004 || pos.getX(i) > 0.45) continue; x0 = Math.min(x0, pos.getX(i)); x1 = Math.max(x1, pos.getX(i)); z0 = Math.min(z0, pos.getZ(i)); z1 = Math.max(z1, pos.getZ(i)); }
    for (const [k, a, b] of [['cx', cx, (x0 + x1) / 2], ['cz', cz, (z0 + z1) / 2], ['rx', rx, (x1 - x0) / 2], ['rz', rz, (z1 - z0) / 2]] as const) assert.ok(Math.abs(a - b) < 0.006, `y ${y} ${k}: table ${a}, mesh ${b.toFixed(3)}`);
  }
});

for (const sj of [false, true]) test(`the varices surround the oesophagus: strands in at least 3 of its 4 quadrants at every station from 1.14 to 1.28, each on the wall (its centreline 0 to ${(2 * ESO_VARIX_GAP).toFixed(3)} beyond it, never in it), smooth (smooth joins ${sj ? 'on' : 'off'})`, () => {
  setSmoothJoins(sj);
  try {
    const cs = coursesOf(NETWORK_BY_ID.get('C1a')!, { ...REST, strandsOn: true }).filter((c) => c.radius > 0);
    assert.ok(cs.length >= 3, 'three strands');
    const stations = [1.14, 1.17, 1.2, 1.23, 1.26, 1.28], seen = stations.map(() => new Set<number>());
    for (const c of cs) {
      assert.ok(c.radius <= ESO_VARIX_GAP, `a strand (${c.radius.toFixed(4)}) is no wider than its gap from the wall, so it never cuts into it`);
      const cur = new CatmullRomCurve3(c.pts.map((p) => new Vector3(p[0], p[1], p[2]))), n = 400;
      for (let i = 0; i <= n; i++) {
        const p = cur.getPointAt(i / n), a = aroundEso([p.x, p.y, p.z]);
        if (p.y > 1.12 && p.y < 1.36) assert.ok(a.out >= c.radius - 1e-4 && a.out <= 2 * ESO_VARIX_GAP, `at y ${p.y.toFixed(3)} a strand's centreline is ${a.out.toFixed(4)} beyond the wall`);
        stations.forEach((y, k) => { if (Math.abs(p.y - y) < 0.004) seen[k]!.add(Math.floor((((a.th % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 2))); });
      }
      const b = bends(c.pts as V[]);
      assert.ok(b.turn <= BAR.vessel.turn && b.jerk <= BAR.vessel.jerk, `a strand turns ${b.turn.toFixed(1)} and ${b.jerk.toFixed(1)} per step (bar ${BAR.vessel.turn}, ${BAR.vessel.jerk})`);
    }
    stations.forEach((y, k) => assert.ok(seen[k]!.size >= 3, `at y ${y} the strands lie in ${seen[k]!.size} quadrants round the oesophagus`));
  } finally { setSmoothJoins(false); }
});

test('the DIPS is a short tract from the portal bifurcation to the cava below the caudate\'s veins: its ends inside both lumens, smooth, crossing no other drawn vessel', () => {
  const d = centrelineOf('DIPS')!, a = d.pointAt(0) as V, b = d.pointAt(1) as V;
  const inside = (p: V, ids: string[]): number => Math.min(...ids.map((id) => drawnShare(id, p[0], p[1], p[2])?.share ?? Infinity));
  assert.ok(inside(a, ['PV_TRUNK', 'PVH_R', 'PVH_L']) < 0.25, 'it starts inside the portal vein, on its centreline');
  assert.ok(inside(b, ['IVC_IS_1', 'IVC_IS']) < 0.25, 'it ends inside the cava, on its centreline');
  assert.ok(d.length < 0.35, `short (${d.length.toFixed(3)}): never a run up the liver beside the TIPS (his drawn course, 0.32)`);
  const tips = centrelineOf('TIPS')!;
  assert.ok(Math.abs(b[1] - tips.pointAt(1)[1]) > 0.3, 'it joins the cava far below where the TIPS ends');
  assert.notEqual(CAUDATE_HOST, 'IVC_IS_1', 'the caudate veins open into the cava above it');
  const bd = bends(coursesOf(NETWORK_BY_ID.get('DIPS')!, REST)[0]!.pts as V[]);
  assert.ok(bd.turn <= BAR.vessel.turn && bd.jerk <= BAR.vessel.jerk, `smooth (${bd.turn.toFixed(1)}, ${bd.jerk.toFixed(1)})`);
  // no crossing: along its length, the distance to every other drawn centreline less the two radii stays positive; the vessels it opens into (and those that meet at the same two nodes) only away from its ends
  const ends = new Set(['PV_TRUNK', 'PV_TRUNK_1', 'PVH_R', 'PVH_L', 'C8', 'IVC_IS_1', 'IVC_IS']);
  const bad: string[] = [];
  for (const v of NETWORK) {
    if (v.id === 'DIPS' || v.kind === 'liver') continue;
    const o = centrelineOf(v.id); if (!o) continue;
    let worst = Infinity;
    for (let i = 0; i <= 100; i++) {
      const u = i / 100, p = d.pointAt(u) as V;
      if (ends.has(v.id) && (u * d.length < 0.08 || (1 - u) * d.length < 0.07)) continue;   // (0.08 at the portal end: the DIPS leaves the fork beside the left portal vein, and its wall is clear of that vein's from 0.075 along, 4 radii, on his drawn course)
      for (let j = 0; j <= 120; j++) worst = Math.min(worst, dist(p, o.pointAt(j / 120) as V) - d.radiusAt(u) - o.radiusAt(j / 120));
    }
    if (worst <= 0) bad.push(`${v.id} ${worst.toFixed(4)}`);
  }
  assert.deepEqual(bad, [], 'the DIPS crosses these');
  // the catheter's route (route-placed.ts dipsPlaced): down the cava to the shunt's mouth, then the tract on the shunt's own course, its tip in the portal vein
  const r3 = route3d('dips')!, tr = r3.route.parts.find((q) => q.name === 'tract')!;
  for (let x = tr.d0 + 3; x < tr.d1 - 3; x += 2) { const p = r3.centre(x); assert.ok(drawnShare('DIPS', p.x, p.y, p.z)!.share < 0.2, `the tract at ${x.toFixed(1)} is on the stent's course`); }
  const tip = r3.point(r3.tipD(1));
  assert.ok(inside([tip.x, tip.y, tip.z], ['PV_TRUNK', 'PVH_R', 'PVH_L', 'DIPS']) < 1, 'the catheter\'s tip ends in the portal vein');
});

test('the DIPS is the course Mohammad drew and picked (25 Nov, dips-his-course.png #2): up and away from the left portal vein, one wide arc, into the cava\'s centreline; its stent lies on it, true 8 mm', () => {
  for (const sj of [false, true]) {
    setSmoothJoins(sj);
    try {
      const v = NETWORK_BY_ID.get('DIPS')!, c = coursesOf(v, REST)[0]!.pts as V[], r = coursesOf(v, REST)[0]!.radius, tag = `smooth joins ${sj}`;
      // every point he drew is on the course in the front view (within 0.02, a radius: the fairing at the fork moves the first by 0.016)
      for (const [x, y] of DIPS_DRAWN) { const d = Math.min(...c.map((q) => Math.hypot(q[0] - x, q[1] - y))); assert.ok(d < 0.02, `${tag}: his point (${x}, ${y}) is ${d.toFixed(3)} off the course`); }
      // it leaves away from the left portal vein: its heading over the first 0.1 of arc is at least 20 degrees from the vein's (24 on his course, the straight chord 3203285e was under 5), in the front view, and its course bows left of the fork
      const lpv = coursesOf(NETWORK_BY_ID.get('PVH_L')!, REST)[0]!.pts as V[], head = (pts: readonly V[], len: number): number => { let acc = 0, i = 1; for (; i < pts.length - 1 && acc < len; i++) acc += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]); return Math.atan2(pts[i - 1]![1] - pts[0]![1], pts[i - 1]![0] - pts[0]![0]); };
      const away = Math.abs((head(c, 0.1) - head(lpv, 0.1)) * 180 / Math.PI);
      assert.ok(away >= 20, `${tag}: it leaves the fork ${away.toFixed(0)} degrees from the left portal vein (at least 20)`);
      assert.ok(Math.min(...c.map((q) => q[0])) < c[0]![0] - 0.012, `${tag}: it bows left of the fork (0.018 on his course)`);
      // it ends on the cava's centreline at the height he drew
      const e = c[c.length - 1]!;
      assert.ok(Math.abs(e[1] - DIPS_DRAWN[DIPS_DRAWN.length - 1]![1]) < 0.01, `${tag}: it ends at the drawn height (${e[1].toFixed(3)})`);
      // one wide arc, no hook: it turns the one way (to the right, seen from the front) from where it has cleared the fork to its end
      const turns: number[] = []; for (let i = 8; i + 8 < c.length; i += 4) { const a = [c[i]![0] - c[i - 8]![0], c[i]![1] - c[i - 8]![1]], b = [c[i + 8]![0] - c[i]![0], c[i + 8]![1] - c[i]![1]]; turns.push(a[0]! * b[1]! - a[1]! * b[0]!); }
      assert.ok(Math.max(...turns) < 3e-4 && turns.filter((t) => t > 0).length <= 1, `${tag}: the arc turns one way only, bar the last stretch easing level into the cava (it does not wobble)`);
      // the stent: its axis lies on the course end to end, at its 8 mm width (never wider than the vessel it is in)
      const s = new StentDevice('DIPS', createShared()), spec = s.specFor(null, 8);
      let worst = 0; for (let i = 0; i <= 40; i++) { const q = spec.at((spec.A * i) / 40, new Vector3()); worst = Math.max(worst, Math.min(...c.map((k) => dist([q.x, q.y, q.z], k)))); }
      assert.ok(worst < 0.004, `${tag}: the stent's axis is ${worst.toFixed(4)} off the course`);
      assert.ok(spec.R > 0.8 * r && spec.R <= r, `${tag}: the stent's radius ${spec.R.toFixed(4)} is the vessel's ${r.toFixed(4)} less its wall (8 mm)`);
    } finally { setSmoothJoins(false); }
  }
});

test('the TIPS and DIPS stents run their courses end to end (no bare tube past them), and the TIPS ends inside the right hepatic vein\'s trunk, clear of the cava', () => {
  const shared = createShared();
  for (const id of ['TIPS', 'DIPS'] as const) {
    const s = new StentDevice(id, shared), spec = s.specFor(null, 8), c = coursesOf(NETWORK_BY_ID.get(id)!, REST)[0]!.pts as V[];
    const p0 = spec.at(0, new Vector3()), p1 = spec.at(spec.A, new Vector3());
    assert.ok(dist([p0.x, p0.y, p0.z], c[0]!) < 0.01 && dist([p1.x, p1.y, p1.z], c[c.length - 1]!) < 0.01, `${id}: the stent's ends are the course's ends (to its 2-unit inset)`);
  }
  const t = centrelineOf('TIPS')!, end = t.pointAt(1) as V;
  assert.ok(Math.min(...['RHV_IVC', 'RHV_IVC_1'].map((id) => drawnShare(id, end[0], end[1], end[2])!.share)) < 0.25, 'the TIPS ends inside the right hepatic vein\'s trunk');
  const cava = WHOLE_PIECES.ivc!.map((id) => centrelineOf(id)!).filter(Boolean), rT = NETWORK_BY_ID.get('TIPS')!.radius;
  for (let i = 0; i <= 100; i++) {
    const p = t.pointAt(i / 100) as V;
    for (const cv of cava) { const u = cv.nearestU([p[0], p[1], p[2]]), q = cv.pointAt(u) as V; assert.ok(dist(p, q) > cv.radiusAt(u) + rT, `the TIPS at ${(i / 100).toFixed(2)} stays out of the cava (${cv.id})`); }
  }
});

test('no stent or shunt course touches another drawn vessel except at its own two ends (wall to wall above 0; the TIPS and DIPS tracts by 0.005 or more)', () => {
  const nodeOf = (id: string): [string, string] => { const v = NETWORK_BY_ID.get(id)!; return [v.from, v.to]; };
  const bad: string[] = [];
  for (const id of ['TIPS', 'DIPS', 'S_PC', 'S_MC', 'S_DSR', 'REX']) {
    const s = centrelineOf(id); if (!s) continue;
    const [n0, n1] = nodeOf(id), floor = id === 'TIPS' || id === 'DIPS' ? 0.005 : 0;
    for (const v of NETWORK) {
      if (v.id === id || v.kind === 'liver') continue;
      const o = centrelineOf(v.id); if (!o) continue;
      // (a vessel that meets it at one of its nodes, or a branch hung on one: only away from that end, three of the two radii out, where the shunt is still entering it)
      // (or one whose end is DRAWN at the shunt's end: the short gastric veins leave the splenic vein at SVD, beside the distal splenorenal shunt, where the placement draws them, though the engine joins them at SV)
      const oEnds = [o.pointAt(0) as V, o.pointAt(1) as V], meets = (q: V): boolean => oEnds.some((e) => dist(e, q) < s.radiusAt(0) + o.radiusAt(0) + 0.01);
      const host = NETWORK_BY_ID.get(v.host ?? v.id) ?? v, at0 = [host.from, host.to, v.from, v.to].includes(n0) || meets(s.pointAt(0) as V), at1 = [host.from, host.to, v.from, v.to].includes(n1) || meets(s.pointAt(1) as V);
      let worst = Infinity, wu = 0;
      for (let i = 0; i <= 120; i++) {
        const u = i / 120, p = s.pointAt(u) as V, rs = s.radiusAt(u), zone = 3 * (rs + 0.027);
        if ((at0 && u * s.length < zone) || (at1 && (1 - u) * s.length < zone)) continue;
        for (let j = 0; j <= 120; j++) { const g = dist(p, o.pointAt(j / 120) as V) - rs - o.radiusAt(j / 120); if (g < worst) { worst = g; wu = u; } }
      }
      if (worst <= floor) bad.push(`${id} vs ${v.id}: ${worst.toFixed(4)} at ${wu.toFixed(2)}`);
    }
  }
  assert.deepEqual(bad, [], 'these touch');
});
