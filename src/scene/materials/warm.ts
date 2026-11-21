// One program per blend-capable material. three.js keys a ShaderMaterial's program on `material.transparent` (its `opaque` parameter, a `#define OPAQUE` in the fragment prefix: true only while transparent is false AND
// blending is NormalBlending), whether or not the shader reads it. Our vessel, veil and junction-skin shaders never do, but a vessel that fades at a free end or a skin whose arm lies behind the organs flips the flag at run
// time, and each flip was a second program the page had to compile (a second or more on a Mac, several on a phone), the first time that state was reached, mid-motion.
// The root fix: a marked material always uses CustomBlending, so `opaque` is constantly false and there is one program whatever the flag says. The flag still sorts the draw (opaque list or transparent list), and the blend
// factors carry the two states: One/Zero while opaque (what NoBlending drew), the premultiply-free "normal" factors while blended. Nothing is compiled twice and nothing needs warming. `setBlendState` is the only way
// to flip a marked material at run time.
import { AddEquation, CustomBlending, OneFactor, OneMinusSrcAlphaFactor, SrcAlphaFactor, ZeroFactor } from 'three';
import type { Camera, Material, Object3D } from 'three';

/** Puts a material in one blend state: `transparent` (draw order) and the factors that go with it. The program does not change. */
export function setBlendState<T extends Material>(m: T, on: boolean): T {
  if (m.transparent !== on) m.transparent = on;
  const src = on ? SrcAlphaFactor : OneFactor, dst = on ? OneMinusSrcAlphaFactor : ZeroFactor, dstA = on ? OneMinusSrcAlphaFactor : ZeroFactor;
  if (m.blendSrc !== src) m.blendSrc = src;
  if (m.blendDst !== dst) m.blendDst = dst;
  if (m.blendDstAlpha !== dstA) m.blendDstAlpha = dstA;
  return m;
}

/** Marks a material whose `transparent` flag changes while the page runs: it blends through CustomBlending (one program for both states, see above) and is flipped with `setBlendState`. */
export function markBlends<T extends Material>(m: T): T {
  m.userData.blends = true;
  m.blending = CustomBlending; m.blendEquation = AddEquation; m.blendEquationAlpha = null;
  m.blendSrcAlpha = OneFactor;
  return setBlendState(m, m.transparent);
}

/** The part of three's WebGLRenderer the warm-up uses (so a test can hand it a stand-in). */
export interface WarmRenderer {
  compileAsync(scene: Object3D, camera: Camera, target?: Object3D): Promise<unknown>;
}

/** Builds every program of the scene (`compileAsync`) once. Blend states share a program, so there is no second pass. */
export async function warmPrograms(gl: WarmRenderer, scene: Object3D, camera: Camera): Promise<number> {
  await gl.compileAsync(scene, camera);
  return 1;
}
