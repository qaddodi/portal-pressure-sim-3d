// Sewn ends (review doc, "Rulings on WP3's sewn-end proposal", 22 Nov): a collateral, a procedure shunt or anything with presence takes no part in a junction. Its end sinks past the host's wall with 2D's own collar (sideEndScale, flareScale)
// in the same mesh (the collar itself is the shader's, net/sewn.ts: sized from the host's live radius), and the host node stays a plain run-on. The outline's node check at C3, C9 and DIPS is WP3's (tests/net-sewn.test.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNetMesh } from '../src/scene/vessels/net/mesh.ts';
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

for (const [ang, bR] of [[90, 0.04], [70, 0.04], [25, 0.04], [12, 0.07], [90, 0.1]] as const) {
  test(`a collateral landing on a trunk at ${ang} degrees (radius ${bR}) is a sewn end: no junction, the host node a plain run-on, one closed surface (the collar is the shader's)`, () => {
    const skel = trunkWith('C9', ang, bR), r = buildNetMesh(skel), m = r.mesh;
    assert.equal(r.nodes.filter((n) => n.kind === 'junction').length, 0, 'the host node is a run-on, not a junction');
    assert.equal(r.nodes.filter((n) => n.kind === 'runon').length, 1);
    const t = topology(m.index);
    for (const [e, c] of t.use) assert.equal(c, 2, `edge ${e} is on ${c} triangles`);
    assert.equal(t.badDirected, 0);
    assert.ok(volume(m.position, m.index) > 0);
    // the sewn end is capped (a closed tube whose end the shader narrows), and the trunk's two edges share one ring at the node
    assert.equal(t.degenerate, 0);
  });
}

test('the same vessel under a permanent name is a junction arm, so the sewn rule is what removes it (the old behaviour is not the same mesh)', () => {
  const sewn = buildNetMesh(trunkWith('C9', 70)), arm = buildNetMesh(trunkWith('BR', 70));
  assert.equal(sewn.nodes.filter((n) => n.kind === 'junction').length, 0);
  assert.equal(arm.nodes.filter((n) => n.kind === 'junction').length, 1);
});

