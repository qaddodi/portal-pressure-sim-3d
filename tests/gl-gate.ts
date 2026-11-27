// The checks of tests/shader-bindings.test.ts, one pure function each over ONE program (a `Program` of src/debug/gl-programs.ts), so the liveness fixtures can hand each of them a program that is wrong and see it named.
// Plan 41 / audit 2: the node shader checks used to see only the eager scene; these run over every program the app draws with (tests/gl-all-programs.ts), every mesh variant, every skin diagnostic.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Decl, type Program, ES3_FLOOR, THREE_FRAGMENT_NAMES, THREE_VERTEX_NAMES, budget, declarations, uniformProblems } from '../src/debug/gl-programs.ts';
import { afterDiscardProblems } from './gl-derivative.ts';
import { badSamplers, stageNames, undeclared, usedBeforeDeclared } from './gl-undeclared.ts';

/** (a) every name the program uses resolves to a declaration, a GLSL builtin or three's prefix, and is declared above its first use. */
export function undeclaredProblems(p: Program): string[] {
  const out: string[] = [];
  for (const stage of ['vertex', 'fragment'] as const) for (const u of undeclared(stage === 'vertex' ? p.vertexGlsl : p.fragmentGlsl, stageNames(p, stage))) out.push(`${p.name} (${stage}): ${u.split('@')[0]} is used and never declared`);
  for (const stage of ['vertex', 'fragment'] as const) for (const u of usedBeforeDeclared(stage === 'vertex' ? p.vertexGlsl : p.fragmentGlsl)) out.push(`${p.name} (${stage}): ${u} is used above the line that declares it`);
  return out;
}

/** (b) every texture call names a declared sampler (read on the preprocessed text), and no sampler is declared twice in a stage. */
export function samplerProblems(p: Program): string[] {
  const out: string[] = [];
  for (const stage of ['vertex', 'fragment'] as const) {
    const glsl = stage === 'vertex' ? p.vertexGlsl : p.fragmentGlsl;
    for (const n of badSamplers(glsl)) out.push(`${p.name} (${stage}): a texture call samples ${n}, which is no declared sampler`);
    const seen = new Set<string>();
    for (const d of declarations(glsl)) if (d.storage === 'uniform' && /^[iu]?sampler/.test(d.type)) { if (seen.has(d.name)) out.push(`${p.name} (${stage}): sampler ${d.name} is declared twice`); seen.add(d.name); }
  }
  return out;
}

// ---- (c) uniforms: present, and of the kind and length the shader declares ----
const isNum = (v: unknown) => typeof v === 'number';
const KINDS: Record<string, (v: any) => boolean> = {   // eslint-disable-line @typescript-eslint/no-explicit-any
  float: isNum, int: isNum, uint: isNum, bool: (v) => typeof v === 'boolean' || isNum(v),
  vec2: (v) => v?.isVector2 === true, ivec2: (v) => v?.isVector2 === true, uvec2: (v) => v?.isVector2 === true,
  vec3: (v) => v?.isVector3 === true || v?.isColor === true, ivec3: (v) => v?.isVector3 === true, uvec3: (v) => v?.isVector3 === true,
  vec4: (v) => v?.isVector4 === true || v?.isQuaternion === true, ivec4: (v) => v?.isVector4 === true, uvec4: (v) => v?.isVector4 === true,
  mat3: (v) => v?.isMatrix3 === true, mat4: (v) => v?.isMatrix4 === true,
};
const COMPS: Record<string, number> = { float: 1, int: 1, uint: 1, bool: 1, vec2: 2, vec3: 3, vec4: 4, ivec2: 2, ivec3: 3, ivec4: 4, uvec2: 2, uvec3: 3, uvec4: 4, mat3: 9, mat4: 16 };
const kindOk = (type: string, v: unknown): boolean => (/^[iu]?sampler/.test(type) ? (v as { isTexture?: boolean } | null)?.isTexture === true : (KINDS[type]?.(v) ?? true));

