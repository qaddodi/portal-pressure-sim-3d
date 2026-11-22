// Node acceptance of the net mesher's fillet windows and extended tubes on the REAL figure (plan owner, 22 Nov, "the fillet steps aside during the Circuit move"), at every 0.05 of the Circuit's t:
//  1. no folded drawn triangle: every fillet mesh with a share of pixels at t (net/regions.ts regionShare) is whole there (no fold, on the live union);
//  2. no gap where a fillet dissolves: the plain tubes, which run on to the node, stay in one piece in the FRONT view (x, y: the map's plane) at every t (arms' discs from the seam to the node overlap into one connected shape); regions that tear are listed with the t;
//  3. no doubled ink at the crotch: every extension vertex lies within the shader's live union (its capsules are the bones of the region rows) at every t and the least, median and most swell state, so its ink hull is behind the fillet's.
// Run: node scripts/net-accept.mjs        (about a minute and a half: builds the real network with maps and the bake's states, no keys)
import { skeleton } from '../src/scene/vessels/net/skeleton.ts';
import { buildNetMesh, networksOf, scaledSkeleton } from '../src/scene/vessels/net/mesh.ts';
import { bonesAtT } from '../src/scene/vessels/net/window.ts';
import { regionsOf, regionShare, BODY_ONLY } from '../src/scene/vessels/net/regions.ts';
import { extensionsOutside, liveGrid } from '../tests/net-ink.ts';
import { presetSwells } from './net-states.mjs';

const sk = skeleton(), grid = Array.from({ length: 21 }, (_, i) => i * 0.05);
const states = await presetSwells(sk);   // (the bake's own options, so the gate judges the same states: only the keys are left out)
const res = buildNetMesh(sk, networksOf(sk)[1], { lenient: true, maps: true, states, keys: false }), scaled = scaledSkeleton(sk, res.mesh.bakeScale);
const INK_MAX = 0.01,
   inkWorst = [], bad = { drawn: [], gap: [], ink: [] };
const regions = res.nodes.filter((n) => n.kind === 'junction' && n.caps);
// 1
for (const [node, w] of res.windows) for (const row of w.rows) {
  const body = regions.find((n) => n.node === node && (n.variant ?? 0) === 0), map = regions.find((n) => n.node === node && n.variant === 1);
  const sb = regionShare({ variant: 0, window: body.switchT ?? BODY_ONLY }, row.t), sm = map ? regionShare({ variant: 1, window: map.switchT }, row.t) : 0;
  if (sb > 1e-6 && !(row.body.folds === 0 && row.body.off <= 0.01)) bad.drawn.push(`${node} body t ${row.t.toFixed(2)} folds ${row.body.folds}`);
  if (sm > 1e-6 && !(row.map.folds === 0 && row.map.off <= 0.01)) bad.drawn.push(`${node} map t ${row.t.toFixed(2)} folds ${row.map.folds}`);
}
// 2 (the arms of each body-built region, seam to node, in the 2D peel)
const arms = regions.filter((n) => (n.variant ?? 0) === 0).map((n) => {
  const cluster = n.node.split('+'), list = n.arms.map((edge, i) => {
    const e = sk.edges[edge], [first, count] = e.bones, end = cluster.includes(e.from) ? 0 : 1, seam = end === 0 ? first + n.seams[i] : first + count - 1 - n.seams[i], node = end === 0 ? first : first + count - 1;
    const ids = []; for (let b = Math.min(seam, node); b <= Math.max(seam, node); b++) ids.push(b);
    return ids;
  });
  // (the short edges inside a merged region are swept whole too: they join its nodes)
  sk.edges.forEach((e, ei) => { if (cluster.includes(e.from) && cluster.includes(e.to) && !n.arms.includes(ei)) { const ids = []; for (let b = e.bones[0]; b < e.bones[0] + e.bones[1]; b++) ids.push(b); list.push(ids); } });
  return { node: n.node, list };
});
for (const t of grid) {
  const B = bonesAtT(scaled, t);
  for (const a of arms) {
    for (const dims of [[0, 1]]) {
      const near = (i, j) => a.list[i].some((p) => a.list[j].some((q) => Math.hypot(...dims.map((d) => B[p].cen[d] - B[q].cen[d])) < B[p].r + B[q].r));
      const seen = new Set([0]), stack = [0];
      while (stack.length) { const i = stack.pop(); for (let j = 0; j < a.list.length; j++) if (!seen.has(j) && near(i, j)) { seen.add(j); stack.push(j); } }
      if (seen.size < a.list.length) bad.gap.push(`${a.node} t ${t.toFixed(2)}: ${a.list.length - seen.size} of ${a.list.length} arms apart`);
    }
  }
}
// 3 (the extensions against the SHADER's union, by the shared oracle tests/net-ink.ts: every t, and the 20 preset states' swells, widths on the map as the oracle's named states; a vertex outside by more than a hair is a doubled outline)
const m = res.mesh, lives = liveGrid(sk, states, grid), ink = extensionsOutside(m, sk, res.nodes, lives);
for (const r of ink) { inkWorst.push(r.worst); if (r.worst > INK_MAX) bad.ink.push(`${r.node}: an extension of ${r.edge} (vertex ${r.vertex}, bone ${r.bone}) stands ${r.worst.toFixed(3)} (narrowest arm's radius) outside the shader's union`); }
console.log(`worst extension outside the shader's union, per region (fraction of the narrowest arm's radius): ${inkWorst.map((x) => x.toFixed(3)).join(' ')}`);
for (const f of res.failures) { bad.drawn.push(`FAIL ${f.node}: ${f.why.slice(0, 200)}`); }
console.log(`regions ${regions.filter((n) => (n.variant ?? 0) === 0).length} (map meshes ${regions.filter((n) => n.variant === 1).length}); vertices ${m.position.length / 3}, triangles ${m.index.length / 3}, sweep ${res.report.sweepTriangles}`);
for (const [k, v] of Object.entries(bad)) console.log(`${k}: ${v.length ? v.length + ' problems' : 'none'}`, ...v.slice(0, 40).map((x) => '\n  ' + x));
for (const n of res.mapNotes) console.log('NOTE', n.node.slice(0, 40), n.why.slice(0, 160));
console.log('windows [b, a]:', [...res.windows].map(([k, w]) => `${k.slice(0, 14)} ${w.b.toFixed(2)}/${w.a.toFixed(2)}`).join('; '));
process.exit(bad.drawn.length + bad.ink.length ? 1 : 0);
