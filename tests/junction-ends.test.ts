// THE GENERAL RULE OF THE JUNCTIONS (27 Nov 2026, Mohammad: "the flow lens, pressure, flow direction and everything else must know where vessel junctions really are").
// Where a vessel meets another is defined once, by the engine's table (topology.js JUNCTIONS), and the body figure reads it: the host is cut where each row says (`at` of the way along its drawn course) and each end
// the row lists lands exactly there. Two things are pinned, for EVERY row and EVERY end, so a new row is held to them with no edit here:
//   1. the junction node's drawn place is `at` of the way along its host's drawn course (the pieces chained, a draw-only branch past the end counted: the share the table is measured in);
//   2. every collateral, shunt and tributary end that lands on a host lies within one host radius of its engine node's drawn place, along the host (the same node the flow lens, the blood and the readings turn at).
// PENDING holds the named cases that are not at their node (one is drawn 4 radii on by rule: C1b on the azygos arch). C2 (the short/posterior gastric veins, now joined at SVD by the engine) and C9 (the ascending lumbar vein, now an engine row on IVC_IS) left it when the engine moved. Each is listed with its reason; it is judged like every other end, and a listed end that lands fails the test until it is taken off the list.
// Node only, about a second.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDGES, JUNCTION_CHAINS } from '../src/engine/hales/portal/topology.js';
import { JNODE, PLACED_EDGE_3D, PLACED_NODE_3D, WHOLE_PIECES, wholeOf } from '../src/scene/anatomy/placed-network.ts';
import { PLACED_VESSELS } from '../src/scene/anatomy/placement.generated.ts';
import { WHOLE_HOSTS, piecesOf } from '../src/scene/anatomy/whole-pieces.ts';

type V3 = readonly [number, number, number];
interface Edge { id: string; from: string; to: string; kind: string }
const edges = EDGES as Edge[];
const byId = new Map(edges.map((e) => [e.id, e]));
/** The ends not yet where the engine puts them: `id|end` and why. */
const PENDING: Readonly<Record<string, string>> = {
  'C1b|1': 'the esophageal varices land on the azygos arch 4 of its radii past AZY, where the lumbar vein runs into it: at AZY itself they would sit on the arch\'s open start when the lumbar vein is hidden, and leave the arch 3 radii to the SVC, too short for the SVC\'s skin (no ring clears its blend; placed-network.ts AZY_LEAD_R, tests/azygos-origin.test.ts)',
};

const chain = (pieces: readonly string[]): V3[] => pieces.flatMap((id, i) => (PLACED_EDGE_3D[id] ?? []).slice(i ? 1 : 0) as V3[]);
const arcOf = (c: readonly V3[]): number[] => { const s = [0]; for (let i = 1; i < c.length; i++) s.push(s[i - 1]! + Math.hypot(c[i]![0] - c[i - 1]![0], c[i]![1] - c[i - 1]![1], c[i]![2] - c[i - 1]![2])); return s; };
/** The nearest place on a polyline to `p`: its arc length from the start and its distance. */
function nearest(c: readonly V3[], p: readonly number[]): { s: number; d: number } {
  const s = arcOf(c); let best = { s: 0, d: Infinity };
  for (let i = 1; i < c.length; i++) {
    const a = c[i - 1]!, b = c[i]!, ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l2 = ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0]! - a[0]) * ab[0]! + (p[1]! - a[1]) * ab[1]! + (p[2]! - a[2]) * ab[2]!) / l2)) : 0;
    const q = [a[0] + t * ab[0]!, a[1] + t * ab[1]!, a[2] + t * ab[2]!], d = Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
    if (d < best.d) best = { s: s[i - 1]! + t * (s[i]! - s[i - 1]!), d };
  }
  return best;
}
const wholeOfHost = (host: string): string => Object.keys(WHOLE_HOSTS).find((w) => WHOLE_HOSTS[w]!.includes(host))!;

test('every junction node is drawn at its table share along its host (the host\'s pieces chained)', () => {
  const rows = (JUNCTION_CHAINS as { host: string; nodes: string[]; at: number[] }[]).flatMap((c) => c.nodes.map((node, i) => ({ host: c.host, node, at: c.at[i]! })));
  assert.ok(rows.length >= 15, 'the table has its rows');
  for (const { host, node, at } of rows) {
    const c = chain(piecesOf(host)), s = arcOf(c), place = PLACED_NODE_3D[node];
    assert.ok(place, `${node} has a drawn place`);
    const share = nearest(c, place!).s / s[s.length - 1]!;
    assert.ok(Math.abs(share - at) <= 0.01, `${node} on ${host}: drawn at ${share.toFixed(3)} of the way along it, the table says ${at}`);
  }
});

test('every collateral, shunt and tributary end that lands on a host lies within one host radius of its engine node, along the host', () => {
  const rows: string[] = [], failing: string[] = [], mended: string[] = [];
  const hosts = new Map<string, string>();   // piece -> host edge
  for (const hs of Object.values(WHOLE_HOSTS)) for (const h of hs) for (const p of piecesOf(h)) hosts.set(p, h);
  for (const e of edges) {
    const c = PLACED_EDGE_3D[e.id];
    // (a collateral, a shunt, or a main vein that ends on a junction node of its host: the coronary vein on the portal trunk)
    const tributary = e.kind === 'vein' && !!wholeOf(e.id) && JNODE.has(e.to);
    if (!c || (e.kind !== 'collateral' && e.kind !== 'shunt' && !tributary)) continue;
    for (const end of [0, 1] as const) {
      const node = end ? e.to : e.from, p = end ? c[c.length - 1]! : c[0]!;
      // the hosts that have a piece at the node, other than the vessel's own
      for (const h of new Set(edges.filter((o) => (o.from === node || o.to === node) && hosts.has(o.id) && !WHOLE_PIECES[wholeOf(o.id) ?? '']?.includes(e.id)).map((o) => hosts.get(o.id)!))) {
        const w = wholeOfHost(h), r = PLACED_VESSELS[w]?.r ?? 0.01, host = chain(piecesOf(h)), place = PLACED_NODE_3D[node];
        if (!place) continue;
        const hit = nearest(host, p);
        // (an end drawn off its host (the rectal varices down the rectum, the arterioportal shunts) is no landing)
        if (hit.d > 0.06 + r) continue;
        const along = Math.abs(hit.s - nearest(host, place).s), key = `${e.id}|${end}`;
        rows.push(`${key.padEnd(10)} ${node.padEnd(6)} on ${h.padEnd(9)} ${(along / r).toFixed(2)} R${PENDING[key] ? '  (pending)' : ''}`);
        if (along > r) failing.push(key);
        else if (PENDING[key]) mended.push(key);
      }
    }
  }
  console.log(`# end node host along\n${rows.map((r) => `# ${r}`).join('\n')}`);
  assert.ok(rows.length >= 20, `${rows.length} landings measured`);
  const unexpected = failing.filter((k) => !PENDING[k]);
  assert.deepEqual(unexpected, [], 'every landing is within one host radius of its engine node, along the host');
  // (J5 of the 27 Nov review: a PENDING end that now lands is no longer pending; the list must shrink with the drawing, never keep a stale reason)
  assert.deepEqual(mended, [], 'these ends now land within one host radius of their node: take them off PENDING');
  for (const k of Object.keys(PENDING)) assert.ok(failing.includes(k) || !rows.some((r) => r.startsWith(k)), `${k} is pending but is not failing`);
  for (const k of Object.keys(PENDING)) assert.ok(byId.has(k.split('|')[0]!), `${k} is an engine edge`);
});