/** Uniforms the program declares and the material gives a value of the wrong kind or the wrong array length (a missing one is `uniformProblems`). */
export function uniformKindProblems(p: Program): string[] {
  const m = p.material;
  if (!m || p.standIn) return [];
  const builtin = new Set([...THREE_VERTEX_NAMES, ...THREE_FRAGMENT_NAMES]);
  const seen = new Map<string, Decl>();
  for (const d of [...declarations(p.vertexGlsl), ...declarations(p.fragmentGlsl)]) if (d.storage === 'uniform' && !builtin.has(d.name)) seen.set(d.name, d);
  const out: string[] = [];
  for (const [n, d] of seen) {
    const v = (m.uniforms as Record<string, { value?: unknown } | undefined>)[n]?.value;
    if (v === undefined || v === null) continue;
    if (Number.isFinite(d.array) && d.array > 1 || (d.array === 1 && Array.isArray(v))) {
      const comps = COMPS[d.type] ?? 1;
      if (Array.isArray(v) && comps > 1 && v.length === d.array * comps && v.every(isNum)) { /* (a flat list of numbers: three takes it as is) */ }
      else if (Array.isArray(v)) { if (v.length !== d.array) out.push(`${p.name}: ${n} is ${d.type}[${d.array}] and its value has ${v.length}`); else if (!v.every((e) => kindOk(d.type, e))) out.push(`${p.name}: ${n} (${d.type}[${d.array}]) holds an element of the wrong kind`); }
      else if (ArrayBuffer.isView(v)) { if ((v as unknown as { length: number }).length !== d.array * comps) out.push(`${p.name}: ${n} is ${d.type}[${d.array}] and its typed array has ${(v as unknown as { length: number }).length} numbers (wants ${d.array * comps})`); }
      else out.push(`${p.name}: ${n} is ${d.type}[${d.array}] and its value is not an array`);
    } else if (!kindOk(d.type, v)) out.push(`${p.name}: ${n} is ${d.type} and its value is ${typeof v === 'object' ? (v as object).constructor?.name : typeof v}`);
  }
  return out;
}

/** (c) the uniform check, whole: declared and present, with a value, of the right kind and length. */
/** Render-pass inputs: a full-screen pass is handed the previous pass's render target each frame, just before it draws (post-aa.ts, post-dof.ts, glow-fx.ts), so the texture is null until then by design. */
export const PASS_INPUTS = new Set(['post aa:tDiffuse', 'post dof:tSrc', 'post dof:tDepth', 'post dof copy:tFrom', 'post dof mix:tBlur', 'glow blur:tSrc']);
export const uniformChecks = (p: Program): string[] => [...uniformProblems(p), ...uniformKindProblems(p)]
  .filter((s) => !(/its uniform has no value$/.test(s) && PASS_INPUTS.has(`${p.name}:${/^(?:.*?: )?(\w+): its uniform/.exec(s)?.[1]}`)))
  .map((s) => (s.startsWith(p.name) ? s : `${p.name}: ${s}`));

/** (d) every varying the fragment shader reads is written by the vertex shader with the same type. */
export function varyingProblems(p: Program): string[] {
  const outs = new Map<string, string>();
  for (const d of declarations(p.vertexGlsl)) if (d.storage === 'out' || d.storage === 'varying') outs.set(d.name, d.type);
  const out: string[] = [];
  for (const d of declarations(p.fragmentGlsl)) {
    if (d.storage !== 'in' && d.storage !== 'varying') continue;
    const t = outs.get(d.name);
    if (t === undefined) out.push(`${p.name}: the fragment shader reads ${d.type} ${d.name}, which the vertex shader never declares`);
    else if (t !== d.type) out.push(`${p.name}: ${d.name} is ${t} in the vertex shader and ${d.type} in the fragment shader`);
  }
  return out;
}

export { afterDiscardProblems };

/** (f) the budget: at or under the floor every phone meets. The vessel program was at the ceiling (16 attributes, 15 varyings, Plan 41 item 5); removing the blood streaks (27 Nov, owner) freed one varying (vZf, the streaks' course), so the pin is 16 and 14. Any change is a named decision, so its numbers are pinned as equal. */
export const VESSEL_PIN = { attributes: 16, varyings: 14 } as const;
export const isVesselProgram = (p: Program) => /^vessel\b/.test(p.name);   // (the tube: toon, veil, glow, shadow, and the inspector's VDBG)
export function budgetProblems(p: Program): string[] {
  const b = budget(p), out: string[] = [];
  for (const k of Object.keys(ES3_FLOOR) as (keyof typeof ES3_FLOOR)[]) if (b[k] > ES3_FLOOR[k]) out.push(`${p.name} uses ${b[k]} ${k} (floor ${ES3_FLOOR[k]}): a phone refuses the program and everything drawn with it is missing`);
  if (isVesselProgram(p)) for (const k of ['attributes', 'varyings'] as const) {
    if (b[k] !== VESSEL_PIN[k]) out.push(`${p.name} uses ${b[k]} ${k}, not the pinned ${VESSEL_PIN[k]}: ${b[k] > VESSEL_PIN[k] ? 'one more and every phone refuses the vessel program (the 19 Nov `rk` class)' : 'slots were freed'}; change the pin in tests/gl-gate.ts only as a named decision in a plan (pack two scalars into one vec2 to free one)`);
  }
  return out;
}
/** Headroom of one program, for the printout. */
export const headroom = (p: Program): string => { const b = budget(p); return `${p.name}: attributes ${ES3_FLOOR.attributes - b.attributes}, varyings ${ES3_FLOOR.varyings - b.varyings}, samplers ${ES3_FLOOR.samplers - b.samplers}`; };

