#!/usr/bin/env node
// Content-hashed names for the figure's data files (22 Nov splash review, item 10). The built pages fetch `anatomy/organs-baked.bin`, `skins.bin`, `circuit-skins.bin`, `organs.bin` and `organ-art.json` by FIXED names, so every deploy
// had to revalidate them and a new build's install fetched 3 MB it already held under the older cache (the worker's special case for files with no hash in the name). After the bundler, this moves each into assets/ under a name
// that carries its content's hash (as Vite does for its own files) and points the chunks at it: the worker already treats everything under assets/ as never-changing, a deploy that does not touch the figure downloads no data,
// and a tab on the build before still finds its own files in the older cache. `node scripts/hash-data.mjs [dist]`; the one export is what the test runs.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The data files the page fetches by name (relative to the site's root). A name missing from the build is skipped (a bake that failed); one present but named by no chunk is an error. */
export const DATA_FILES = ['anatomy/organs-baked.bin', 'anatomy/skins.bin', 'anatomy/circuit-skins.bin', 'anatomy/organs.bin', 'anatomy/organ-art.json'];

/** The data files the first picture waits for (the finished organs, the Anatomy's welds, the organs' art): the page's head asks for them at once, at low priority, so they download beside the app's code instead of after it. Root cause of the
 *  long cold splash (24 Nov): each was fetched by the app's own code, which only began to run once its 1.5 MB (gzipped) had arrived and been read, so the line sat idle for that long and then carried 4 MB one after the other. A file
 *  the page's `fetch` asks for with the same settings (same origin, no credentials) is the one the preload fetched; a low priority leaves the script files the bandwidth they need first. */
export const BOOT_PRELOAD = ['anatomy/organs-baked.bin', 'anatomy/skins.bin', 'anatomy/organ-art.json'];

/** Moves each data file of `dist` to assets/<stem>-<hash><ext> and rewrites the chunks that name it. Returns old name -> new name.
 * @param {string} dist
 * @param {string[]} [files]
 * @returns {Record<string, string>} */
export function hashData(dist, files = DATA_FILES) {
  const assets = join(dist, 'assets');
  mkdirSync(assets, { recursive: true });
  const chunks = readdirSync(assets).filter((f) => /\.(js|html)$/.test(f)).concat([]);
  const texts = new Map(chunks.map((f) => [join(assets, f), readFileSync(join(assets, f), 'utf8')]));
  const page = join(dist, 'index.html'); if (existsSync(page)) texts.set(page, readFileSync(page, 'utf8'));
  const out = {};
  for (const name of files) {
    const from = join(dist, name);
    if (!existsSync(from)) continue;
    const bytes = readFileSync(from), hash = createHash('sha256').update(bytes).digest('base64url').slice(0, 8);
    const ext = extname(name), to = `assets/${basename(name, ext)}-${hash}${ext}`;
    let named = 0;
    for (const [p, t] of texts) if (t.includes(name)) { texts.set(p, t.split(name).join(to)); named++; }
    if (!named) throw new Error(`hash-data: no chunk names ${name} (the page would fetch a file that is gone)`);
    renameSync(from, join(dist, to));
    out[name] = to;
  }
  // (the preload tags: only for a file this build has, named as the chunks name it, relative to the page like the chunks' own `./assets/...` reads)
  const tags = BOOT_PRELOAD.filter((n) => out[n]).map((n) => `<link rel="preload" as="fetch" crossorigin fetchpriority="low" href="./${out[n]}">`).join('\n    ');
  if (tags && texts.has(page) && texts.get(page).includes('</head>')) texts.set(page, texts.get(page).replace('</head>', `    ${tags}\n  </head>`));
  for (const [p, t] of texts) writeFileSync(p, t);
  for (const name of Object.keys(out)) for (const [, t] of texts) if (t.includes(name)) throw new Error(`hash-data: ${name} is still named after the rewrite`);
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dist = process.argv[2] ?? fileURLToPath(new URL('../dist', import.meta.url));
  const r = hashData(dist);
  for (const [a, b] of Object.entries(r)) console.log(`data: ${a} -> ${b}`);
}
