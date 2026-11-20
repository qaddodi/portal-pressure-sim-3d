// Junction skins, WP6 (docs/junction-skin-spec.md section 5): the skin and the tubes it joins AGREE where they meet, on the REAL network at rest. A seam is where one arm's tube hands over to the skin, so every number the two stages
// make there (the vertex's place, the colour's ramp position, the ink's distance, the alpha) must be the same, or a crack, a step or a kink shows. These read the JS twins of the two vertex stages (vessels/skin/arm-twins.ts normalShift)
// and of the fragment's ink rule; the GLSL itself is compiled by tests/glsl-compile.test.ts and tests/skin-shaders.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BufferAttribute, PerspectiveCamera, Vector4 } from 'three';
import { SKIN_K } from '../src/scene/vessels/skin/sdf.ts';
import { axisOf } from '../src/scene/vessels/skin/skin-set.ts';
import type { ArmAxis } from '../src/scene/vessels/skin/skin-object.ts';
import { SKIN_VS } from '../src/scene/vessels/skin/shaders.ts';
import { NETWORK, NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { REST, coursesOf, tubularOf } from '../src/scene/vessels/shape.ts';
import { TUBE_RADIAL, buildTubes } from '../src/scene/vessels/tubes.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { fadeOf } from '../src/scene/vessels/fades.ts';
import { slicesFor } from '../src/scene/circuit/geometry.ts';
import { CelScene } from '../src/scene/scene.ts';
import { SkinSet, type SkinDraw } from '../src/scene/vessels/skin/skin-set.ts';
import { liveFadeAt, lensUAt, normalShift } from '../src/scene/vessels/skin/arm-twins.ts';
import { waistNarrow, waistSigma } from '../src/scene/disease/clamps.ts';
import type { SkinMesh } from '../src/scene/vessels/skin/types.ts';
import { Group, type Object3D } from 'three';
import type { VesselObject } from '../src/scene/vessels/vessel-object.ts';

const RADIAL = TUBE_RADIAL;
const SWELLS = [0.6, 1, 1.4] as const;

interface Rec extends SkinDraw { mesh: SkinMesh; got: { i: number; narrow: number }[] }
/** Builds the phase-2 skins on a real scene's vessels with smooth joins on, as the scene does; the objects are recorders (nothing is drawn in node). */
function built(): { scene: CelScene; set: SkinSet; draws: Rec[]; was: boolean } {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene();
  const draws: Rec[] = [];
  const parent = new Group();
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh) => { const got: Rec['got'] = []; const d: Rec = { mesh, got, object: new Group(), setArm(i, _f, _h, _l, _c, narrow) { got.push({ i, narrow }); }, setArc() {}, setPres() {}, setArmCopy() {}, setTransparent() {}, dispose() {} }; draws.push(d); return d; },
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
          assert.equal(ai < 4 ? mesh.weight[sv * 4 + ai] : mesh.weight2[sv * 2 + ai - 4], 1);   // (arms 4 and 5 are the second attribute: IVCS has five) assert.ok(Math.abs(mesh.restR[sv]! - v.radius * rk.getX(ti)) < 1e-6, `${arm.vesselId} rest radius ${mesh.restR[sv]} vs ${v.radius * rk.getX(ti)}`);
          // the live move: the tube's expression with its own swell, the skin's with the weights' blend of ALL the arms' swells (the others varied independently)
          for (const own of SWELLS) for (const other of SWELLS) {
            const sw = mesh.junction.arms.map((_, k) => (k === ai ? own : other));
            const blend = [0, 1, 2, 3, 4, 5].reduce((s, k) => s + (k < 4 ? mesh.weight[sv * 4 + k]! : mesh.weight2[sv * 2 + k - 4]!) * (sw[k] ?? 1), 0);
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

/** The vertex stage's stenosis share kept (vessels/shaders.ts `narrowK`, and the skin's `1 - armNarrow`): the clamp is the same for both. */
const keep = (narrow: number): number => 1 - Math.min(Math.max(narrow, 0), 0.97);
test('the stenosis waist: nothing on any seam ring at rest; with a stenosis the skin takes the tube\'s own narrowing at the seam (armNarrow), so the seam has no step (c8fe17d3 makes it zero at a vessel\'s ends, but a short piece\'s seam can lie inside its waist)', () => {
  const b = built();
  try {
    let inside = 0;
    for (const { mesh } of b.draws) mesh.junction.arms.forEach((arm, ai) => {
      const cut = mesh.cuts[ai]!, v = NETWORK_BY_ID.get(arm.vesselId)!, { b: tb, run } = tubeOf(arm.vesselId);
      const len = tb.length, U = 300, rk = tb.geometry.getAttribute('rk').getX(run.tubeStart + cut.ring * (RADIAL + 1));
      const at = (s: number) => waistNarrow(s, cut.u, waistSigma(2 * v.radius * U, len * U));
      assert.equal(at(0), 0, `${arm.vesselId} at rest`);
      for (const s of [0.4, 0.95]) {
        const nar = at(s);
        if (nar > 0) inside++;
        // the tube moves a seam vertex by its own narrowK; the skin by swell x (1 - armNarrow) with narrowK 1: the same
        for (const sw of SWELLS) {
          const tube = normalShift(v.radius * rk, sw, keep(nar), 0.01, 0), skin = normalShift(v.radius * rk, sw * keep(nar), 1, 0.01, 0);
          assert.ok(Math.abs(tube - skin) < 1e-9, `${arm.vesselId} u ${cut.u.toFixed(3)} stenosis ${s}`);
        }
      }
    });
    assert.ok(inside >= 1, 'at least one seam lies inside a waist: the case this exists for (PV_TRUNK_1 at CONF)');
  } finally { done(b); }
});

test('the skin\'s vertex stage takes each arm\'s waist into its live width, and the set hands the seam\'s narrow attribute over', () => {
  assert.match(SKIN_VS, /uniform float armNarrow\[6\];/);
  assert.match(SKIN_VS, /swellOf\(armData\[i\]\.x, armData\[i\]\.y, armData\[i\]\.z\) \* \(1\.0 - clamp\(armNarrow\[i\], 0\.0, 0\.97\)\)/);
  const b = built();
  try {
    const sk = b.draws[0]!.mesh, id = sk.junction.arms[0]!.vesselId;
    const o = b.scene.vesselObject(id) as VesselObject, geo = o.toonMesh.geometry;
    const n = geo.getAttribute('position').count, narrow = new Float32Array(n).fill(0.21);
    geo.setAttribute('narrow', new BufferAttribute(narrow, 1));
    b.draws.forEach((d) => { d.got.length = 0; });
    b.set.sync();
    const got = b.draws[0]!.got.find((g) => g.i === 0);
    assert.ok(got && Math.abs(got.narrow - 0.21) < 1e-6, `armNarrow ${got?.narrow}`);
  } finally { done(b); }
});

// ---- the seam's ink ----
const RES = 1000, DPR = 1;
/** The skin fragment stage's rule (skin/shaders.ts skinPx, skinArmPx, skinSmin, skinSdPx) in JS, on a perspective camera at the fit. */
function inkTwin(cam: PerspectiveCamera, axes: readonly ArmAxis[], swell: number, kM: number) {
  cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const project = (p: readonly number[], R: number): [number, number, number] => {
    const q = new Vector4(p[0]!, p[1]!, p[2]!, 1).applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix);
    return [(q.x / q.w * 0.5 + 0.5) * RES * DPR, (q.y / q.w * 0.5 + 0.5) * RES * DPR, R * swell / ((q.w * 2) / (RES * cam.projectionMatrix.elements[5]!)) * DPR];
  };
  const armPx = (frag: readonly number[], ax: ArmAxis): number => {
    const a = project(ax.pts[0], ax.radii[0]), b = project(ax.pts[1], ax.radii[1]), c = project(ax.pts[2], ax.radii[2]), d = project(ax.pts[3], ax.radii[3]);
    const seg = (p: number[], q: number[]): number => {
      const abx = q[0]! - p[0]!, aby = q[1]! - p[1]!, t = Math.min(1, Math.max(0, ((frag[0]! - p[0]!) * abx + (frag[1]! - p[1]!) * aby) / Math.max(abx * abx + aby * aby, 1e-6)));
      return Math.hypot(frag[0]! - p[0]! - abx * t, frag[1]! - p[1]! - aby * t) - (p[2]! + t * (q[2]! - p[2]!));
    };
    return Math.min(seg(a, b), seg(b, c), seg(c, d));
  };
  const smin = (a: number, b: number, k: number): number => { const h = Math.min(1, Math.max(0, 0.5 + 0.5 * (b - a) / Math.max(k, 1e-4))); return b + (a - b) * h - k * h * (1 - h); };
  const kPx = (centre: readonly number[]): number => { const q = new Vector4(centre[0]!, centre[1]!, centre[2]!, 1).applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix); return kM / ((q.w * 2) / (RES * cam.projectionMatrix.elements[5]!)) * DPR; };
  return { project, armPx, sdPx: (frag: readonly number[], centre: readonly number[]): number => { let d = 0; axes.forEach((ax, i) => { const di = armPx(frag, ax); d = i === 0 ? di : smin(d, di, kPx(centre)); }); return d; } };
}

