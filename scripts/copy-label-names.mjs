#!/usr/bin/env node
// Copies the words and priorities of the figure's labels from the 2D app, so the 3D figure names things exactly as the 2D one does
// (parity plan, section 2: "Words come from the 2D source, never retyped").
//
//   node scripts/copy-label-names.mjs --from <2D checkout> [--check]
//
// Reads <2D>/src/ui/anatomy.js (SHORT full names, ABBR short forms, LABEL_VESSEL station to vessel, ORGAN_LABELS, CHIP_NODES, the
// atlas names), the label priorities in <2D>/src/ui/stage-label-items.js (ANAT_PRI, ANAT_EXTRA) and the figure key's words in
// <2D>/src/ui/presenter.js (LENS_KEY, PRESSURE_KEY), and writes src/scene/labels/names.copied.ts. The same file carries LABEL_STYLE: how a label
// is drawn (type roles and sizes, run weights and gaps, halo, leader and ring, the ink and halo of each look), read from type-scale.js,
// stage-label-size.js, stage-label-items.js, stage-label-solve.js, stage-label-text.js, styles/app.css and styles/tokens.css.
// --check writes nothing and exits 1 when the copied file differs from what the 2D source would give.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../src/scene/labels/names.copied.ts');

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const from = arg('--from');
const check = process.argv.includes('--check');
if (!from) { console.error('usage: node scripts/copy-label-names.mjs --from <2D checkout> [--check]'); process.exit(2); }
const src = (f) => resolve(from, f);

