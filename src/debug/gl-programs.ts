// Every GLSL program the app can draw with, as the driver will be given it. Pure and dependency-light: a node test and the on-device ?gl page both load it.
//
// Why it exists: a real GPU refuses a program a node test never compiles (a redeclared attribute on 19 Nov made every vessel vanish on an iPhone; a tube of no radius made NaN
// geometry on a GPU only). Three.js builds a ShaderMaterial's final source itself, in WebGLProgram: its own prefix (version, precision, built-in attributes and uniforms, the
// `attribute`/`varying` defines, the colour-space helpers) and then ours. `assemble` rebuilds that text exactly, so tests/glsl-compile.test.ts can hand it to glslang (the Khronos
// reference compiler, no browser) and the ?gl page can compare it with what the device's own compiler says.
import { type Material, type Object3D, type ShaderMaterial, ShaderChunk, BackSide, DoubleSide, NormalBlending } from 'three';

export interface Program {
  /** a readable name: the shader it is made from, or where in the scene it was found */
  name: string;
  vertex: string;
  fragment: string;
  /** the complete source the driver is given, with the version line */
  vertexGlsl: string;
  fragmentGlsl: string;
  /** 'three' for a ShaderMaterial; 'raw' for source given to WebGL as it stands (a RawShaderMaterial or a hand-made program) */
  kind: 'three' | 'raw';
  /** the material it came from, when it came from one (the uniform check reads it) */
  material?: ShaderMaterial;
}

/** What three.js' WebGLProgram puts in front of a ShaderMaterial's vertex source (three 0.187, WebGL2, no maps, no lights, no instancing, no fog, no tone mapping: the app's `flat` canvas). */
const VERTEX_BUILTINS = [
  'uniform mat4 modelMatrix;', 'uniform mat4 modelViewMatrix;', 'uniform mat4 projectionMatrix;', 'uniform mat4 viewMatrix;', 'uniform mat3 normalMatrix;',
  'uniform vec3 cameraPosition;', 'uniform bool isOrthographic;',
  'attribute vec3 position;', 'attribute vec3 normal;', 'attribute vec2 uv;',
];
export const THREE_VERTEX_NAMES = ['modelMatrix', 'modelViewMatrix', 'projectionMatrix', 'viewMatrix', 'normalMatrix', 'cameraPosition', 'isOrthographic', 'position', 'normal', 'uv'];
export const THREE_FRAGMENT_NAMES = ['viewMatrix', 'cameraPosition', 'isOrthographic', 'pc_fragColor'];

const precision = (p: string) => [
  `precision ${p} float;`, `precision ${p} int;`, `precision ${p} sampler2D;`, `precision ${p} samplerCube;`, `precision ${p} sampler3D;`, `precision ${p} sampler2DArray;`,
  `precision ${p} sampler2DShadow;`, `precision ${p} samplerCubeShadow;`, `precision ${p} sampler2DArrayShadow;`, `precision ${p} isampler2D;`, `precision ${p} isampler3D;`,
  `precision ${p} isamplerCube;`, `precision ${p} isampler2DArray;`, `precision ${p} usampler2D;`, `precision ${p} usampler3D;`, `precision ${p} usamplerCube;`, `precision ${p} usampler2DArray;`,
  '#define HIGH_PRECISION',
].join('\n');

const FRAGMENT_DEFINES = [
  '#define varying in', 'layout(location = 0) out highp vec4 pc_fragColor;', '#define gl_FragColor pc_fragColor', '#define gl_FragDepthEXT gl_FragDepth', '#define texture2D texture',
  '#define textureCube texture', '#define texture2DProj textureProj', '#define texture2DLodEXT textureLod', '#define texture2DProjLodEXT textureProjLod', '#define textureCubeLodEXT textureLod',
  '#define texture2DGradEXT textureGrad', '#define texture2DProjGradEXT textureProjGrad', '#define textureCubeGradEXT textureGrad',
];

