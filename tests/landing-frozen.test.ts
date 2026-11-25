// WHERE EACH COLLATERAL AND SHUNT OPENS, AGAINST THE FROZEN PLACEMENT (docs/approved/anatomy-placement.md, round 18). The landing rules in anatomy/placed-network.ts move an end off the place the placement draws it
// only so a junction skin can take it (a snap onto its node, two nodes spaced along a vein, an end beside its node's own end). Each such move is short: the drawn mouth stays within SNAP_R (6) of the host's radii, along the
// host, of the frozen mouth (the host's nearest point to the placement's own end). The spontaneous splenorenal shunt's renal end once went 0.54 down the renal vein to beside the cava (a wall landing kept 22 radii past the next
// node), and swept across the gastrorenal shunt just above that one's mouth (tests/overlaps.test.ts). The ends moved further for a reason of their own are named in FAR, with the reason, and each is checked to be still that far
// (so the list only shrinks).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { WHOLE_PIECES, PLACED_EDGE_3D } = await import('../src/scene/anatomy/placed-network.ts');
const { PLACED_COURSES, PLACED_VESSELS } = await import('../src/scene/anatomy/placement.generated.ts');
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
  'S_DSR|0': 'SVD is drawn at the short gastric veins\' take-off (they leave beside it)',
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

interface Row { key: string; host: string; along: number; R: number }
function rows(): Row[] {
  const out: Row[] = [];
  for (const id of OWN) {
    const e = edges.find((x) => x.id === id)!, frozen = PLACED_COURSES[id] as readonly V[], drawn = PLACED_EDGE_3D[id] as readonly V[];
    for (const end of [0, 1] as const) {
      if (RUN_ON_ENDS.has(`${id}|${end}`)) continue;
      const node = end ? e.to : e.from, f = end ? frozen[frozen.length - 1]! : frozen[0]!, d = end ? drawn[drawn.length - 1]! : drawn[0]!;
      // (the host: the whole vessel with a piece at the end's node that the drawn end lies on)
      const hosts = [...new Set(edges.filter((x) => x.id !== id && (x.from === node || x.to === node)).map((x) => wholeOf(x.id)))].filter((w) => w !== id && PLACED_VESSELS[w]);
      let host = '', best = Infinity;
      for (const w of hosts) { const h = nearestOn(wholeCourse(w), d); if (h.d < best) { best = h.d; host = w; } }
      if (!host) continue;
      const C = wholeCourse(host), R = PLACED_VESSELS[host]!.r, hf = nearestOn(C, f), hd = nearestOn(C, d);
      if (hd.d > 1.5 * R || hf.d > LAND_REACH + R) continue;   // (not a landing on the host: a run-on, or an end drawn away from its node)
      out.push({ key: `${id}|${end}`, host, along: Math.abs(hd.s - hf.s), R });
    }
  }
  return out;
}

test('every collateral and shunt opens within SNAP_R of its host\'s radii of where the frozen placement draws its mouth (along the host), but the named ones', () => {
  const all = rows();
  console.log(all.map((r) => `${r.key.padEnd(10)} on ${r.host.padEnd(8)} ${r.along.toFixed(3)} (${(r.along / r.R).toFixed(1)} R)`).join('\n'));
  const far = all.filter((r) => r.along > REACH_R * r.R && !FAR[r.key]).map((r) => `${r.key} on ${r.host}: ${(r.along / r.R).toFixed(1)} radii from its frozen mouth`);
  assert.deepEqual(far, [], 'no landing moves further than SNAP_R from where the placement draws it');
  // (the spontaneous splenorenal shunt's renal end: on the renal vein, beside the distal splenorenal shunt at LRV_S, not down by the cava)
  const c6 = all.find((r) => r.key === 'C6|1');
  assert.ok(c6 && c6.host === 'lrv' && c6.along <= REACH_R * c6.R, `C6 opens on the renal vein near its frozen mouth: ${c6 ? (c6.along / c6.R).toFixed(1) : 'none'} radii`);
  // (its splenic end: on the splenic vein at SVD beside the distal splenorenal shunt, not sent on down the vein to SV (12.7 radii, when a skin took two growing arms): placed-network.ts SIBLINGS APART)
  const c6s = all.find((r) => r.key === 'C6|0');
  assert.ok(c6s && c6s.host === 'sv' && c6s.along <= REACH_R * c6s.R, `C6 opens on the splenic vein near its frozen mouth: ${c6s ? (c6s.along / c6s.R).toFixed(1) : 'none'} radii`);
  // (the named ones are still as far as their reasons say: one that comes back within reach is taken off the list)
  const back = Object.keys(FAR).filter((k) => { const r = all.find((x) => x.key === k); return !r || r.along <= REACH_R * r.R; });
  assert.deepEqual(back, [], 'every named end is still far (take one that came back off FAR)');
});

