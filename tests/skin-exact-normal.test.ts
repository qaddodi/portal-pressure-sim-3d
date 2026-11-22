// Mohammad, 20 Nov: "ragged torn edge" at the hepatic veins' mouths: the cel shade's hard threshold, the lens lanes and the dust's across are all contours of the pixel's NORMAL, and the skin gave the fragment stage its vertices'
// normals lerped over a triangle, which across a fillet are wrong by tens of degrees (ROOT CAUSE, exact-normal.ts). The pixel now takes the smooth union's own gradient. Pinned here: the twin of the shader's function is the CPU's
// sdUnionGrad (the gradient the vertices' normals were sampled from) on every built skin, at rest, with an arm's width changed and with an arm absent; on a seam ring it is the tube's own normal; and the shader reads it before any derivative.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';
import { sdUnionGrad, skinKOf, type Capsule } from '../src/scene/vessels/skin/sdf.ts';
import { skinNormalTwin, skinNormalGlsl, SKIN_SHADE_K, SKIN_RING_W_FROM, type TwinArm } from '../src/scene/vessels/skin/exact-normal.ts';
import { SKIN_ARM_ABSENT, SKIN_FS } from '../src/scene/vessels/skin/shaders.ts';

const deg = (a: readonly number[], b: readonly number[]): number => Math.acos(Math.max(-1, Math.min(1, a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!))) * 180 / Math.PI;

test('every skin: the pixel normal is the smooth union\'s own gradient (rest, a narrowed arm, an absent arm), and a seam ring keeps the tube\'s normal', () => {
  setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  const inner: number[] = [];
  let skins = 0, worstInterp = 0, worstSeam = 1, worstInner = 0, mates = 0;
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh, axes, arms) => {
      skins++;
      const A = axes.length, k = skinKOf(mesh.junction.arms);
      const caps = (sw: number[]): Capsule[] => axes.map((a, i) => ({ n: a.pts.length, pts: Float64Array.from(a.pts.flat()), r: Float64Array.from(a.radii, (r) => r * sw[i]!), mate: a.mate }));
      const twin = (sw: number[], off: number[]): TwinArm[] => axes.map((a, i) => ({ pts: a.pts.flat(), r: a.radii, mate: a.mate, sw: sw[i], off: off.includes(i) }));
      if (axes.some((a) => (a.mate ?? -1) >= 0)) mates++;
      const g = [0, 0, 0], one = Array<number>(A).fill(1), narrowed = one.map((_, i) => (i % 2 ? 0.7 : 1.2));
      const nV = mesh.position.length / 3;
      for (let t = 0; t < mesh.index.length; t += 3) {
        const v = [mesh.index[t]!, mesh.index[t + 1]!, mesh.index[t + 2]!];
        for (const [a, b, c] of [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.3, 0.1], [0.1, 0.2, 0.7]] as const) {
          const w = [a, b, c], P = [0, 1, 2].map((d) => v.reduce((s, vi, q) => s + w[q]! * mesh.position[3 * vi + d]!, 0)) as [number, number, number];
          const interp = [0, 1, 2].map((d) => v.reduce((s, vi, q) => s + w[q]! * mesh.normal[3 * vi + d]!, 0)), il = Math.hypot(interp[0]!, interp[1]!, interp[2]!);
          sdUnionGrad(caps(one), k, P[0], P[1], P[2], g);
          const gl = Math.hypot(g[0]!, g[1]!, g[2]!), ref = [g[0]! / gl, g[1]! / gl, g[2]! / gl];
          assert.ok(deg(skinNormalTwin(twin(one, []), k, P[0], P[1], P[2], SKIN_ARM_ABSENT), ref) < 0.01, `${mesh.junction.node}: the twin is sdUnionGrad at rest`);
          worstInterp = Math.max(worstInterp, deg(interp.map((x) => x / il), ref));
          if ((t / 3 + Math.round(a * 10)) % 7 === 0) {   // (a sample of the triangles for the changed-width cases: the CPU gradient is the same function with the radii scaled)
            sdUnionGrad(caps(narrowed), k, P[0], P[1], P[2], g);
            const l2 = Math.hypot(g[0]!, g[1]!, g[2]!);
            // (the shader also holds an arm of nearly no width out of reach, which the CPU union does not: only widths of 0.7 and 1.2, well past SKIN_ARM_ABSENT)
            assert.ok(deg(skinNormalTwin(twin(narrowed, []), k, P[0], P[1], P[2], SKIN_ARM_ABSENT), [g[0]! / l2, g[1]! / l2, g[2]! / l2]) < 0.01, `${mesh.junction.node}: the twin follows an arm's live width`);
          }
        }
      }
      // an absent arm is held out of reach: the union of the others (the plain skin without it), as the outline's own rule
      if (A >= 3) {
        const keep = axes.map((_, i) => i).filter((i) => i !== A - 1 && (axes[i]!.mate ?? -1) !== A - 1 && (axes[A - 1]!.mate ?? -1) !== i);
        if (keep.length === A - 1) {
          const c2 = keep.map((i) => caps(one)[i]!).map((c, q) => ({ ...c, mate: undefined as number | undefined, n: c.n, q }));
          const P = [mesh.position[0]!, mesh.position[1]!, mesh.position[2]!];
          const off = twin(one, [A - 1]).map((x) => ({ ...x, mate: undefined }));
          const keepArms = keep.map((i) => off[i]!);
          sdUnionGrad(c2 as Capsule[], k, P[0]!, P[1]!, P[2]!, g);
          const gl = Math.hypot(g[0]!, g[1]!, g[2]!);
          if (axes.every((a) => (a.mate ?? -1) < 0) && gl > 1e-6) assert.ok(deg(skinNormalTwin(keepArms, k, P[0]!, P[1]!, P[2]!, SKIN_ARM_ABSENT), [g[0]! / gl, g[1]! / gl, g[2]! / gl]) < 0.01, `${mesh.junction.node}: an absent arm is not in the union`);
        }
      }
      // a seam ring: its vertices belong wholly to their own arm (weight 1), so the pixel there keeps the lerped TUBE normal (SKIN_RING_W_FROM); every other vertex's normal is the union's gradient eased in creases by how the triangles lie, which is
      // what the pixel's own softening is measured against
      const ring = new Set(mesh.seamVerts.flatMap((a) => [...a])), kS = k * SKIN_SHADE_K;
      for (let vi = 0; vi < nV; vi++) {
        if (ring.has(vi)) { const top = Math.max(mesh.weight[4 * vi]!, mesh.weight[4 * vi + 1]!, mesh.weight[4 * vi + 2]!, mesh.weight[4 * vi + 3]!, mesh.weight2[2 * vi]!, mesh.weight2[2 * vi + 1]!); worstSeam = Math.min(worstSeam, top); continue; }
        const e = skinNormalTwin(twin(one, []), kS, mesh.position[3 * vi]!, mesh.position[3 * vi + 1]!, mesh.position[3 * vi + 2]!, SKIN_ARM_ABSENT);
        const dd = deg(e, [mesh.normal[3 * vi]!, mesh.normal[3 * vi + 1]!, mesh.normal[3 * vi + 2]!]);
        inner.push(dd); worstInner = Math.max(worstInner, dd);
      }
      return new SkinObject(mesh, arms[0]!, axes, arms);
    },
    add: (o: Object3D) => new Group().add(o), remove: () => {}, warn: () => {},
  });
  set.build(2);
  assert.ok(skins >= 9, `${skins} skins built`);
  assert.ok(mates >= 1, 'a skin with a run through the node was checked');
  assert.ok(worstInterp > 15, `the vertices' normals lerped over a triangle are wrong by ${worstInterp.toFixed(0)} degrees somewhere (that is what the pixel no longer reads)`);
  assert.ok(worstSeam >= 1 - 1e-6, `every seam ring vertex has weight 1 (so its pixel keeps the tube's normal): lowest ${worstSeam.toFixed(4)}`);
  // the mesh's own shade normals are the gradient eased in creases by how the triangles lie; the pixel's is the same softening as a property of the surface, so it stays near them (and no ring correction is carried past the rings)
  inner.sort((a, b) => a - b);
  const at = (p: number): number => inner[Math.floor(p * (inner.length - 1))]!;
  // (the quantiles are the guard: p90 and p99 are the whole surface. The single worst vertex over every skin is a crease outlier that moves a few degrees whenever any course moves a little: 47.7 degrees before the cava was straightened (aaa40673), 54.3 on that commit, 51 at the tip; 55 keeps it from being a coin toss without letting a systematic error through, which the quantiles would show first)
  assert.ok(at(0.9) < 11 && at(0.99) < 22 && worstInner < 55, `the pixel normal against the eased vertex normals: p90 ${at(0.9).toFixed(1)}, p99 ${at(0.99).toFixed(1)}, max ${worstInner.toFixed(0)} degrees`);
});

