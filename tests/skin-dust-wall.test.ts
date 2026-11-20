// BLACK DASHES AT THE OUTLINE OF A JUNCTION SKIN, only with Blood streaks on (Mohammad, 21 Nov, the portal confluence: small dark dashes against the outline right at the seam rings and the crotch).
// ROOT CAUSE: the dust keeps off the wall by the pixel's ACROSS (the mesh normal's component on the screen's sideways axis): on a tube that is the lateral position over the half width, so 0.90 to 0.96 is just short of the line. On a
// skin the arm's across is the normal's, and in a fillet the normal turns with the blend: a silhouette 30 to 60 degrees off the arm's heading has an arm across of 0.5 to 0.87, so the gate stood OPEN on the outline itself and a
// particle was drawn against the ink. The skin now asks the pixel's own distance to the outline (skin/dust-wall.ts), which is the tube's across on a cylinder and 1 at the line's outer edge wherever the outline runs.
// Run: node --test tests/skin-dust-wall.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { smoothJoinsOn, setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { SkinSet, capsuleOf } from '../src/scene/vessels/skin/skin-set.ts';
import { SKIN_FS, SKIN_VS, SKIN_HEAD_LAT_FROM, SKIN_HEAD_LAT_TO } from '../src/scene/vessels/skin/shaders.ts';
import { SKIN_K, sdUnionGrad } from '../src/scene/vessels/skin/sdf.ts';
import { SKIN_SHADE_K, SKIN_RING_W_FROM } from '../src/scene/vessels/skin/exact-normal.ts';
import { skinWallJs, SKIN_WALL_GLSL } from '../src/scene/vessels/skin/dust-wall.ts';
import { DUST_GLSL, DUST_WALL_FROM, DUST_WALL_TO, dustWall } from '../src/scene/blood/dust-glsl.ts';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import type { ArmAxis } from '../src/scene/vessels/skin/skin-object.ts';
import type { SkinMesh } from '../src/scene/vessels/skin/types.ts';
import type { VesselObject } from '../src/scene/vessels/vessel-object.ts';

interface Made { mesh: SkinMesh; axes: readonly ArmAxis[]; arms: readonly VesselObject[] }
function built(): { scene: CelScene; made: Made[]; was: boolean } {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  const made: Made[] = [];
  const parent = new Group();
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh, axes, arms) => {
      const m: Made = { mesh, axes, arms };
      made.push(m);
      return { mesh, object: new Group(), setArm() {}, setArc() {}, setPres() {}, setArmCopy() {}, setTransparent() {}, dispose() { made.splice(made.indexOf(m), 1); } };
    },
    add: (o: Object3D) => parent.add(o), remove: (o: Object3D) => parent.remove(o), warn: () => {},
  });
  set.build(2);
  set.sync();
  return { scene, made, was };
}

const ss = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
type V3 = [number, number, number];
const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: readonly number[], b: readonly number[]): V3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const unit = (a: readonly number[]): V3 => { const l = Math.hypot(a[0]!, a[1]!, a[2]!) || 1; return [a[0]! / l, a[1]! / l, a[2]! / l]; };

/** What the skin shader's dust gates were before the wall rule, at one vertex of the rest surface seen from the front (the figure's normal toward the eye): the two heaviest arms' frames, each by its own across (flowFrame's 0.97, dustTube's wall rule) and by how far inside its own
 *  cylinder the vertex is, renormalised by those shares (skin/shaders.ts THE FLOW MARKS). */