// the helpers three adds to every fragment shader (colour space, luminance); a shader of ours that names its own `luminance` or `sRGBTransferOETF` collides with them
const OUTPUT_HELPERS = [
  ShaderChunk.colorspace_pars_fragment,
  'vec4 linearToOutputTexel( vec4 value ) { return sRGBTransferOETF( value ); }',
  'float luminance( const in vec3 rgb ) { const vec3 weights = vec3( 0.2126729, 0.7151522, 0.0721750 ); return dot( weights, rgb ); }',
].join('\n');

const includePattern = /^[ \t]*#include +<([\w\d./]+)>/gm;
const resolveIncludes = (s: string): string => s.replace(includePattern, (_m, name: string) => {
  const chunk = (ShaderChunk as Record<string, string>)[name];
  if (chunk === undefined) throw new Error(`THREE.WebGLProgram: Can not resolve #include <${name}>`);
  return resolveIncludes(chunk);
});
const unrollPattern = /#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;
const unroll = (s: string): string => s.replace(unrollPattern, (_m, a: string, b: string, body: string) => {
  let out = '';
  for (let i = parseInt(a); i < parseInt(b); i++) out += body.replace(/\[\s*i\s*\]/g, `[ ${i} ]`).replace(/UNROLLED_LOOP_INDEX/g, String(i));
  return out;
});

const defineLines = (defines: Record<string, unknown> | undefined): string => Object.entries(defines ?? {}).filter(([, v]) => v !== false).map(([k, v]) => `#define ${k} ${v}`).join('\n');

/** The source three.js gives the driver for a ShaderMaterial (or the source as it stands for a raw one). */
export interface Assemblable { vertexShader: string; fragmentShader: string; defines?: Record<string, unknown>; side?: number; transparent?: boolean; blending?: number; alphaToCoverage?: boolean; isRawShaderMaterial?: boolean; glslVersion?: string | null }
export function assemble(m: Assemblable): { vertexGlsl: string; fragmentGlsl: string; kind: 'three' | 'raw' } {
  const defs = defineLines(m.defines);
  const side = [m.side === DoubleSide ? '#define DOUBLE_SIDED' : '', m.side === BackSide ? '#define FLIP_SIDED' : ''].filter(Boolean).join('\n');
  const version = m.glslVersion ? `#version ${m.glslVersion}\n` : '';
  if (m.isRawShaderMaterial) {
    const head = ['#define SHADER_TYPE RawShaderMaterial', '#define SHADER_NAME RawShaderMaterial', defs].filter(Boolean).join('\n');
    const pre = head ? head + '\n' : '';
    return { vertexGlsl: version + pre + unroll(resolveIncludes(m.vertexShader)), fragmentGlsl: version + pre + unroll(resolveIncludes(m.fragmentShader)), kind: 'raw' };
  }
  const common = ['#define SHADER_TYPE ShaderMaterial', '#define SHADER_NAME ShaderMaterial', defs, side].filter(Boolean);
  const opaque = m.transparent === false && m.blending === NormalBlending && m.alphaToCoverage === false;
  const vertexPrefix = ['#define attribute in', '#define varying out', '#define texture2D texture'].join('\n') + '\n' + [precision('highp'), ...common, ...VERTEX_BUILTINS, '\n'].join('\n');
  const fragmentPrefix = FRAGMENT_DEFINES.join('\n') + '\n' + [precision('highp'), ...common, 'uniform mat4 viewMatrix;', 'uniform vec3 cameraPosition;', 'uniform bool isOrthographic;', opaque ? '#define OPAQUE' : '', OUTPUT_HELPERS, '\n'].filter((l) => l !== '').join('\n');
  return {
    vertexGlsl: '#version 300 es\n' + vertexPrefix + unroll(resolveIncludes(m.vertexShader)),
    fragmentGlsl: '#version 300 es\n' + fragmentPrefix + unroll(resolveIncludes(m.fragmentShader)),
    kind: 'three',
  };
}

