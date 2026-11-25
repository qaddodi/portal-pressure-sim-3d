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
import { skinNormalTwin, skinNormalGlsl, skinShadeK, SKIN_SHADE_FLOOR_PX, SKIN_SHADE_K, SKIN_RING_W_FROM, type TwinArm } from '../src/scene/vessels/skin/exact-normal.ts';
import { SKIN_ARM_ABSENT, SKIN_FS } from '../src/scene/vessels/skin/shaders.ts';

/** The far view the continuity check samples at: scene units to one CSS pixel (the whole figure on a phone) and the bound on how far a drawn normal may stray from its neighbours' chord at one sample per pixel. */
const REF_SCENE_PER_PX = 0.006, CONT_MAX_DEG = 12;
const deg = (a: readonly number[], b: readonly number[]): number => Math.acos(Math.max(-1, Math.min(1, a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!))) * 180 / Math.PI;

test('every skin: the pixel normal is the smooth union\'s own gradient (rest, a narrowed arm, an absent arm), and a seam ring keeps the tube\'s normal', () => {
  setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  const inner: number[] = [];
  let skins = 0, worstInterp = 0, worstSeam = 1, mates = 0, thin = 0, contFloor = 0, contBare = 0;
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
        inner.push(dd);
      }
      // the drawn normal's continuity at a far view (REF_SCENE_PER_PX scene units to a CSS px): along every inner mesh edge, one sample per CSS px, how far each sample's normal strays from the
      // chord of its two neighbours. A smooth ramp strays by nothing; a ridge narrower than a pixel is one sample of the crotch's own normal between two that agree (the dark line). Only a skin whose
      // blend is narrower than the floor at this scale (thin) can show it, so only those are judged, with the floor and then, to prove the check sees the line, without it.
      if (skinShadeK(k, REF_SCENE_PER_PX) > kS * 1.15) {
        thin++;
        const T = twin(one, []), seen = new Set<number>();
        const worstOf = (kk: number): number => {
          let worst = 0;
          for (let t = 0; t < mesh.index.length; t += 3) for (let e = 0; e < 3; e++) {
            const a = mesh.index[t + e]!, b = mesh.index[t + (e + 1) % 3]!, key = Math.min(a, b) * nV + Math.max(a, b);
            if (seen.has(key + kk) || ring.has(a) || ring.has(b)) continue;
            seen.add(key + kk);
            const A0 = [0, 1, 2].map((d) => mesh.position[3 * a + d]!), B0 = [0, 1, 2].map((d) => mesh.position[3 * b + d]!);
            const n = Math.max(2, Math.ceil(Math.hypot(B0[0]! - A0[0]!, B0[1]! - A0[1]!, B0[2]! - A0[2]!) / REF_SCENE_PER_PX)), ns: number[][] = [];
            for (let i = 0; i <= n; i++) ns.push(skinNormalTwin(T, kk, ...([0, 1, 2].map((d) => A0[d]! + (B0[d]! - A0[d]!) * i / n) as [number, number, number]), SKIN_ARM_ABSENT));
            for (let i = 1; i < n; i++) {
              const m = [0, 1, 2].map((d) => ns[i - 1]![d]! + ns[i + 1]![d]!), l = Math.hypot(m[0]!, m[1]!, m[2]!) || 1;
              worst = Math.max(worst, deg(ns[i]!, m.map((x) => x / l)));
            }
          }
          return worst;
        };
        contFloor = Math.max(contFloor, worstOf(skinShadeK(k, REF_SCENE_PER_PX)));
        contBare = Math.max(contBare, worstOf(kS));
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
    assert.ok(at(0.9) < 11 && at(0.99) < 22, `the pixel normal against the eased vertex normals: p90 ${at(0.9).toFixed(1)}, p99 ${at(0.99).toFixed(1)} degrees`);
  // (a single worst vertex is not a bound: where two small arms cross, the eased mesh normal and the surface's own normal can differ a lot at one point without anything being drawn wrong; what is drawn is judged by its continuity)
  assert.ok(thin >= 3, `${thin} skins have a blend narrower than ${SKIN_SHADE_FLOOR_PX} px at the far view`);
  assert.ok(contFloor < CONT_MAX_DEG, `with the floor, the drawn normal of a thin ridge strays ${contFloor.toFixed(1)} degrees from its neighbours at one sample per px (bound ${CONT_MAX_DEG})`);
  assert.ok(contBare > CONT_MAX_DEG, `without the floor, a ridge thinner than a pixel shows (${contBare.toFixed(1)} degrees, over ${CONT_MAX_DEG}): this check sees the dark line the floor ends`);
});

