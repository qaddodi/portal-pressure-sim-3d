// One program per blend-capable material. three.js keys a ShaderMaterial's program on `material.transparent` (its `opaque` parameter, a `#define OPAQUE` in the fragment prefix: true only while transparent is false AND
// blending is NormalBlending), whether or not the shader reads it. Our vessel, veil and junction-skin shaders never do, but a vessel that fades at a free end or a skin whose arm lies behind the organs flips the flag at run
// time, and each flip was a second program the page had to compile (a second or more on a Mac, several on a phone), the first time that state was reached, mid-motion.
// The root fix: a marked material always uses CustomBlending, so `opaque` is constantly false and there is one program whatever the flag says. The flag still sorts the draw (opaque list or transparent list), and the blend
// factors carry the two states: One/Zero while opaque (what NoBlending drew), the premultiply-free "normal" factors while blended. Nothing is compiled twice and nothing needs warming. `setBlendState` is the only way
// to flip a marked material at run time.
import { clock } from '../../clock/frame.ts';
import { AddEquation, CustomBlending, Mesh, MeshBasicMaterial, OneFactor, OneMinusSrcAlphaFactor, PlaneGeometry, Scene, SrcAlphaFactor, ZeroFactor } from 'three';
import type { BufferGeometry, Camera, Material, Object3D } from 'three';

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
  /** three's synchronous compile of `scene`'s materials, with the lights of `targetScene`: the warm-up uses it one material at a time (below); a stand-in without it is
   *  compiled in one go by `compileAsync`. */
  compile?(scene: Object3D, camera: Camera, targetScene?: Object3D | null): void;
  setRenderTarget?(target: unknown): void;
  getRenderTarget?(): unknown;
}

/** A slice of the warm-up never runs longer than this before the page gets a turn (timers, the cover's note and its buttons, a tap) on a machine where each program takes a while to link. */
export const WARM_SLICE_MS = 40;

/** The meshes, points, lines and sprites of a scene, one for each material (a program is keyed on the material; whatever an object adds to its key is built by the closing `compileAsync`). */
function materialOwners(scene: Object3D): Object3D[] {
  const seen = new Set<Material>(), out: Object3D[] = [];
  scene.traverse((o) => {
    const m = (o as Mesh).material as Material | Material[] | undefined;
    if (!m) return;
    const list = Array.isArray(m) ? m : [m];
    if (list.some((x) => !seen.has(x))) { out.push(o); for (const x of list) seen.add(x); }
  });
  return out;
}

/** The page gets a turn: a macrotask later. A hidden tab does not wait (its timers are throttled to a second each: the compile there goes straight through). */
const pageTurn = (): Promise<void> => (typeof document !== 'undefined' && document.hidden ? Promise.resolve() : new Promise<void>((done) => { clock.afterReal(done, 0, 'warm-slice'); }));

/** Builds every program of the scene once, in SLICES (independent review F12 and the old computer stuck at 96%): without KHR_parallel_shader_compile (software renderers, old
 *  drivers) every link blocks the page, and the
 *   scene's few hundred programs were one block of seconds, or minutes on a weak machine, in which no timer, no note and no button on the cover could run. Each material is
  *  compiled by its own `compile` call, and after
 *   WARM_SLICE_MS of that the page gets a turn and `beat` says the warm-up is getting somewhere (the cover's wait counts it as progress). `compileAsync` then closes it:
  *  every program is cached by then, so it only waits for
 *  the browser's parallel links and builds what a material alone did not key (an instanced or skinned object). A renderer with no `compile` (a test's stand-in) is compiled in one go, as before. */
/** `target`: the render target the figure is drawn into (the post pass's, PostAA.target), or null when it is drawn straight to the canvas. three keys every program on the OUTPUT COLOUR SPACE
 *  (WebGLPrograms.getParameters: the canvas's, sRGB, with no target; the working space, linear, into a render target), and `compile` reads the target at the moment it is called. Warmed with no target
 *  while every frame draws into one, each program built here was a different program from the one the frame asked for: the whole warm-up was wasted, and the first show of every view (the lobule's 14, the
 *  sinusoid's 8, a collateral's 5 ...) linked its programs inside the frame, seconds each on a phone (iPhone audit, 21 Nov: single frames of 1.6 to 3.6 s). The target is bound only for the synchronous
 *  part of the compile call, then put back before any frame can see it. */
export async function warmPrograms(gl: WarmRenderer, scene: Object3D, camera: Camera, target: unknown = null, beat?: () => void): Promise<number> {
  const bound = <T,>(fn: () => T): T => {
    const prev = target && gl.getRenderTarget ? gl.getRenderTarget() : null;
    if (target && gl.setRenderTarget) gl.setRenderTarget(target);
    try { return fn(); } finally { if (target && gl.setRenderTarget) gl.setRenderTarget(prev); }
  };
  if (gl.compile) {
    let from = clock.now();
    for (const o of materialOwners(scene)) {
      try { bound(() => gl.compile!(o, camera, scene)); } catch { /* (the closing compileAsync builds it, or says why it cannot) */ }
      if (clock.now() - from > WARM_SLICE_MS) { await pageTurn(); beat?.(); from = clock.now(); }
    }
  }
  await bound(() => gl.compileAsync(scene, camera));
  return 1;
}

