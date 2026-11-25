#!/usr/bin/env node
// What a first visit downloads before the app is usable, in bytes on the wire, by kind, and whether that is within the budget (scripts/boot-budget.json). Node only, no browser: it reads the built site (`dist/`) and takes the
// files the page needs before its first picture from the same list the service worker installs (scripts/pwa.mjs orderFiles: the page, its scripts and style sheets, the fonts, the organs, the skins), because that list IS what the page
// requests before it can be used. Text is counted gzipped (what the host sends), the baked .bin files, fonts and pictures as they are. Run by the build after the worker is written (scripts/build.mjs) and by hand:
//   node scripts/boot-bytes.mjs [dist] [--check]      --check exits 1 over the budget (the build does it on main; a branch preview ships and says so in build-info.txt)
// The review of 25 Nov measured 10,071 kB before usable in headless Chromium with the cache empty (91 requests); this count is made the same way as that table's rows (JavaScript, images, fonts, CSS, JSON and HTML within a few percent of them). A measurement
// in a browser (every response until the cover lifts) is the check that a number here has not drifted from what a device really pulls; it needs a headless run and is made by hand, with the owner's say.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listFiles, orderFiles, wireBytes } from './pwa.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
export const BUDGET_FILE = join(root, 'scripts', 'boot-budget.json');

/** The kind a built file counts under. */
export function kindOf(file) {
  if (/\.bin$/.test(file)) return 'geometry (baked)';
  if (/(?:^|\/)organ-art[^/]*\.json$/.test(file)) return 'geometry (organ art)';
  if (/\.(?:m?js)$/.test(file)) return 'javascript';
  if (/\.css$/.test(file)) return 'css';
  if (/\.(?:woff2?|ttf|otf)$/.test(file)) return 'fonts';
  if (/\.(?:png|jpe?g|webp|avif|gif|svg|ico)$/.test(file)) return 'images';
  if (/\.(?:html|json|webmanifest)$/.test(file)) return 'json and html';
  return 'other';
}

/** The boot list's wire bytes by kind. `files` is the built site's file list (relative paths), `read(file)` a file's bytes.
 * @param {string[]} files
 * @param {(file: string) => Buffer} read
 * @returns {{ total: number, kinds: Record<string, { files: number, bytes: number }>, files: { file: string, kind: string, bytes: number }[] }} */
export function bootBytes(files, read) {
  const { boot: held } = orderFiles(files, (f) => read(f).toString('utf8'));
  // (the install list holds every iOS launch picture the page names, 48 of them, 1.7 MB; a device is sent the one that fits its screen, and only when the app is opened from the home screen: the picture is no part of what a page needs before it can be used)
  const page = files.includes('index.html') ? read('index.html').toString('utf8') : '';
  const launch = new Set([...page.matchAll(/<link\b[^>]*rel="apple-touch-startup-image"[^>]*>/g)].map((m) => /href="(?:\.\/)?([^"?#]+)/.exec(m[0])?.[1]).filter(Boolean));
  const boot = held.filter((f) => !launch.has(f));
  const list = boot.map((file) => ({ file, kind: kindOf(file), bytes: wireBytes([file], read) }));
  /** @type {Record<string, { files: number, bytes: number }>} */
  const kinds = {};
  for (const f of list) { const k = (kinds[f.kind] ??= { files: 0, bytes: 0 }); k.files++; k.bytes += f.bytes; }
  return { total: list.reduce((a, f) => a + f.bytes, 0), kinds, files: list };
}

/** The budget file's numbers (kB).
 * @returns {{ targetKb: number, budgetKb: number, geometryKb: number }} */
export const readBudget = () => JSON.parse(readFileSync(BUDGET_FILE, 'utf8'));

/** The printout: bytes by kind, the total, the budget and the target. */
/** @param {ReturnType<typeof bootBytes>} r
 * @param {{ targetKb: number, budgetKb: number }} [budget] */
export function report(r, budget = readBudget()) {
  const kb = (n) => `${Math.round(n / 1024).toLocaleString('en-US')} kB`;
  const rows = Object.entries(r.kinds).sort((a, b) => b[1].bytes - a[1].bytes).map(([k, v]) => `  ${k.padEnd(22)} ${String(v.files).padStart(4)} files ${kb(v.bytes).padStart(10)}  ${Math.round((100 * v.bytes) / r.total)}%`);
  return [`before usable: ${r.files.length} files, ${kb(r.total)} on the wire (budget ${budget.budgetKb.toLocaleString('en-US')} kB, target ${budget.targetKb.toLocaleString('en-US')} kB)`, ...rows].join('\n');
}

/** Whether the total is within the budget.
 * @param {ReturnType<typeof bootBytes>} r
 * @param {{ budgetKb: number, targetKb?: number }} [budget] */
export const within = (r, budget = readBudget()) => r.total <= budget.budgetKb * 1024;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dist = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? join(root, 'dist');
  if (!existsSync(join(dist, 'index.html'))) { console.error(`boot-bytes: no built site at ${dist} (npm run build makes it; the deploy does)`); process.exit(2); }
  const r = bootBytes(listFiles(dist), (f) => readFileSync(join(dist, f)));
  console.log(report(r));
  if (process.argv.includes('--check') && !within(r)) { console.error(`boot-bytes: over the budget (${readBudget().budgetKb} kB): something new is downloaded before the app is usable`); process.exit(1); }
}
