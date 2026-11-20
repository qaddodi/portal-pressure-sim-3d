// Mohammad, 20 Nov: "there are holes in the SMV" (teardrop holes in the trunk of the skins, the organ showing through, ragged edges). Root cause (skin/mesh.ts, the growing arms' closed shape): every vertex of a closed collateral or shunt
// was put on the NEAREST point of the trunk, so every row of the arm's sleeve landed on the same circle of the wall: the rows folded onto one another (9 to 40 triangles per skin turned against their own normals, which the fragment stage
// discards as back faces) and the arm's footprint was left with no triangle facing out. The closed arm is now laid on its footprint as a flattened cone (ring at the centre, rows between, relaxed with the fillet held).
// Pinned over EVERY skin that has a growing arm, in the state a figure starts in (every arm closed): the footprint is covered by triangles that face out, and no triangle of any size that counts is turned against its normals, at the closed shape, half
// grown and fully grown. (A triangle smaller than 1% of the narrowest radius squared is under a pixel and is not counted: the ring's fourteen vertices all lie at the footprint's centre when closed, so the few triangles around it have no area.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';
import { sdUnionGrad, skinKOf, type Capsule } from '../src/scene/vessels/skin/sdf.ts';
import { foldedTriangles } from '../src/scene/vessels/skin/mesh.ts';
import type { SkinMesh } from '../src/scene/vessels/skin/types.ts';

const built: Array<{ mesh: SkinMesh; caps: Capsule[] }> = [];
function build(): void {
  if (built.length) return;
  setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh, axes, arms) => { built.push({ mesh, caps: axes.map((a) => ({ n: a.pts.length, pts: Float64Array.from(a.pts.flat()), r: Float64Array.from(a.radii), mate: a.mate })) }); return new SkinObject(mesh, arms[0]!, axes, arms); },
    add: (o: Object3D) => new Group().add(o), remove: () => {}, warn: () => {},
  });
  set.build(2);
}

/** The mesh with each growing arm at growth g[k] (the vertex stage's morph: P1 less (1 - g) times the difference). */
function atGrowth(mesh: SkinMesh, g: number): { position: Float64Array; normal: Float64Array } {
  const position = Float64Array.from(mesh.position), normal = Float64Array.from(mesh.normal);
  for (const m of mesh.grow) { const q = 1 - g; for (let i = 0; i < position.length; i++) { position[i]! -= q * m.dPos[i]!; normal[i]! -= q * m.dNor[i]!; } }
  return { position, normal };
}