// ---- raw programs: what the host asks the driver for, against what the shader declares ----
/** The hosts of the raw programs, by registry name: the file that compiles it and how it names its uniforms (`getUniformLocation` with a literal, or a loop over an array constant). */
export const RAW_HOSTS: { programs: string[]; file: string; list: RegExp | null; literals: boolean; note?: string }[] = [
  { programs: ['charts'], file: 'src/ui/charts/gl.ts', list: null, literals: true },
  { programs: ['doppler spectrum (chart)'], file: 'src/ui/tests/doppler/spectrum-gl.ts', list: /const UNIS = \[([^\]]*)\]/, literals: false },
  { programs: ['endoscopic field'], file: 'src/ui/tests/endo/endo-under.ts', list: /const UNIS = \[([^\]]*)\]/, literals: false },
  { programs: ['fibroscan map'], file: 'src/ui/tests/fibro/copied/fibro-gl.copied.js', list: /const UNIS = \[([^\]]*)\]/, literals: false },
  { programs: ['fibroscan map (show)'], file: 'src/ui/tests/fibro/copied/fibro-gl.copied.js', list: /for \(const n of \[([^\]]*)\]\) g\.S\[n\]/, literals: false },
];
/** Programs that are text only, never given to a driver as they stand (with the reason). */
export const RAW_NOT_DRAWN: Record<string, string> = {
  'doppler spectrum': 'the 2D line shader as copied (it draws into a ring texture); spectrum-gl.ts joins its pieces into `doppler spectrum (chart)`, which is the program drawn',
};

export function hostUniforms(h: (typeof RAW_HOSTS)[number]): string[] {
  const text = readFileSync(resolve(h.file), 'utf8'), names = new Set<string>();
  if (h.literals) for (const m of text.matchAll(/getUniformLocation\(\s*\w+(?:\.\w+)?\s*,\s*'(\w+)'\s*\)/g)) names.add(m[1]!);
  if (h.list) { const m = h.list.exec(text); if (m) for (const s of m[1]!.matchAll(/'(\w+)'/g)) names.add(s[1]!); }
  return [...names];
}

/** Every uniform the host looks up is declared by the program, and every uniform the program declares is looked up (a declared one the host never sets reads 0; a looked-up one the shader lacks is a null location). */
export function rawUniformProblems(p: Program, h: (typeof RAW_HOSTS)[number], looked: readonly string[] = hostUniforms(h)): string[] {
  const declared = new Set<string>();
  for (const d of [...declarations(p.vertexGlsl), ...declarations(p.fragmentGlsl)]) if (d.storage === 'uniform') declared.add(d.name);
  const out: string[] = [];
  for (const n of looked) if (!declared.has(n)) out.push(`${p.name}: the host looks up ${n}, which no stage declares`);
  for (const n of declared) if (!looked.includes(n)) out.push(`${p.name}: declares uniform ${n}, which the host never looks up (dead: it reads 0)`);
  return out;
}

/** A raw fragment shader that samples a texture says `precision highp sampler2D` (the default is lowp, and the float textures it reads are clamped on a GPU that honours it). */
export function lowpSamplerProblems(p: Program): string[] {
  if (p.kind !== 'raw' || RAW_NOT_DRAWN[p.name]) return [];
  const has = declarations(p.fragmentGlsl).some((d) => d.storage === 'uniform' && /^sampler2D$/.test(d.type));
  return has && !/precision\s+highp\s+sampler2D\s*;/.test(p.fragmentGlsl) ? [`${p.name}: samples a sampler2D at the default LOWP precision (add \`precision highp sampler2D;\`: src/ui/tests/highp-samplers.js)`] : [];
}
