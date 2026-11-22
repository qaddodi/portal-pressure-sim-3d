// THE JUNCTION PEEL (plan owner, 22 Nov): a junction region peels as one piece. The root cause of the fillet unfolding mid-move was a peel share per BONE (by map position), so the bones of one region left at different times. Now every bone inside a
// region (the seam rings and everything inside them, short edges of a merged region too) takes its node's share, and outside it each arm eases from that share to its own flow-peel share over 3 arm radii (smoothstep), so the flow peel along the vessels is 2D's.
// Held on the fixtures with the oracle (the real figure, 32 regions, was run by hand: 0 regions with unequal shares inside against 32 without the table, docs/net-shader.md) and by the shader's text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNetMesh } from '../src/scene/vessels/net/mesh.ts';
import { PEEL_EASE_RADII, peelTable } from '../src/scene/vessels/net/peel.ts';
import { EDGE_LAYOUT } from '../src/scene/vessels/net/edge-state.ts';
import { NET_CAP_VS, NET_VS, NET_VS_COLUMNS } from '../src/scene/vessels/net/shaders.ts';
import { fixtures } from './net-lib.ts';
import { liveBones, liveStates } from './net-oracle.ts';

test('the shader: one peelShareAt for every bone (the capsule pass shares it), the anchor read from the bone texture, the ease over PEEL_EASE_RADII', () => {
  assert.ok(EDGE_LAYOUT.has('peelA') && NET_VS_COLUMNS.includes('peelA'));
  assert.equal(NET_VS.split('float peelShareAt(').length, 2);
  assert.ok(NET_CAP_VS.includes('float peelShareAt('), 'the capsule pass has the same rule');
  assert.ok(NET_VS.includes(`min(${PEEL_EASE_RADII.toFixed(1)} * max(rr, 1e-6), 0.5 * max(span, 0.0))`));
  assert.match(NET_VS, /w = peeled \? peelShareAt\(M\.xyz, u, A\.w\) : circPeel\(circT, rank\);/);
  assert.match(NET_VS, /if \(peeled\) dwdu = \(peelShareAt\(Mn\.xyz, un, A\.w\) - peelShareAt\(Mp\.xyz, up, A\.w\)\) \/ du;/);
});

let unevenOld = 0, regions = 0;
for (const fx of fixtures()) {
  const r = buildNetMesh(fx.skel), junc = r.nodes.filter((n) => n.kind === 'junction');
  if (!junc.length) continue;
  const tab = peelTable(fx.skel, r.nodes), base = liveStates(fx.skel)[0]![1];
  test(`${fx.name}: every bone inside a region has its node's share at every t; outside, the share is between the node's and the bone's own, and is the bone's own from ${PEEL_EASE_RADII} arm radii out`, () => {
    for (const rp of junc) {
      const cluster = new Set(rp.node.split('+')), inside: number[] = [];
      rp.arms.forEach((e, i) => { const ed = fx.skel.edges[e]!, end = cluster.has(ed.from) ? 0 : 1, [f, c] = ed.bones, seam = end === 0 ? f + rp.seams[i]! : f + c - 1 - rp.seams[i]!; for (let b = end === 0 ? f : seam; b <= (end === 0 ? seam : f + c - 1); b++) inside.push(b); });
      fx.skel.edges.forEach((ed, ei) => { if (cluster.has(ed.from) && cluster.has(ed.to) && !rp.arms.includes(ei)) for (let b = ed.bones[0]; b < ed.bones[0] + ed.bones[1]; b++) inside.push(b); });
      const anchorNode = fx.skel.nodes.find((n) => n.id === rp.node.split('+')[0])!, anchor = fx.skel.edges[anchorNode.edges[0]!.edge]!.bones[0] + (anchorNode.edges[0]!.end === 0 ? 0 : fx.skel.edges[anchorNode.edges[0]!.edge]!.bones[1] - 1);
      regions++;
      let spreadOld = 0;
      for (let t = 0.05; t < 1; t += 0.05) {
        const st = { ...base, circT: t, peel: tab }, nw = liveBones(fx.skel, st), old = liveBones(fx.skel, { ...st, peel: undefined });
        const wn = old[anchor]!.share, shares = inside.map((i) => nw[i]!.share);
        for (const sh of shares) assert.ok(Math.abs(sh - wn) < 1e-9, `t ${t.toFixed(2)}: a bone inside ${rp.node} has share ${sh}, its node's is ${wn}`);
        const so = inside.map((i) => old[i]!.share); spreadOld = Math.max(spreadOld, Math.max(...so) - Math.min(...so));
        // outside: between the two, and exactly its own beyond the ease
        rp.arms.forEach((e, i) => {
          const ed = fx.skel.edges[e]!, end = cluster.has(ed.from) ? 0 : 1, [f, c] = ed.bones;
          for (let k = 0; k < c; k++) {
            const bi = f + k, u = fx.skel.bones[bi]!.u, seamU = tab[e]![end === 0 ? 1 : 3]!, dd = end === 0 ? u - seamU : seamU - u;
            if (dd <= 0 || tab[e]![end === 0 ? 2 : 0]! >= 0) continue;   // (inside, or an edge between two regions: its stretch is shared)
            const lo = Math.min(wn, old[bi]!.share) - 1e-9, hi = Math.max(wn, old[bi]!.share) + 1e-9;
            assert.ok(nw[bi]!.share >= lo && nw[bi]!.share <= hi, `t ${t.toFixed(2)}: ${fx.skel.edges[e]!.id} bone ${k} share ${nw[bi]!.share} not between ${wn} and ${old[bi]!.share}`);
            const len = (() => { let a = 0; for (let q = 1; q < c; q++) a += Math.hypot(...[0, 1, 2].map((d) => fx.skel.bones[f + q]!.pos[0][d]! - fx.skel.bones[f + q - 1]!.pos[0][d]!)); return a; })();
            if ((dd * len) / (PEEL_EASE_RADII * fx.skel.bones[bi]!.r[0]) >= 1) assert.ok(Math.abs(nw[bi]!.share - old[bi]!.share) < 1e-9, `${fx.skel.edges[e]!.id} bone ${k}: its own share from ${PEEL_EASE_RADII} radii out`);
          }
        });
      }
      if (spreadOld > 1e-6) unevenOld++;
    }
  });
}
test('without the table the regions do not travel as one piece (the bug this fixes is real on the fixtures)', () => {
  assert.ok(regions > 0 && unevenOld > 0, `${unevenOld} of ${regions} regions had unequal shares inside without the table`);
});
