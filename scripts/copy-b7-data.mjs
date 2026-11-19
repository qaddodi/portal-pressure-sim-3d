#!/usr/bin/env node
// Copies what the Circuit view needs from the 2D app, so nothing is retyped (parity plan section 5: words come from the 2D source):
//   src/scene/circuit/data.copied.ts   the map's courses (every vessel's circuit path, after the junction cuts), station places and kinds, zone names and spans,
//                                      lane captions, the liver's branches, the junction points, the dot sizes, the map's colours per look, the flow peel's constant
// Usage: node scripts/copy-b7-data.mjs --from <2D checkout> [--check]    (--check writes nothing and fails when the file would change)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const from = flag('--from') ?? process.env.PPS_2D_REPO;
const check = args.includes('--check');
if (!from || !existsSync(`${from}/src/ui/anatomy.js`)) { console.error('usage: copy-b7-data.mjs --from <2D checkout>'); process.exit(2); }
let commit = 'unknown';
try { commit = execFileSync('git', ['-C', from, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }
const target = new URL('../src/scene/circuit/data.copied.ts', import.meta.url);
const routerTarget = new URL('../src/scene/circuit/router.copied.js', import.meta.url);

const imp = (p) => import(pathToFileURL(`${from}/${p}`).href);
const A = await imp('src/ui/anatomy.js');
const T = await imp('src/engine/portal/topology.js');
const CN = await imp('src/ui/circuit-nodes.js');
const PEEL = await imp('src/ui/flow-peel.js');
const TT = await imp('src/ui/theme-tokens.js');
const MOTION = await imp('src/ui/motion.js');
const css = readFileSync(`${from}/styles/tokens.css`, 'utf8');
const srcOf = (p) => readFileSync(`${from}/${p}`, 'utf8');
// a literal (object or array) written in a source file as `const NAME = <literal>;`, read without running the file
const literal = (text, name) => {
  const at = text.indexOf(`${name} =`);
  if (at < 0) throw new Error(`no ${name} in the 2D source`);
  let i = text.indexOf('=', at) + 1, depth = 0, j = i;
  for (; j < text.length; j++) { const c = text[j]; if ('{[('.includes(c)) depth++; else if ('}])'.includes(c)) { depth--; if (depth === 0) { j++; break; } } }
  return Function(`return ${text.slice(i, j)}`)();
};

const r1 = (v) => Math.round(v * 10) / 10;
const round2 = (p) => [r1(p[0]), r1(p[1])];

// ---- courses: the circuit path of every edge (the 2D stage's rule: CIRCUIT_PATH, else a transit-map route between the stations) ----
const courses = {};
for (const e of T.EDGES) {
  const a = A.NODE_POS[e.from], b = A.NODE_POS[e.to];
  let d = A.CIRCUIT_PATH[e.id];
  if (!d && a && b && e.shunt !== 'custom') d = A.metroPath(a[1], b[1]);
  if (d) courses[e.id] = d;
}
// ---- stations ----
const nodes = {};
for (const n of T.NODES) {
  if (n.kind === 'wedge' || A.HIDDEN_NODES.has(n.id)) continue;
  const p = A.NODE_POS[n.id];
  if (!p) continue;
  nodes[n.id] = { at: round2(p[1]), kind: n.kind, r: CN.dotRadius(n.kind) };
}
// ---- the liver's branches ----
const trees = Object.fromEntries(Object.entries(A.CIRCUIT_TREES).map(([id, list]) => [id, list.map(({ d, k }) => ({ d, k }))]));
// ---- the map's colours per look: the zone bands (the chart's own), the dot grid, the ground the dots stand on ----
const cmapStageBg = (id) => {
  // the dark looks have their own ground in the circuit (`.stage-wrap.cmap`), the light ones keep theirs
  const sel = { dark: ':root[data-theme="dark"] .stage-wrap.cmap', navy: ':root[data-theme="dark"][data-palette="navy"] .stage-wrap.cmap', black: ':root[data-theme="dark"][data-palette="black"] .stage-wrap.cmap' }[id];
  if (!sel) return null;
  const at = css.indexOf(`\n${sel} {`);
  if (at < 0) throw new Error(`no ${sel} in tokens.css`);
  const m = /--stage-bg:\s*(#[0-9A-Fa-f]{6})/.exec(css.slice(at, css.indexOf('}', at)));
  if (!m) throw new Error(`no --stage-bg in ${sel}`);
  return m[1].toUpperCase();
};
const mapBase = (name) => { const at = css.indexOf('\n.stage-wrap.cmap {'); const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(css.slice(at, css.indexOf('}', at))); if (!m) throw new Error(`--${name} not in .stage-wrap.cmap`); return m[1].trim(); };
const rgba = (s) => { const m = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)/.exec(s); if (!m) throw new Error(`not an rgba: ${s}`); return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] == null ? 1 : Number(m[4])]; };
const looks = {};
for (const id of TT.LOOK_IDS) {
  const t = TT.tokensOfLook(id);
  looks[id] = {
    bands: ['chart-pre-band', 'chart-liver-band', 'chart-post-band'].map((k) => rgba(t[k])),
    dot: rgba(mapBase('map-dot')),
    ground: cmapStageBg(id),
  };
}

