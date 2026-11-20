// ROOT CAUSE of the specks on the welded junctions (Mohammad, 20 Nov: green, navy, black and yellow-green specks and dashes at every crotch and seam): a screen-space derivative (fwidth, dFdx, dFdy) taken AFTER a
// `discard` in a fragment shader. On a GPU that drops a discarded lane from its quad (Apple's), the lanes that stay next to it read garbage, so every mark built from a derivative (the heads, the shade band, the lane
// colour, the streaks) came out as clusters of wrongly coloured pixels exactly where neighbours are dropped: seams, crotches, silhouettes. This test is the ONE invariant over EVERY program the app draws with (the
// registry and the scene graph, the same list glsl-compile.test.ts compiles): in `main`, no derivative and no call of a function that takes one comes after the first `discard`. A derivative is taken at the top and
// handed down (a parameter, or a global like gStreakFw or lensAcrossFw that main sets first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CelScene } from '../src/scene/scene.ts';
import { GL_FILES, allPrograms } from '../src/debug/gl-registry.ts';
import { glslFiles } from '../scripts/gl-scan.mjs';

const FIBRO = resolve('src', 'ui', 'tests', 'fibro', 'copied', 'fibro-gl.copied.js');
const auto: Record<string, Record<string, unknown>> = {};
for (const f of (glslFiles() as string[]).filter((x) => !(x in GL_FILES))) auto[f] = (await import(pathToFileURL(resolve('src', f)).href)) as Record<string, unknown>;
const programs = allPrograms(new CelScene().scene, readFileSync(FIBRO, 'utf8'), auto);

const DERIV = /\b(fwidth|dFdx|dFdy)\s*\(/;

/** The matching close brace of the `{` at `open`. */
function close(src: string, open: number): number {
  let d = 0;
  for (let i = open; i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) return i; }
  return src.length;
}
/** Every top-level function: name -> its body text. */
function functions(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /(?:^|\n)[ \t]*(?:highp |mediump |lowp )?(?:void|bool|int|float|vec[234]|ivec[234]|mat[234]|DFrame|DPart|DSeg|DMark)\s+(\w+)\s*\([^)]*\)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) { const open = src.indexOf('{', m.index + m[0].length - 1); const end = close(src, open); out.set(m[1]!, src.slice(open, end + 1)); re.lastIndex = end; }
  return out;
}
/** A derivative that the function takes only when its caller has not (gStreakFw > 0.0 ? gStreakFw : fwidth(across)) is the caller's, not the function's. */
const guarded = (body: string): boolean => /gStreakFw > 0\.0 \? gStreakFw : fwidth\(/.test(body.replace(/\s+/g, ' '));

export function derivativeAfterDiscard(source: string): string[] {
  const frag = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');   // (a comment that says "discard" is not one)
  const fns = functions(frag);
  const takes = new Set<string>();
  for (const [name, body] of fns) if (name !== 'main' && DERIV.test(body) && !guarded(body)) takes.add(name);
  // (a function that calls one of those takes a derivative too)
  for (let changed = true; changed;) { changed = false; for (const [name, body] of fns) if (name !== 'main' && !takes.has(name) && [...takes].some((t) => new RegExp(`\\b${t}\\s*\\(`).test(body))) { takes.add(name); changed = true; } }
  const main = fns.get('main');
  if (!main) return [];
  const first = main.search(/\bdiscard\b/);
  if (first < 0) return [];
  const after = main.slice(first);
  const bad: string[] = [];
  for (const m of after.matchAll(/\b(fwidth|dFdx|dFdy)\s*\(/g)) bad.push(after.slice(after.lastIndexOf('\n', m.index!) + 1, after.indexOf('\n', m.index!)).trim().slice(0, 140));
  for (const t of takes) if (new RegExp(`\\b${t}\\s*\\(`).test(after)) bad.push(`calls ${t}(), which takes a derivative`);
  return bad;
}

test('the checker finds a derivative after a discard, and passes one taken first or handed down', () => {
  assert.equal(derivativeAfterDiscard('void main() { float w = fwidth(x); if (a) discard; use(w); }').length, 0);
  assert.equal(derivativeAfterDiscard('void main() { if (a) discard; float w = fwidth(x); }').length, 1);
  assert.equal(derivativeAfterDiscard('float soft(float f) { return fwidth(f); }\nvoid main() { if (a) discard; float w = soft(x); }').length, 1);
  assert.equal(derivativeAfterDiscard('float soft(float f) { return gStreakFw > 0.0 ? gStreakFw : fwidth(f); }\nvoid main() { if (a) discard; float w = soft(x); }').length, 0);
});

test('EVERY program the app draws takes its screen-space derivatives before its first discard (a derivative after a discard is garbage on Apple GPUs: specks at every seam and crotch)', () => {
  assert.ok(programs.length >= 10, `${programs.length} programs`);
  const found: string[] = [];
  for (const p of programs) for (const line of derivativeAfterDiscard(p.fragmentGlsl)) found.push(`${p.name}: ${line}`);
  assert.deepEqual(found, [], 'move these to the top of main (before the first discard) and hand the value down');
});
