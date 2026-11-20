#!/usr/bin/env node
// Copies the 2D organ painter's tones from the 2D app's styles/tokens.css: per look every --og-<organ>-1/2/3 (the gradient's two stops and the outline),
// --og-light, --og-dark, --og-vol-shade, --og-ao, --light-ink and --gut-a, the organ layer's opacity from styles/app.css (#organs > .organ, the kidney's own),
// and the rest of the organ painter's numbers: #ogVol's centre, radius and stops (stage.js), the soft AO seat's width, the inner shade's three steps and the rim light's
// opacity (the right atrium's own), and the liver's gloss (#lvSheen: its two ellipses, stage-organs.js, and its stop opacities per look). The 3D organs paint with these
// (src/scene/organs/organ-shader.ts) so they are 2D's wash. Never edited by hand.
//
//   node scripts/copy-organ-tones.mjs --from <2D checkout> [--check]
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const from = arg('--from') ?? process.env.PPS_2D_REPO, check = process.argv.includes('--check');
if (!from) { console.error('usage: node scripts/copy-organ-tones.mjs --from <2D checkout> [--check]'); process.exit(2); }
const out = resolve(here, '../src/looks/organ-tones.copied.ts');
const sha = (() => { try { return execFileSync('git', ['-C', from, 'rev-parse', '--short=10', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return 'unknown'; } })();

const css = readFileSync(resolve(from, 'styles/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** the custom properties of every top-level block whose selector is exactly `sel` (and of the dark media block for 'media-dark'), in order */
function block(sel) {
  const vars = {};
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    if (m[1].trim().replace(/\s+/g, ' ') !== sel) continue;
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[d[1]] = d[2].trim();
  }
  return vars;
}
const root = block(':root');
const looks = {
  light: root,
  soft: { ...root, ...block(':root[data-theme="soft"]') },
  dark: { ...root, ...block(':root[data-theme="dark"]') },
};
looks.navy = { ...looks.dark, ...block(':root[data-theme="dark"][data-palette="navy"]') };
looks.black = { ...looks.dark, ...block(':root[data-theme="dark"][data-palette="black"]') };

// 2D's main has one styles/app.css; its preview branch (b3058ef3, the commit every copy here is pinned to) splits it into styles/app-NN-*.css
const app = readdirSync(resolve(from, 'styles')).filter((f) => /^app(-\d\d-[\w-]+)?\.css$/.test(f)).sort().map((f) => readFileSync(resolve(from, 'styles', f), 'utf8')).join('\n');
const op = (re) => { const m = app.match(re); if (!m) throw new Error(`styles/app.css no longer has ${re}: look at it`); return Number(m[1]); };
const opt = (re, d) => { const m = app.match(re); return m ? Number(m[1]) : d; };
const layer = op(/\n#organs > \.organ \{ opacity: ([\d.]+); \}/), kidney = op(/\n#organs > \.organ\.organ-kidney-l \{ opacity: ([\d.]+); \}/);
const softLayer = opt(/:root\[data-theme="soft"\] #organs > \.organ:not\(\.organ-gut\) \{ opacity: ([\d.]+); \}/, layer);
const softKidney = opt(/:root\[data-theme="soft"\] #organs > \.organ\.organ-kidney-l \{ opacity: ([\d.]+); \}/, kidney);

/** the last match's first group of `re` in the 2D styles (the cascade's winner among rules of one specificity), as a number */
const lastNum = (re, what) => {
  const all = [...app.matchAll(new RegExp(re.source, 'g'))];
  if (!all.length) throw new Error(`styles/app*.css no longer has ${what}: look at it`);
  return Number(all[all.length - 1][1]);
};
const aoW = lastNum(/\.organ \.org-ao \{[^}]*stroke-width: ([\d.]+)/, '.organ .org-ao stroke-width');
const shade = [1, 2, 3].map((i) => lastNum(new RegExp(`\\.organ \\.org-shade\\.s${i} \\{[^}]*stroke-opacity: ([\\d.]+)`), `.organ .org-shade.s${i} stroke-opacity`));
const rim = lastNum(/\.organ \.org-rimlight \{ stroke-opacity: ([\d.]+); \}/, '.organ .org-rimlight stroke-opacity');
const raRim = lastNum(/\.organ-heart-ra \.org-rimlight \{ stroke-opacity: ([\d.]+); \}/, '.organ-heart-ra .org-rimlight stroke-opacity');
const raShade = lastNum(/\.organ-heart-ra \.org-shade\.s1[^{]*\{ stroke-opacity: ([\d.]+); \}/, '.organ-heart-ra .org-shade stroke-opacity');

// the volume radial (stage.js #ogVol) and the liver's sheen (stage-organs.js #lvSheen and its two ellipses)
const stageJs = readFileSync(resolve(from, 'src/ui/stage.js'), 'utf8'), organsJs = readFileSync(resolve(from, 'src/ui/stage-organs.js'), 'utf8');
const volM = /<radialGradient id="ogVol" cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)">([\s\S]*?)<\/radialGradient>/.exec(stageJs);
if (!volM) throw new Error('stage.js no longer has #ogVol: look at it');
const volStops = [...volM[4].matchAll(/<stop offset="([\d.]+)" style="stop-color:var\((--[\w-]+)\);stop-opacity:([\d.]+)"\/>/g)].map((m) => ({ off: Number(m[1]), tok: m[2], a: Number(m[3]) }));
if (volStops.length !== 4 || volStops[0].tok !== '--light-ink' || volStops[3].tok !== '--og-vol-shade') throw new Error('#ogVol is no longer light, light, shade, shade: look at it');
const sheenM = /<radialGradient id="lvSheen">([\s\S]*?)<\/radialGradient>/.exec(organsJs);
const sheenOff = sheenM ? [...sheenM[1].matchAll(/<stop offset="([\d.]+)"/g)].map((m) => Number(m[1])) : [];
const ellipses = [...organsJs.matchAll(/s\('ellipse', \{ cx: ([\d.]+), cy: ([\d.]+), rx: ([\d.]+), ry: ([\d.]+), transform: 'rotate\((-?[\d.]+) ([\d.]+) ([\d.]+)\)', fill: 'url\(#lvSheen\)' \}\)/g)].map((m) => m.slice(1, 8).map(Number));
if (sheenOff.length !== 3 || ellipses.length !== 2) throw new Error('stage-organs.js no longer has the liver sheen as three stops and two ellipses: look at it');
/** the sheen stop i's opacity in a look: the base rule, and the dark looks' (data-theme="dark": Dark, Navy and Black) */
const sheenA = (i, dark) => {
  const base = op(new RegExp(`\\.lv-sh${i} \\{ stop-color: var\\(--light-ink\\); stop-opacity: ([\\d.]+); \\}`));
  const m = app.match(new RegExp(`:root\\[data-theme="dark"\\] \\.lv-sh${i} \\{ stop-opacity: ([\\d.]+); \\}`));
  return dark && m ? Number(m[1]) : base;
};

const ORGANS = ['liver', 'stomach', 'eso', 'spleen', 'kidney', 'gut', 'heart', 'ra'];
const hex = (v, k) => { if (!/^#[0-9a-f]{6}$/i.test(v ?? '')) throw new Error(`${k} is not a #rrggbb: ${v}`); return v.toUpperCase(); };
const rgba = (v, k) => {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*[,/]\s*([\d.]+))?\s*\)/.exec(v ?? '') ?? (/^#/.test(v ?? '') ? [0, ...[1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)), 1] : null);
  if (!m) throw new Error(`${k} is not a colour: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
};
const table = {};
for (const [id, v] of Object.entries(looks)) {
  const t = { tones: {} };
  for (const o of ORGANS) t.tones[o] = [1, 2, 3].map((i) => hex(v[`--og-${o}-${i}`], `${id} --og-${o}-${i}`));
  t.light = rgba(v['--og-light'], `${id} --og-light`); t.dark = rgba(v['--og-dark'], `${id} --og-dark`); t.volShade = rgba(v['--og-vol-shade'], `${id} --og-vol-shade`);
  t.gutA = Number(v['--gut-a']);
  t.ao = rgba(v['--og-ao'], `${id} --og-ao`); t.aoW = aoW;
  const li = rgba(v['--light-ink'], `${id} --light-ink`), dk = id === 'dark' || id === 'navy' || id === 'black';
  t.vol = { cx: Number(volM[1]), cy: Number(volM[2]), r: Number(volM[3]), light: [li[0], li[1], li[2], volStops[0].a], lightEnd: volStops[1].off, shadeStart: volStops[2].off, shadeA: volStops[3].a };
  t.shade = shade; t.rim = rim; t.raShade = raShade; t.raRim = raRim;
  t.gloss = { ellipses, stops: [0, 1, 2].map((i) => ({ off: sheenOff[i], a: sheenA(i, dk) })) };
  t.layer = id === 'soft' ? softLayer : layer; t.kidney = id === 'soft' ? softKidney : kidney;
  table[id] = t;
}

const text = `// @generated by scripts/copy-organ-tones.mjs from styles/tokens.css and styles/app*.css of qaddodi/portal-pressure-simulator at ${sha}. Do not edit: run the script again.
export type Rgba = readonly [number, number, number, number];
export interface OrganTones2D { tones: Record<${ORGANS.map((o) => `'${o}'`).join(' | ')}, readonly [string, string, string]>; light: Rgba; dark: Rgba; volShade: Rgba; gutA: number; /** the soft AO seat (.org-ao: --og-ao, its stroke's width) */ ao: Rgba; aoW: number; /** #ogVol: centre, radius, --light-ink with the first stop's opacity, where the light ends and the shade starts, the shade's opacity */ vol: { cx: number; cy: number; r: number; light: Rgba; lightEnd: number; shadeStart: number; shadeA: number }; /** the inner shade's three strokes' opacities, the rim light's, and the right atrium's own */ shade: readonly [number, number, number]; rim: number; raShade: number; raRim: number; /** the liver's capsule sheen (#lvSheen): its ellipses (cx, cy, rx, ry, turn, turn about x, y; the figure's units) and its stops */ gloss: { ellipses: readonly (readonly number[])[]; stops: readonly { off: number; a: number }[] }; /** the organ layer's opacity (#organs > .organ) */ layer: number; /** the kidney's own (.organ-kidney-l) */ kidney: number }
export const ORGAN_TONES_2D: Record<'light' | 'soft' | 'dark' | 'navy' | 'black', OrganTones2D> = ${JSON.stringify(table, null, 1)};
`;
const strip = (t) => t.replace(/^\/\/ @generated.*\n/, '');
if (check) {
  if (!existsSync(out) || strip(readFileSync(out, 'utf8')) !== strip(text)) { console.error('src/looks/organ-tones.copied.ts differs from the 2D app: run scripts/copy-organ-tones.mjs'); process.exit(1); }
  console.log('organ tones: same as the 2D app');
} else { writeFileSync(out, text); console.log('wrote src/looks/organ-tones.copied.ts'); }
