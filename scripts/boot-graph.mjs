#!/usr/bin/env node
// The boot entry's static import graph (what src/main.tsx reaches without a dynamic `import()`), and which parts of it could be a chunk of their own.
//   node scripts/boot-graph.mjs          the file count, then the files that bring the most with them (what is imported only through them), biggest first: a file with a big number is a part the first picture probably does not draw.
//                                        Load it with a dynamic import (src/boot/lazy-part.ts; src/ui/shell/sheets-load.ts + SheetsSlot.tsx is the pattern) and the whole number leaves the boot.
// tests/boot-entry.test.ts reads the graph from here, so the test and this list cannot differ.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// (an import or re-export statement at the start of a line; comments are not stripped: a "/*" inside a path in a comment, like styles/*.css, would swallow the imports after it)
const STATIC = /^[ \t]*(?:import|export)\s+(?!type\b)(?:[^'"()]*?\sfrom\s*)?['"]([^'"]+)['"]/gm;

/** Every source file reached from `entry` by static imports, with the file that first imported it (null for the entry). */
export function staticGraph(entry, root) {
  const seen = new Map();
  const walk = (file, from) => {
    if (seen.has(file)) return;
    seen.set(file, from);
    if (!/\.(tsx?|jsx?|mjs)$/.test(file)) return;
    for (const m of readFileSync(file, 'utf8').matchAll(STATIC)) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue;
      const p = resolve(dirname(file), spec.split('?')[0]);
      if (existsSync(p) && statSync(p).isFile()) walk(p, file);
    }
  };
  walk(resolve(root, entry), null);
  return seen;
}

/** For each file: how many files leave the graph if that file stops being imported (itself and what only it brings in), biggest first. The entry itself is left out. */
export function onlyThrough(entry, root) {
  const graph = staticGraph(entry, root);
  const kids = new Map();   // (file -> every file it statically imports)
  const start = resolve(root, entry);
  for (const file of graph.keys()) {
    const out = [];
    if (/\.(tsx?|jsx?|mjs)$/.test(file)) for (const m of readFileSync(file, 'utf8').matchAll(STATIC)) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue;
      const p = resolve(dirname(file), spec.split('?')[0]);
      if (graph.has(p)) out.push(p);
    }
    kids.set(file, out);
  }
  const reach = (skip) => { const s = new Set([start]); const st = [start]; while (st.length) { for (const c of kids.get(st.pop()) ?? []) if (c !== skip && !s.has(c)) { s.add(c); st.push(c); } } return s; };
  const total = graph.size;
  return [...graph.keys()].filter((f) => f !== start).map((f) => [total - reach(f).size, relative(root, f).split('\\').join('/')]).sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? -1 : 1));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  console.log(`${staticGraph('src/main.tsx', root).size} files in the boot entry`);
  console.log('what leaves the boot, with each file, if it were loaded on demand (App, Shell and the scene are the first picture; look below them):');
  for (const [n, f] of onlyThrough('src/main.tsx', root).slice(0, Number(process.argv[2]) || 25)) console.log(`${String(n).padStart(5)}  ${f}`);
}
