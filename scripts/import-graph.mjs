// The import graph the pre-push picks tests through (C1, external review 27 Nov: "a test runs when anything it imports, at ANY depth, changed").
// Pure functions over a file list and a reader, so tests/import-graph.test.ts pins them without touching the disk.
//
// An edge A -> B means "A names B": a path written in A's text (an import, a dynamic import, `new URL('../x.ts', import.meta.url)`, `readFileSync('src/x.ts')`) that resolves to the file B.
// The scan is by text, not by syntax, on purpose: it must also see the reads (`readFileSync`) and the `.js` that is really a `.ts`, and it errs towards MORE edges (a path in a comment counts). A missing edge lets a break through; an extra one costs a test's seconds.
// Comments that start a line are not read (a header that names a script is not an import of it); a path after code on the same line still counts.
// (An edge never points at a test file: a script that names a test by path does not make that test depend on the script's imports.)
// A file that lists a directory (`readdirSync('src/scene/parts')`, a glob) depends on every file under it, when the directory is small (TREE_WALK files or fewer). A walk of a whole tree (`src`, `scripts`, `src/ui`) would make every
// test depend on every file and the gate would run everything: those tree-wide scanners are left to the daily full run (`scripts/tests-daily.mjs`), which now names the failing ones. A test file is terminal for directory reads.
// `selectTests` (pre-push-select.mjs) walks the edges backwards from what changed.

export const CODE = /\.(tsx?|mjs|cjs|js)$/;
/** The kinds of file a text may name (the ones that are not code are leaves: they have no edges of their own). */
const NAMED = '(?:tsx?|mjs|cjs|js|json|md|css|html|glsl|txt)';
const PATH_TOKEN = new RegExp(`[A-Za-z0-9_@.\\-/]+\\.${NAMED}(?![A-Za-z0-9_])`, 'g');
const DIR_TOKEN = /['"`]((?:\.{1,2}\/)?[A-Za-z0-9_@.\-]+(?:\/[A-Za-z0-9_@.\-]+)*)\/?(?:\$\{|['"`])/g;
/** A directory with more files than this, read as a list, is a tree walk and makes no edges (see the header). */
export const TREE_WALK = 60;
const LISTS_A_DIRECTORY = /\b(readdirSync|readdir|opendirSync|globSync|glob|walk|walkSync)\b/;

/** The text with the comments that begin a line taken out, so a header's \`scripts/other.mjs\` is not an edge. */
export const withoutComments = (text) => text.replace(/^[ \t]*\/\/.*$/gm, '').replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '');

const dirOf = (f) => (f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '');
/** `a/b/../c/./d` -> `a/c/d`; null when it climbs out of the repo. */
export function normalize(p) {
  const out = [];
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') { if (!out.length) return null; out.pop(); } else out.push(part);
  }
  return out.join('/');
}
const join = (dir, rel) => normalize(dir ? `${dir}/${rel}` : rel);

/** The files a path written in `from`'s text can mean: beside the file, from the repo root, and the `.js` that is a `.ts`. */
function resolveToken(token, from, known) {
  const bare = token.replace(/^\/+/, '');
  const tries = [join(dirOf(from), token.startsWith('/') ? bare : token), normalize(bare)];
  for (const t of tries) {
    if (!t) continue;
    if (known.has(t)) return t;
    if (/\.js$/.test(t)) for (const alt of [t.replace(/\.js$/, '.ts'), t.replace(/\.js$/, '.tsx')]) if (known.has(alt)) return alt;
  }
  return null;
}

/**
 * @param files  every repo-relative path (tracked and untracked, not ignored)
 * @param read   (path) => text of a code file
 * @returns Map<dependent path, Set<path it names>>
 */
export function buildGraph(files, read) {
  const known = new Set(files);
  const dirs = new Map();   // directory -> the files under it, any depth
  for (const f of files) for (let d = dirOf(f); d; d = dirOf(d)) { if (!dirs.has(d)) dirs.set(d, []); dirs.get(d).push(f); }
  const graph = new Map();
  for (const f of files) {
    if (!CODE.test(f)) continue;
    const text = withoutComments(read(f)), deps = new Set();
    for (const token of text.match(PATH_TOKEN) ?? []) { const r = resolveToken(token, f, known); if (r && r !== f && !/\.test\.ts$/.test(r)) deps.add(r); }
    if (LISTS_A_DIRECTORY.test(text)) {
      for (const m of text.matchAll(DIR_TOKEN)) {
        for (const base of [join(dirOf(f), m[1]), normalize(m[1])]) {
          const inside = (base && dirs.get(base)) || [];
          if (inside.length > TREE_WALK) continue;
          for (const g of inside) if (g !== f && !/\.test\.ts$/.test(g)) deps.add(g);
        }
      }
    }
    graph.set(f, deps);
  }
  return graph;
}

/** How far each file is from what changed: `changed` themselves 0, a file that names one 1, a file that names one of those 2, and so on (breadth first, so the nearest chain wins). */
export function affectedBy(graph, changed) {
  const back = new Map();
  for (const [from, deps] of graph) for (const d of deps) { if (!back.has(d)) back.set(d, []); back.get(d).push(from); }
  const depth = new Map(changed.map((f) => [f, 0]));
  const queue = [...depth.keys()];
  for (let i = 0; i < queue.length; i++) {
    const f = queue[i];
    for (const up of back.get(f) ?? []) if (!depth.has(up)) { depth.set(up, depth.get(f) + 1); queue.push(up); }
  }
  return depth;
}
