// WP3, open gap 2 of the review: vessels of ONE network that cross without meeting (they share one merged mesh and one draw, so a faded vessel and a solid one that cross are blended in vertex order, not depth order).
// Measured on the real skeleton (net/skeleton.ts), centrelines only: two non-adjacent edges of a network whose centrelines come closer than the sum of their radii, in each pose. The count is pinned so it cannot grow unseen;
// the todo says what is open: the draw does not yet split them (a second draw, or a depth-sorted index order, for the faded ones), and the real skeleton does not mesh yet (net/mesh.ts: "HA:art: the mesh grew past its vertex limit").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skeleton } from '../src/scene/vessels/net/skeleton.ts';
import { buildNetMesh, networksOf } from '../src/scene/vessels/net/mesh.ts';

export function crossings(pose: 0 | 1): { net: number; a: string; b: string; tones: string; gap: number }[] {
  const sk = skeleton(), out: { net: number; a: string; b: string; tones: string; gap: number }[] = [];
  const meets = (a: number, b: number): boolean => sk.nodes.some((n) => n.edges.some((e) => e.edge === a) && n.edges.some((e) => e.edge === b));
  networksOf(sk).forEach((net, ni) => {
    for (let i = 0; i < net.length; i++) for (let j = i + 1; j < net.length; j++) {
      if (meets(net[i]!, net[j]!)) continue;
      const a = sk.edges[net[i]!]!, b = sk.edges[net[j]!]!, [fa, ca] = a.bones, [fb, cb] = b.bones;
      let best = Infinity;
      for (let p = 0; p < ca; p++) for (let q = 0; q < cb; q++) {
        const A = sk.bones[fa + p]!, B = sk.bones[fb + q]!;
        best = Math.min(best, Math.hypot(A.pos[pose][0] - B.pos[pose][0], A.pos[pose][1] - B.pos[pose][1], A.pos[pose][2] - B.pos[pose][2]) / (A.r[pose] + B.r[pose]));
      }
      if (best < 1) out.push({ net: ni, a: a.id, b: b.id, tones: `${a.tone}/${b.tone}`, gap: best });
    }
  });
  return out;
}

test('crossing vessels of one network: counted per pose (body 7, map 18 today); none may be added unseen', () => {
  assert.ok(crossings(0).length <= 7, `${crossings(0).length} crossings in the body pose`);
  assert.ok(crossings(1).length <= 18, `${crossings(1).length} crossings in the map pose`);
});

test('a crossing is a pair of arms in one network, never within the junction they share', () => {
  for (const pose of [0, 1] as const) for (const c of crossings(pose)) assert.notEqual(c.a, c.b);
});

test('the real skeleton meshes as one surface per network', { todo: 'HA:art: the junction will not mesh (vertex limit): WP2' }, () => {
  buildNetMesh(skeleton());
});

test('crossings are drawn in depth order (a second draw or a sorted index for the faded ones)', { todo: 'not built: one merged draw blends a crossing faded vessel in vertex order (WP4 decides: second draw, or sort)' }, () => {
  assert.equal(crossings(1).length, 0);
});
