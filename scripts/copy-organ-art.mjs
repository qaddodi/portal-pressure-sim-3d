#!/usr/bin/env node
// Copies what the 2D figure draws ON its organs that the 3D pillows have not: the gut's art (organ-art.js: the small bowel's loops with their rims and lights, the colon's
// haustra, bands, folds and rim shade), the surface lines of the organs (anatomy.js ORGAN_DETAIL: the stomach's rugae, the spleen's, kidney's and heart's hairlines) and the
// esophagus (the outline the stage paints with the stomach as one shape, its top fade and the seam where its tone gives way to the stomach's). Plus the few tokens the gut art
// reads (--og-hi, --og-hi-k, --gut-rim-k, --og-ao per look). Never edited by hand.
//
//   node scripts/copy-organ-art.mjs --from <2D checkout> [--check]
//
// Writes public/anatomy/organ-art.json (fetched at boot like organs.bin, so it stays out of the entry chunk). Curves are flattened and each polyline simplified to 0.2 units
// (the figure is drawn at about 1 to 3 pixels a unit), numbers kept to 0.1. src/scene/organs/organ-art.ts paints it into a small texture per organ.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { flattenPath } from '../src/scene/labels/organ2d/flatten.js';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const from = arg('--from') ?? process.env.PPS_2D_REPO, check = process.argv.includes('--check');
if (!from) { console.error('usage: node scripts/copy-organ-art.mjs --from <2D checkout> [--check]'); process.exit(2); }
const out = resolve(here, '../public/anatomy/organ-art.json');
const sha = (() => { try { return execFileSync('git', ['-C', from, 'rev-parse', '--short=10', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return 'unknown'; } })();

const TOL = 0.2;
const r1 = (v) => Math.round(v * 10) / 10;
/** Douglas-Peucker over a flat [x, y, ...] polyline. */
function simplify(P, tol) {
  const n = P.length / 2;
  if (n < 3) return P;
  if (Math.hypot(P[0] - P[n * 2 - 2], P[1] - P[n * 2 - 1]) < 1e-6) {
    // a ring (first point = last): cut it at the point farthest from its start, or the chord is a point and nothing is kept
    let fi = 1, fd = 0;
    for (let i = 1; i < n - 1; i++) { const d = Math.hypot(P[i * 2] - P[0], P[i * 2 + 1] - P[1]); if (d > fd) { fd = d; fi = i; } }
    const a = simplify(P.slice(0, fi * 2 + 2), tol), b = simplify(P.slice(fi * 2), tol);
    return a.concat(b.slice(2));
  }
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const st = [[0, n - 1]];
  while (st.length) {
    const [a, b] = st.pop();
    const ax = P[a * 2], ay = P[a * 2 + 1], dx = P[b * 2] - ax, dy = P[b * 2 + 1] - ay, L = Math.hypot(dx, dy) || 1e-9;
    let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((P[i * 2] - ax) * dy - (P[i * 2 + 1] - ay) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  const o = [];
  for (let i = 0; i < n; i++) if (keep[i]) o.push(r1(P[i * 2]), r1(P[i * 2 + 1]));
  return o;
}
/** A path's subpaths, flattened and simplified: { s: [[x, y, ...]], z: [closed, ...] } (z left out when every subpath is open). */
function shape(d) {
  const subs = flattenPath(d, 1).map((p) => ({ pts: simplify(p.pts, TOL), closed: !!p.closed })).filter((p) => p.pts.length >= 4);
  const z = subs.map((p) => (p.closed ? 1 : 0));
  return { s: subs.map((p) => p.pts), ...(z.some(Boolean) ? { z } : {}) };
}
const bbox = (flat) => { const b = [1e9, 1e9, -1e9, -1e9]; for (let i = 0; i < flat.length; i += 2) { b[0] = Math.min(b[0], flat[i]); b[1] = Math.min(b[1], flat[i + 1]); b[2] = Math.max(b[2], flat[i]); b[3] = Math.max(b[3], flat[i + 1]); } return b; };
const boxOf = (b, pad = 0) => [r1(b[0] - pad), r1(b[1] - pad), r1(b[2] - b[0] + 2 * pad), r1(b[3] - b[1] + 2 * pad)];

/** organ-art.js markup (defs, clipPaths, groups and paths) as { clips: { id: polyline }, kids: [group or leaf] }. */
function parseArt(svg) {
  const clips = {}, root = { kids: [] }, stack = [root];
  let clipId = null;
  const re = /<(\/?)(defs|clipPath|g|path)\b([^>]*?)(\/?)>/g;
  const attr = (a, k) => (a.match(new RegExp(`\\b${k}="([^"]*)"`)) || [])[1];
  let m;
  while ((m = re.exec(svg))) {
    const [, close, tag, a, self] = m;
    if (tag === 'defs') continue;
    if (tag === 'clipPath') { clipId = close ? null : attr(a, 'id'); continue; }
    if (tag === 'g') {
      if (close) { stack.pop(); continue; }
      const g = { kids: [] };
      const cp = attr(a, 'clip-path'); if (cp) g.clip = /url\(#([^)]+)\)/.exec(cp)[1];
      const op = attr(a, 'opacity'); if (op) g.op = Number(op);
      stack[stack.length - 1].kids.push(g); stack.push(g);
      continue;
    }
    if (tag === 'path' && !close) {
      const d = attr(a, 'd');
      if (clipId) { clips[clipId] = shape(d).s[0]; continue; }
      const leaf = { c: attr(a, 'class'), ...shape(d) };
      const w = attr(a, 'stroke-width'); if (w !== undefined) leaf.w = Number(w);
      const t = attr(a, 'transform'); if (t) { const n = /^translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)\s*\)$/.exec(t); if (!n) throw new Error(`transform ${t}: look at it`); leaf.t = [Number(n[1]), Number(n[2])]; }
      stack[stack.length - 1].kids.push(leaf);
    }
  }
  return { clips, kids: root.kids };
}
/** every leaf of a tree, in painting order */
function* leaves(kids) { for (const k of kids) { if (k.kids) yield* leaves(k.kids); else yield k; } }
/** drops the leaves `skip` says (the empty groups they leave stay: the painter ignores them) */
function prune(kids, skip) { return kids.filter((k) => (k.kids ? (k.kids = prune(k.kids, skip), true) : !skip(k))); }

const art = await import(pathToFileURL(resolve(from, 'src/ui/organ-art.js')).href);
const anat = await import(pathToFileURL(resolve(from, 'src/ui/anatomy.js')).href);

// the tokens the gut art reads, per look (the same blocks copy-organ-tones.mjs reads)
const css = readFileSync(resolve(from, 'styles/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
function block(sel) {
  const vars = {}, re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    if (m[1].trim().replace(/\s+/g, ' ') !== sel) continue;
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[d[1]] = d[2].trim();
  }
  return vars;
}
const root = block(':root');
const looks = { light: root, soft: { ...root, ...block(':root[data-theme="soft"]') }, dark: { ...root, ...block(':root[data-theme="dark"]') } };
looks.navy = { ...looks.dark, ...block(':root[data-theme="dark"][data-palette="navy"]') };
looks.black = { ...looks.dark, ...block(':root[data-theme="dark"][data-palette="black"]') };
const rgba = (v, k) => {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*[,/]\s*([\d.]+))?\s*\)/.exec(v ?? '');
  if (!m) throw new Error(`${k} is not a colour: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
};
const pct = (v, k) => { const m = /^([\d.]+)%$/.exec(v ?? ''); if (!m) throw new Error(`${k} is not a percentage: ${v}`); return Number(m[1]) / 100; };
const tokens = {};
for (const [id, v] of Object.entries(looks)) tokens[id] = { hi: rgba(v['--og-hi'], `${id} --og-hi`).slice(0, 3), hiK: pct(v['--og-hi-k'], `${id} --og-hi-k`), rimK: pct(v['--gut-rim-k'], `${id} --gut-rim-k`), ao: rgba(v['--og-ao'], `${id} --og-ao`) };

// the class rules the painter (organ-art.ts STYLE) hard-codes: check the 2D stylesheet still says them, so a changed width or opacity is seen here
import { readdirSync } from 'node:fs';
const app = readdirSync(resolve(from, 'styles')).filter((f) => /^app(-\d\d-[\w-]+)?\.css$/.test(f)).sort().map((f) => readFileSync(resolve(from, 'styles', f), 'utf8')).join('\n');
const RULES = [
  '.oc-ao { fill: var(--og-ao); stroke: var(--og-ao); stroke-width: 8;', '.oc-o1 { fill: var(--o1); }',
  '.oc-wall, .oc-pouch { fill: var(--o2); fill-opacity: .49; stroke: var(--o3); stroke-width: .84; stroke-opacity: .42;', '.oc-pouch { fill-opacity: .42; }',
  '.oc-tail { fill: var(--o2); fill-opacity: .5; }', '.oc-line { fill: none; stroke: var(--o3); stroke-width: .84; stroke-opacity: .42;',
  '.oc-valve { fill: none; stroke: var(--o3); stroke-width: 1; stroke-opacity: .35;', '.oc-band { fill: var(--o1); stroke: var(--o3); stroke-width: .9; stroke-opacity: .45;',
  '.oc-band-lit { fill: var(--og-light); fill-opacity: .32; }', '.oc-shade { fill: var(--o3); stroke: var(--o3); stroke-width: 16;',
  '.oc-fold { fill: none; stroke: var(--o3); stroke-width: 1.6; stroke-opacity: .7;', '.oc-rim-shade.s1 { stroke-width: 24; stroke-opacity: .08; }',
  '.oc-rim-shade.s2 { stroke-width: 14; stroke-opacity: .12; }', '.oc-rim-shade.s3 { stroke-width: 6; stroke-opacity: .18; }', '.oc-rim-light { stroke: var(--og-light); stroke-width: 4; stroke-opacity: .22; }',
  '.ob-ao { stroke: var(--og-ao); }', '.ob-deep, .ob-space { stroke: color-mix(in srgb, var(--o1) 40%, var(--o2)); }', '.ob-space { fill: color-mix(in srgb, var(--o1) 40%, var(--o2));',
  '.ob-rim { stroke: color-mix(in srgb, var(--o1) var(--gut-rim-k), var(--o3)); }', '.ob-edge { stroke: color-mix(in srgb, var(--o1) 58%, var(--o3)); }', '.ob-wall { stroke: var(--o1); }',
  '.ob-shade { stroke: color-mix(in srgb, var(--o1) 50%, var(--o2)); }', '.ob-hi { stroke: color-mix(in srgb, var(--o1), var(--og-hi) var(--og-hi-k)); }',
  ':root[data-theme="soft"] :is(.ob-deep, .ob-space, .ob-rim, .ob-edge, .ob-wall, .ob-shade, .ob-hi) { --o1: color-mix(in srgb, var(--og-gut-1) 65%, var(--og-gut-2)); }',
  '.org-detail .od-fine { stroke: var(--o3); stroke-width: .9; stroke-opacity: .55; }', '.org-detail .od-fold { stroke: var(--o3); stroke-width: 1.4; stroke-opacity: .16; }',
];
for (const r of RULES) if (!app.includes(r)) throw new Error(`the 2D stylesheet no longer says: ${r}\nlook at it, then update STYLE in src/scene/organs/organ-art.ts and RULES here`);

// the gut: the small bowel (its pile's base fill, a stroke of width 0, is the pillow's own colour here) and the colon, as the stage draws them
const arts = {};
function gut(id, svg, tone, skip) {
  const t = parseArt(svg);
  t.kids = prune(t.kids, skip);
  const top = t.kids.find((k) => k.clip);
  const b = bbox(top ? t.clips[top.clip] : [...leaves(t.kids)].flatMap((l) => l.s.flat()));
  arts[id] = { tone, box: boxOf(b, 3), clips: t.clips, kids: t.kids };
}
gut('bowel', art.BOWEL_ART, 'gut', (l) => l.c === 'ob-space' && l.w === 0);
gut('colon', art.COLON_ART, 'gut', () => false);

// the surface lines each organ carries (stage.js detailFor: clipped to the organ, here to its pillow)
const TONE_OF = { liver: 'liver', stomach: 'stomach', spleen: 'spleen', 'kidney-l': 'kidney', heart: 'heart' };
for (const [id, list] of Object.entries(anat.ORGAN_DETAIL)) {
  if (!TONE_OF[id]) continue;
  const kids = list.map(([kind, d]) => ({ c: `od-${kind}`, ...shape(d) }));
  arts[id] = { tone: TONE_OF[id], box: boxOf(bbox(kids.flatMap((k) => k.s.flat())), 6), clips: {}, kids };
}

// the esophagus: the stage's own outline for it (stage-organs.js closes it at the cardia, L 792 251 -> L 813 266 L 792 266), and the numbers of its fades
const esoD = anat.ORGANS.find((o) => o.id === 'esophagus').d.replace('L 792 251', 'L 813 266 L 792 266');
if (!esoD.includes('L 813 266 L 792 266')) throw new Error('the esophagus outline is not what the stage closes at the cardia: look at it');
const eso = flattenPath(esoD, 1)[0].pts.map(r1);
const stomachD = anat.ORGANS.find((o) => o.id === 'stomach').d;
const sources = readFileSync(resolve(from, 'src/ui/stage.js'), 'utf8');
for (const needle of ['id="rectFadeG" gradientUnits="userSpaceOnUse" x1="0" y1="${RECTUM_FADE[0]}" x2="0" y2="${RECTUM_FADE[1]}"', 'id="esoFadeG" gradientUnits="userSpaceOnUse" x1="0" y1="40" x2="0" y2="-40"', 'id="seamFG" gradientUnits="userSpaceOnUse" x1="0" y1="226" x2="0" y2="262"']) if (!sources.includes(needle)) throw new Error(`stage.js no longer has ${needle}`);
const data = {
  from: sha,
  tokens,
  eso: { poly: eso, box: boxOf(bbox(eso)), fade: [40, -40], seam: [226, 262] },
  rectum: anat.RECTUM_FADE,
  stomachBox: boxOf(bbox(flattenPath(stomachD, 1)[0].pts)),
  arts,
};
const text = JSON.stringify(data) + '\n';
const strip = (t) => t.replace(/"from":"[^"]*",/, '');
if (check) {
  if (!existsSync(out) || strip(readFileSync(out, 'utf8')) !== strip(text)) { console.error('public/anatomy/organ-art.json differs from the 2D app: run scripts/copy-organ-art.mjs'); process.exit(1); }
  console.log('organ art: same as the 2D app');
} else {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, text);
  console.log(`wrote public/anatomy/organ-art.json (${(text.length / 1024).toFixed(0)} KB, ${Object.keys(arts).join(', ')}, 2D at ${sha})`);
}
