// Names a GLSL program uses and nothing declares. A real driver refuses the whole program (everything drawn with it is missing); a syntax parse does not see it, and glslang
// is not installed in the cloud. This is the check that always runs (Plan 28: `mapCB` sampled in the lobule plate and never declared).
import { parser } from '@shaderfrog/glsl-parser/index.js';
import { preprocess } from '@shaderfrog/glsl-parser/preprocessor/index.js';
import { THREE_FRAGMENT_NAMES, THREE_VERTEX_NAMES, type Program } from '../src/debug/gl-programs.ts';

type Entry = { declaration?: unknown; references: { location?: { start: { line: number } } }[] };
type Scope = { name: string; parent?: Scope; bindings: Record<string, Entry>; functions: Record<string, unknown> };

// GLSL ES 3.00 built-in variables and constants (functions are resolved separately: a call is not a binding)
const BUILTIN_VARS = new Set(['gl_Position', 'gl_PointSize', 'gl_FragCoord', 'gl_FrontFacing', 'gl_PointCoord', 'gl_FragDepth', 'gl_VertexID', 'gl_InstanceID', 'gl_FragColor',
  'gl_MaxVertexAttribs', 'gl_MaxVertexUniformVectors', 'gl_MaxVaryingVectors', 'gl_MaxVertexTextureImageUnits', 'gl_MaxCombinedTextureImageUnits', 'gl_MaxTextureImageUnits',
  'gl_MaxFragmentUniformVectors', 'gl_MaxDrawBuffers', 'gl_MinProgramTexelOffset', 'gl_MaxProgramTexelOffset']);

/** The parser records only the first declarator of `float a = 1.0, b = 2.0;`: a later one is a declaration when its statement starts with a type and a name. */
function chained(text: string, name: string): boolean {
  for (const m of text.matchAll(new RegExp(`,\\s*${name}\\s*(?:\\[[^\\]]*\\]\\s*)?(?:=|;|,)`, 'g'))) {
    const start = Math.max(text.lastIndexOf(';', m.index), text.lastIndexOf('{', m.index), text.lastIndexOf('}', m.index)) + 1;
    if (/^\s*(?:(?:const|highp|mediump|lowp|uniform|flat|smooth|in|out)\s+)*[A-Za-z_]\w*\s+[A-Za-z_]\w*\s*(?:\[[^\]]*\]\s*)?(?:=|;|,)/.test(text.slice(start, m.index))) return true;
  }
  return false;
}

const prepped = new Map<string, string>();
/** The text as the driver's preprocessor leaves it (defines expanded, `#ifdef` blocks chosen), kept by text so the three checks of one program preprocess it once (the skin's variants are slow). */
export function preprocessed(glsl: string): string {
  let t = prepped.get(glsl);
  if (t === undefined) { t = preprocess(glsl, { preserve: { version: () => true } as never, stopOnError: false } as never); prepped.set(glsl, t); }
  return t;
}

/** Every undeclared name (`name@line`) of one stage's assembled text; the sampler calls whose first argument is not a declared sampler uniform. */
export function undeclared(glsl: string, three: readonly string[]): string[] {
  const text = preprocessed(glsl);
  const ast = parser.parse(text, { quiet: true }) as unknown as { scopes: Scope[] };
  const out: string[] = [];
  const known = (s: Scope | undefined, n: string): boolean => {
    for (let c = s; c; c = c.parent) if (c.bindings[n]?.declaration) return true;
    return false;
  };
  for (const s of ast.scopes) {
    for (const [n, e] of Object.entries(s.bindings)) {
      if (e.declaration || BUILTIN_VARS.has(n) || three.includes(n) || known(s.parent, n) || chained(text, n)) continue;
      out.push(`${n}@${e.references[0]?.location?.start.line ?? '?'}`);
    }
  }
  return out;
}

/** Every global the text uses ABOVE the line that declares it (`name@useLine<declLine`). GLSL needs a name declared before it is used: a driver refuses the program for `vL` used in an injected
 *  chunk and declared further down (the lobule plate, 23 Nov 2026), and the check above passes it, since the name is declared somewhere. Variables (uniform, varying, attribute, const, globals) read
 *  the parser's scope entries (declaration line against the first reference, in its own scope or the scope chain above); functions are read from the text: the first `name(` must be the definition or a prototype. */
