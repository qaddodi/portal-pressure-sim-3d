// The 2D app's stylesheets came over whole, and most of what the 3D figure replaced (the plate's SVG overlay classes, the old shell) is still in them. A class that a stylesheet names and that no source,
// test, script or page says anywhere is dead: nothing can set it, so its rules can never match. This lists them (`node scripts/dead-css.mjs`), and tests/dead-css.test.ts holds the count: it may only go down.
// `icons.css` is left out (its names are built at runtime). A class counts as used when its name appears as text anywhere outside the stylesheets (so a name built from a prefix still has to be written whole once).
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const sh = (c) => execSync(c, { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(Boolean);

/** Every class a rule of the sheets' selectors names, with the files naming it. */
export function sheetClasses() {
  const names = new Map();
  for (const f of sh("git ls-files 'src/*.css' 'src/**/*.css'")) {
    if (f.endsWith('/icons.css')) continue;
    const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    // selectors are what stands before a `{`, outside declaration blocks (a depth walk, so a nested @media's rules count)
    let depth = 0, buf = '';
    const take = (sel) => { if (sel.startsWith('@')) return; for (const m of sel.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) { if (!names.has(m[1])) names.set(m[1], new Set()); names.get(m[1]).add(f); } };
    const stack = [];
    for (const ch of css) {
      if (ch === '{') { stack.push(buf.trim().startsWith('@') ? 'at' : 'rule'); if (stack[stack.length - 1] === 'rule' && !stack.slice(0, -1).includes('rule')) take(buf); buf = ''; depth++; }
      else if (ch === '}') { stack.pop(); depth--; buf = ''; }
      else if (ch === ';' && stack[stack.length - 1] !== 'at') buf = '';
      else buf += ch;
    }
  }
  return names;
}

/** Name families the code builds at runtime (`sv-region-${key}`, `cc-${kind}`, `lb-g-${run.k}`, `lb-key-*`, `sh-crash-${layer}`): they never appear whole in a source file, so they are never called dead. */
export const BUILT_AT_RUNTIME = /^(sv-region-|sv-end-arrow-|cc-|lb-g-|lb-key-|sh-crash-)/;

/** The classes of the sheets that no other file says. */
export function deadClasses() {
  const files = sh("git ls-files src tests scripts public index.html").filter((f) => !/\.(css|pdf|png|jpe?g|webp|woff2?|ico|glb|bin)$/.test(f) && !f.endsWith('lint-long-lines.json'));
  let text = '';
  for (const f of files) { try { text += readFileSync(f, 'utf8') + '\n'; } catch { /* a file that is gone */ } }
  const names = sheetClasses();
  return { total: names.size, dead: [...names.keys()].filter((n) => !BUILT_AT_RUNTIME.test(n) && !text.includes(n)).sort(), where: names };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { total, dead, where } = deadClasses();
  console.log(`${dead.length} dead of ${total}`);
  if (process.argv[2] === 'list') for (const d of dead) console.log(d, [...where.get(d)].map((f) => f.split('/').pop()).join(','));
}
