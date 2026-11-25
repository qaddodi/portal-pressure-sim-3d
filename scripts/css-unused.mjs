#!/usr/bin/env node
// Which rules of the built stylesheet style something the app never makes: a rule is DEAD when a class or id in its selector is named nowhere in src/, public/ or index.html (a literal, a template
// string and a dash-prefix built at run time, `'row-' + x`, all count as naming it). `node scripts/css-unused.mjs [dist/assets/<name>.css]` (no argument: every stylesheet in dist/assets) prints the share; `--write` rewrites the file without the dead rules.
// scripts/build.mjs runs it with --write on the built file, so the base stylesheets in src/ui/styles carry only rules for what the app makes (`node scripts/css-unused.mjs` with no --write reports any that are dead again).
import { readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const postcss = createRequire(import.meta.url)('postcss');   // (vite's own dependency)

const root = fileURLToPath(new URL('..', import.meta.url));

/** All text a class or id could be named in. */
export function corpus(dirs = ['src', 'public', 'index.html']) {
  let text = '';
  const walk = (p) => {
    const st = statSync(p);
    if (st.isDirectory()) { for (const n of readdirSync(p)) { if (n === 'handout' || n === 'node_modules') continue; walk(join(p, n)); } return; }
    if (/\.(ts|tsx|js|mjs|jsx|json|html|svg|md)$/.test(p) && st.size < 4e6) text += readFileSync(p, 'utf8') + '\n';
  };
  for (const d of dirs) walk(join(root, d));
  return text;
}

/** A name is used when it appears whole, or when a dash-prefix of it (`row-`) ends a string somewhere (a name built at run time). */
export function namer(text) {
  const built = new Set(), tails = new Set();
  for (const m of text.matchAll(/([\w-]*-)(?=['"`]|\$\{)/g)) built.add(m[1]);
  for (const m of text.matchAll(/(?<=[}'"`])(-[\w-]+)/g)) tails.add(m[1]);   // (`${kind}-card`, 'a' + '-b')
  const cache = new Map();
  return (name) => {
    if (cache.has(name)) return cache.get(name);
    let ok = text.includes(name);
    if (!ok) for (let i = name.indexOf('-'); i >= 0 && !ok; i = name.indexOf('-', i + 1)) ok = built.has(name.slice(0, i + 1)) || tails.has(name.slice(i));
    cache.set(name, ok);
    return ok;
  };
}

/** Names (classes and ids) in a selector. What sits inside :not(), :is(), :where() and :has() is left out: a rule is kept or dropped by what it NEEDS to exist, never by a class it only excludes. */
const namesOf = (sel) => [...sel.replace(/:(?:not|is|where|has)\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)/g, '').matchAll(/[.#](-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]).filter((n, i, a) => a.indexOf(n) === i);

/** Takes the dead selectors out of a stylesheet; returns the new text and the counts. A rule keeps the selectors of its list whose names are all used. */
export function prune(css, used) {
  const root_ = postcss.parse(css);
  let rules = 0, dead = 0;
  root_.walkRules((r) => {
    if (r.parent?.type === 'atrule' && /keyframes$/i.test(r.parent.name)) return;
    rules++;
    const keep = r.selectors.filter((s) => namesOf(s).every(used));
    if (keep.length === r.selectors.length) return;
    dead++;
    if (!keep.length) r.remove(); else r.selectors = keep;
  });
  root_.walkAtRules((a) => { if (a.nodes && a.nodes.length === 0 && /^(media|supports|layer)$/i.test(a.name)) a.remove(); });
  return { css: root_.toString(), rules, dead };
}

/** The built app's stylesheets: every .css in the build's assets folder (named by the page and the chunks, whatever the entry is called: `index-*`, `main-*`). Throws when there is none, so a rename can never again turn the prune off unseen. */
export function builtStylesheets(dir) {
  const files = readdirSync(dir).filter((f) => /\.css$/.test(f)).sort();
  if (!files.length) throw new Error(`no stylesheet in ${dir}`);
  return files.map((f) => join(dir, f));
}

/** Prunes one built file in place; returns its new name. The file's name is its content's hash (a browser keeps a hashed file for good): the pruned text gets its own name, and the page and every chunk that names the old one are pointed at it. */
function pruneFile(file, used, write) {
  const before = readFileSync(file, 'utf8');
  const { css, rules, dead } = prune(before, used);
  console.log(`css: ${file.split('/').pop()} ${Math.round(before.length / 1024)} kB, ${rules} rules, ${dead} had a selector naming something the app never makes; ${write ? 'written' : 'would be'} ${Math.round(css.length / 1024)} kB`);
  if (!write) return;
  const dir = file.slice(0, file.lastIndexOf('/') + 1), oldName = file.split('/').pop(), stem = oldName.replace(/-[^-]*\.css$/, '');
  const newName = `${stem}-${createHash('sha256').update(css).digest('base64url').slice(0, 8)}.css`;
  writeFileSync(file, css); renameSync(file, dir + newName);
  const fix = (p) => { const t = readFileSync(p, 'utf8'); if (t.includes(oldName)) writeFileSync(p, t.split(oldName).join(newName)); };
  fix(join(dir, '../index.html'));
  for (const f of readdirSync(dir)) if (/\.(js|css)$/.test(f)) fix(dir + f);
  console.log(`css: renamed ${oldName} to ${newName}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2), write = args.includes('--write');
  const given = args.find((a) => !a.startsWith('--'));
  const used = namer(corpus());
  for (const file of given ? [given] : builtStylesheets(join(root, 'dist/assets'))) pruneFile(file, used, write);
}
