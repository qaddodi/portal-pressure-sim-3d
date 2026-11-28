// WHERE EACH COLLATERAL AND SHUNT OPENS, AGAINST THE FROZEN PLACEMENT (docs/approved/anatomy-placement.md, round 18). The landing rules in anatomy/placed-network.ts move an end off the place the placement draws it
// only so a junction skin can take it (a snap onto its node, two nodes spaced along a vein, an end beside its node's own end). Each such move is short: the drawn mouth stays within SNAP_R (6) of the host's radii, along the
// host, of the frozen mouth (the host's nearest point to the placement's own end). The spontaneous splenorenal shunt's renal end once went 0.54 down the renal vein to beside the cava (a wall landing kept 22 radii past the next
// node), and swept across the gastrorenal shunt just above that one's mouth (tests/overlaps.test.ts). The ends moved further for a reason of their own are named in FAR, with the reason, and each is checked to be still that far
// (so the list only shrinks).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { WHOLE_PIECES, PLACED_EDGE_3D } = await import('../src/scene/anatomy/placed-network.ts');
const { PLACED_VESSELS } = await import('../src/scene/anatomy/placement.generated.ts');
const { DRAWN_COURSES, C6_DRAWN } = await import('../src/scene/anatomy/drawn-courses.ts');
const { EDGES } = await import('../src/engine/hales/portal/topology.js');

type V = readonly [number, number, number];
interface Edge { id: string; from: string; to: string }
const edges = EDGES as Edge[];
/** The collaterals and shunts (placed-network.ts OWN). */
const OWN = ['C1a', 'C1b', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'EPI_SVC', 'EPI_ILI', 'TIPS', 'DIPS', 'S_PC', 'S_MC', 'S_DSR', 'REX'];
/** How far along its host a landing may move from the frozen mouth, in the host's radii (placed-network.ts SNAP_R: the same place). */
const REACH_R = 6;
/** How near the placement's own end must be to a host for that end to be a landing on it (placed-network.ts LAND_REACH), beyond the host's radius. */
const LAND_REACH = 0.06;
/** The ends that run on into another course (placed-network.ts RUN_ON_ENDS): no landing. */
const RUN_ON_ENDS = new Set(['C1a|0', 'C1a|1', 'C1b|0', 'C2|1', 'C5|0', 'EPI_ILI|0', 'EPI_SVC|0']);

/** The ends that open further from their frozen mouth, each for its own ruling or rule (not the landing rules' spacing). */
const FAR: Readonly<Record<string, string>> = {
  'C2|0': 'the short gastric veins leave the splenic vein against its flow as drawn: the arrival moves on along the flow (joinEnd, "no hairpin, no reversal")',
  'C4|0': 'the rectal varices leave the inferior mesenteric vein against its flow as drawn: the arrival moves on along the flow (joinEnd)',
  'DIPS|0': 'the DIPS is rebuilt from the portal bifurcation (the engine\'s PVH), the course Mohammad drew (docs/approved/dips.md), not from where the frozen placement opened it on the trunk',
  'DIPS|1': 'the DIPS is rebuilt to the cava at the caudate lobe\'s foot',
};

const dist = (a: V, b: V): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** The nearest point of a polyline to p: its distance and its arc length from the start. */
function nearestOn(poly: readonly V[], p: V): { d: number; s: number } {
  let best = { d: Infinity, s: 0 }, run = 0;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1]!, b = poly[i]!, ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const, l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2, seg = Math.sqrt(l2);
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / l2)) : 0;
    const d = dist(p, [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]]);
    if (d < best.d) best = { d, s: run + t * seg };
    run += seg;
  }
  return best;
}
/** A whole vessel's drawn course: its pieces end to end (a collateral is its own piece). */
const wholeCourse = (w: string): V[] => (WHOLE_PIECES[w] ?? [w]).flatMap((id: string) => PLACED_EDGE_3D[id] ?? []);
const wholeOf = (piece: string): string => Object.entries(WHOLE_PIECES as Record<string, readonly string[]>).find(([, ps]) => ps.includes(piece))?.[0] ?? piece;