// SIBLINGS APART (placed-network.ts): an end that opens beside its node's own end bows off it. The spontaneous splenorenal shunt left the splenic vein 5 degrees beside the distal one and arrived on the renal vein 14 beside it, the
// two ran the whole way 0.022 apart centre to centre (their walls overlapping), and no skin could take both: the spontaneous one was sent on 12.7 radii down the splenic vein. Now each of its ends leaves its sibling about 60
// degrees off it, and between the two skins the tracts are clear wall to wall.
test('the spontaneous splenorenal shunt bows off the distal one: both ends leave it well apart, and the two tracts never touch between their mouths', () => {
  const c6 = PLACED_EDGE_3D.C6 as readonly V[], sd = PLACED_EDGE_3D.S_DSR as readonly V[];
  const dir = (D: readonly V[], end: 0 | 1): V => { const k = 6, a = end ? D[D.length - 1]! : D[0]!, b = end ? D[D.length - 1 - k]! : D[k]!, l = dist(a, b); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l, (b[2] - a[2]) / l]; };
  const deg = (a: V, b: V): number => (Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180) / Math.PI;
  for (const end of [0, 1] as const) {
    assert.ok(dist(end ? c6[c6.length - 1]! : c6[0]!, end ? sd[sd.length - 1]! : sd[0]!) < 0.01, `end ${end}: the two open at one node`);
    const a = deg(dir(c6, end), dir(sd, end));
    assert.ok(a >= 55, `end ${end}: the spontaneous shunt leaves the distal one ${a.toFixed(1)} degrees off it (5 and 14 before)`);
  }
  const r6 = PLACED_VESSELS.C6!.r, rs = PLACED_VESSELS.S_DSR!.r, ends = [c6[0]!, c6[c6.length - 1]!];
  const gap = Math.min(...c6.filter((p) => ends.every((e) => dist(p, e) > 3 * r6)).map((p) => nearestOn(sd, p).d));
  assert.ok(gap > r6 + rs, `the tracts are clear wall to wall between their mouths: ${gap.toFixed(3)} centre to centre, ${(r6 + rs).toFixed(3)} of radii (0.022 before)`);
});

// C6's two mouths and the gastrorenal shunt (C5), Mohammad 25 Nov via the review of 2a54261a: the spontaneous splenorenal shunt's splenic end opens where the placement draws it (it was 0.241 down the
// splenic vein, at the inferior mesenteric vein's mouth), its renal end stays on the renal vein, and its course never crosses or touches the gastrorenal shunt.
test('the spontaneous splenorenal shunt opens at its drawn splenic spot, ends on the renal vein, and keeps wall to wall clear of the gastrorenal shunt', () => {
  const c6 = PLACED_EDGE_3D.C6 as readonly V[], c5 = PLACED_EDGE_3D.C5 as readonly V[], frozen = PLACED_COURSES.C6 as readonly V[];
  const sv = wholeCourse('sv'), r6 = PLACED_VESSELS.C6!.r, r5 = PLACED_VESSELS.C5!.r, rsv = PLACED_VESSELS.sv!.r;
  // the splenic end: within SNAP_R splenic-vein radii (along the vein) of where the placement draws it, and ON the splenic vein's own end of the node
  const along = Math.abs(nearestOn(sv, c6[0]!).s - nearestOn(sv, frozen[0]!).s);
  assert.ok(along <= REACH_R * rsv, `the splenic end is ${(along / rsv).toFixed(1)} splenic-vein radii along the vein from its drawn spot (12.7 before)`);
  assert.ok(nearestOn(sv, c6[0]!).d < 1.5 * rsv, 'the splenic end sits on the splenic vein');
  // the renal end: on the renal vein
  assert.ok(nearestOn(wholeCourse('lrv'), c6[c6.length - 1]!).d < 1.5 * PLACED_VESSELS.lrv!.r, 'the renal end sits on the renal vein');
  // the whole course against the gastrorenal shunt: clear wall to wall (a junction at an end is not between them, so the ends' vicinity is left out)
  const ends = [c6[0]!, c6[c6.length - 1]!];
  const gap = Math.min(...c6.filter((p) => ends.every((e) => dist(p, e) > 3 * r6)).map((p) => nearestOn(c5, p).d));
  assert.ok(gap > r6 + r5, `C6 clears the gastrorenal shunt wall to wall: ${gap.toFixed(3)} centre to centre, ${(r6 + r5).toFixed(3)} of radii`);
});