test('every growing arm, closed: its footprint on the trunk is covered by triangles that face out', () => {
  build();
  let arms = 0;
  for (const { mesh, caps } of built) {
    const n = 14, k = skinKOf(mesh.junction.arms), { position } = atGrowth(mesh, 0), I = mesh.index;
    for (const m of mesh.grow) {
      arms++;
      const a = m.arm, capsT = caps.filter((_, i) => i !== a), R = mesh.junction.arms[a]!.restR;
      const rc = [0, 0, 0];
      for (let q = 0; q < n; q++) for (let c = 0; c < 3; c++) rc[c]! += mesh.position[3 * (a * n + q) + c]! / n;
      const g = new Float64Array(3);
      let p = rc.slice();
      for (let s = 0; s < 12; s++) { const d = sdUnionGrad(capsT, k, p[0]!, p[1]!, p[2]!, g), gg = g[0]! ** 2 + g[1]! ** 2 + g[2]! ** 2; if (gg < 1e-14) break; p = [p[0]! - (d * g[0]!) / gg, p[1]! - (d * g[1]!) / gg, p[2]! - (d * g[2]!) / gg]; }
      sdUnionGrad(capsT, k, p[0]!, p[1]!, p[2]!, g);
      const gl = Math.hypot(g[0]!, g[1]!, g[2]!), nn = [g[0]! / gl, g[1]! / gl, g[2]! / gl];
      const h = Math.abs(nn[0]!) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const c1 = [nn[1]! * h[2]! - nn[2]! * h[1]!, nn[2]! * h[0]! - nn[0]! * h[2]!, nn[0]! * h[1]! - nn[1]! * h[0]!], l1 = Math.hypot(c1[0]!, c1[1]!, c1[2]!);
      const t1 = [c1[0]! / l1, c1[1]! / l1, c1[2]! / l1], t2 = [nn[1]! * t1[2]! - nn[2]! * t1[1]!, nn[2]! * t1[0]! - nn[0]! * t1[2]!, nn[0]! * t1[1]! - nn[1]! * t1[0]!];
      const rad = 0.5 * Math.min(R, ...mesh.junction.arms.filter((_, i) => i !== a).map((x) => x.restR));
      const tri: number[][][] = [];
      for (let t = 0; t < I.length; t += 3) {
        const pr = (v: number): number[] => { const d = [0, 1, 2].map((c) => position[3 * v + c]! - p[c]!); return [d[0]! * t1[0]! + d[1]! * t1[1]! + d[2]! * t1[2]!, d[0]! * t2[0]! + d[1]! * t2[1]! + d[2]! * t2[2]!, d[0]! * nn[0]! + d[1]! * nn[1]! + d[2]! * nn[2]!]; };
        const A = pr(I[t]!), B = pr(I[t + 1]!), C = pr(I[t + 2]!);
        if (Math.max(Math.abs(A[2]!), Math.abs(B[2]!), Math.abs(C[2]!)) < 4 * R) tri.push([A, B, C]);
      }
      let samples = 0, covered = 0;
      const N = 12;
      for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
        const u = (i / N) * rad, w = (j / N) * rad;
        if (u * u + w * w > rad * rad) continue;
        samples++;
        if (tri.some(([A, B, C]) => {
          const ar = (B![0]! - A![0]!) * (C![1]! - A![1]!) - (B![1]! - A![1]!) * (C![0]! - A![0]!);
          if (ar <= 0) return false;   // (counter-clockwise from the outward normal: facing out)
          return (B![0]! - u) * (C![1]! - w) - (B![1]! - w) * (C![0]! - u) >= 0 && (C![0]! - u) * (A![1]! - w) - (C![1]! - w) * (A![0]! - u) >= 0 && (A![0]! - u) * (B![1]! - w) - (A![1]! - w) * (B![0]! - u) >= 0;
        })) covered++;
      }
      assert.ok(covered >= 0.98 * samples, `${mesh.junction.node}: the closed ${mesh.junction.arms[a]!.vesselId} leaves ${samples - covered} of ${samples} footprint samples with no triangle facing out (a hole in the trunk)`);
    }
  }
  assert.ok(arms >= 6, `${arms} growing arms checked`);
});

test('every skin: no triangle that counts is turned against its own normals, with its growing arms closed, half grown and fully grown', () => {
  build();
  for (const { mesh } of built) {
    const rmin = Math.min(...mesh.junction.arms.map((a) => a.restR));
    for (const g of mesh.grow.length ? [0, 0.5, 0.75, 1] : [1]) {
      const { position, normal } = atGrowth(mesh, g);
      const bad = foldedTriangles(position, normal, mesh.index).filter((t) => {
        const a = mesh.index[3 * t]!, b = mesh.index[3 * t + 1]!, c = mesh.index[3 * t + 2]!;
        const u = [0, 1, 2].map((q) => position[3 * b + q]! - position[3 * a + q]!), v = [0, 1, 2].map((q) => position[3 * c + q]! - position[3 * a + q]!);
        const area = Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!) / 2;
        return area > 0.01 * rmin * rmin;
      });
      assert.equal(bad.length, 0, `${mesh.junction.node} at growth ${g}: ${bad.length} triangles are turned against their normals (the fragment stage discards them: holes)`);
    }
  }
});