// ---- the passes' programs ------------------------------------------------------------------------------------------------------------------------------------------------------------
// The depth-of-field quads, the glow's blur and lay, the anti-aliasing quad and the uploader's plain material are drawn outside the scene graph (their own one-quad scenes), so `compile(scene)` never saw them and each
// linked its program at its first use: three DoF programs in the first dive (140 to 200 ms on a Mac, the audit's first Lobule frame), two glow programs at the first highlight pick. Their owners hand their
// materials over (`materials`); one hidden quad scene per colour space is compiled with the rest, under the splash (Stage.tsx). A pass added later fails tests/program-warm.test.ts until it is listed.

/** The plain material the geometry uploader draws every hidden geometry with: one, made once, so the warm-up can compile its program (it lived in the uploader's private scene, which no warm-up saw). */
export const uploaderMaterial = new MeshBasicMaterial();

/** A hidden scene with one full-screen quad per material: what `compile` needs to build a pass's program. */
export function passWarmScene(materials: readonly Material[]): Scene {
  const scene = new Scene(), geometry = new PlaneGeometry(2, 2);
  scene.name = 'pass-warm';
  for (const m of materials) { const q = new Mesh(geometry, m); q.name = `pass/${m.name || m.type}`; q.frustumCulled = false; scene.add(q); }
  return scene;
}

/** Every material a pass draws, by the colour space it is drawn into: `target` (a render target: the DoF's three, the glow's two and the uploader's) and `canvas` (the anti-aliasing quad, drawn to the canvas). The one list Stage.tsx compiles. */
export function passMaterials(post: { material: Material; dof: { materials: readonly Material[] } }, glow: { materials: readonly Material[] }): { target: Material[]; canvas: Material[] } {
  return { target: [...post.dof.materials, ...glow.materials, uploaderMaterial], canvas: [post.material] };
}

// ---- the geometries' first upload ---------------------------------------------------------------------------------------------------------------------------------------------------
// `compile` builds PROGRAMS for every material, visible or not, but a geometry's buffers (positions, normals, the shape's dH/dD columns, indices: about 800 000 triangles for the sinusoid, the Circuit's tubes and skins)
// are sent to the GPU by the first draw that includes them. The micro views and the Circuit are hidden until chosen, so that first draw was the first frame of the view: 180 to 390 ms on an iPhone (audit 21 Nov:
// 'render: pass 1' and 'vessel layer' laps, the entries' stalls). `GeometryUploader` draws each hidden geometry once, one per call, with a plain material into a 1 x 1 target, in the idle slices after the build:
// three keys the upload on the geometry itself, so the view's own first frame finds every buffer on the card.

/** The part of the renderer the upload uses (so a test can hand it a stand-in). */
export interface UploadRenderer {
  render(scene: Object3D, camera: Camera): void;
  getRenderTarget(): unknown;
  setRenderTarget(target: unknown): void;
}

/** The geometries of `root` that no frame has drawn: a mesh under a hidden object (visible false somewhere up its chain), each once. */
export function hiddenGeometries(root: Object3D, seen: WeakSet<BufferGeometry> = new WeakSet()): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const walk = (o: Object3D, shown: boolean): void => {
    const here = shown && o.visible;
    const m = o as Mesh;
    if (m.isMesh && !here && m.geometry && !seen.has(m.geometry)) { seen.add(m.geometry); out.push(m.geometry); }
    for (const c of o.children) walk(c, here);
  };
  walk(root, true);
  return out;
}

export class GeometryUploader {
  private queue: BufferGeometry[] = [];
  private readonly done = new WeakSet<BufferGeometry>();
  private readonly scene = new Scene();
  private readonly mesh = new Mesh(undefined, uploaderMaterial);
  private readonly gl: UploadRenderer;
  private readonly camera: Camera;
  private readonly target: unknown;
  constructor(gl: UploadRenderer, camera: Camera, target: unknown) {
    this.gl = gl; this.camera = camera; this.target = target;
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  /** Adds the not-yet-drawn geometries under `root` to the queue. */
  add(root: Object3D): void { this.queue.push(...hiddenGeometries(root, this.done)); }
  get pending(): number { return this.queue.length; }
  /** Uploads one geometry; true while more are queued. */
  step(): boolean {
    const g = this.queue.shift();
    if (!g) return false;
    this.mesh.geometry = g;
    const prev = this.gl.getRenderTarget();
    this.gl.setRenderTarget(this.target);
    try { this.gl.render(this.scene, this.camera); } finally { this.gl.setRenderTarget(prev); }
    return this.queue.length > 0;
  }
  dispose(): void { this.queue = []; }   // (the material is shared with the warm-up and stays)
}