test('the shader takes the normal from the union\'s gradient at the pixel, before any derivative or discard', () => {
  assert.match(SKIN_FS, /vec3 skinNormalExact\(vec3 p, float k, vec3 fallback\)/);
  const main = SKIN_FS.slice(SKIN_FS.indexOf('void main('));
  const at = main.indexOf('skinNormalExact(vPos, skinK');
  assert.ok(at > 0, 'main reads it');
  assert.ok(at < main.indexOf('fwidth(sT)') && at < main.indexOf('discard'), 'before the derivative of the shade and before the first discard');
  assert.match(main, /skinNormalExact\(vPos, skinK \* 1\.5, vec3\(0\.0\)\)/);
  assert.match(main, /n = normalize\(mix\(n, normalize\(mat3\(modelViewMatrix\) \* gx\), \(1\.0 - smoothstep\(0\.97, 1\.0, wTop\)\)\)\)/);
  assert.equal(SKIN_RING_W_FROM, 0.97);
  // the same rules as the CPU: arm order, the run's halves as a minimum first, the absent arm held out of reach by the outline's own smoothstep
  const g = skinNormalGlsl(6, 4, (sw) => `ABS(${sw})`);
  assert.match(g, /if \(m > -0\.5 && m < float\(i\) - 0\.5\) continue;/);
  assert.match(g, /if \(o < b\) \{ b = o; ug = mg; \}/);
  assert.match(g, /2\.0 \* k \* \(1\.0 - ABS\(swi\)\)/);
});
