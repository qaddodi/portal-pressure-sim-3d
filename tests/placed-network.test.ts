// The placed vessel network (anatomy integration plan 3.1, docs/approved/anatomy-placement.md): with the approved placement switched on (PPS_ANATOMY=placed, `?anatomy=new` in the app), every engine edge the anatomy draws has a
// finite 3D course; the pieces the engine cuts a whole vessel into meet end to end (within 0.002); every run-on meets with no gap; and no engine-linked end (a shunt's, a collateral's, a bed's, a neighbour's) sits on a
// draw-only branch (rhva, rhvb, rpva, rpvp: they have no engine node, so the TIPS lands on the trunks, Mohammad's ruling 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PPS_ANATOMY = 'placed';
const { PLACED } = await import('../src/scene/anatomy/source.ts');
const { WHOLE_PIECES, PLACED_BRANCHES, PLACED_SPLIT, PLACED_EDGE_3D } = await import('../src/scene/anatomy/placed-network.ts');
const { DRAWN_EDGE_IDS, NETWORK, NETWORK_BY_ID, RUN_ONS } = await import('../src/scene/vessels/network.ts');
const { centrelineOf } = await import('../src/scene/vessels/centreline.ts');
const { setSmoothJoins } = await import('../src/scene/vessels/join-mode.ts');

type V = readonly [number, number, number];
const dist = (a: V, b: V): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function nearest(p: V, poly: readonly V[]): number {
  let best = Infinity;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1]!, b = poly[i]!, ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l2 = ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0]! + (p[1] - a[1]) * ab[1]! + (p[2] - a[2]) * ab[2]!) / l2)) : 0;
    best = Math.min(best, dist(p, [a[0] + t * ab[0]!, a[1] + t * ab[1]!, a[2] + t * ab[2]!]));
  }
  return best;
}

test('the switch is on for this file', () => assert.equal(PLACED, true));

for (const sj of [false, true]) {
  test(`every drawn engine edge has a finite course (smooth joins ${sj ? 'on' : 'off'})`, () => {
    setSmoothJoins(sj);
    const bad: string[] = [];
    for (const id of DRAWN_EDGE_IDS) {
      const c = centrelineOf(id);
      if (!c || !(c.length > 0)) { bad.push(`${id}: no course`); continue; }
      for (let i = 0; i <= 40; i++) if (!c.pointAt(i / 40).every(Number.isFinite) || !Number.isFinite(c.radiusAt(i / 40))) { bad.push(`${id}: not finite at ${i / 40}`); break; }
    }
    setSmoothJoins(false);
    assert.deepEqual(bad, []);
  });

  test(`the pieces of every whole vessel meet end to end within 0.002, and every run-on meets with no gap (smooth joins ${sj ? 'on' : 'off'})`, () => {
    setSmoothJoins(sj);
    const bad: string[] = [];
    for (const [w, pieces] of Object.entries(WHOLE_PIECES)) for (let i = 1; i < pieces.length; i++) {
      const a = centrelineOf(pieces[i - 1]!)!, b = centrelineOf(pieces[i]!)!, d = dist(a.pointAt(1), b.pointAt(0));
      if (d > 0.002) bad.push(`${w}: ${pieces[i - 1]} > ${pieces[i]} ${d.toFixed(4)}`);
    }
    for (const r of RUN_ONS) {
      const a = centrelineOf(r.a), b = centrelineOf(r.b);
      if (!a || !b) continue;
      const d = dist(a.pointAt(r.ia), b.pointAt(r.ib));
      if (d > 0.002) bad.push(`run-on ${r.a} > ${r.b} ${d.toFixed(4)}`);
    }
    setSmoothJoins(false);
    assert.deepEqual(bad, []);
  });
}

test('no engine-linked end sits on a draw-only branch (rhva, rhvb, rpva, rpvp): shunts, collaterals and beds land on the trunks', () => {
  const bad: string[] = [];
  for (const [host, b] of Object.entries(PLACED_BRANCHES)) {
    const whole = PLACED_EDGE_3D[host]!, q = PLACED_SPLIT[host]!.q, r = NETWORK_BY_ID.get(host)!.radius;
    // the draw-only stretch: the through branch past the split (two host radii clear of it), and the side branch past where it leaves the trunk's wall
    const s = [0]; for (let i = 1; i < whole.length; i++) s.push(s[i - 1]! + dist(whole[i]!, whole[i - 1]!));
    const L = s[s.length - 1]!, split = (b.out ? q : 1 - q) * L;
    const through = whole.filter((_, i) => (b.out ? s[i]! > split + 2 * r : s[i]! < split - 2 * r));
    const side = PLACED_SPLIT[host]!.side, ss = [0]; for (let i = 1; i < side.length; i++) ss.push(ss[i - 1]! + dist(side[i]!, side[i - 1]!));
    const sideOnly = side.filter((_, i) => (b.out ? ss[i]! > 2 * r : ss[ss.length - 1]! - ss[i]! > 2 * r));
    for (const v of NETWORK) {
      if (v.feeder || v.id === host) continue;
      for (const end of [0, 1] as const) {
        const c = centrelineOf(v.id);
        if (!c) continue;
        const p = c.pointAt(end);
        const dT = through.length > 1 ? nearest(p, through) : Infinity, dS = sideOnly.length > 1 ? nearest(p, sideOnly) : Infinity;
        if (Math.min(dT, dS) < r) bad.push(`${v.id} end ${end} on ${host}'s draw-only ${dT < dS ? b.through : b.side} (${Math.min(dT, dS).toFixed(4)})`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('the TIPS runs from the right portal vein trunk to the right hepatic vein trunk', () => {
  const t = centrelineOf('TIPS')!, rpv = centrelineOf('PVH_R_1')!, rpv2 = centrelineOf('PVH_R_2')!, rhv = centrelineOf('RHV_IVC')!, rhv1 = centrelineOf('RHV_IVC_1')!;
  const onTrunk = (p: V, cs: (typeof t)[]): number => Math.min(...cs.map((c) => dist(p, c.pointAt(c.nearestU([p[0], p[1], p[2]])))));
  assert.ok(onTrunk(t.pointAt(0), [rpv, rpv2]) < 0.004, 'its portal end is on the right portal vein');
  assert.ok(onTrunk(t.pointAt(1), [rhv, rhv1]) < 0.004, 'its hepatic end is on the right hepatic vein');
});