interface Row { key: string; host: string; along: number; R: number; at: number }
function rows(): Row[] {
  const out: Row[] = [];
  for (const id of OWN) {
    const e = edges.find((x) => x.id === id)!, frozen = DRAWN_COURSES[id] as readonly V[], drawn = PLACED_EDGE_3D[id] as readonly V[];
    for (const end of [0, 1] as const) {
      if (RUN_ON_ENDS.has(`${id}|${end}`)) continue;
      const node = end ? e.to : e.from, f = end ? frozen[frozen.length - 1]! : frozen[0]!, d = end ? drawn[drawn.length - 1]! : drawn[0]!;
      // (the host: the whole vessel with a piece at the end's node that the drawn end lies on)
      const hosts = [...new Set(edges.filter((x) => x.id !== id && (x.from === node || x.to === node)).map((x) => wholeOf(x.id)))].filter((w) => w !== id && PLACED_VESSELS[w]);
      // (an end at the common end of several hosts (the portal bifurcation: the trunk and both branches) is on all of them to within a float: of those, the first that the frozen mouth is on too,
      // not the one a rounding error puts first)
      const near = hosts.map((w) => ({ w, d: nearestOn(wholeCourse(w), d).d })), least = Math.min(...near.map((x) => x.d));
      for (const { w: host } of near.filter((x) => x.d <= least + 1e-6)) {
        const C = wholeCourse(host), R = PLACED_VESSELS[host]!.r, hf = nearestOn(C, f), hd = nearestOn(C, d);
        if (hd.d > 1.5 * R || hf.d > LAND_REACH + R) continue;   // (not a landing on the host: a run-on, or an end drawn away from its node)
        out.push({ key: `${id}|${end}`, host, along: Math.abs(hd.s - hf.s), R, at: hd.s });
        break;
      }
    }
  }
  return out;
}

test('every collateral and shunt opens within SNAP_R of its host\'s radii of where the frozen placement draws its mouth (along the host), but the named ones', () => {
  const all = rows();
  console.log(all.map((r) => `${r.key.padEnd(10)} on ${r.host.padEnd(8)} ${r.along.toFixed(3)} (${(r.along / r.R).toFixed(1)} R)`).join('\n'));
  const far = all.filter((r) => r.along > REACH_R * r.R && !FAR[r.key]).map((r) => `${r.key} on ${r.host}: ${(r.along / r.R).toFixed(1)} radii from its frozen mouth`);
  assert.deepEqual(far, [], 'no landing moves further than SNAP_R from where the placement draws it');
  // (the named ones are still as far as their reasons say: one that comes back within reach is taken off the list)
  const back = Object.keys(FAR).filter((k) => { const r = all.find((x) => x.key === k); return !r || r.along <= REACH_R * r.R; });
  assert.deepEqual(back, [], 'every named end is still far (take one that came back off FAR)');
});

// OWN TAKE-OFFS (Mohammad, 27 Nov: "every shunt open at a slightly different location on the vessel"). The spontaneous splenorenal shunt (C6) opened at SVD with the distal one and the short gastric veins: five vessels in one
// junction. Its sibling bow ran along the view's depth, so it left the vein end-on and lay behind the stomach, where the organ veil dims it. It now leaves the splenic vein at a take-off of its own (OWN_TAKEOFF), upstream of SVD,
// in the screen plane, and no take-off on one vessel carries more than two collaterals or shunts.
const mouths = (): { key: string; host: string; at: number; R: number }[] => rows().map((r) => ({ key: r.key, host: r.host, at: r.at, R: r.R }));

test('no vessel carries more than two collateral or shunt mouths at one take-off (within 5 of its radii along it)', () => {
  const all = mouths(), crowded: string[] = [];
  for (const m of all) {
    const group = all.filter((o) => o.host === m.host && Math.abs(o.at - m.at) <= 5 * m.R);
    if (group.length > 2) crowded.push(`${m.host}: ${group.map((g) => g.key).join(', ')}`);
  }
  assert.deepEqual([...new Set(crowded)], [], 'no take-off carries three or more mouths');
});

