// Junction skins, WP6 (docs/junction-skin-spec.md section 5): the skin and the tubes it joins AGREE where they meet, on the REAL network at rest. A seam is where one arm's tube hands over to the skin, so every number the two stages
// make there (the vertex's place, the colour's ramp position, the ink's distance, the alpha) must be the same, or a crack, a step or a kink shows. These read the JS twins of the two vertex stages (vessels/skin/arm-twins.ts normalShift)
// and of the fragment's ink rule; the GLSL itself is compiled by tests/glsl-compile.test.ts and tests/skin-shaders.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { NETWORK, NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { REST, coursesOf, tubularOf } from '../src/scene/vessels/shape.ts';
import { TUBE_RADIAL, buildTubes } from '../src/scene/vessels/tubes.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { fadeOf } from '../src/scene/vessels/fades.ts';
import { slicesFor } from '../src/scene/circuit/geometry.ts';
import { CelScene } from '../src/scene/scene.ts';
import { SkinSet, type SkinDraw } from '../src/scene/vessels/skin/skin-set.ts';
import { liveFadeAt, lensUAt, normalShift } from '../src/scene/vessels/skin/arm-twins.ts';
import { skinNodesForPhase } from '../src/scene/vessels/skin/inventory.ts';
import { SKIN_K } from '../src/scene/vessels/skin/sdf.ts';
import { waistNarrow, waistSigma } from '../src/scene/disease/clamps.ts';
import type { SkinMesh } from '../src/scene/vessels/skin/types.ts';
import { Group, type Object3D } from 'three';
import type { VesselObject } from '../src/scene/vessels/vessel-object.ts';

const RADIAL = TUBE_RADIAL;
const SWELLS = [0.6, 1, 1.4] as const;

interface Rec extends SkinDraw { mesh: SkinMesh }
/** Builds the phase-2 skins on a real scene's vessels with smooth joins on, as the scene does; the objects are recorders (nothing is drawn in node). */
function built(): { scene: CelScene; set: SkinSet; draws: Rec[]; was: boolean } {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene();
  const draws: Rec[] = [];
  const parent = new Group();
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh) => { const d: Rec = { mesh, object: new Group(), setArm() {}, setTransparent() {}, dispose() {} }; draws.push(d); return d; },
    add: (o: Object3D) => parent.add(o), remove: (o: Object3D) => parent.remove(o), warn: () => {},
  });
  set.build(2);
  return { scene, set, draws, was };
}
const done = (b: { scene: CelScene; was: boolean }) => { (b.scene as unknown as { dispose?(): void }).dispose?.(); setSmoothJoins(b.was); };

const tubeOf = (id: string) => { const v = NETWORK_BY_ID.get(id)!; const b = buildTubes(coursesOf(v, REST), tubularOf(v, slicesFor(id)), v.radius); return { v, b, run: b.runs[0]! }; };

test('every skinned arm\'s seam, on the real network: the skin\'s vertex stage lands each seam vertex where the tube\'s does, for every live width of any arm', () => {
  const b = built();
  try {
    assert.ok(b.draws.length >= 2, `${b.draws.length} skins built`);
    let n = 0;
    for (const { mesh } of b.draws) {
      mesh.junction.arms.forEach((arm, ai) => {
        const cut = mesh.cuts[ai]!, { v, b: tb, run } = tubeOf(arm.vesselId);
        const pos = tb.geometry.getAttribute('position'), nor = tb.geometry.getAttribute('normal'), rk = tb.geometry.getAttribute('rk');
        for (let j = 0; j < RADIAL; j++) {
          const ti = run.tubeStart + cut.ring * (RADIAL + 1) + j, sv = mesh.seamVerts[ai]![j]!;
          // the rest place and normal are the tube's own, bit for bit
          for (const [d, get] of [[0, 'getX'], [1, 'getY'], [2, 'getZ']] as const) {
            assert.equal(mesh.position[sv * 3 + d], pos[get](ti), `${mesh.junction.node} ${arm.vesselId} ring ${cut.ring} vertex ${j} position`);
            assert.ok(Math.abs(mesh.normal[sv * 3 + d]! - nor[get](ti)) < 1e-6, `${arm.vesselId} normal`);
          }
          // the weight is 1 on its own arm and the rest radius is the tube's here (radius x rk)
          assert.equal(mesh.weight[sv * 4 + ai], 1); assert.ok(Math.abs(mesh.restR[sv]! - v.radius * rk.getX(ti)) < 1e-6, `${arm.vesselId} rest radius ${mesh.restR[sv]} vs ${v.radius * rk.getX(ti)}`);
          // the live move: the tube's expression with its own swell, the skin's with the weights' blend of ALL the arms' swells (the others varied independently)
          for (const own of SWELLS) for (const other of SWELLS) {
            const sw = mesh.junction.arms.map((_, k) => (k === ai ? own : other));
            const blend = [0, 1, 2, 3].reduce((s, k) => s + mesh.weight[sv * 4 + k]! * (sw[k] ?? 1), 0);
            const inkW = 0.0123, inflate = 0.002;
            const tube = normalShift(v.radius * rk.getX(ti), own, 1, inkW, inflate), skin = normalShift(mesh.restR[sv]!, blend, 1, inkW, inflate);
            assert.ok(Math.abs(tube - skin) < 1e-6, `${arm.vesselId} swell ${own}/${other}: tube ${tube} skin ${skin}`);
            n++;
          }
        }
      });
    }
    assert.ok(n > 1000, `${n} vertex agreements`);
  } finally { done(b); }
});

