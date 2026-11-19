// `npm run look:diff [-- <folder>]` (WP11): compares a look-board run (default: the newest folder in look/) with look/baseline/ and writes one contact sheet,
// look/<folder>/index.html: each state with the baseline, the new picture and the difference, the ones that moved first. Node only, no browser; run it on the Mac after the board has saved.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './png-lite.mjs';
import { diffPixels, verdict, moved } from '../src/debug/look-diff.ts';

const look = fileURLToPath(new URL('../look/', import.meta.url));
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Compare two folders of PNGs: [{ file, diff }] with diff null when the baseline lacks the file; writes the difference pictures into `out`. */
export function compareFolders(dir, baseDir, out) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
  mkdirSync(out, { recursive: true });
  return files.map((file) => {
    const bf = `${baseDir}/${file}`;
    if (!existsSync(bf)) return { file, diff: null };
    const a = decodePng(readFileSync(`${dir}/${file}`)), b = decodePng(readFileSync(bf));
    if (a.w !== b.w || a.h !== b.h) return { file, diff: { same: false, size: false, changed: 0, total: 0, percent: 100, image: null } };
    const diff = diffPixels(a.data, b.data, a.w, a.h);
    writeFileSync(`${out}/${file}`, encodePng(a.w, a.h, diff.image));
    return { file, diff: { ...diff, image: null } };
  });
}

export function sheet(folder, rows) {
  const rank = (r) => (!r.diff ? 1 : moved(r.diff) ? 0 : 2);
  const sorted = [...rows].sort((x, y) => rank(x) - rank(y) || x.file.localeCompare(y.file));
  const cell = (src, label) => `<figure><img loading="lazy" src="${src}" alt=""><figcaption>${label}</figcaption></figure>`;
  const body = sorted.map((r) => `<section${moved(r.diff) ? ' class="moved"' : ''}><h3>${esc(r.file.replace(/\.png$/, ''))} <span>${esc(verdict(r.diff))}</span></h3><div>${r.diff ? cell(`../baseline/${r.file}`, 'baseline') : ''}${cell(r.file, 'this run')}${r.diff?.image === null && r.diff.size ? cell(`diff/${r.file}`, 'difference') : ''}</div></section>`).join('\n');
  return `<!doctype html><meta charset="utf-8"><title>Look board ${esc(folder)}</title><style>body{font:14px system-ui;margin:16px;background:#f2f1ee;color:#1b1b1d}section>div{display:flex;gap:8px}figure{margin:0;flex:1;min-width:0}img{width:100%;display:block;background:#ddd}h3 span{font-weight:400;opacity:.7}.moved h3{color:#c8282e}figcaption{font-size:11px;opacity:.7}</style><h1>${esc(folder)}</h1><p>${rows.filter((r) => moved(r.diff)).length} moved, ${rows.filter((r) => !r.diff).length} without a baseline, of ${rows.length}.</p>\n${body}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  const dirs = existsSync(look) ? readdirSync(look).filter((d) => d !== 'baseline' && statSync(`${look}${d}`).isDirectory()) : [];
  const folder = arg || dirs.map((d) => ({ d, t: statSync(`${look}${d}`).mtimeMs })).sort((a, b) => b.t - a.t)[0]?.d;
  if (!folder) { console.error('look/ has no run yet: npm run look:serve, open /?look and press Run all.'); process.exit(1); }
  const rows = compareFolders(`${look}${folder}`, `${look}baseline`, `${look}${folder}/diff`);
  writeFileSync(`${look}${folder}/index.html`, sheet(folder, rows));
  for (const r of rows.filter((x) => moved(x.diff))) console.log(`${r.file}: ${verdict(r.diff)}`);
  console.log(`${rows.filter((r) => moved(r.diff)).length} moved, ${rows.filter((r) => !r.diff).length} without a baseline, of ${rows.length}. Contact sheet: look/${folder}/index.html`);
}