test('the spontaneous splenorenal shunt leaves the splenic vein in the screen plane at a take-off of its own, ON the vein, clear of the distal shunt wall to wall, and the distal shunt is not bowed off its way', () => {
  const c6 = PLACED_EDGE_3D.C6 as readonly V[], sd = PLACED_EDGE_3D.S_DSR as readonly V[], sv = wholeCourse('sv');
  const rsv = PLACED_VESSELS.sv!.r, r6 = PLACED_VESSELS.C6!.r, rs = PLACED_VESSELS.S_DSR!.r;
  // its own take-off: on the splenic vein's centreline, and well apart (many radii along the vein) from SVD, where the distal shunt opens
  assert.ok(nearestOn(sv, c6[0]!).d < 1.5 * rsv, 'the splenic end sits on the splenic vein');
  const apart = Math.abs(nearestOn(sv, c6[0]!).s - nearestOn(sv, sd[0]!).s);
  assert.ok(apart >= 8 * rsv, `C6 opens ${(apart / rsv).toFixed(1)} splenic-vein radii along the vein from the distal shunt (at least 8)`);
  // it leaves in the screen plane (x, y), not end-on: the depth share of its first 6 points' heading
  const d = [0, 1, 2].map((i) => c6[6]![i]! - c6[0]![i]!), share = Math.abs(d[2]!) / Math.hypot(d[0]!, d[1]!, d[2]!);
  assert.ok(share < 0.33, `C6 leaves the splenic vein ${(100 * share).toFixed(0)} % in depth (83 % end-on before)`);
  // and the distal shunt keeps its own course: its depth over its first 10 points stays small
  const dd = [0, 1, 2].map((i) => sd[10]![i]! - sd[0]![i]!);
  assert.ok(Math.abs(dd[2]!) / Math.hypot(dd[0]!, dd[1]!, dd[2]!) < 0.5, 'the distal shunt is not bowed in depth');
  // the two tracts are clear wall to wall between their mouths, and its renal end sits on the renal vein beside the distal one at LRV_S
  const ends = [c6[0]!, c6[c6.length - 1]!], gap = Math.min(...c6.filter((p) => ends.every((e) => dist(p, e) > 3 * r6)).map((p) => nearestOn(sd, p).d));
  assert.ok(gap > r6 + rs, `the tracts are clear wall to wall between their mouths: ${gap.toFixed(3)} centre to centre, ${(r6 + rs).toFixed(3)} of radii`);
  assert.ok(nearestOn(wholeCourse('lrv'), c6[c6.length - 1]!).d < 1.5 * PLACED_VESSELS.lrv!.r, 'the renal end sits on the renal vein');
});

test('the spontaneous splenorenal shunt takes off on a STRAIGHT stretch of the splenic vein: the vein turns under 10 degrees across the take-off\'s reach (the junction skin on a bend came out lumpy, Mohammad 27 Nov)', () => {
  const c6 = PLACED_EDGE_3D.C6 as readonly V[], sv = wholeCourse('sv'), rsv = PLACED_VESSELS.sv!.r;
  const s0 = nearestOn(sv, c6[0]!).s, reach = 6 * rsv;
  // the point at arc length `s` along the splenic vein (clamped to its ends)
  const at = (s: number): V => {
    let acc = 0;
    for (let i = 1; i < sv.length; i++) {
      const l = dist(sv[i - 1]!, sv[i]!);
      if (acc + l >= s || i === sv.length - 1) { const t = Math.min(1, Math.max(0, (s - acc) / (l || 1))); return [0, 1, 2].map((k) => sv[i - 1]![k]! + t * (sv[i]![k]! - sv[i - 1]![k]!)) as unknown as V; }
      acc += l;
    }
    return sv[sv.length - 1]!;
  };
  const a = at(s0 - reach), b = at(s0), c = at(s0 + reach);
  const u = [0, 1, 2].map((k) => b[k]! - a[k]!), w = [0, 1, 2].map((k) => c[k]! - b[k]!);
  const cos = (u[0]! * w[0]! + u[1]! * w[1]! + u[2]! * w[2]!) / (Math.hypot(u[0]!, u[1]!, u[2]!) * Math.hypot(w[0]!, w[1]!, w[2]!));
  const turn = (Math.acos(Math.min(1, cos)) * 180) / Math.PI;
  assert.ok(turn < 10, `the splenic vein turns ${turn.toFixed(1)} degrees across C6's take-off (21 on the bend it stood on before)`);
});

// C6 and the gastrorenal shunt (C5), Mohammad 25 Nov via the review of 2a54261a: the shunt's course never crosses or touches the gastrorenal shunt.
test('the spontaneous splenorenal shunt keeps wall to wall clear of the gastrorenal shunt, and the drawn course is the one the network lays', () => {
  const c6 = PLACED_EDGE_3D.C6 as readonly V[], c5 = PLACED_EDGE_3D.C5 as readonly V[], r6 = PLACED_VESSELS.C6!.r, r5 = PLACED_VESSELS.C5!.r;
  const ends = [c6[0]!, c6[c6.length - 1]!];
  const gap = Math.min(...c6.filter((p) => ends.every((e) => dist(p, e) > 3 * r6)).map((p) => nearestOn(c5, p).d));
  assert.ok(gap > r6 + r5, `C6 clears the gastrorenal shunt wall to wall: ${gap.toFixed(3)} centre to centre, ${(r6 + r5).toFixed(3)} of radii`);
  assert.deepEqual(DRAWN_COURSES.C6, C6_DRAWN);
});