const isShader = (m: Material | undefined): m is ShaderMaterial => !!m && (m as ShaderMaterial).isShaderMaterial === true;

/** Every distinct ShaderMaterial program under `root` (hidden objects too: a view that is not shown still compiles on the device the first time it is). `named` maps a source text to its name. */
export function collectMaterials(root: Object3D, named: ReadonlyMap<string, string> = new Map()): Program[] {
  const byKey = new Map<string, Program>();
  root.traverse((o) => {
    const mat = (o as unknown as { material?: Material | Material[] }).material;
    for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
      if (!isShader(m)) continue;
      const a = assemble(m);
      const key = `${a.vertexGlsl}\u0000${a.fragmentGlsl}`;
      if (byKey.has(key)) continue;
      const base = named.get(m.fragmentShader) ?? named.get(m.vertexShader) ?? (o.name || m.name || 'unnamed');
      const defs = Object.keys(m.defines ?? {}).filter((k) => (m.defines as Record<string, unknown>)[k] !== false);
      const opaque = m.transparent === false && m.blending === NormalBlending && m.alphaToCoverage === false;
      const name = base + (defs.length ? ` (${defs.join(', ')})` : '') + (m.side === DoubleSide ? ' · double-sided' : m.side === BackSide ? ' · back faces' : '') + (opaque ? ' · opaque' : ' · blended');
      // (a device wears the toon fragment with an alpha put in front of it: a program of its own, named for the toon it was made from)
      byKey.set(key, { name, vertex: m.vertexShader, fragment: m.fragmentShader, ...a, material: m });
    }
  });
  return uniqueNames([...byKey.values()]);
}

/** Two different programs can be named alike (a define's VALUE differs, not its name: the same ink or toon built for two kinds of mesh), and the ?gl page keys its rows by name: a second
 *  "toon opaque" made React warn about two children with one key. Each repeat gets a number, in scene order, so a name is one program and the page's rows are unique. */
export function uniqueNames(list: Program[]): Program[] {
  const seen = new Map<string, number>();
  for (const p of list) {
    const n = (seen.get(p.name) ?? 0) + 1;
    seen.set(p.name, n);
    if (n > 1) p.name = `${p.name} #${n}`;
  }
  return list;
}

/** A ShaderMaterial the scene makes late (a Circuit resistor, a dye overlay), as three.js would build it: transparent, front faces, no defines. */
export function lateMaterialProgram(name: string, vertex: string, fragment: string, defines?: Record<string, unknown>): Program {
  const a = assemble({ vertexShader: vertex, fragmentShader: fragment, defines, side: 0, transparent: true, blending: NormalBlending, alphaToCoverage: false });
  return { name, vertex, fragment, ...a };
}

/** A program given to WebGL as it stands (the charts, the Doppler, the FibroScan: `#version 300 es` and no three.js prefix). */
export function rawProgram(name: string, vertex: string, fragment: string): Program {
  return { name, vertex, fragment, vertexGlsl: vertex, fragmentGlsl: fragment, kind: 'raw' };
}

/** The template literals `const NAME = \`#version 300 es ...\`;` of a source file, by name (the copied FibroScan file keeps its shaders private; they carry no `${}`). */
export function templateConstants(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/const\s+(\w+)\s*=\s*`(#version 300 es[\s\S]*?)`;/g)) {
    if (m[2]!.includes('${')) throw new Error(`${m[1]} has an interpolation: export it and register it by value`);
    out[m[1]!] = m[2]!;
  }
  return out;
}

// ---- reading a program's own declarations (the resource and uniform checks) ----

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const SLOTS: Record<string, number> = { float: 1, int: 1, uint: 1, bool: 1, vec2: 1, vec3: 1, vec4: 1, ivec2: 1, ivec3: 1, ivec4: 1, uvec2: 1, uvec3: 1, uvec4: 1, mat2: 2, mat3: 3, mat4: 4 };

