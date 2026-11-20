// How a shader file the registry was never told about gets compiled: the GLSL compile test and the ?gl page find every file that holds GLSL by scanning (scripts/gl-scan.mjs) and read its programs
// from the module itself, so a new shader needs nothing in gl-registry.ts. A file gives its programs by either
//   - `export const GL_PROGRAMS: readonly GlSpec[]`  (explicit: a name, the two stages, and the defines it is built with), or
//   - exports named `<STEM>_VS` and `<STEM>_FS` (a pair by stem: MICRO_VS / MICRO_FS), or one `_VS` and several `_FS` (`DOF_VS` with `DOF_COPY_FS`, ...: every fragment shader with that vertex shader), or
//   - `export const GL_ON_SCENE_GRAPH = 'why'` when its programs are materials the scene graph holds (found there, nothing to compile from the module).
// A scanned file that gives none of these fails the test with this note.
import { type Program, lateMaterialProgram } from './gl-programs.ts';

export interface GlSpec { name: string; vs: string; fs: string; defines?: Record<string, unknown> }

/** The programs a module gives (see the top of this file); empty when it gives none. */
export function programsOfModule(file: string, mod: Record<string, unknown>): Program[] {
  const explicit = mod.GL_PROGRAMS as readonly GlSpec[] | undefined;
  if (Array.isArray(explicit)) return explicit.map((s) => lateMaterialProgram(s.name, s.vs, s.fs, s.defines));
  const strings = Object.entries(mod).filter(([, v]) => typeof v === 'string') as [string, string][];
  const vs = strings.filter(([k]) => /_VS$/.test(k)), fs = strings.filter(([k]) => /_FS$/.test(k));
  const out: Program[] = [];
  for (const [fk, f] of fs) {
    const stem = fk.replace(/_FS$/, '');
    const own = vs.find(([vk]) => vk.replace(/_VS$/, '') === stem) ?? (vs.length === 1 ? vs[0] : vs.find(([vk]) => stem.startsWith(vk.replace(/_VS$/, '') + '_')));
    if (own) out.push(lateMaterialProgram(`${file}: ${fk}`, own[1], f));
  }
  return out;
}

/** Whether a module says its programs are on the scene graph. */
export const onSceneGraph = (mod: Record<string, unknown>): boolean => typeof mod.GL_ON_SCENE_GRAPH === 'string';

/** The programs of every module given, by file. */
export function autoPrograms(mods: Readonly<Record<string, Record<string, unknown>>>): Program[] {
  return Object.entries(mods).flatMap(([file, mod]) => programsOfModule(file, mod));
}
