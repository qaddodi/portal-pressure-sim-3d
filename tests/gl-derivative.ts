// ROOT CAUSE of the specks on the welded junctions (Mohammad, 20 Nov: green, navy, black and yellow-green specks and dashes at every crotch and seam): a screen-space derivative (fwidth, dFdx, dFdy) taken AFTER a
// `discard` in a fragment shader. On a GPU that drops a discarded lane from its quad (Apple's), the lanes that stay next to it read garbage, so every mark built from a derivative (the heads, the shade band, the lane
// colour, the streaks) came out as clusters of wrongly coloured pixels exactly where neighbours are dropped: seams, crotches, silhouettes.
// A texture call that takes its level of detail IMPLICITLY (`texture`, `texture2D`, `textureProj`: not `*Lod`, `*Grad`, `texelFetch`) is a derivative too (the level comes from the quad's derivatives of the coordinate), so one after a
// discard is the same bug (Plan 41: the organ wash read its nodule texture, mipmapped, after the dive window's discard). In `main`, none of these and no call of a function that takes one comes after the first `discard`.
// A derivative is taken at the top and handed down (a parameter, or a global like gStreakFw or lensAcrossFw that main sets first); a texture is sampled at the top.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Program } from '../src/debug/gl-programs.ts';

const DERIV = /\b(fwidth|dFdx|dFdy|texture|texture2D|textureProj|texture2DProj)\s*\(/;
const DERIV_G = /\b(fwidth|dFdx|dFdy|texture|texture2D|textureProj|texture2DProj)\s*\(/g;

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
  for (const m of after.matchAll(DERIV_G)) bad.push(after.slice(after.lastIndexOf('\n', m.index!) + 1, after.indexOf('\n', m.index!)).trim().slice(0, 140));
  for (const t of takes) if (new RegExp(`\\b${t}\\s*\\(`).test(after)) bad.push(`calls ${t}(), which takes a derivative`);
  return bad;
}

/** A sample after a discard that is safe by construction, with the proof (a test checks the proof still holds). */
export const DISCARD_ALLOWED: { program: string; line: RegExp; why: string; proof: () => boolean }[] = [
  { program: 'fibroscan map (show)', line: /texture\(uMap,/, why: 'the map texture is one level (LINEAR, never mipmapped), so its implicit level is level 0 whatever the neighbours do',
    proof: () => { const t = readFileSync(resolve('src', 'ui', 'tests', 'fibro', 'copied', 'fibro-gl.copied.js'), 'utf8'); return !/generateMipmap|MIPMAP/.test(t) && /TEXTURE_MIN_FILTER, gl\.LINEAR\)/.test(t); } },
];

/** What one program does wrong, as `name: line` (empty when clean). */
export const afterDiscardProblems = (p: Program): string[] => derivativeAfterDiscard(p.fragmentGlsl).filter((line) => !DISCARD_ALLOWED.some((a) => p.name === a.program && a.line.test(line))).map((l) => `${p.name}: ${l}`);
