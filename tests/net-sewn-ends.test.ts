// Sewn ends (review doc, "Rulings on WP3's sewn-end proposal", 22 Nov): a collateral, a procedure shunt or anything with presence takes no part in a junction. Its end sinks past the host's wall with 2D's own collar (sideEndScale, flareScale)
// in the same mesh, the host node stays a plain run-on, and the buried part never shows through the wall (the outline's node check: every vertex within 0.6 of the host's radius of the tip lies inside the host's lumen with the ink's margin).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNetMesh } from '../src/scene/vessels/net/mesh.ts';
import { closestOnArm } from '../src/scene/vessels/skin/sdf.ts';
import { makeSkeleton, topology, volume, type FixEdge } from './net-lib.ts';

const lin = (a: number, b: number) => (u: number): number => a + (b - a) * u;
const trunkWith = (branchId: string, angDeg: number, branchR = 0.04) => {
  const a = (angDeg * Math.PI) / 180;
  return makeSkeleton([{ id: 'N', runOn: ['TR0', 'TR1'] }, { id: 'a' }, { id: 'b' }, { id: 'c' }], [
    { id: 'TR0', from: 'a', to: 'N', curve: (u) => [-3 + 3 * u, 0, 0], rad: lin(0.1, 0.1) },
    { id: 'TR1', from: 'N', to: 'b', curve: (u) => [3 * u, 0, 0], rad: lin(0.1, 0.1) },
    { id: branchId, from: 'N', to: 'c', curve: (u) => [Math.cos(a) * 3 * u, Math.sin(a) * 3 * u, 0.0], rad: lin(branchR, branchR * 0.9), bones: 120 },
  ] as FixEdge[]);
};

for (const [ang, bR] of [[90, 0.04], [70, 0.04], [25, 0.04], [12, 0.07], [90, 0.1], [60, 0.09]] as const) {
  test(`a collateral landing on a trunk at ${ang} degrees (radius ${bR}) is a sewn end: no junction, one closed surface, and nothing of its buried part shows through the wall`, () => {
    const skel = trunkWith('C9', ang, bR), r = buildNetMesh(skel), m = r.mesh;
    assert.equal(r.nodes.filter((n) => n.kind === 'junction').length, 0, 'the host node is a run-on, not a junction');
    const t = topology(m.index);
    for (const [e, c] of t.use) assert.equal(c, 2, `edge ${e} is on ${c} triangles`);
    assert.equal(t.badDirected, 0);
    assert.ok(volume(m.position, m.index) > 0);
    // the node check: every vertex of the sewn end within 0.6 R_host of its tip is inside the host's lumen, by at least the ink's margin
    const trunk = ['TR0', 'TR1'].map((id) => skel.edges.find((e) => e.id === id)!);
    const caps = trunk.map((e) => { const [f, c] = e.bones, pts = new Float64Array(3 * c), rr = new Float64Array(c); for (let q = 0; q < c; q++) { pts.set(skel.bones[f + q]!.pos[0], 3 * q); rr[q] = skel.bones[f + q]!.r[0]; } return { n: c, pts, r: rr }; });
    const br = skel.edges.find((e) => e.id === 'C9')!, [f, c] = br.bones, tip = skel.bones[f]!.pos[0], hostR = 0.1, cp = new Float64Array(7);
    let n = 0, worst = -Infinity;
    for (let v = 0; v < m.position.length / 3; v++) {
      const b = m.bone[4 * v]!;
      if (b < f || b >= f + c || m.weight[4 * v]! < 0.99) continue;
      const p = skel.bones[b]!.pos[0];
      if (Math.hypot(p[0] - tip[0], p[1] - tip[1], p[2] - tip[2]) > 0.6 * hostR) continue;
      let best = Infinity;
      for (const cap of caps) best = Math.min(best, closestOnArm(cap, m.position[3 * v]!, m.position[3 * v + 1]!, m.position[3 * v + 2]!, cp) - cp[3]);
      worst = Math.max(worst, best); n++;
    }
    assert.ok(n > 0, 'the sewn end has vertices near its tip');
    assert.ok(worst <= -0.05 * hostR, `the outline shows ${worst.toFixed(4)} from the host's lumen (must be inside by 0.05 R = ${(-0.05 * hostR).toFixed(4)})`);
  });
}

test('the same vessel under a permanent name is a junction arm, so the sewn rule is what removes it (the old behaviour is not the same mesh)', () => {
  const sewn = buildNetMesh(trunkWith('C9', 70)), arm = buildNetMesh(trunkWith('BR', 70));
  assert.equal(sewn.nodes.filter((n) => n.kind === 'junction').length, 0);
  assert.equal(arm.nodes.filter((n) => n.kind === 'junction').length, 1);
});

test('a sewn end narrows to its tip like 2D: the dome is well under the vessel\'s own radius', () => {
  const skel = trunkWith('C9', 90), m = buildNetMesh(skel).mesh, br = skel.edges.find((e) => e.id === 'C9')!, [f] = br.bones, tip = skel.bones[f]!.pos[0];
  let widest = 0;
  for (let v = 0; v < m.position.length / 3; v++) if (m.bone[4 * v] === f && m.weight[4 * v]! >= 0.99) widest = Math.max(widest, Math.hypot(m.position[3 * v]! - tip[0], m.position[3 * v + 1]! - tip[1]));
  assert.ok(widest > 0 && widest < 0.04 * 0.6, `the end's widest ring is ${widest.toFixed(4)} across, the vessel's radius is 0.04`);
});