test('the seam\'s ink: the skin\'s outline rule gives, on the seam ring, the tube\'s own lateral distance minus its radius (within a quarter pixel), so the line runs on with no kink', () => {
  const b = built();
  try {
    let n = 0;
    for (const draw of b.draws) {
      const { mesh } = draw, J = mesh.junction.J;
      const cam = new PerspectiveCamera(30, 1, 0.01, 100); cam.position.set(J[0], J[1], J[2] + 1.2); cam.lookAt(J[0], J[1], J[2]);
      mesh.junction.arms.forEach((arm, ai) => {
        const tb = tubeOf(arm.vesselId), cut = mesh.cuts[ai]!;
        // the three axis points the shader draws from: the tube's own ring centres, as the set builds them
        const axes = mesh.junction.arms.map((a, i) => axisOf({ geometry: tubeOf(a.vesselId).b.geometry, tubular: tubeOf(a.vesselId).run.tubular }, a.restR, mesh.cuts[i]!, mesh.junction.J));
        const tw = inkTwin(cam, axes, 1, SKIN_K * Math.min(...mesh.junction.arms.map((a) => a.restR)));
        const seam = axes[ai]!.pts[2], R = axes[ai]!.radii[2], s1 = tw.project(seam, R), c1 = tw.project(axes[ai]!.pts[3], R);
        // the arm's heading on the screen at its seam, and the offsets across it
        let hx = c1[0] - s1[0], hy = c1[1] - s1[1]; const hl = Math.hypot(hx, hy);
        if (hl < 1) return;   // (seen end on: no sideways direction to measure across)
        hx /= hl; hy /= hl;
        for (const k of [0, 0.5, 1]) for (const sgn of [-1, 1]) {
          const off = sgn * k * s1[2], frag = [s1[0] - hy * off, s1[1] + hx * off];
          const want = Math.abs(off) - s1[2];
          if (process.env.SKIN_DEBUG) console.log(mesh.junction.node, arm.vesselId, k, sgn, (tw.sdPx(frag, seam) - want).toFixed(3), 'R px', s1[2].toFixed(2));
          assert.ok(Math.abs(tw.sdPx(frag, seam) - want) <= 0.25, `${mesh.junction.node} ${arm.vesselId}: skin ${tw.sdPx(frag, seam).toFixed(3)} px vs tube ${want.toFixed(3)} px (offset ${k} R)`);
          n++;
        }
        void tb; void cut;
      });
    }
    assert.ok(n >= 20, `${n} pixels judged`);
  } finally { done(b); }
});
