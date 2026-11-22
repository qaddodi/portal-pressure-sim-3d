// Mohammad, 21 Nov (iPhone c2ed15a3, Healthy, zoomed on the left renal vein joint): the renal vein's blunt rounded end showed inside the cava's lumen. The rule, for every junction skin of the body and not only this one:
// NO VESSEL END RENDERS INSIDE ANOTHER VESSEL'S LUMEN. Three places an end can come from, each pinned here (node only, the real network and skin set):
//   1. the skin's own mesh: no vertex of any junction skin lies inside any arm's lumen (the skin is the surface of the union, its seam rings and fillets included);
//   2. the seam ring where a tube hands over to the skin lies on the skin, outside every OTHER arm's lumen;
//   3. the tube's cut part (the stretch past a seam, with its rounded end cap, which for a vessel that runs into another ends inside the other's lumen) is never drawn under a skin: the weld of every permanent arm's cut end is 1, which discards it whole.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { SkinSet, capsuleOf } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject, type ArmAxis } from '../src/scene/vessels/skin/skin-object.ts';
import { sdArm } from '../src/scene/vessels/skin/sdf.ts';
import type { SkinMesh } from '../src/scene/vessels/skin/types.ts';
import type { VesselObject } from '../src/scene/vessels/vessel-object.ts';

const LUMEN_TOL = 0.2, SEAM_TOL = 0.15;

function body() {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' }), parent = new Group(), made: { mesh: SkinMesh; axes: readonly ArmAxis[] }[] = [];
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh, axes, arms) => { made.push({ mesh, axes }); return new SkinObject(mesh, arms[0]!, axes, arms); },
    add: (o: Object3D) => parent.add(o), remove: (o: Object3D) => parent.remove(o), warn: () => {},
  });
  set.build(2);
  const presence = (scene as unknown as { presence: { set(id: string, goal: 'hidden', instant: boolean): void } }).presence;
  for (const id of ['S_PC', 'S_MC', 'C9', 'C1b', 'REX', 'TIPS', 'S_DSR', 'DIPS']) presence.set(id, 'hidden', true);   // Healthy: every shunt and collateral closed
  set.sync();
  return { scene, made, done: () => { scene.dispose(); setSmoothJoins(was); } };
}

test('no skin vertex lies inside an arm\'s lumen, and no seam ring inside another arm\'s (every junction of the body)', () => {
  const b = body();
  try {
    assert.ok(b.made.length > 20, `${b.made.length} skins`);
    for (const { mesh, axes } of b.made) {
      const caps = axes.map(capsuleOf), j = mesh.junction, P = mesh.position;
      for (let v = 0; v < P.length / 3; v++) for (let q = 0; q < caps.length; q++) {
        const d = sdArm(caps[q]!, P[v * 3]!, P[v * 3 + 1]!, P[v * 3 + 2]!) / j.arms[q]!.restR;
        assert.ok(d >= -LUMEN_TOL, `${j.node}: a skin vertex lies ${(-d).toFixed(2)} R inside ${j.arms[q]!.vesselId}'s lumen`);
      }
      for (let i = 0; i < caps.length; i++) for (const v of mesh.seamVerts[i] ?? []) for (let q = 0; q < caps.length; q++) {
        if (q === i) continue;
        const d = sdArm(caps[q]!, P[v * 3]!, P[v * 3 + 1]!, P[v * 3 + 2]!) / j.arms[q]!.restR;
        assert.ok(d >= -SEAM_TOL, `${j.node}: ${j.arms[i]!.vesselId}'s seam ring lies ${(-d).toFixed(2)} R inside ${j.arms[q]!.vesselId}'s lumen`);
      }
    }
  } finally { b.done(); }
});

test('the cut end of a permanent arm is never drawn under its skin (weld 1 discards it whole, its cap with it)', () => {
  const b = body();
  try {
    let n = 0;
    const nodes = new Set(b.made.map((m) => m.mesh.junction.node));
    for (const { mesh } of b.made) for (const a of mesh.junction.arms) {
      if (a.grow || a.side) continue;
      // (a skin with a growing arm and no plain trunk of the arms that stay hands its tubes back whole while the arm is closed: today's join, with its own caps, plain.ts)
      const node = mesh.junction.node.replace('~plain', '');
      if (mesh.junction.arms.some((x) => x.grow) && !nodes.has(`${node}~plain`)) continue;
      const o = b.scene.vesselObject(a.vesselId) as VesselObject, cut = (o.toon.uniforms.skinCut!.value as { toArray(): number[] }).toArray(), w = (o.toon.uniforms.skinWeld!.value as { toArray(): number[] }).toArray();
      const cutAtEnd = a.end === 0 ? cut[0]! >= 0 : cut[1]! <= 1;
      if (!cutAtEnd) continue;
      n++;
      assert.equal(w[a.end]!, 1, `${a.vesselId} end ${a.end} (${mesh.junction.node}): the cut end is drawn again under the skin, its cap inside the other vessel`);
    }
    assert.ok(n > 40, `${n} cut ends checked`);
  } finally { b.done(); }
});