export interface Decl { storage: string; type: string; name: string; array: number }
/** The global `uniform`, `attribute`/`in`, `varying`/`out` declarations of a source, after `#define attribute in` style words are taken as the keyword they stand for. */
export function declarations(src: string): Decl[] {
  // statements, not lines: `in vec2 a_pos; in vec4 a_col;` on one line is two declarations; a local variable or a parameter never starts with these words
  const out: Decl[] = [];
  for (const stmt of stripComments(src).replace(/^[ \t]*#.*$/gm, '').split(/[;{}]/)) {
    const m = /^\s*(?:layout\s*\([^)]*\)\s*)?(uniform|attribute|varying|in|out)\s+(?:(?:highp|mediump|lowp|flat|smooth|centroid)\s+)*(\w+)\s+([\s\S]+)$/.exec(stmt);
    if (!m) continue;
    for (const part of m[3]!.split(',')) {
      const n = /^\s*(\w+)\s*(?:\[\s*(\w+)\s*\])?/.exec(part);
      if (!n) continue;
      const size = n[2] === undefined ? 1 : /^\d+$/.test(n[2]) ? Number(n[2]) : NaN;
      out.push({ storage: m[1]!, type: m[2]!, name: n[1]!, array: size });
    }
  }
  return out;
}

const slotsOf = (d: Decl) => (SLOTS[d.type] ?? 1) * (Number.isFinite(d.array) ? d.array : 1);

export interface Budget { attributes: number; varyings: number; samplers: number; vertexUniformVectors: number; fragmentUniformVectors: number }
/** The slots a program asks of the GPU, counted from its own source plus three's built-ins. The ES 3.0 floor every phone meets: 16 attributes, 15 varying vectors, 16 samplers a stage, 256 and 224 uniform vectors. */
export function budget(p: Program): Budget {
  const v = declarations(p.vertexGlsl), f = declarations(p.fragmentGlsl);
  const attrs = v.filter((d) => d.storage === 'attribute' || d.storage === 'in');
  const varyings = v.filter((d) => d.storage === 'varying' || d.storage === 'out');
  const isSampler = (d: Decl) => /^[iu]?sampler/.test(d.type);
  const uni = (ds: Decl[]) => ds.filter((d) => d.storage === 'uniform' && !isSampler(d)).reduce((n, d) => n + (d.type === 'mat3' ? 3 : slotsOf(d)), 0);
  return {
    attributes: attrs.reduce((n, d) => n + slotsOf(d), 0),
    varyings: varyings.reduce((n, d) => n + slotsOf(d), 0),
    samplers: Math.max(v.filter((d) => d.storage === 'uniform' && isSampler(d)).length, f.filter((d) => d.storage === 'uniform' && isSampler(d)).length),
    vertexUniformVectors: uni(v),
    fragmentUniformVectors: uni(f),
  };
}
export const ES3_FLOOR: Budget = { attributes: 16, varyings: 15, samplers: 16, vertexUniformVectors: 256, fragmentUniformVectors: 224 };

/** Uniforms a program declares that its material does not carry (three then never sets them: they read 0, or the draw throws on a `.value` of undefined), and entries with no value. */
export function uniformProblems(p: Program): string[] {
  const m = p.material;
  if (!m) return [];
  const builtin = new Set([...THREE_VERTEX_NAMES, ...THREE_FRAGMENT_NAMES]);
  const names = new Set<string>();
  for (const d of [...declarations(p.vertexGlsl), ...declarations(p.fragmentGlsl)]) if (d.storage === 'uniform' && !builtin.has(d.name)) names.add(d.name);
  const out: string[] = [];
  for (const n of names) {
    const u = (m.uniforms as Record<string, { value?: unknown } | undefined>)[n];
    if (u === undefined) out.push(`${n}: declared in the shader, missing from the material's uniforms`);
    else if (u === null || typeof u !== 'object' || !('value' in u) || u.value === undefined || u.value === null) out.push(`${n}: its uniform has no value`);
  }
  return out;
}
