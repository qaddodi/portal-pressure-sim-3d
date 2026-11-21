// The ?gl check's work: compile every program the app can use on THIS device's driver and say, per program, green or red with the driver's own log. No pictures, no timings of
// frames: the answer is the link status. ShaderMaterial programs go through three.js (renderer.compileAsync on the whole scene, hidden views too), so what is tested is exactly what
// the app draws with; the rest (charts, Doppler, FibroScan, and late ones) are compiled from their text on the same context and thrown away.
import type { Object3D } from 'three';
import { type Program, budget } from './gl-programs.ts';
import { allPrograms } from './gl-registry.ts';
import type { GlHandle } from './gl-ref.ts';

import { clock } from '../clock/frame.ts';
export interface Row { name: string; ok: boolean; how: 'three' | 'text'; log: string; ms: number; warn: string[] }
export interface Limits { renderer: string; vendor: string; version: string; attributes: number; varyings: number; vertexUniforms: number; fragmentUniforms: number; textureUnits: number; highpFragment: boolean }

const sub = (gl: WebGL2RenderingContext, p: WebGLProgram) => (gl.getAttachedShaders(p) ?? []).map((s) => (gl.getShaderInfoLog(s) ?? '').trim()).filter(Boolean).join('\n');

export function limitsOf(gl: WebGL2RenderingContext): Limits {
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
  return {
    renderer: String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),
    vendor: String(dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)),
    version: String(gl.getParameter(gl.VERSION)),
    attributes: gl.getParameter(gl.MAX_VERTEX_ATTRIBS), varyings: gl.getParameter(gl.MAX_VARYING_VECTORS),
    vertexUniforms: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS), fragmentUniforms: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS), textureUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
    highpFragment: !!hp && hp.precision > 0,
  };
}

/** What a program asks for beyond what this device says it has (the floor tests in node use ES 3.0's minimum; a device can have less only if it is not WebGL2). */
function overBudget(p: Program, l: Limits): string[] {
  const b = budget(p), w: string[] = [];
  if (b.attributes > l.attributes) w.push(`${b.attributes} attributes, device has ${l.attributes}`);
  if (b.varyings > l.varyings) w.push(`${b.varyings} varying vectors, device has ${l.varyings}`);
  if (b.vertexUniformVectors > l.vertexUniforms) w.push(`${b.vertexUniformVectors} vertex uniform vectors, device has ${l.vertexUniforms}`);
  if (b.fragmentUniformVectors > l.fragmentUniforms) w.push(`${b.fragmentUniformVectors} fragment uniform vectors, device has ${l.fragmentUniforms}`);
  if (b.samplers > l.textureUnits) w.push(`${b.samplers} samplers, device has ${l.textureUnits}`);
  return w;
}

/** Compiles a program's text on the context and reads its status (waits for the driver when it compiles in parallel). */
async function compileText(gl: WebGL2RenderingContext, p: Program): Promise<{ ok: boolean; log: string }> {
  const ext = gl.getExtension('KHR_parallel_shader_compile');
  const mk = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const vs = mk(gl.VERTEX_SHADER, p.vertexGlsl), fs = mk(gl.FRAGMENT_SHADER, p.fragmentGlsl), prog = gl.createProgram()!;
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (ext) await new Promise<void>((done) => { const poll = () => (gl.getProgramParameter(prog, ext.COMPLETION_STATUS_KHR) || gl.isContextLost() ? done() : void clock.after(poll, 8)); poll(); });
  const ok = !!gl.getProgramParameter(prog, gl.LINK_STATUS);
  const log = [gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs), gl.getProgramInfoLog(prog)].map((s) => (s ?? '').trim()).filter(Boolean).join('\n');
  gl.deleteProgram(prog); gl.deleteShader(vs); gl.deleteShader(fs);
  return { ok, log };
}

export async function runGlCheck(r: GlHandle, scene: Object3D, camera: object, fibroText: string): Promise<{ limits: Limits; rows: Row[] }> {
  const gl = r.getContext() as WebGL2RenderingContext;
  const limits = limitsOf(gl);
  // every file that holds GLSL (found by the build's scan): its programs are read from the module (gl-auto.ts), so a new shader is checked here with nothing registered
  let auto: Record<string, Record<string, unknown>> = {};
  try { const { GL_MODULES } = await import('virtual:gl-modules'); auto = Object.fromEntries(await Promise.all(Object.entries(GL_MODULES).map(async ([f, load]) => [f, await load()] as const))); } catch { /* not in the build (a node test): the hand list and the scene graph */ }
  const programs: Program[] = allPrograms(scene, fibroText, auto);
  // three.js builds every ShaderMaterial program of the scene in one go (parallel where the driver can), hidden views included
  try { await r.compileAsync(scene as never, camera as never); } catch (e) { console.error('[?gl] compile failed', e); }
  const rows: Row[] = [];
  for (const p of programs) {
    const t0 = clock.now();
    let ok: boolean, log: string, how: Row['how'];
    const live = p.material ? (r.properties.get(p.material as never) as { currentProgram?: { program?: unknown } } | undefined)?.currentProgram?.program as WebGLProgram | undefined : undefined;
    if (live) { how = 'three'; ok = !!gl.getProgramParameter(live, gl.LINK_STATUS); log = ok ? '' : sub(gl, live) || (gl.getProgramInfoLog(live) ?? ''); }
    else { how = 'text'; ({ ok, log } = await compileText(gl, p)); }
    rows.push({ name: p.name, ok, how, log: log.slice(0, 1500), ms: Math.round(clock.now() - t0), warn: overBudget(p, limits) });
  }
  return { limits, rows };
}

/** The page's text, what Copy puts on the clipboard. */
export function checkText(l: Limits, rows: readonly Row[], build: string): string {
  const bad = rows.filter((r) => !r.ok || r.warn.length);
  return [
    `Portal Pressure 3D ?gl · ${build}`,
    `${l.renderer} · ${l.vendor} · ${l.version}`,
    `limits: attributes ${l.attributes}, varyings ${l.varyings}, vertex uniforms ${l.vertexUniforms}, fragment uniforms ${l.fragmentUniforms}, texture units ${l.textureUnits}, highp in fragment ${l.highpFragment ? 'yes' : 'NO'}`,
    `${rows.length - rows.filter((r) => !r.ok).length} of ${rows.length} programs link${bad.length ? `; ${bad.length} need a look` : ''}`,
    ...rows.map((r) => `${r.ok ? (r.warn.length ? 'WARN' : 'OK  ') : 'FAIL'}  ${r.name}  (${r.how}, ${r.ms} ms)${r.warn.length ? `  over the device's limits: ${r.warn.join('; ')}` : ''}${r.log ? `\n      ${r.log.split('\n').join('\n      ')}` : ''}`),
  ].join('\n');
}
