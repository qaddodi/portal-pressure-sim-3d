// Fail loud, not invisible (docs/atlas-look-plan.md section 8.1, layer 3). When a device's driver refuses a program, three.js calls renderer.debug.onShaderError and then draws
// nothing with it: every vessel vanished on an iPhone that way on 19 Nov and the page said nothing. The guard answers that call: the meshes that wore the failing program are
// drawn plain (a flat material in the part's own tone colour: a vessel is a plain tube, a hidden veil is simply not drawn), the failure is remembered (shader-fail.ts: the ?perf bar
// shows a red pill, the bug packet carries it) and a frame is asked for. A broken shader then looks plain, not missing.
import { type Material, type Mesh, type Object3D, type ShaderMaterial, Color, DoubleSide, MeshBasicMaterial } from 'three';
import { reportShaderFailure } from './shader-fail.ts';

/** The part of three's WebGLRenderer the guard uses (so a test can hand it a stand-in). */
export interface GuardRenderer {
  debug: { onShaderError: unknown };
  properties: { get(o: Material): unknown };
}
interface GuardGL {
  getShaderInfoLog(s: unknown): string | null;
  getProgramInfoLog(p: unknown): string | null;
}

const isShader = (m: Material | undefined): m is ShaderMaterial => !!m && (m as ShaderMaterial).isShaderMaterial === true;

/** The flat material a failed program is drawn with: its `color` uniform (the part's tone, written in sRGB as the cel shaders do) shown as that colour. */
export function plainFor(m: ShaderMaterial): MeshBasicMaterial {
  const u = m.uniforms as Record<string, { value?: unknown } | undefined>;
  const c = u.color?.value ?? u.inkColor?.value;
  const colour = c instanceof Color ? c.clone().convertSRGBToLinear() : new Color(0x888888);
  return new MeshBasicMaterial({ color: colour, side: DoubleSide, name: 'plain (shader failed)' });
}

/** The kind a failure is filed under: a vessel's program has the `inkColor` uniform, the rest are named by the material or the mesh. */
export const kindOf = (m: ShaderMaterial, mesh: Object3D): string => (m.name === 'skin' ? 'skin' : (m.uniforms as Record<string, unknown>).inkColor ? 'vessel' : m.name || mesh.name || 'scene');   // (a junction skin shares the vessels' ink uniform but is its own program)

/** `extras`: materials drawn outside the scene graph (the anti-aliasing pass's); one whose program is refused is told through its `userData.onFail`. */
export function installShaderGuard(renderer: GuardRenderer, root: Object3D, after: () => void = () => undefined, extras: () => readonly Material[] = () => []): () => void {
  const before = renderer.debug.onShaderError;
  const handler = (gl: GuardGL, program: unknown, vs: unknown, fs: unknown): void => {
    const log = [gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs), gl.getProgramInfoLog(program)].map((s) => (s ?? '').trim()).filter(Boolean).join('\n');
    const worn: { mesh: Mesh; m: ShaderMaterial }[] = [];
    root.traverse((o) => {
      const m = (o as Mesh).material as Material | undefined;
      if (isShader(m) && (renderer.properties.get(m) as { currentProgram?: { program?: unknown } } | undefined)?.currentProgram?.program === program) worn.push({ mesh: o as Mesh, m });
    });
    const lent: Material[] = [];
    for (const m of extras()) if ((renderer.properties.get(m) as { currentProgram?: { program?: unknown } } | undefined)?.currentProgram?.program === program) { lent.push(m); (m.userData as { onFail?: () => void }).onFail?.(); }
    for (const { mesh, m } of worn) {
      // a veil (the faint copy over the organs, and its depth-only pass) has no plain form worth drawing: the solid tube it veils is drawn
      const d = m.defines as Record<string, unknown> | undefined;
      if (d?.VEIL || (m.name === 'skin' && d?.SKIN_COPY === 2) || m.name === 'pool' || m.name === 'pool-top') mesh.visible = false;   // (a skin's veil copy likewise; and the ascites pool, a grey slab over the belly if drawn plain: the 2D-flat figure without it is the lesser harm)
      else mesh.material = plainFor(m);
    }
    reportShaderFailure({ kind: worn.length ? kindOf(worn[0]!.m, worn[0]!.mesh) : lent.length ? lent[0]!.name || 'post aa' : 'scene', meshes: worn.length + lent.length, log });
    console.error(`[shader] a program the device refused; ${worn.length} mesh(es) drawn plain${lent.length ? `, the ${lent[0]!.name || 'post aa'} pass is off` : ''}\n${log}`);
    after();
  };
  renderer.debug.onShaderError = handler;
  return () => { if (renderer.debug.onShaderError === handler) renderer.debug.onShaderError = before; };
}
