// The text of a shader as the driver is asked to link it, for a test that must read it (Plan 42). Root cause of the 23 stale greps of 22 Nov: each one matched a regex against ONE source file, but a vessel's fragment shader is
// assembled from chunks (glsl-shared.ts, debug-view.ts, the stent and the seam blocks) and written with macros (`DROP(n)`, which is `discard` with the inspector off and a painted reason with it on), so the text a test looked for
// moved or was spelled another way whenever a rule was cut into a chunk. `shaderText` is the assembled string (the JS template literals are already resolved in the export) with the inspector's branch (`#ifdef VDBG`) chosen OFF
// and `DROP(n)` written as the `discard` it is; names stay as written (a `#define` is not expanded: `vR0` is still `vR0`). `driverText` is the full preprocessed text (every define expanded, comments gone) for a check of what the
// driver sees (tests/gl-undeclared.ts). `block` cuts one braced block out of either, by its first words, so a test slices a rule by its braces and never by a comment (a comment is gone from the driver's text).
// Where a behaviour can be checked by a twin (a cut, a fade), prefer the twin: tests/source-grep-allow.json counts the tests that still read source, and it only goes down.
import { preprocessed } from './gl-undeclared.ts';

/** `#ifdef NAME ... #else ... #endif` (and `#ifndef`) resolved for the one switch `name` being off; every other directive and line is left as written. */
export function withoutSwitch(glsl: string, name: string): string {
  const out: string[] = [];
  // each frame: whether lines in it are kept, and whether this conditional is ours (so its #else / #endif are ours too)
  const stack: Array<{ ours: boolean; keep: boolean; parentKeep: boolean }> = [];
  const keeping = (): boolean => stack.every((f) => f.keep);
  for (const line of glsl.split('\n')) {
    const t = line.trim();
    const d = /^#\s*(ifdef|ifndef)\s+(\w+)/.exec(t);
    if (d) {
      const ours = d[2] === name;
      stack.push({ ours, keep: ours ? d[1] === 'ifndef' : true, parentKeep: keeping() });
      if (!ours && keeping()) out.push(line);
      continue;
    }
    if (/^#\s*if\b/.test(t)) { stack.push({ ours: false, keep: true, parentKeep: keeping() }); if (keeping()) out.push(line); continue; }
    if (/^#\s*else\b/.test(t)) {
      const f = stack[stack.length - 1];
      if (f?.ours) { f.keep = !f.keep; continue; }
      if (keeping()) out.push(line);
      continue;
    }
    if (/^#\s*endif\b/.test(t)) {
      const f = stack.pop();
      if (!f?.ours && keeping()) out.push(line);
      continue;
    }
    if (keeping()) out.push(line);
  }
  return out.join('\n');
}

/** The vessel programs' discard macro, written as what it is with the inspector off. */
const dropped = (t: string): string => t.replace(/^[ \t]*#\s*define\s+DROP\(n\)[^\n]*\n/gm, '').replace(/\bDROP\(\d+\)/g, 'discard');

/** A shader's assembled text, the inspector (VDBG) off, `DROP(n)` as `discard`, names as written. */
export function shaderText(glsl: string): string { return dropped(withoutSwitch(glsl, 'VDBG')); }

/** The text the driver's preprocessor leaves (defines expanded, `#ifdef` chosen, comments gone), for what a driver sees. */
export function driverText(glsl: string): string { return preprocessed(glsl); }

/** The braced block that starts at the first `marker` in `text` (the marker, its `{`, and everything to the matching `}`), or '' when the marker is not there. */
export function block(text: string, marker: string | RegExp): string {
  const at = typeof marker === 'string' ? text.indexOf(marker) : text.search(marker);
  if (at < 0) return '';
  const open = text.indexOf('{', at);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(at, i + 1);
  }
  return '';
}
