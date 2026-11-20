// The skin carries the tubes' flow marks (chevrons, streaks, dust) through a junction (Mohammad, 20 Nov: "the streaks still break between vessels", "the particles should cross at the junction, not disappear").
// Each arm's marks are drawn on that arm's ARC carried on past its seam (skin/shaders.ts THE FLOW MARKS): on the seam ring the arc is the tube's own (`vUv.x * len * vU`), so the pattern is the tube's, and it grows toward the node
// the way the tube's does (end 1) or shrinks (end 0). Run: node --test tests/skin-marks.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { smoothJoinsOn, setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { SkinSet, armArcOf } from '../src/scene/vessels/skin/skin-set.ts';
import { SKIN_FIGURE_UNITS, SKIN_FS } from '../src/scene/vessels/skin/shaders.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import type { ArmAxis } from '../src/scene/vessels/skin/skin-object.ts';
import type { SkinMesh } from '../src/scene/vessels/skin/types.ts';
import type { VesselObject } from '../src/scene/vessels/vessel-object.ts';

interface Made { mesh: SkinMesh; axes: readonly ArmAxis[]; arms: readonly VesselObject[]; arcs: Array<{ seamArc: number; dir: number; length: number; restR: number; flow: number }> }

function built(): { scene: CelScene; made: Made[]; was: boolean } {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  const made: Made[] = [];
  const parent = new Group();
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh, axes, arms) => {
      const m: Made = { mesh, axes, arms, arcs: [] };
      made.push(m);
      return { mesh, object: new Group(), setArm() {}, setArc(i, seamArc, dir, length, restR, flow) { m.arcs[i] = { seamArc, dir, length, restR, flow }; }, setTransparent() {}, dispose() {} };
    },
    add: (o: Object3D) => parent.add(o), remove: (o: Object3D) => parent.remove(o), warn: () => {},
  });
  set.build(2);
  set.sync();
  return { scene, made, was };
}

/** The skin shader's arc at a rest position (the twin of THE FLOW MARKS' `sI`): the arc at the seam, plus which way it grows, times the distance toward the node along the arm's axis, in figure units. */
const arcAt = (axis: ArmAxis, seamArc: number, dir: number, p: readonly number[]): number => {
  const a = axis.pts[0], b = axis.pts[1];
  const tx = a[0] - b[0], ty = a[1] - b[1], tz = a[2] - b[2], tl = Math.hypot(tx, ty, tz) || 1;
  return seamArc + dir * (((p[0]! - b[0]) * tx + (p[1]! - b[1]) * ty + (p[2]! - b[2]) * tz) / tl) * SKIN_FIGURE_UNITS;
};

test('on every seam ring the skin\'s arc for the arm is the tube\'s own (u x length x figure units), to a twentieth of the arm radius (the ring is flat to its heading): the marks line up at the seam', () => {
  const { scene, made, was } = built();
  try {
    assert.ok(made.length >= 5, `${made.length} skins`);
    let n = 0;
    for (const m of made) {
      const rings = m.mesh.seamVerts;
      m.mesh.junction.arms.forEach((arm, i) => {
        const o = m.arms[i]!, len = o.toon.uniforms.len!.value as number, rd = o.toon.uniforms.radius!.value as number;
        const a = armArcOf(arm.end, m.mesh.cuts[i]!.u, len, rd);
        assert.deepEqual([m.arcs[i]!.seamArc, m.arcs[i]!.dir, m.arcs[i]!.length, m.arcs[i]!.restR], [a.seamArc, a.dir, a.length, a.restR], `${m.mesh.junction.node} ${arm.vesselId}: the set hands the shader the tube's numbers`);
        for (const v of rings[i]!) {
          const p = [m.mesh.position[3 * v]!, m.mesh.position[3 * v + 1]!, m.mesh.position[3 * v + 2]!];
          const s = arcAt(m.axes[i]!, a.seamArc, a.dir, p);
          assert.ok(Math.abs(s - a.seamArc) < 0.05 * a.restR, `${m.mesh.junction.node} ${arm.vesselId}: skin arc ${s} against the tube's ${a.seamArc} at a seam vertex`);
          n++;
        }
      });
    }
    assert.ok(n > 100, `${n} seam vertices`);
  } finally { scene.dispose(); setSmoothJoins(was); }
});

test('the arc grows toward the node on an arm that is its vessel\'s end 1 and shrinks on one that is its start, so a streak runs on in the direction it was going', () => {
  const { scene, made, was } = built();
  try {
    let n = 0;
    for (const m of made) m.mesh.junction.arms.forEach((arm, i) => {
      const o = m.arms[i]!, a = armArcOf(arm.end, m.mesh.cuts[i]!.u, o.toon.uniforms.len!.value as number, o.toon.uniforms.radius!.value as number);
      assert.equal(a.dir, arm.end === 1 ? 1 : -1);
      // the skin's own vertices that belong to this arm and lie toward the node from the seam
      for (let v = 0; v < m.mesh.weight.length / 4; v++) {
        if (m.mesh.weight[4 * v + i]! < 0.9) continue;
        const p = [m.mesh.position[3 * v]!, m.mesh.position[3 * v + 1]!, m.mesh.position[3 * v + 2]!];
        const s = arcAt(m.axes[i]!, a.seamArc, a.dir, p);
        assert.ok(a.dir * (s - a.seamArc) > -0.05 * a.restR, `${m.mesh.junction.node} ${arm.vesselId}: the arc runs toward the node (${s} from ${a.seamArc})`);
        n++;
      }
    });
    assert.ok(n > 100, `${n} arm vertices`);
  } finally { scene.dispose(); setSmoothJoins(was); }
});

test('the skin\'s marks are the tube\'s code: the same dust call on the stream and its chain, the same heads, no fade before the seam, and the arms blended by weight', () => {
  for (const frag of [
    'dustField(acrossI, sI, 0.0, 1.0, smS.w, rOwn, rOwn,',
    'dustField(acrossI, sI, chD.y, chD.z, texelFetch(streamTex, ivec2(rootIx, 0), 0).w, rOwn,',
    'chevOne(sI, Lw, sI, 1.0, Dm, vd, rv, chE.xy, R, acrossI, wpcM, Pt, px)',
    'chevOne(sI, Lw, chD.y + chD.z * sI, chD.z, rootD, vd, rv, chE.xy, R, acrossI, wpcM, Pt, px)',
    'dustAcc += wI *', 'headAcc += wI *',
  ]) assert.ok(SKIN_FS.includes(frag), frag);
  assert.doesNotMatch(SKIN_FS, /skinMarkK|MARK_FADE/);
  assert.doesNotMatch(VESSEL_FS, /skinMarkK|skinSeamDist/, 'the tube draws its marks right up to the seam');
  // the tube's own calls (the tube and the skin must not drift)
  assert.ok(VESSEL_FS.includes('dustField(across, sD, 0.0, 1.0, smS.w, rOwn, rOwn,') && VESSEL_FS.includes('chevOne(s, Lw, s, 1.0, Dm, vd, rv, c5.xy, R, across, wpc, Pt, px)'));
});