export function usedBeforeDeclared(glsl: string): string[] {
  const text = preprocessed(glsl);
  const ast = parser.parse(text, { quiet: true, includeLocation: true }) as unknown as { scopes: Scope[] };
  const lineOf = (e: { location?: { start: { line: number } } } | undefined) => e?.location?.start.line;
  const declLine = (s: Scope | undefined, n: string): number | undefined => {
    for (let c = s; c; c = c.parent) { const e = c.bindings[n]; if (e?.declaration) return lineOf(e.declaration as { location?: { start: { line: number } } }); }
    return undefined;
  };
  const out = new Set<string>();
  for (const s of ast.scopes) {
    for (const [n, e] of Object.entries(s.bindings)) {
      const refs = e.references.map(lineOf).filter((l): l is number => l !== undefined);
      if (!refs.length) continue;
      const decl = e.declaration ? lineOf(e.declaration as { location?: { start: { line: number } } }) : declLine(s.parent, n);
      const first = Math.min(...refs);
      if (decl !== undefined && first < decl) out.add(`${n}@${first}<${decl}`);
    }
  }
  const at = (i: number) => text.slice(0, i).split('\n').length;
  const fnNames = new Set<string>();
  for (const s of ast.scopes) for (const n of Object.keys(s.functions)) fnNames.add(n);
  for (const n of fnNames) {
    if (n === 'main') continue;
    const def = new RegExp(`(?:^|[;}\\n])\\s*(?:(?:highp|mediump|lowp|const|in|out|inout)\\s+)*[A-Za-z_]\\w*\\s+${n}\\s*\\([^)]*\\)\\s*[{;]`);
    const m = def.exec(text);
    if (!m) continue;   // (no definition in the text: a builtin, a constructor, or three.js' own: the check above owns it)
    const defAt = at(m.index + m[0].search(/\S/));
    const call = new RegExp(`\\b${n}\\s*\\(`, 'g');
    for (let c = call.exec(text); c; c = call.exec(text)) {
      const before = text.slice(0, c.index);
      if (/(?:^|[;}\s])(?:void|float|int|bool|uint|[iub]?vec[234]|mat[234](?:x[234])?|[A-Za-z_]\w*)\s+$/.test(before) && !/\b(?:return|else|case|discard)\s+$/.test(before)) break;   // the definition or prototype comes first
      out.add(`${n}()@${at(c.index)}<${defAt}`);
      break;
    }
  }
  return [...out];
}

/** Samplers: every `texture2D(x, ...)`/`texture(x, ...)`/`textureLod(x, ...)` names a declared `uniform sampler*` (or a sampler parameter) as its first argument, read on the PREPROCESSED text (a sampler declared only under an
 *  `#ifdef` and sampled outside it is no declaration), and each bad name is listed once (a sampler called twice, like the plate's `mapCB`, is one bad name, not two). */
export function badSamplers(glsl: string): string[] {
  const text = preprocessed(glsl);
  const samplers = new Set<string>();
  for (const m of text.matchAll(/\b[iu]?sampler\w+\s+(\w+)/g)) samplers.add(m[1]!);   // (a uniform or a parameter)
  for (const m of text.matchAll(/\buniform\s+(?:\w+\s+)?[iu]?sampler\w+\s+(\w+(?:\s*,\s*\w+)*)\s*;/g)) for (const n of m[1]!.split(',')) samplers.add(n.trim());   // (`uniform sampler2D a, b;`)
  const bad = new Set<string>();
  for (const m of text.matchAll(/\b(?:texture2D|texture2DLodEXT|texture|textureLod|textureProj|textureGrad|texelFetch|textureSize)\s*\(\s*(\w+)\s*[,)]/g)) if (!samplers.has(m[1]!)) bad.add(m[1]!);
  return [...bad];
}

export const stageNames = (p: Program, stage: 'vertex' | 'fragment') => (p.kind === 'three' ? (stage === 'vertex' ? THREE_VERTEX_NAMES : THREE_FRAGMENT_NAMES) : []);