// ---- the labels on the map: station captions (preferred sides, priority), zone titles' short forms, the resistors' words and sizes ----
const labels = Object.fromEntries(Object.entries(A.CIRCUIT_LABELS).map(([id, v]) => [id, { dirs: v.dirs, pri: v.pri }]));
const zoneShort = literal(srcOf('src/ui/stage.js'), 'const ZONE_SHORT');
const resSrc = srcOf('src/ui/stage-resistors.js'), sitesSrc = srcOf('src/ui/stage-sites.js');
const RES_LABEL = literal(resSrc, 'RES_LABEL'), RES_FULL = literal(resSrc, 'RES_FULL');
const resLiver = literal(sitesSrc, 'const RES_LIVER');
const num = (name) => { const m = new RegExp(`${name} = ([\\d.]+)`).exec(resSrc); if (!m) throw new Error(`no ${name}`); return Number(m[1]); };
const resSizes = { amp: num('RES_AMP'), teeth: num('RES_TEETH'), minAmpPx: num('RES_MIN_AMP_PX'), outline: num('RES_OUTLINE'), veil: num('RES_VEIL'), w0: num('RES_W0'), w1: num('RES_W1'), wk: num('RES_WK') };
// every station's place on the map (the hidden ones too: a custom shunt is routed between them)
const nodeAll = {};
for (const n of T.NODES) { const p = A.NODE_POS[n.id]; if (p) nodeAll[n.id] = round2(p[1]); }
// the stations a routed shunt keeps clear of (every one with a place and not hidden)
const routerStations = T.NODES.filter((n) => A.NODE_POS[n.id] && !A.HIDDEN_NODES.has(n.id)).map((n) => round2(A.NODE_POS[n.id][1]));
// the custom shunts: every pair the engine can open one between
const customEdges = T.EDGES.filter((e) => e.shunt === 'custom').map((e) => [e.id, e.from, e.to]);
// the router and the rounded route text, copied whole
const routerText = srcOf('src/ui/circuit-router.js');
const anat = srcOf('src/ui/anatomy.js');
const rAt = anat.indexOf('export function route(pts, r = 16) {');
const rEnd = anat.indexOf('\n}\n', rAt) + 3;
if (rAt < 0 || rEnd < rAt) throw new Error('no route() in anatomy.js');
const routerBody = `// GENERATED by scripts/copy-b7-data.mjs from the 2D app at ${commit.slice(0, 8)} (circuit-router.js whole, and anatomy.js route()). Do not edit; run the script again.\n${routerText}\n${anat.slice(rAt, rEnd)}`;

