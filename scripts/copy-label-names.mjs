#!/usr/bin/env node
// Copies the words and priorities of the figure's labels from the 2D app, so the 3D figure names things exactly as the 2D one does
// (parity plan, section 2: "Words come from the 2D source, never retyped").
//
//   node scripts/copy-label-names.mjs --from <2D checkout> [--check]
//
// Reads <2D>/src/ui/anatomy.js (SHORT full names, ABBR short forms, LABEL_VESSEL station to vessel, ORGAN_LABELS, CHIP_NODES, the
// atlas names), the label priorities in <2D>/src/ui/stage-label-items.js (ANAT_PRI, ANAT_EXTRA) and the figure key's words in
// <2D>/src/ui/presenter-words.js (LENS_KEY, PRESSURE_KEY; presenter.js before the 2D app moved them), and writes src/scene/labels/names.copied.ts. The same file carries LABEL_STYLE: how a label
// is drawn (type roles and sizes, run weights and gaps, halo, leader and ring, the ink and halo of each look), read from type-scale.js,
// stage-label-size.js, stage-label-items.js, stage-label-solve.js, stage-label-text.js, styles/app.css (or its pieces styles/app-NN-*.css) and styles/tokens.css.
// --check writes nothing and exits 1 when the copied file differs from what the 2D source would give.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
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
  // (LENS_KEY and PRESSURE_KEY live in presenter-words.js at the pin b3058ef3; they were in presenter.js before: read whichever file holds each, and fail naming both when none does)
  const presFiles = ['src/ui/presenter-words.js', 'src/ui/presenter.js'].filter((f) => existsSync(src(f))).map((f) => ({ f, text: readFileSync(src(f), 'utf8') }));
  const presLiteral = (name) => {
    for (const { text } of presFiles) if (new RegExp(`const\\s+${name}\\s*=`).test(text)) return literalOf(text, name);
    throw new Error(`the 2D source has no "${name}" any more (looked in presenter-words.js and presenter.js)`);
  };

  // The figure key: each lens names itself and either a colour scale (ramp, with its two end words) or named swatches ([css var, name, short?]).
  // A scale is a function in the 2D source; in 3D it is a ramp id the lens code supplies (the stub returns the lens's own name).
  const ramp = (id) => () => `ramp:${id}`;
  const lensRaw = evalLiteral(presLiteral('LENS_KEY'), { flowCss: ramp('flow'), heatCss: ramp('heat'), dropCss: ramp('drop'), oxygenCss: ramp('oxygen') });
  const pressureRaw = evalLiteral(presLiteral('PRESSURE_KEY'), { gradientCss: ramp('pressure') });
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
  // (styles/app.css was split into styles/app-01-chrome.css ... app-11-deck-visuals.css, in that order; the rules are the same, so the pieces are read as the one file they were)
  const appCss = existsSync(src('styles/app.css')) ? readFileSync(src('styles/app.css'), 'utf8')
    : readdirSync(src('styles')).filter((f) => /^app-\d+-.*\.css$/.test(f)).sort().map((f) => readFileSync(src(`styles/${f}`), 'utf8')).join('\n');
  if (!appCss) throw new Error('the 2D source has neither styles/app.css nor styles/app-NN-*.css');
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
  const lgScale = must(appCss, /\.lg-scale \{ position: relative; width: (\d+)px; height: (\d+)px; \}/, 'the legend scale');
  const lgBar = must(appCss, /\.lg-bar \{ position: absolute; left: 0; right: 0; top: (\d+)px; height: (\d+)px; border-radius: (\d+)px;/, 'the legend bar');
  const lgTick = must(appCss, /\.lg-tick \{ position: absolute; top: (\d+)px; width: 1px; height: (\d+)px;/, 'the legend ticks');
  const lgNum = must(appCss, /\.lg-num \{ position: absolute; top: (\d+)px; transform: translateX\(-50%\); font-size: var\(--fs-12\); font-weight: (\d+);/, 'the legend numbers');
  const lgCap = must(appCss, /@media \(max-width: (\d+)px\) \{ \.legend \.lg-cap \{ display: flex; \} \}/, 'the legend caption breakpoint');
  // The deck's figure key (the `.pz-fk` pill): its type, shell, scale and swatch sizes, and where it docks on each screen (app.css 2005-2033, 6612-6637).
  const fkBase = must(appCss, /\.pz-fk \{[^}]*?padding: ([\d.]+)em (\d+)px ([\d.]+)em; border-radius: var\(--r-sheet\);[^}]*?gap: ([\d.]+)em;|\.pz-fk \{[^}]*?gap: ([\d.]+)em; box-sizing: border-box; padding: ([\d.]+)em (\d+)px ([\d.]+)em; border-radius: var\(--r-sheet\); white-space: nowrap; font: (\d+) max\((\d+)px, calc\(var\(--s-cap\) \* ([\d.]+)\)\)\/([\d.]+)/, 'the key pill');
  const fk = fkBase[5] !== undefined ? { gap: num(fkBase[5]), padTop: num(fkBase[6]), padX: num(fkBase[7]), padBottom: num(fkBase[8]), weight: num(fkBase[9]), floor: num(fkBase[10]), scale: num(fkBase[11]), line: num(fkBase[12]) } : null;
  if (!fk) throw new Error('the 2D key pill changed shape');
  const fkGrad = must(appCss, /\.pz-fk\.grad, \.pz-fk\.grad\.col \{ flex-direction: column; align-items: center; gap: ([\d.]+)em; padding: ([\d.]+)em (\d+)px ([\d.]+)em; font-size: max\((\d+)px, calc\(var\(--s-cap\) \* ([\d.]+)\)\); \}/, 'the gradient key');
  const fkGradBar = must(appCss, /\.pz-fk\.grad \.pz-lens-bar \{ width: ([\d.]+)em; height: ([\d.]+)em; \}/, 'the gradient key bar');
  const fkBar = must(appCss, /\.pz-lens-bar \{ width: ([\d.]+)em; height: ([\d.]+)em;/, 'the key bar');
  const fkSw = must(appCss, /\.pz-lens-sw \{ width: ([\d.]+)em; height: ([\d.]+)em; border-radius: ([\d.]+)em;/, 'the key swatch');
  const fkWide = must(appCss, /\.pz:not\(\.stack\) \.pz-fk \{[^}]*?\+ (\d+)px \+ (\d+)px\)/, 'the wide key dock');
  const fkSide = must(appCss, /\.pz\.low\.fk-side \.pz-fk:not\(\.grad\) \{ bottom: calc\([^;]*?\+ (\d+)px \+ (\d+)px\)/, 'the sideways key dock');
  const fkStack = must(appCss, /\.pz\.stack \.pz-fk \{ left: (\d+)px;/, 'the phone key left');
  const fkRow = must(appCss, /\.pz\.stack:not\(\.fk-up\) \.pz-fk \{ bottom: calc\((\d+)px \+ var\(--pz-sb\)\); min-height: (\d+)px;/, 'the phone key row');
  const fkTab = must(appCss, /\.pz\.stack\.tab \.pz-fk \{ left: calc\((\d+)% \+ (\d+)px\); \}/, 'the tablet key left');
  const fkTabRow = must(appCss, /\.pz\.stack\.tab:not\(\.fk-up\) \.pz-fk \{ bottom: calc\((\d+)px \+ var\(--pz-sb\)\); \}/, 'the tablet key row');
  const fkTabUp = must(appCss, /\.pz\.stack\.tab\.fk-up \.pz-fk \{ bottom: calc\((\d+)px \+ var\(--pz-sb\)\); \}/, 'the tablet key above the pill');
  const fkUp = must(appCss, /\.pz\.stack\.fk-up \.pz-fk \{ bottom: calc\((\d+)px \+ var\(--pz-sb\)\); \}/, 'the phone key above the pill');
  const capM = must(appCss, /--s-cap: max\((\d+)px, calc\(clamp\((\d+)px, calc\(([\d.]+) \* var\(--pzh\)\), (\d+)px\)/, 'the wide caption size');
  const KEY = {
    TYPE: fk, GRAD: { gap: num(fkGrad[1]), padTop: num(fkGrad[2]), padX: num(fkGrad[3]), padBottom: num(fkGrad[4]), floor: num(fkGrad[5]), scale: num(fkGrad[6]), barW: num(fkGradBar[1]), barH: num(fkGradBar[2]) },
    BAR: { w: num(fkBar[1]), h: num(fkBar[2]) }, SWATCH: { w: num(fkSw[1]), h: num(fkSw[2]), radius: num(fkSw[3]) },
    CAP: { floor: num(capM[2]), perPzh: num(capM[3]), max: num(capM[4]) },
    DOCK: { aboveWide: num(fkWide[2]), aboveSide: num(fkSide[2]), pillH: num(fkWide[1]), phoneSide: num(fkStack[1]), phoneRow: num(fkRow[1]), phoneMinH: num(fkRow[2]), phoneUp: num(fkUp[1]), tabLeftShare: num(fkTab[1]) / 100, tabLeftPx: num(fkTab[2]), tabRow: num(fkTabRow[1]), tabUp: num(fkTabUp[1]) },
  };
  const STYLE = {
    KEY,
    LEGEND: { width: num(lgScale[1]), height: num(lgScale[2]), barTop: num(lgBar[1]), barHeight: num(lgBar[2]), barRadius: num(lgBar[3]), tickTop: num(lgTick[1]), tickHeight: num(lgTick[2]), numTop: num(lgNum[1]), numWeight: num(lgNum[2]), captionBelow: num(lgCap[1]) },
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
    // (the rule says `opacity: var(--label-dim)` at the pin, the number is tokens.css's; it said the number itself before)
    TAP_DIM: (() => {
      const m = must(appCss, /#labels \.lb\.spot-dim, \.lb-leaders > \.spot-dim \{ opacity: (?:([\d.]+)|var\(--label-dim\)); \}/, 'the tapped-label dim');
      return num(m[1] ?? must(tokens, /--label-dim:\s*(\.?[\d.]+)\s*;/, 'the label dim token (--label-dim)')[1]);
    })(),
  };
  // The look's own ink, halo and ring colours (tokens.css): each look is the Light block plus what its own blocks change.
  const LABEL_WANT = ['text', 'text-2', 'text-3', 'stage-bg', 'label-halo', 'label-panel', 'leader', 'flow-reversed', 'accent-ink', 'surface', 'hairline', 'tr-hv', 'tr-wedge', 'ok', 'caution', 'danger'];
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

  // ── the catheter's readings: the card, the stack, the bracket and the leaders, and how they come and go (app.css .cath-label, .cath-sum; stage-cath.js) ──
  const stageCath = readFileSync(src('src/ui/stage-cath.js'), 'utf8');
  const clBox = must(appCss, /\.cath-label \{ position: absolute; left: 0; top: 0; isolation: isolate; display: inline-flex; flex-direction: column; align-items: center; gap: ([\d.]+)px; padding: ([\d.]+)px ([\d.]+)px ([\d.]+)px; border: ([\d.]+)px solid transparent; border-radius: ([\d.]+)px;/, 'the catheter reading card');
  const clSmall = must(appCss, /\.cath-label small \{ color: [^;]+; font-weight: (\d+); font-size: ([\d.]+)px; letter-spacing: ([\d.]+)em; \}/, 'the reading\'s name');
  const clBig = must(appCss, /\.cath-label b \{ font-size: ([\d.]+)px; line-height: ([\d.]+); font-weight: (\d+);/, 'the reading\'s number');
  const clUnit = must(appCss, /\.cath-label b \+ span \{ color: var\(--text-3\); font-size: ([\d.]+)px; font-weight: (\d+); margin-top: (-?[\d.]+)px; \}/, 'the reading\'s unit');
  const clPres = must(appCss, /\.app\.presenting \.cath-label \{ padding: calc\(([\d.]+)px \* min\(var\(--label-k, 1\), ([\d.]+)\)\) calc\(([\d.]+)px \* min\(var\(--label-k, 1\), [\d.]+\)\) calc\(([\d.]+)px \* min\(var\(--label-k, 1\), [\d.]+\)\); border-radius: calc\(([\d.]+)px \* min\(var\(--label-k, 1\), [\d.]+\)\); \}/, 'the presenting reading card');
  must(appCss, /\.app\.presenting \.cath-label small, \.app\.presenting \.cath-label b \+ span \{ font-size: calc\(var\(--t-lab\) \* min\(var\(--label-scale, 1\), ([\d.]+)\)\); \}/, 'the presenting name and unit size');
  must(appCss, /\.app\.presenting \.cath-label b \{ font-size: calc\(var\(--t-big\) \* min\(var\(--label-scale, 1\), ([\d.]+)\)\); \}/, 'the presenting number size');
  const clResult = must(appCss, /\.cath-label\.result small \{ color: var\(--text-3\); letter-spacing: ([\d.]+)em; \}/, 'the result\'s name');
  // (the caution reading's colour is the token --caution-ink (tokens.css: caution mixed with the text colour) at the pin, via `.cath-label.caution { --c-ink: var(--caution-ink) }`;
  // it was a colour-mix written on the rule itself before: either way, the share of caution in the mix)
  const clTone = appCss.match(/\.cath-label\.caution \{ --c: color-mix\(in srgb, var\(--caution\) (\d+)%, var\(--text\)\); \}/)
    ?? (must(appCss, /\.cath-label\.caution \{ --c: var\(--caution\); --c-ink: var\(--caution-ink\); \}/, 'the caution tone'), must(tokens, /--caution-ink: color-mix\(in srgb, var\(--caution\) (\d+)%, var\(--text\)\);/, 'the caution ink token (--caution-ink)'));
  const sumCol = must(appCss, /\.cath-sum-col \{ display: flex; flex-direction: column; gap: ([\d.]+)px; \}/, 'the stack\'s gap');
  const sumBox = must(appCss, /\.cath-sum-box \{ position: absolute; left: 0; top: 0; display: flex; align-items: center; gap: ([\d.]+)px;/, 'the stack beside its calculation');
  const tightCol = must(appCss, /\.cath-sum-box\.tight \.cath-sum-col \{ gap: ([\d.]+)px; \}/, 'the tight stack');
  const tightRow = must(appCss, /\.cath-sum-box\.tight \.cath-label\.in-sum \{ flex-direction: row; align-items: baseline; gap: ([\d.]+)px; padding: ([\d.]+)px ([\d.]+)px ([\d.]+)px; border-radius: ([\d.]+)px; \}/, 'the tight reading');
  const tightBig = must(appCss, /\.cath-sum-box\.tight \.cath-label\.in-sum b \{ font-size: ([\d.]+)px; \}/, 'the tight number');
  const leadCss2 = must(appCss, /\.cath-leads \.lead \{ fill: none; stroke-width: ([\d.]+);/, 'the summary leader');
  const dotCss = must(appCss, /\.cath-leads \.lead-dot \{ stroke: var\(--surface\); stroke-width: ([\d.]+);/, 'the summary leader dot');
  const braceCss = must(appCss, /\.cath-brace path \{ fill: none; stroke: var\(--text-3\); stroke-width: ([\d.]+);/, 'the bracket');
  const delays = must(appCss, /\.cath-sum \.cath-brace, \.cath-sum \.cath-leads \{ transition: opacity var\(--d-surface\) var\(--ease\) ([\d.]+)s; \}\n\.cath-sum \.cath-label\.in-sum\.calc \{ transition: translate var\(--d-surface\) var\(--ease\) ([\d.]+)s;/, 'the summary\'s delays');
  const pre = must(appCss, /\.cath-label\.cath-pre:not\(\.in-sum\), \.cath-sum\.cath-pre \.cath-sum-box \{ --pre: ([\d.]+)px; \}/, 'the reading\'s rise');
  const goneMs = must(stageCath, /stageScope\.timer\(cathGone, (\d+), el\)/, 'how long a leaving reading stays');
  const braceM = must(stageCath, /s\('svg', \{ class: 'cath-brace', width: (\d+) \}/, 'the bracket width');
  const bracePath = must(stageCath, /`M(\d+) \$\{ys0\} H(\d+) V\$\{ys1\} H(\d+) M(\d+) \$\{\(ys0 \+ ys1\) \/ 2\} H(\d+)`/, 'the bracket path');
  const dotR = must(stageCath, /s\('circle', \{ r: ([\d.]+) \}\)/, 'the leader dot');
  const place = must(stageCath, /const top = Math\.max\((\d+), sp\.t \+ (\d+)\), off = (\d+);/, 'the stack\'s room');
  const tightAt = must(stageCath, /const tight = !l\.mid && lim - top < (\d+);/, 'when the stack is tight');
  // (the stack's order and side are planned in cath-leads.js (planStack) at the pin; they were inline in stage-cath.js before: the same two thresholds, read from whichever holds them)
  const leadsJs = existsSync(src('src/ui/cath-leads.js')) ? readFileSync(src('src/ui/cath-leads.js'), 'utf8') : '';
  const swapDy = (/const swap = dy > (\d+) \? true : dy < -(\d+) \? false : box\._swap === true;/.exec(stageCath) ?? must(leadsJs, /const prefer = dy > (\d+) \? true : dy < -(\d+) \? false : kept === true;/, 'when the stack swaps'));
  const sideAt = (/const beside = !l\.mid && x >= Math\.max\(A\.tip\[0\], A\.ahead\[0\]\) \+ (\d+);/.exec(stageCath) ?? must(leadsJs, /const beside = !mid && x >= Math\.max\(P\[0\]\[0\], P\[1\]\[0\]\) \+ (\d+);/, 'when the stack stands beside'));
  const bandM = must(stageCath, /q\.top = Math\.max\(0, sp\.t\) \+ (\d+); q\.lim = lim - (\d+);/, 'the readings\' band');
  const tokensCss = readFileSync(src('styles/tokens.css'), 'utf8');
  const durM = must(tokensCss, /--d-flip: (\d+)ms; --d-small: (\d+)ms; --d-surface: (\d+)ms;/, 'the motion steps');
  const easeM = must(tokensCss, /--ease-move: cubic-bezier\(([\d., ]+)\);/, 'the move curve');
  const num4 = (t) => t.split(',').map((x) => Number(x.trim()));
  const easeA = must(tokensCss, /--ease-arrive: cubic-bezier\(([\d., ]+)\);/, 'the arrive curve');
  STYLE.CATH = {
    CARD: { gap: num(clBox[1]), padTop: num(clBox[2]), padX: num(clBox[3]), padBottom: num(clBox[4]), border: num(clBox[5]), radius: num(clBox[6]) },
    PRESENTING: { padTop: num(clPres[1]), cap: num(clPres[2]), padX: num(clPres[3]), padBottom: num(clPres[4]), radius: num(clPres[5]) },
    NAME: { weight: num(clSmall[1]), size: num(clSmall[2]), track: num(clSmall[3]), resultTrack: num(clResult[1]) },
    NUMBER: { size: num(clBig[1]), line: num(clBig[2]), weight: num(clBig[3]) },
    UNIT: { size: num(clUnit[1]), weight: num(clUnit[2]), lift: num(clUnit[3]) },
    CAUTION_MIX: num(clTone[1]),
    STACK: { gap: num(sumCol[1]), beside: num(sumBox[1]), tightGap: num(tightCol[1]), tightRow: { gap: num(tightRow[1]), padTop: num(tightRow[2]), padX: num(tightRow[3]), padBottom: num(tightRow[4]), radius: num(tightRow[5]), numberSize: num(tightBig[1]) }, tightBelow: num(tightAt[1]), swapDy: num(swapDy[1]), besideAt: num(sideAt[1]), top: num(place[1]), topPad: num(place[2]), off: num(place[3]) },
    BAND: { top: num(bandM[1]), bottom: num(bandM[2]) },
    BRACE: { width: num(braceM[1]), stroke: num(braceCss[1]), x0: num(bracePath[1]), x1: num(bracePath[2]), x2: num(bracePath[3]), x3: num(bracePath[4]), x4: num(bracePath[5]) },
    LEAD: { stroke: num(leadCss2[1]), dotR: num(dotR[1]), dotStroke: num(dotCss[1]) },
    MS: { small: num(durM[2]), surface: num(durM[3]), goneMs: num(goneMs[1]), braceDelay: num(delays[1]) * 1000, calcDelay: num(delays[2]) * 1000 },
    RISE: num(pre[1]),
    EASE_MOVE: num4(easeM[1]),
    EASE_ARRIVE: num4(easeA[1]),
  };

  return {
    CALLOUTS,
    KEY_COLOURS,
    LABEL_STYLE: STYLE,
    SHORT: anat.SHORT, ABBR: anat.ABBR, LABEL_VESSEL: anat.LABEL_VESSEL, CHIP_NODES: anat.CHIP_NODES,
    ORGAN_NAMES: anat.ORGAN_LABELS.map((o) => o[0]),
    ORGAN_AT: Object.fromEntries(anat.ORGAN_LABELS.map(([n, x, y]) => [n, [x, y]])),
    ANAT_PRI: evalLiteral(literalOf(items, 'ANAT_PRI')),
    ANAT_EXTRA: evalLiteral(literalOf(items, 'ANAT_EXTRA')),
    CIRCUIT_PRI: Object.fromEntries(Object.entries(anat.CIRCUIT_LABELS).map(([k, v]) => [k, v.pri])),
    LENS_KEY: lens,
  };
}

export function render(data, sha) {
  const body = JSON.stringify(data, null, 2);
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 12);
  return `// @generated by scripts/copy-label-names.mjs from src/ui/anatomy.js, stage-label-items.js and presenter-words.js of qaddodi/portal-pressure-simulator at ${sha}. Do not edit: run the script again.
// The names, short forms, priorities and key words are the 2D app's, character for character.
// content hash ${hash}

export const LABEL_NAMES = ${body} as const;
`;
}

const sha = (() => { try { return execFileSync('git', ['-C', from, 'rev-parse', '--short=10', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return 'unknown'; } })();
const data = await extract();
const text = render(data, sha);

// The catheter readings' own placing code is copied whole (pure numbers, no page): where a reading stands round its point (cath-pill.js), where the stack
// of two readings stands (cath-place.js) and the pointer's two numbers (callout-ptr.js). Never edited here: run this again.
const VERBATIM = ['cath-pill', 'cath-place', 'callout-ptr'];
// ... and the outline of a callout's one shape (callout.js `outline`, cut out of that file), with the pointer's base rule it is drawn by checked to be still the 2D one.
const must = (text, re, what) => { const m = re.exec(text); if (!m) throw new Error(`the 2D source no longer says ${what}`); return m; };
const calloutJs = readFileSync(src('src/ui/callout.js'), 'utf8');
must(calloutJs, /const want = w \/ 2 \+ \(lean \? ax : Math\.max\(-0\.4 \* w, Math\.min\(0\.4 \* w, ax\)\)\);\s*const px = Math\.max\(KEEP, Math\.min\(w - KEEP, want\)\), tx = lean \? want : px/, 'the pointer base rule');
const outlineSrc = must(calloutJs, /\nconst outline = [\s\S]*?\n\};\n/, 'the callout outline')[0].trim().replace(/^const outline/, 'export const outline');
const OUTLINE_FILE = `// @generated by scripts/copy-label-names.mjs from src/ui/callout.js of qaddodi/portal-pressure-simulator at ${sha}. Do not edit: run the script again.
import { PTR } from './callout-ptr.copied.js';
${outlineSrc}
`;
const verbatimOut = (n) => resolve(here, `../src/scene/labels/cath2d/${n}.copied.js`);
const verbatim = (n) => `// @generated by scripts/copy-label-names.mjs from src/ui/${n}.js of qaddodi/portal-pressure-simulator at ${sha}. Do not edit: run the script again.\n` + readFileSync(src(`src/ui/${n}.js`), 'utf8');
const stripGen = (t) => t.replace(/^\/\/ @generated.*\n/, '');
if (check) {
  const have = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  const strip = (s) => s.replace(/^\/\/ @generated.*\n/, '');
  if (strip(have) !== strip(text)) { console.error('src/scene/labels/names.copied.ts differs from the 2D source: run scripts/copy-label-names.mjs'); process.exit(1); }
  for (const n of VERBATIM) {
    const h = existsSync(verbatimOut(n)) ? readFileSync(verbatimOut(n), 'utf8') : '';
    if (stripGen(h) !== stripGen(verbatim(n))) { console.error(`src/scene/labels/cath2d/${n}.copied.js differs from the 2D source: run scripts/copy-label-names.mjs`); process.exit(1); }
  }
  { const h = existsSync(verbatimOut('callout-outline')) ? readFileSync(verbatimOut('callout-outline'), 'utf8') : '';
    if (stripGen(h) !== stripGen(OUTLINE_FILE)) { console.error('src/scene/labels/cath2d/callout-outline.copied.js differs from the 2D source: run scripts/copy-label-names.mjs'); process.exit(1); } }
  console.log('label names: same as the 2D app');
} else {
  writeFileSync(OUT, text);
  mkdirSync(dirname(verbatimOut('cath-pill')), { recursive: true });
  for (const n of VERBATIM) writeFileSync(verbatimOut(n), verbatim(n));
  writeFileSync(verbatimOut('callout-outline'), OUTLINE_FILE);
  console.log(`wrote ${OUT} (${Object.keys(data.SHORT).length} names, ${Object.keys(data.LENS_KEY).length} key lenses, 2D at ${sha}) and ${VERBATIM.length} placing files`);
}
