#!/usr/bin/env node
// The build's reference check: every file a built page, style sheet or script names must be a file the build wrote. A name that points at nothing is a 404 for every visitor
// (a hashed asset whose name moved, a `url(...)` into a folder the bundler did not copy, a chunk a rewrite renamed), and nothing else in the build would say so: the bundler
// writes what it saw, the worker lists what is on disk, and only a browser asks for the name. The capture of 414a0ce2 reported such a miss, `assets/icons-r-<hash>.png`, on one slide;
// that file was served (the capture's own wait was in page time), but nothing in the build proved it, so this does, for every deck and every file the same way.
// `node scripts/dist-refs.mjs [dist]` exits 1 and lists each dangling name with the file that names it; scripts/build.mjs runs it last, and a failure stops the build on a branch too (a shipped 404 is
// not a warning). What counts as a name: a page's `src`/`href`, a style sheet's `url(...)`, a script's relative `import`/`from` of a chunk (a hashed name; a source sample inside a string imports whatever it likes) and `new URL(..., import.meta.url)`, and any content-hashed file name
// (`stem-<8 chars>.ext`) a script mentions at all (the bundler's and hash-data's own naming), which must exist somewhere under the build.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEXT = /\.(html|css|js|mjs)$/;
/** `stem-<8 url-safe chars>.ext`, the shape of Vite's and hash-data's names (a hash that is only letters can be a word, so a name is told by its digit or capital, or its _ or -). */
const HASHED = /(?<![\w.-])([A-Za-z][\w.-]*-[\w-]{8}\.(?:png|jpe?g|webp|svg|gif|woff2?|css|js|mjs|bin|json|wasm|mp3|mp4|webm))(?![\w-])/g;
const LOCAL = (r) => r && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(r) && !r.includes('${');

/** Every file under `dir`, '/'-separated and relative to it. */
export function allFiles(dir) {
  const out = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else out.push(relative(dir, p).split('\\').join('/')); } };
  walk(dir);
  return out.sort();
}

/** The names `text` (the built file `file`) points at: { ref, path } where `path` is the file it must be (null: only a file of that name must exist somewhere). */
export function refsOf(file, text) {
  const dir = posix.dirname(file), out = [];
  const at = (ref) => posix.normalize(posix.join(dir, ref.split(/[?#]/)[0]));
  if (file.endsWith('.html')) for (const m of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) { if (LOCAL(m[1])) out.push({ ref: m[1], path: at(m[1]) }); }
  else if (file.endsWith('.css')) for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) { if (LOCAL(m[1])) out.push({ ref: m[1], path: at(m[1]) }); }
  else {
    for (const m of text.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*(["'`])(\.{1,2}\/(?:[^"'`\s]*\/)?[A-Za-z][\w.-]*-[\w-]{8}\.m?js)\1/g)) out.push({ ref: m[2], path: at(m[2]) });
    for (const m of text.matchAll(/new URL\(\s*(["'`])([^"'`]+)\1\s*,\s*import\.meta\.url\s*\)/g)) { if (LOCAL(m[2])) out.push({ ref: m[2], path: at(m[2]) }); }
  }
  const strict = new Set(out.map((o) => o.ref.split(/[?#]/)[0].split('/').pop()));
  for (const m of text.matchAll(HASHED)) if (!strict.has(m[1]) && /\d|[A-Z_]/.test(m[1].slice(m[1].lastIndexOf('-') + 1))) out.push({ ref: m[1], path: null });
  return out;
}

/** Every dangling name in the build `dir`: [{ file, ref }]. */
export function danglingRefs(dir) {
  const files = allFiles(dir), have = new Set(files), names = new Set(files.map((f) => f.split('/').pop()));
  const bad = [];
  for (const f of files) {
    if (!TEXT.test(f) || f === 'sw.js') continue;
    for (const r of refsOf(f, readFileSync(join(dir, f), 'utf8'))) {
      if (r.path ? !have.has(r.path) : !names.has(r.ref)) bad.push({ file: f, ref: r.ref });
    }
  }
  const seen = new Set();
  return bad.filter((b) => { const k = `${b.file}\0${b.ref}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dist = process.argv[2] ?? fileURLToPath(new URL('../dist', import.meta.url));
  if (!existsSync(dist)) { console.error(`dist-refs: no build at ${dist}`); process.exit(1); }
  const bad = danglingRefs(dist);
  if (bad.length) {
    console.error(`dist-refs: ${bad.length} name(s) in the build point at a file the build did not write:`);
    for (const b of bad) console.error(`  ${b.file} names ${b.ref}`);
    process.exit(1);
  }
  console.log(`dist-refs: ok (${allFiles(dist).length} files, every name a page, style sheet or script gives is a file in the build)`);
}