function armGates(m: Made, v: number, n: V3, rad: number[]): number {
  const V: V3 = [0, 0, 1], w = [0, 1, 2, 3].map((i) => m.mesh.weight[4 * v + i]!);
  const p: V3 = [m.mesh.position[3 * v]!, m.mesh.position[3 * v + 1]!, m.mesh.position[3 * v + 2]!];
  const fr = m.mesh.junction.arms.map((arm, i) => {
    const ax = m.axes[i]!, tJ = unit([ax.pts[1][0] - ax.pts[2][0], ax.pts[1][1] - ax.pts[2][1], ax.pts[1][2] - ax.pts[2][2]]);
    const side = unit(cross(tJ.map((x) => x * (arm.end === 1 ? 1 : -1)), V));
    const across = dot(n, side);
    const rel: V3 = [p[0] - ax.pts[2][0], p[1] - ax.pts[2][1], p[2] - ax.pts[2][2]], al = dot(rel, tJ);
    const lat = Math.hypot(rel[0] - tJ[0] * al, rel[1] - tJ[1] * al, rel[2] - tJ[2] * al) / rad[i]!;
    return { inn: 1 - ss(SKIN_HEAD_LAT_FROM, SKIN_HEAD_LAT_TO, lat), on: Math.abs(across) >= 0.97 ? 0 : 1, gate: dustWall(across) };
  });
  const ord = [0, 1, 2, 3].filter((i) => i < fr.length).sort((a, b) => w[b]! - w[a]!);
  const [i0, i1, i2] = ord as [number, number, number | undefined];
  const w1 = Math.max(w[i1]! - (i2 === undefined ? 0 : w[i2]!), 0) / Math.max(w[i0]! + w[i1]! - 2 * (i2 === undefined ? 0 : w[i2]!), 1e-4);
  const a0 = (1 - w1) * fr[i0]!.inn, a1 = w1 * fr[i1]!.inn, aN = a0 + a1;
  return aN > 1e-4 ? (a0 * fr[i0]!.on * fr[i0]!.gate + a1 * fr[i1]!.on * fr[i1]!.gate) / aN : 0;
}