test('the seam\'s colour: the ramp position the skin reads for an arm is the one the tube has at the seam ring, and the tube\'s uv there is the cut\'s u', () => {
  const b = built();
  try {
    for (const { mesh } of b.draws) mesh.junction.arms.forEach((arm, ai) => {
      const cut = mesh.cuts[ai]!, { v, b: tb, run } = tubeOf(arm.vesselId);
      const uv = tb.geometry.getAttribute('uv');
      for (let j = 0; j < RADIAL; j++) assert.ok(Math.abs(uv.getX(run.tubeStart + cut.ring * (RADIAL + 1) + j) - cut.u) < 1e-6, `${arm.vesselId}: the ring's uv.x is the cut's u`);
      const span = v.lensSpan ?? [0, 1];
      assert.equal(lensUAt(span, cut.u), span[0] + (span[1] - span[0]) * cut.u);
    });
  } finally { done(b); }
});

test('the seam\'s alpha: the skin\'s armFade (the live twin) is the tube\'s own fade at the seam, for every fade mode the arms have', () => {
  const b = built();
  try {
    let modes = new Set<number>();
    for (const { mesh } of b.draws) mesh.junction.arms.forEach((arm, ai) => {
      const cut = mesh.cuts[ai]!, v = NETWORK_BY_ID.get(arm.vesselId)!, f = fadeOf(arm.vesselId, v.tone === 'artery', v.feeder?.host);
      const o = b.scene.vesselObject(arm.vesselId) as VesselObject, u = o.toon.uniforms;
      const fv = (k: string) => u[k]!.value as { x: number; y: number; z: number; w: number };
      const state = { mode: u.fadeMode!.value as number, a: [fv('fadeA').x, fv('fadeA').y, fv('fadeA').z, fv('fadeA').w] as const, line: [fv('fadeLine').x, fv('fadeLine').y, fv('fadeLine').z, fv('fadeLine').w] as const, cavaEnd: [fv('cavaEnd').x, fv('cavaEnd').y] as const, stumpCut: 0, len: u.len!.value as number, units: 300 };
      const { pos } = { pos: tubeOf(arm.vesselId).b.geometry.getAttribute('position') };
      const run = tubeOf(arm.vesselId).run;
      const i = run.tubeStart + cut.ring * (RADIAL + 1);
      const got = liveFadeAt(state, cut.u, pos.getX(i), pos.getY(i));
      const want = f ? liveFadeAt({ ...state, mode: f.mode, a: [f.from, f.to, f.a0, f.a1] }, cut.u, pos.getX(i), pos.getY(i)) : 1;
      assert.ok(Math.abs(got - want) < 1e-9, `${arm.vesselId}`);
      modes.add(state.mode);
    });
    assert.ok(modes.size >= 1);
  } finally { done(b); }
});

test('the stenosis waist is zero on every seam ring: at rest, and with the portal vein stenosed to its limit (c8fe17d3: it is zero at a vessel\'s ends)', () => {
  const b = built();
  try {
    for (const { mesh } of b.draws) mesh.junction.arms.forEach((arm, ai) => {
      const cut = mesh.cuts[ai]!, v = NETWORK_BY_ID.get(arm.vesselId)!;
      const len = tubeOf(arm.vesselId).b.length, U = 300;
      for (const stenosis of [0, 0.5, 0.95]) {
        const w = waistNarrow(stenosis, cut.u, waistSigma(2 * v.radius * U, len * U));
        assert.ok(Math.abs(w) < 1e-3, `${arm.vesselId} at u ${cut.u.toFixed(3)} with stenosis ${stenosis}: narrow ${w}`);
      }
    });
  } finally { done(b); }
});