const body = `// GENERATED by scripts/copy-b7-data.mjs from the 2D app at ${commit.slice(0, 8)} (anatomy.js CIRCUIT_PATH, CIRCUIT_TREES, CIRCUIT_ZONES, NODE_POS, LANE_CAPTIONS, LIVER_*; circuit-nodes.js; flow-peel.js; motion.js; tokens.css). Do not edit; run the script again.
// World units of the 2D circuit (the map is VB_CIRC wide and tall, y runs down). Courses are SVG path text (M, L, Q, C) sampled in src/scene/circuit/paths.ts.
/** The circuit's view box: x, y, width, height. */
export const VB_CIRC: readonly [number, number, number, number] = ${JSON.stringify(A.VB_CIRC)};
/** Each edge's circuit course (SVG path), every piece of a divided vein included. */
export const CIRCUIT_D: Readonly<Record<string, string>> = ${JSON.stringify(courses)};
/** The junction points on the host veins' circuit courses (where the lanes that join them were drawn to). */
export const JUNCTION_CIRCUIT: Readonly<Record<string, readonly [number, number]>> = ${JSON.stringify(A.JUNCTION_CIRCUIT)};
/** The stations with a dot: their place on the map, their kind and the dot's radius (map units). */
export const CIRCUIT_NODES: Readonly<Record<string, { at: readonly [number, number]; kind: string; r: number }>> = ${JSON.stringify(nodes)};
/** The liver's branches in the circuit (the portal venules dividing, the sinusoids gathering): each a path in the direction of flow and its caliber as a share of the vessel's. */
export const CIRCUIT_TREES: Readonly<Record<string, readonly { d: string; k: number }[]>> = ${JSON.stringify(trees)};
/** The pressure zones along the top of the map: [caption, x0, x1]. */
export const CIRCUIT_ZONES: readonly (readonly [string, number, number])[] = ${JSON.stringify(A.CIRCUIT_ZONES)};
/** The collateral and shunt lanes' captions (edge to caption). */
export const LANE_CAPTIONS: Readonly<Record<string, string>> = ${JSON.stringify(A.LANE_CAPTIONS)};
/** The liver module's inner stations and edges. */
export const LIVER_INNER: readonly string[] = ${JSON.stringify([...A.LIVER_INNER])};
export const LIVER_EDGES: readonly string[] = ${JSON.stringify([...A.LIVER_EDGES])};
/** The flow peel: how much of the change the wave spreads over (the heart starts when this share has gone). */
export const PEEL_DL = ${PEEL.PEEL_DL};
/** The change between the views and the circuit's quarter turn, ms. */
export const VIEW_CHANGE_MS = ${MOTION.VIEW_CHANGE_MS};
export const TURN_MS = ${MOTION.TURN_MS};
/** The tinted zones' edges in the map (the portal veins' x span, the liver's, the hepatic veins'): mapAlt in veins-gl.js. */
export const MAP_ZONE_X: readonly [number, number, number, number] = ${JSON.stringify(A.CIRCUIT_ZONES.slice(1, 4).map((z) => z[1]).concat([A.CIRCUIT_ZONES[3][2]]))};
/** The map's colours per look: the three zone bands (before the liver, the liver, after it; rgb 0 to 255, alpha 0 to 1), the dot grid, and the ground the dark looks take in the circuit (null: the look's own). */
export const MAP_LOOKS: Readonly<Record<string, { bands: readonly (readonly number[])[]; dot: readonly number[]; ground: string | null }>> = ${JSON.stringify(looks)};
/** The stations' captions on the map: the sides they prefer, in order, and their priority (higher wins when room is short). */
export const CIRCUIT_LABELS: Readonly<Record<string, { dirs: readonly string[]; pri: number }>> = ${JSON.stringify(labels)};
/** A zone title's shorter forms, tried in order when the band is too narrow for it. */
export const ZONE_SHORT: Readonly<Record<string, readonly string[]>> = ${JSON.stringify(zoneShort)};
/** The resistors: their short and full names, the liver's two zigzags (x0, y0, x1, y1 each lobe) and the zigzag's sizes (map units; widths in px). */
export const RES_LABEL: Readonly<Record<string, string>> = ${JSON.stringify(RES_LABEL)};
export const RES_FULL: Readonly<Record<string, string>> = ${JSON.stringify(RES_FULL)};
export const RES_LIVER: readonly number[] = ${JSON.stringify([...resLiver])};
export const RES_SIZES: Readonly<Record<'amp' | 'teeth' | 'minAmpPx' | 'outline' | 'veil' | 'w0' | 'w1' | 'wk', number>> = ${JSON.stringify(resSizes)};
/** Every station's place on the map, the hidden ones too. */
export const NODE_CIRCUIT: Readonly<Record<string, readonly [number, number]>> = ${JSON.stringify(nodeAll)};
/** The stations a routed custom shunt keeps clear of. */
export const ROUTER_STATIONS: readonly (readonly [number, number])[] = ${JSON.stringify(routerStations)};
/** The custom shunts the engine can open: [edge, from, to]. */
export const CUSTOM_EDGES: readonly (readonly [string, string, string])[] = ${JSON.stringify(customEdges)};
`;

const same = existsSync(target) && readFileSync(target, 'utf8') === body && existsSync(routerTarget) && readFileSync(routerTarget, 'utf8') === routerBody;
if (check) { if (!same) { console.error('copy-b7-data: out of date'); process.exit(1); } console.log('copy-b7-data: up to date'); }
else if (!same) { writeFileSync(target, body); writeFileSync(routerTarget, routerBody); console.log('copy-b7-data: wrote src/scene/circuit/data.copied.ts and router.copied.js'); }
else console.log('copy-b7-data: nothing changed');
