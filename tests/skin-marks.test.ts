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
import { FLOW_MARKS_GLSL, CHEV_ONE_GLSL } from '../src/scene/vessels/glsl-shared.ts';
import { DUST_GLSL } from '../src/scene/blood/dust-glsl.ts';
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
      return { mesh, object: new Group(), setArm() {}, setArc(i, seamArc, dir, length, restR, flow) { m.arcs[i] = { seamArc, dir, length, restR, flow }; }, setPres() {}, setArmCopy() {}, setTransparent() {}, dispose() { made.splice(made.indexOf(m), 1); } };   // (a skin the planner took back to plan with a neighbour is not one that stands)
    },
    add: (o: Object3D) => parent.add(o), remove: (o: Object3D) => parent.remove(o), warn: () => {},
  });
  set.build(2);
  set.sync();
  return { scene, made, was };
}

/** The skin shader's arc at a rest position (the twin of THE FLOW MARKS' `sI`): the arc at the seam, plus which way it grows, times the distance toward the node along the arm's axis, in figure units. */
const arcAt = (axis: ArmAxis, seamArc: number, dir: number, p: readonly number[]): number => {
  const a = axis.pts[1], b = axis.pts[2];
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

test('the tube and the skin call ONE flow-marks code (glsl-shared.ts flowDust / flowHeads): neither program holds a copy of the dust or chevron placing, there is no fade before the seam, and the skin blends its arms by weight', () => {
  for (const [name, src] of [['VESSEL_FS', VESSEL_FS], ['SKIN_FS', SKIN_FS]] as const) {
    assert.ok(src.includes(FLOW_MARKS_GLSL), `${name} holds the shared flow marks`);
    const rest = src.replace(FLOW_MARKS_GLSL, '').replace(CHEV_ONE_GLSL, '').replace(DUST_GLSL, '');   // (their definitions are not calls)
    assert.doesNotMatch(rest, /dustField\(|chevOne\(/, `${name} calls the marks only through flowDust / flowFrame / flowHeads`);
    assert.match(rest, /flowDust\(|flowFrame\(/); assert.match(rest, /flowHeads\(/);
  }
  // the skin's dust: each particle drawn ONCE at the blend of its places in the two heaviest arms' frames (blood/dust-glsl.ts dustSkin), never two weighted ghosts
  assert.match(SKIN_FS, /float onI = flowFrame\(acrossI, dustFrame\(/);
  assert.match(SKIN_FS, /dustSkin\(FD0, FD1, w1, litD, inkColor, /);
  assert.doesNotMatch(SKIN_FS, /dustAcc \+= wI/);
  assert.match(SKIN_FS, /vec4 hI = flowHeads\(/);   // (each arm's heads, kept whole by the arm that owns their centre: tests/skin-head-owner.test.ts)
  assert.doesNotMatch(SKIN_FS + VESSEL_FS, /skinMarkK|skinSeamDist|MARK_FADE/);
  assert.match(FLOW_MARKS_GLSL, /vec4 dust = dustTube\(F, lit, inkColor, rev\);/);
  assert.match(FLOW_MARKS_GLSL, /chevOne\(s, Lw, c4\.y \+ c4\.z \* s, c4\.z, rootD,/);
  assert.match(FLOW_MARKS_GLSL, /F = DFrame\(across, fr\.xy, fr\.zw, s, Lw, rOwn, vR, rCss, nar, smS\.y, lensI, vUn\);/, 'the root\'s radius (route table, scene units) is scaled by the program\'s own figure units (the Circuit\'s map is not 300)');
});

test('no NaN can leave the skin\'s flow marks: a heading is normalised only after its length is checked (a NaN pixel is a speck of any colour, Mohammad 20 Nov: green and dark blue specks on the welds)', () => {
  assert.ok(!/normalize\(mat3\(modelViewMatrix\) \* \(armArc/.test(SKIN_FS), 'the arm heading is never normalised unchecked');
  assert.match(SKIN_FS, /float headL = length\(headA\[i\]\);/);
  assert.match(SKIN_FS, /headL > 1e-6 \? cross\(headA\[i\] \/ headL, viewDir\)/);
});

test('every derivative of the flow marks is taken before the first discard, in uniform control flow (a quad whose neighbours were discarded gives a garbage fwidth on a device that drops the lane: blocky wrong-coloured specks at every crotch and silhouette, gone with ?joins=nomarks)', () => {
  for (const [name, src] of [['skin', SKIN_FS], ['tube', VESSEL_FS]] as const) {
    const first = src.indexOf('discard;', src.indexOf('void main()'));
    assert.ok(first > 0, name);
    const body = src.slice(src.indexOf('void main()'));
    let n = 0;
    for (const m of body.matchAll(/fwidth\(/g)) {
      const at = body.indexOf('discard;');
      if (m.index! > at) { const line = body.slice(body.lastIndexOf('\n', m.index!) + 1, body.indexOf('\n', m.index!)); if (!/fwidth\(nz\)|fwidth\(dv\)|fwidth\(tn\)|fwidth\(f\)/.test(line)) assert.fail(`${name}: a derivative after the first discard: ${line.trim()}`); }
      n++;
    }
    assert.ok(n >= 3, `${name} takes its derivatives`);
  }
});
