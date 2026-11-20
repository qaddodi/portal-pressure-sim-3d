// Warming the programs a material changes into at run time. three.js keys a ShaderMaterial's program on `material.transparent` (its `opaque` parameter, a `#define OPAQUE` in the fragment prefix), whether or not the shader
// reads it: our vessel, veil and junction-skin shaders never do, but a vessel that fades at a free end, a skin whose arm lies behind the organs, flips the flag at run time, and the flip is a program the page has never
// compiled: one driver compile (a second or more for these shaders on a Mac, several on a phone) in the middle of whatever was moving, the first time that state is reached. The Circuit's first change did it: its skins
// (three programs each) flip as the map's tubes fade. So the one warm-up at boot (Stage.tsx) compiles each program in its other blend state too, one program at a time in the gaps between frames, never leaving a flag flipped
// across a frame: `warmPrograms`.
import type { Camera, Material, Mesh, Object3D, ShaderMaterial } from 'three';

/** Marks a material whose `transparent` flag changes while the page runs (its other blend state is warmed too). */
export function markBlends<T extends Material>(m: T): T { m.userData.blends = true; return m; }

/** The part of three's WebGLRenderer the warm-up uses (so a test can hand it a stand-in). */
export interface WarmRenderer {
  compile(scene: Object3D, camera: Camera, target?: Object3D): unknown;
  compileAsync(scene: Object3D, camera: Camera, target?: Object3D): Promise<unknown>;
}

const isShader = (m: unknown): m is ShaderMaterial => !!m && (m as ShaderMaterial).isShaderMaterial === true;

/** One mesh for each distinct program among the materials marked `markBlends` (the same shaders, defines, side and blend state are one program: its other state is warmed once, every other material of it finds it built). */
export function blendWarmups(root: Object3D): { mesh: Mesh; mat: ShaderMaterial }[] {
  const seen = new Map<string, { mesh: Mesh; mat: ShaderMaterial }>();
  root.traverse((o) => {
    const mesh = o as Mesh, m = mesh.material as Material | Material[] | undefined;
    if (!mesh.isMesh || !isShader(m) || !m.userData.blends) return;
    const key = [m.vertexShader.length, m.fragmentShader.length, JSON.stringify(m.defines ?? {}), m.side, m.transparent, m.name].join('|');
    if (!seen.has(key)) seen.set(key, { mesh, mat: m });
  });
  return [...seen.values()];
}

/** Builds every program of the scene (`compileAsync`), then each marked material's program in its other blend state: the flag is flipped only for the synchronous `compile` call (which asks the driver, and returns; the link runs
 *  beside the page), and put back before any frame can see it. `gap`: the wait between two programs, so a driver that compiles on the page's own thread is never asked for two at once. */
export async function warmPrograms(gl: WarmRenderer, scene: Object3D, camera: Camera, gap: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<number> {
  await gl.compileAsync(scene, camera);
  let n = 0;
  for (const { mesh, mat } of blendWarmups(scene)) {
    const was = mat.transparent;
    mat.transparent = !was;
    try { gl.compile(mesh, camera, scene); n++; } finally { mat.transparent = was; }
    await gap(24);
  }
  return n;
}