test('the shader takes the normal from the union\'s gradient at the pixel, before any derivative or discard', () => {
  assert.match(SKIN_FS, /vec3 skinNormalExact\(vec3 p, float k, vec3 fallback\)/);
  const main = SKIN_FS.slice(SKIN_FS.indexOf('void main('));
  const at = main.indexOf('skinNormalExact(vPos, max(skinK');
  assert.ok(at > 0, 'main reads it');
  assert.ok(at < main.indexOf('fwidth(sT)') && at < main.indexOf('discard'), 'before the derivative of the shade and before the first discard');
  // the shade's blend: 1.5 k, and never narrower than SKIN_SHADE_FLOOR_PX of the screen (a ridge thinner than a pixel is drawn as a one-pixel line of the crotch's own normal: the dark line this fix was made to end)
  // placed only: k itself, the drawn surface's own blend (a 1.5 k union read normals up to 27 degrees off the placed surface and shaded the crotches darker than both arms)
  assert.equal(SKIN_SHADE_K, 1);
  assert.match(main, /skinNormalExact\(vPos, max\(skinK \* 1\.0, 2\.0 \* vCenW \* 2\.0 \/ \(res\.y \* projY\) \* 1\.0\), vec3\(0\.0\)\)/);
  assert.equal(SKIN_SHADE_FLOOR_PX, 2);
  assert.equal(skinShadeK(0.004, 0.0015), 0.004, 'at a laptop\'s zoom k is already wider than two pixels: nothing changes');
  assert.equal(skinShadeK(0.004, 0.004), 0.008, 'on a phone\'s fit two pixels are wider: the shade reads the union there');
  assert.equal(skinShadeK(0, 0.004), 0.008, 'a skin with no blend at all is still given the floor');
  // placed only: the mesh's normal is kept by rows from the seam (vRest.y, exact-normal.ts skinTubeKeep), not by the weight alone
  assert.match(main, /n = normalize\(mix\(n, normalize\(mat3\(modelViewMatrix\) \* gx\), \(1\.0 - \(smoothstep\(0\.0, 1\.0, vRest\.y\) \* smoothstep\(0\.2, 0\.6, wTop\)\)\)\)\)/);
  assert.equal(SKIN_RING_W_FROM, 0.97);
  // the same rules as the CPU: arm order, the run's halves as a minimum first, the absent arm held out of reach by the outline's own smoothstep
  const g = skinNormalGlsl(6, 4, (sw) => `ABS(${sw})`);
  assert.match(g, /if \(m > -0\.5 && m < float\(i\) - 0\.5\) continue;/);
  assert.match(g, /if \(o < b\) \{ b = o; ug = mg; \}/);
  assert.match(g, /2\.0 \* k \* \(1\.0 - ABS\(swi\) \* 1\.0\)/);
  // the arms that are not there (keepOf, the outline's own rule) leave the union the shade reads: their stub is not shaded as a stub
  assert.match(skinNormalGlsl(6, 4, (sw) => `ABS(${sw})`, (arm) => `KEPT(${arm})`), /2\.0 \* k \* \(1\.0 - ABS\(swi\) \* KEPT\(i\)\)/);
  assert.match(skinNormalGlsl(6, 4, (sw) => `ABS(${sw})`, (arm) => `KEPT(${arm})`), /\(1\.0 - ABS\(swm\) \* KEPT\(mi\)\)/);
  assert.match(SKIN_FS, /skinNormalExact/);
  assert.match(SKIN_FS, /\(1\.0 - smoothstep\(0\.0, [0-9.]+, swi\) \* keepOf\(i\)\)/);
});