/** The text of a top-level `const NAME = <literal>;` block, found by its brackets (strings and comments inside are skipped). */
export function literalOf(text, name) {
  const m = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=\\s*`).exec(text);
  if (!m) throw new Error(`the 2D source has no "${name}" any more`);
  let i = m.index + m[0].length;
  const start = i;
  const open = text[i];
  const close = { '{': '}', '[': ']' }[open];
  if (!close) throw new Error(`"${name}" is not an object or array literal`);
  let depth = 0, q = null;
  for (; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`"${name}" is never closed`);
}
const evalLiteral = (lit, scope = {}) => vm.runInNewContext(`(${lit})`, scope);

export async function extract() {
  const anat = await import(pathToFileURL(src('src/ui/anatomy.js')).href);
  const items = readFileSync(src('src/ui/stage-label-items.js'), 'utf8');
  const pres = readFileSync(src('src/ui/presenter.js'), 'utf8');

  // The figure key: each lens names itself and either a colour scale (ramp, with its two end words) or named swatches ([css var, name, short?]).
  // A scale is a function in the 2D source; in 3D it is a ramp id the lens code supplies (the stub returns the lens's own name).
  const ramp = (id) => () => `ramp:${id}`;
  const lensRaw = evalLiteral(literalOf(pres, 'LENS_KEY'), { flowCss: ramp('flow'), heatCss: ramp('heat'), dropCss: ramp('drop'), oxygenCss: ramp('oxygen') });
  const pressureRaw = evalLiteral(literalOf(pres, 'PRESSURE_KEY'), { gradientCss: ramp('pressure') });
  const lens = {};
  const take = (k, v) => {
    const [name, bar, lo, hi] = v;
    if (typeof bar === 'function') {
      const id = bar(); lens[k] = { name, ramp: id === 'ramp:pressure' ? 'pressure' : (/^ramp:/.test(id) ? id.slice(5) : k), lo, hi };
    } else lens[k] = { name, swatches: bar.map(([cssVar, label, short]) => (short ? { cssVar, label, short } : { cssVar, label })) };
  };
  take('pressure', pressureRaw);
  for (const [k, v] of Object.entries(lensRaw)) {
    // delta's scale is an inline gradient string rather than a helper: its ramp is its own name
    take(k, v.map((x, i) => (i === 1 && typeof x === 'function' ? () => 'ramp:' + k : x)));
  }

  // The catheter's readings on the figure (hvpg-proc.js): the free reading at the tip, the wedged one ahead of it, the HVPG they give.
  const proc = readFileSync(src('src/ui/hvpg-proc.js'), 'utf8');
  const pick = (name, field) => { const m = new RegExp(`const ${name} = \\{[^}]*${field}: '([^']*)'`).exec(proc); if (!m) throw new Error(`hvpg-proc.js has no ${name} ${field} any more`); return m[1]; };
  const CALLOUTS = {
    free: { kicker: pick('lblF', 'kicker'), unit: pick('lblF', 'unit') },
    wedge: { kicker: pick('lblW', 'kicker'), unit: pick('lblW', 'unit') },
    result: { kicker: pick('lblCalc', 'kicker'), unit: pick('lblCalc', 'unit') },
  };

  // The colours the figure key's scales and swatches are made of, per look family (tokens.css): the lens ramps (stops "#colour position"), the swatch
  // colours, and the flow direction pair. Navy and Black use the Dark values; Soft is Light with its own overrides.
  const tokens = readFileSync(src('styles/tokens.css'), 'utf8');
  const blockAt = (sel) => { const i = tokens.indexOf(sel + ' {'); if (i < 0) throw new Error(`tokens.css has no "${sel}" block`); const o = tokens.indexOf('{', i); let d = 0; for (let k = o; k < tokens.length; k++) { if (tokens[k] === '{') d++; else if (tokens[k] === '}' && --d === 0) return tokens.slice(o + 1, k); } throw new Error('unclosed block'); };
  const WANT = ['vel-slow', 'vel-fast', 'delta-low', 'delta-mid', 'delta-high', 'origin-smv', 'origin-imv', 'origin-spleen', 'origin-artery', 'origin-systemic', 'fp-raw', 'fp-clear', 'flow-normal', 'flow-reversed', 'ramp-pressure', 'ramp-flow', 'ramp-velocity', 'ramp-heat', 'ramp-drop', 'ramp-oxygen'];
  const decls = (text) => { const o = {}; for (const m of text.matchAll(/--([a-z-]+):\s*([^;]+);/g)) if (WANT.includes(m[1])) o[m[1]] = m[2].trim(); return o; };
  const rootBlocks = [...tokens.matchAll(/^:root \{/gm)].map((m) => { const o = m.index + m[0].length - 1; let d = 0; for (let k = o; k < tokens.length; k++) { if (tokens[k] === '{') d++; else if (tokens[k] === '}' && --d === 0) return tokens.slice(o + 1, k); } return ''; });
  const light = Object.assign({}, ...rootBlocks.map(decls));
  const KEY_COLOURS = { light, soft: { ...light, ...decls(blockAt(':root[data-theme="soft"]')) }, dark: { ...light, ...decls(blockAt(':root[data-theme="dark"]')) } };
  for (const k of Object.keys(KEY_COLOURS)) for (const w of WANT) if (!KEY_COLOURS[k][w]) throw new Error(`tokens.css gives ${k} no --${w}`);

  // ── how a label is drawn (Mohammad, 19 Nov: "the labeling system font outline etc should also reflect the 2D app") ──
  const must = (text, re, what) => { const m = re.exec(text); if (!m) throw new Error(`the 2D source no longer says ${what}`); return m; };
  const num = (v) => Number(v);
  const scale = readFileSync(src('src/ui/type-scale.js'), 'utf8');
  const sizeJs = readFileSync(src('src/ui/stage-label-size.js'), 'utf8');
  const textJs = readFileSync(src('src/ui/stage-label-text.js'), 'utf8');
  const solveJs = readFileSync(src('src/ui/stage-label-solve.js'), 'utf8');
  const appCss = readFileSync(src('styles/app.css'), 'utf8');
  const roleM = must(scale, /roleOf = \(size\) => \(size >= ([\d.]+) \? 'val' : size >= ([\d.]+) \? 'lab' : 'cap'\)/, 'roleOf(size)');
  const runOf = (re, what, fields) => { const m = must(items, re, what); return Object.fromEntries(fields.map((f, i) => [f, num(m[i + 1])])); };
  const nameM = must(items, /\{ t: name, size: ([\d.]+), weight: one \? (\d+) : (\d+), cls: 'lb-name' \}/, 'the name run');
  const gapM = must(items, /\{ \.\.\.r, gap: (\d+) \}\)\);?/, 'the gap between a name and its value');
  const haloM = must(appCss, /paint-order: stroke; stroke: var\(--label-halo\); stroke-width: max\((\d+)px, calc\((\d+)px \* var\(--lbk, 1\)\)\)/, 'the label halo');
  const ringM = must(solveJs, /class: 'leader-dot', 'data-k': it\.key, cx, cy, r: '([\d.]+)'/, 'the leader ring');
  const ringCss = must(appCss, /\.leader-dot \{ fill: var\(--stage-bg\); stroke: var\(--text-2\); stroke-width: ([\d.]+); \}/, 'the leader ring stroke');
  const leadCss = must(appCss, /\.leader \{ fill: none; stroke: var\(--leader\); stroke-width: (\d+); \}/, 'the leader line');
  const organM = must(solveJs, /size: ([\d.]+), weight: (\d+), cls: 'lb-organ', track: ([\d.]+) \}\]\), align: 'middle', padX: (\d+), padY: (\d+)/, 'the organ caption');
  const padM = must(items, /padX: mode === 'inline' && !one \? \d+ : (\d+), padY: mode === 'inline' && !one \? \d+ : (\d+)/, 'the label padding');
  const phoneOrgan = must(appCss, /@media \(max-width: (\d+)px\) \{ \.lb-organ \{ fill: color-mix\(in srgb, var\(--text-3\) (\d+)%, var\(--stage-bg\)\); \} \}/, 'the phone organ ink');
  const STYLE = {
    ROLES: evalLiteral(literalOf(scale, 'ROLES')),
    FLUID_FROM: num(must(scale, /\(Math\.min\(w, h\) - (\d+)\) \/ (\d+)/, 'the fluid size')[1]), FLUID_SPAN: num(must(scale, /\(Math\.min\(w, h\) - (\d+)\) \/ (\d+)/, 'the fluid size')[2]),
    ROLE_VAL_FROM: num(roleM[1]), ROLE_LAB_FROM: num(roleM[2]),
    LABEL_K: num(must(textJs, /const deskK = \(\) => ([\d.]+)/, 'the label size factor')[1]),
    LINE_H: num(must(sizeJs, /return m \* ([\d.]+)/, 'the line height')[1]),
    BASELINE: num(must(items, /base = yy \+ lh \* ([\d.]+)/, 'the baseline')[1]),
    PAD: { x: num(padM[1]), y: num(padM[2]) },
    NAME: { size: num(nameM[1]), weight: num(nameM[2]) },
    VALUE: runOf(/const runs = \[\{ t: v, size: ([\d.]+), weight: (\d+), cls: 'lb-val' \}\];/, 'the value run', ['size', 'weight']),
    NAME_TO_VALUE: num(gapM[1]),
    UNIT: runOf(/runs\.push\(\{ t: u, size: ([\d.]+), weight: (\d+), cls: 'lb-unit', gap: ([\d.]+) \}\)/, 'the unit run', ['size', 'weight', 'gap']),
    DELTA: runOf(/size: ([\d.]+), weight: (\d+), cls: 'lb-delta ' \+ \(P > ref \? 'up' : 'down'\), gap: (\d+)/, 'the change run', ['size', 'weight', 'gap']),
    REVERSED: runOf(/t: '⟲', size: ([\d.]+), weight: (\d+), cls: 'lb-rev', gap: (\d+) \}\)/, 'the reversal mark', ['size', 'weight', 'gap']),
    ORGAN: { size: num(organM[1]), weight: num(organM[2]), track: num(organM[3]), padX: num(organM[4]), padY: num(organM[5]) },
    ORGAN_PHONE: { maxWidth: num(phoneOrgan[1]), mixPercent: num(phoneOrgan[2]) },
    HALO: { min: num(haloM[1]), perK: num(haloM[2]) },
    RING: { r: num(ringM[1]), stroke: num(ringCss[1]) },
    LEADER_WIDTH: num(leadCss[1]),
    TAP_DIM: num(must(appCss, /#labels \.lb\.spot-dim, \.lb-leaders > \.spot-dim \{ opacity: ([\d.]+); \}/, 'the tapped-label dim')[1]),
  };
  // The look's own ink, halo and ring colours (tokens.css): each look is the Light block plus what its own blocks change.
  const LABEL_WANT = ['text', 'text-2', 'text-3', 'stage-bg', 'label-halo', 'label-panel', 'leader', 'flow-reversed', 'accent-ink'];
  const declsOf = (text) => { const o = {}; for (const m of text.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) if (LABEL_WANT.includes(m[1])) o[m[1]] = m[2].trim(); return o; };
  const layer = (sel) => declsOf(blockAt(sel));
  const dark = { ...Object.assign({}, ...rootBlocks.map(declsOf)), ...layer(':root[data-theme="dark"]') };
  const LABEL_LOOKS = {
    light: Object.assign({}, ...rootBlocks.map(declsOf)),
    soft: { ...Object.assign({}, ...rootBlocks.map(declsOf)), ...layer(':root[data-theme="soft"]') },
    dark,
    navy: { ...dark, ...layer(':root[data-theme="dark"][data-palette="navy"]') },
    black: { ...dark, ...layer(':root[data-theme="dark"][data-palette="black"]') },
  };
  for (const [k, v] of Object.entries(LABEL_LOOKS)) for (const w of LABEL_WANT.filter((x) => x !== 'accent-ink')) if (!v[w]) throw new Error(`tokens.css gives the ${k} look no --${w}`);
  STYLE.LOOKS = LABEL_LOOKS;

  return {
    CALLOUTS,
    KEY_COLOURS,
    LABEL_STYLE: STYLE,
    SHORT: anat.SHORT, ABBR: anat.ABBR, LABEL_VESSEL: anat.LABEL_VESSEL, CHIP_NODES: anat.CHIP_NODES,
    ORGAN_NAMES: anat.ORGAN_LABELS.map((o) => o[0]),
    ANAT_PRI: evalLiteral(literalOf(items, 'ANAT_PRI')),
    ANAT_EXTRA: evalLiteral(literalOf(items, 'ANAT_EXTRA')),
    CIRCUIT_PRI: Object.fromEntries(Object.entries(anat.CIRCUIT_LABELS).map(([k, v]) => [k, v.pri])),
    LENS_KEY: lens,
  };
}

export function render(data, sha) {
  const body = JSON.stringify(data, null, 2);
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 12);
  return `// @generated by scripts/copy-label-names.mjs from src/ui/anatomy.js, stage-label-items.js and presenter.js of qaddodi/portal-pressure-simulator at ${sha}. Do not edit: run the script again.
// The names, short forms, priorities and key words are the 2D app's, character for character.
// content hash ${hash}

export const LABEL_NAMES = ${body} as const;
`;
}

const sha = (() => { try { return execFileSync('git', ['-C', from, 'rev-parse', '--short=10', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return 'unknown'; } })();
const data = await extract();
const text = render(data, sha);
if (check) {
  const have = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  const strip = (s) => s.replace(/^\/\/ @generated.*\n/, '');
  if (strip(have) !== strip(text)) { console.error('src/scene/labels/names.copied.ts differs from the 2D source: run scripts/copy-label-names.mjs'); process.exit(1); }
  console.log('label names: same as the 2D app');
} else {
  writeFileSync(OUT, text);
  console.log(`wrote ${OUT} (${Object.keys(data.SHORT).length} names, ${Object.keys(data.LENS_KEY).length} key lenses, 2D at ${sha})`);
}
