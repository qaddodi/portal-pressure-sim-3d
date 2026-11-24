// The signature of a bake (Plan 50): the sha256 of the bake script plus every source file in its import graph (and the few data files it reads that no import names).
// A bake writes `<out>.sig` beside its file; the next run whose signature is the same does nothing, so a deploy that did not touch what a bake is made from costs it 0 s
// (the Pages workflow restores the baked files from the Actions cache, so "the file on disk" outlives one run).
// The walker follows static `import … from '…'`, `import '…'`, `import('…')` (dynamic, with a string) and `new URL('…', import.meta.url)` (workers, data files): relative addresses only, resolved to
// .ts / .tsx / .js / .mjs / .json / index.*. A bare package (three, react) is not walked: package-lock.json is in every signature instead, so a changed dependency changes it.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const EXT = ['', '.ts', '.tsx', '.js', '.mjs', '.json', '/index.ts', '/index.tsx', '/index.js'];
const SPEC = [
  /\bfrom\s*['"](\.[^'"]+)['"]/g,                          // import x from './a'  /  export * from './a'
  /\bimport\s*['"](\.[^'"]+)['"]/g,                        // import './a'
  /\bimport\s*\(\s*['"](\.[^'"]+)['"]/g,                   // await import('./a')
  /new\s+URL\(\s*['"`](\.[^'"`$]+)['"`]\s*,\s*import\.meta\.url/g,   // new URL('./a', import.meta.url)
];
/** Every file name in a source text that is an import by address: the specifiers, as written, with any ?query cut off. */
export function specifiers(text) {
  const found = new Set();
  for (const re of SPEC) for (const m of text.matchAll(re)) found.add(m[1].replace(/[?#].*$/, ''));
  return [...found];
}
const resolveFile = (from, spec) => {
  for (const e of EXT) { const p = resolve(dirname(from), spec + e); if (existsSync(p) && statSync(p).isFile()) return p; }
  return null;
};
/** Shader source never changes what a bake writes (a bake writes geometry and plans, and draws nothing), so a file named shaders.ts or *glsl*.ts is not part of any signature. */
/** A bake's own outputs are never inputs (the scene reads them by address too: a signature that hashed them would never match after the bake that wrote them). */
export const BAKED_OUTPUT = /^public\/(anatomy\/(skins|circuit-skins|skins-placed|circuit-skins-placed|organs-baked)\.bin|lobule\/welds\.bin|baked\/)/;
export const SHADER_FILE = /(^|\/)[a-z0-9.-]*(shaders?|glsl)[a-z0-9.-]*\.ts$/;
/** The import graph of an entry file, as absolute paths, sorted: the entry and everything it reaches by an address.
 *  `skip(relativePath)` leaves a file out (and what only it reaches): a bake lists the folders its output cannot depend on. */
export function graph(entry, skip = () => false) {
  const seen = new Set(), todo = [resolve(entry)];
  const out = (f) => { const r = f.startsWith(root) ? f.slice(root.length) : f; return SHADER_FILE.test(r) || BAKED_OUTPUT.test(r) || skip(r); };
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f) || (f !== resolve(entry) && out(f))) continue;
    seen.add(f);
    if (!/\.(ts|tsx|js|mjs)$/.test(f)) continue;   // (a .json or a data file is a leaf)
    for (const s of specifiers(readFileSync(f, 'utf8'))) { const p = resolveFile(f, s); if (p && !seen.has(p)) todo.push(p); }
  }
  return [...seen].sort();
}
/** The signature of a bake: its entry's whole graph, the extra data files the bake reads without importing, and package-lock.json. */
export function bakeSig(entry, extras = [], skip = () => false) {
  const h = createHash('sha256');
  const files = [...new Set([...graph(entry, skip), ...extras.map((e) => resolve(root, e)), resolve(root, 'package-lock.json')])].sort();
  for (const f of files) {
    h.update(f.slice(root.length)); h.update('\0');
    if (existsSync(f)) h.update(readFileSync(f)); else h.update('(missing)');
    h.update('\0');
  }
  return h.digest('hex');
}
/** What the skin bake's output cannot depend on: the figure's vessels and their joins are made by the vessels, the circuit and the engine; the lobule, the sinusoid, the decks and the UI never touch them.
 *  (The one file of those folders the skins read is the weld codec, for its digest.) */
export const SKINS_SKIP = (r) => /^\/?src\/(scene\/(lobule|micro3d|sinusoid|materials)|ui|decks)\//.test(r) && !/weld-codec\.ts$/.test(r);
export const SKINS_EXTRAS = ['public/anatomy/vessels.json', 'public/anatomy/organs.bin'];
/** True when every output exists and the sidecar of each holds this signature. */
export function isCurrent(outs, sig) {
  return outs.every((o) => existsSync(o) && existsSync(`${o}.sig`) && readFileSync(`${o}.sig`, 'utf8').trim() === sig);
}
export function writeSig(outs, sig) { for (const o of outs) writeFileSync(`${o}.sig`, `${sig}\n`); }