test('the wall rule is written once and the skin applies it by the pixel\'s own distance to the outline, after the dust is held by the final alpha', () => {
  assert.equal((DUST_GLSL.match(/smoothstep\(0\.9, 0\.96/g) ?? []).length, 1, 'the 0.90 to 0.96 ramp stands in dWall only');
  assert.match(DUST_GLSL, /float dWall\(float e\) \{ return 1\.0 - smoothstep\(0\.9, 0\.96, abs\(e\)\); \}/);
  assert.equal((DUST_GLSL.match(/\* dWall\(/g) ?? []).length, 2, 'the tube\'s dust and the skin\'s two-frame blend both end in dWall');
  assert.match(DUST_GLSL, /keepT \* dWall\(F\.across\)/);
  assert.equal(DUST_WALL_FROM, 0.9); assert.equal(DUST_WALL_TO, 0.96);
  const fs = SKIN_FS.slice(SKIN_FS.indexOf('void main()'));
  assert.match(SKIN_FS, new RegExp(SKIN_WALL_GLSL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'the skin carries the wall coordinate\'s GLSL');
  const hold = fs.indexOf('dustAcc *= dHold(alpha);'), wall = fs.indexOf('dustAcc *= dWall(skinWall(rCssAx * dpr, sdPx, inkDev));');
  assert.ok(hold > 0 && wall > hold, 'the skin\'s dust is gated by the wall coordinate (the lumen\'s radius, the outline\'s distance and the line, device px)');
  assert.ok(wall < fs.indexOf('c = c * (1.0 - dustAcc.a) + dustAcc.rgb;'), 'and that is before the dust is laid on the body');
});

test('on a cylinder the skin\'s wall coordinate IS the tube\'s across: lateral position over the half width, ink included (so a seam ring gates the dust as the tube past it does)', () => {
  for (const R of [8, 20, 60, 140]) {
    const ink = Math.min(CEL_STYLE.LINE_MAX, Math.max(CEL_STYLE.LINE_MIN, CEL_STYLE.LINE_R * R));
    for (const x of [0, 0.3 * R, 0.8 * R, 0.9 * R, R, R + ink]) {
      const sd = x - R;   // the outline's signed distance from a lateral position x of a cylinder of radius R
      assert.ok(Math.abs(skinWallJs(R, sd, ink) - x / (R + ink)) < 1e-12, `R ${R} x ${x}`);
    }
    assert.ok(Math.abs(skinWallJs(R, 0, ink) - R / (R + ink)) < 1e-12, 'on the outline it is R over R + ink: the tube\'s own');
    assert.equal(skinWallJs(R, R + ink, ink), 1, 'the line\'s outer edge');
    assert.equal(skinWallJs(R, -3 * R, ink), 0, 'deep in a crotch, nowhere near any wall');
  }
});

test('on the real network the arms\' own gates left the dust open on the outline of a skin (the dashes); the wall coordinate shuts it exactly as the tube does at its own line', () => {
  const { scene, made, was } = built();
  try {
    assert.ok(made.length >= 5, `${made.length} skins`);
    const PX = 60 / 0.0227;   // device px in a scene unit: a lumen of the portal vein's radius is 60 px
    let n = 0, openBefore = 0, openAfter = 0;
    for (const m of made) {
      const caps = m.axes.map(capsuleOf), rad = m.arms.map((o) => o.toon.uniforms.radius!.value as number), g = new Float64Array(3);
      const nV = m.mesh.position.length / 3;
      for (let v = 0; v < nV; v++) {
        // a vertex of the rest surface that lies on the outline seen from the front: the union's own normal is square to the eye
        const x = m.mesh.position[3 * v]!, y = m.mesh.position[3 * v + 1]!, z = m.mesh.position[3 * v + 2]!;
        sdUnionGrad(caps, SKIN_K * SKIN_SHADE_K, x, y, z, g);
        const nv = unit([g[0]!, g[1]!, g[2]!]);
        if (Math.abs(nv[2]) > 0.12) continue;
        const wTop = Math.max(m.mesh.weight[4 * v]!, m.mesh.weight[4 * v + 1]!, m.mesh.weight[4 * v + 2]!, m.mesh.weight[4 * v + 3]!);
        const vn: V3 = [m.mesh.normal[3 * v]!, m.mesh.normal[3 * v + 1]!, m.mesh.normal[3 * v + 2]!], t = 1 - ss(SKIN_RING_W_FROM, 1, wTop);
        const shown = unit([vn[0] + (nv[0] - vn[0]) * t, vn[1] + (nv[1] - vn[1]) * t, vn[2] + (nv[2] - vn[2]) * t]);
        const before = armGates(m, v, shown, rad);
        const R = m.mesh.restR[v]! * PX, ink = Math.min(CEL_STYLE.LINE_MAX, Math.max(CEL_STYLE.LINE_MIN, CEL_STYLE.LINE_R * R));
        const wall = dustWall(skinWallJs(R, 0, ink)), after = before * wall;
        const tube = dustWall(R / (R + ink));   // the tube's gate at its own lumen edge (its across there)
        assert.ok(after <= tube + 1e-9, `vertex ${v} of ${m.mesh.junction.node}: the skin's dust at the outline (${after}) is never more than the tube's at its line (${tube})`);
        if (tube > 0.05) continue;   // (a thin vessel's line is a large share of its radius: its own gate is open at the line, and so is the skin's)
        n++;
        if (before > 0.3) openBefore++;
        if (after > 0.3) openAfter++;
      }
    }
    assert.ok(n > 100, `${n} outline vertices of the real skins where the tube's own gate is shut at its line`);
    assert.ok(openBefore >= 0.15 * n, `the arms' gates alone were open on ${openBefore} of those ${n}: the mismatch the wall rule removes`);
    assert.equal(openAfter, 0, 'with the wall rule none is: the skin\'s outline is as clear of dust as the tube\'s');
  } finally { scene.dispose(); setSmoothJoins(was); }
});

// THE DUST-FREE BLOCK ON THE SMV JUST BELOW THE CONFLUENCE (Mohammad, 21 Nov): a flat, uniformly blue patch with straight edges and a hard top, where the streaks are missing, and streaks above, beside and below it.
// ROOT CAUSE: the vertex stage handed the fragment stage `vPos = position`, the mesh as built (every growing arm at full radius), not the position the vertex is DRAWN at (the growth morph moves an absent arm's mesh onto the union
// without it: `pos`). Every dust frame reads its arc, its lateral gate (inD: inside the arm's own cylinder) and the union's gradient from vPos, so in the triangles the S_PC thread's morph moves (it lies across the SMV's stub) the
// pixel was judged at the place of S_PC's bulge, outside every arm's cylinder: neither frame held, and the dust, renormalised by what held (aN), was none. The patch's edges are the moved triangles' edges.
test('the position the fragment stage reads is the position the vertex is drawn at, so every drawn skin vertex of an arm\'s own stretch is inside that arm\'s cylinder (the dust frames hold) at any growth', () => {
  assert.match(SKIN_VS, /vPos = pos;/, 'vPos is the morphed rest position');
  assert.doesNotMatch(SKIN_VS, /vPos = position;/);
  const { scene, made, was } = built();
  try {
    let grown = 0, worstNow = 0, worstBuilt = 0, movedOut = 0, n = 0;
    for (const m of made) {
      if (m.mesh.grow.length === 0) continue;
      grown++;
      const rad = m.arms.map((o) => o.toon.uniforms.radius!.value as number), growing = new Set(m.mesh.grow.map((gm) => gm.arm));
      for (const g of [0, 0.5]) {
        for (let v = 0; v < m.mesh.position.length / 3; v++) {
          for (let i = 0; i < m.axes.length; i++) {
            if (growing.has(i)) continue;
            // the vertex's weights as the vertex stage makes them: the mesh's less what each growing arm has still to grow (renormalised)
            const wv = [0, 1, 2, 3].map((k) => m.mesh.weight[4 * v + k]! - m.mesh.grow.reduce((t, gm) => t + (1 - g) * gm.dWeight[4 * v + k]!, 0));
            const sum = wv.reduce((t, x) => t + Math.max(x, 0), 0) || 1;
            if (Math.max(wv[i]!, 0) / sum < 0.95) continue;
            const ax = m.axes[i]!, tJ = unit([ax.pts[1][0] - ax.pts[2][0], ax.pts[1][1] - ax.pts[2][1], ax.pts[1][2] - ax.pts[2][2]]);
            const lat = (q: (k: number) => number): number => { const rel: V3 = [q(0) - ax.pts[2][0], q(1) - ax.pts[2][1], q(2) - ax.pts[2][2]], al = dot(rel, tJ); return Math.hypot(rel[0] - tJ[0] * al, rel[1] - tJ[1] * al, rel[2] - tJ[2] * al) / rad[i]!; };
            const built1 = lat((k) => m.mesh.position[3 * v + k]!);
            const now = lat((k) => m.mesh.position[3 * v + k]! - m.mesh.grow.reduce((t, gm) => t + (1 - g) * gm.dPos[3 * v + k]!, 0));
            n++; worstNow = Math.max(worstNow, now); worstBuilt = Math.max(worstBuilt, built1);
            if (built1 > SKIN_HEAD_LAT_TO && now <= SKIN_HEAD_LAT_FROM) movedOut++;
          }
        }
      }
    }
    assert.ok(grown >= 2, `${grown} skins with a growing arm`);
    assert.ok(n > 500, `${n} arm-own vertices`);
    assert.ok(worstNow < SKIN_HEAD_LAT_TO, `drawn where it is, the farthest an arm-own vertex lies from its arm's axis is ${worstNow.toFixed(2)} radii: inside the cylinder the dust frame holds in (gone by ${SKIN_HEAD_LAT_TO})`);
    assert.ok(movedOut > 0 && worstBuilt >= SKIN_HEAD_LAT_TO, `at the mesh's built place ${movedOut} of them lay ${worstBuilt.toFixed(2)} radii out, beyond every frame: the block`);
  } finally { scene.dispose(); setSmoothJoins(was); }
});
