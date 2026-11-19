#!/usr/bin/env node
// Writes tests/fixtures/parity-2d.json: what the 2D app's card rules give on every one of its device sizes, so the 3D app's port
// (src/ui/layout/rules2d.ts) is held to them by tests/ui-parity-2d.test.ts without a 2D checkout at hand.
//
//   node scripts/gen-parity-2d.mjs --from <2D checkout> [--check]
//
// Sources, all read from the 2D checkout: src/ui/devices.js (the sizes), src/ui/util.js (the media queries, evaluated by a small matcher below),
// src/ui/card-scale.js (the type roles), src/ui/card-type.js (steps, phonePlan, figFloorOf), src/ui/card-shuffle.js (the wallet),
// and styles/app-04-presenter.css (--pz-b, --pz-cm, --pz-cp, --pz-cw: the formulas are READ from the stylesheet and evaluated here).
// Headless nothing: Node only.

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../tests/fixtures/parity-2d.json');

// ── a CSS length evaluator for the few formulas the card geometry uses: clamp(), min(), max(), calc(), var(), px and vw ──
export function cssEval(src, vars, vw) {
  let i = 0; const s = String(src).replace(/\s+/g, ' ').trim();
  const peek = () => s[i]; const ws = () => { while (s[i] === ' ') i++; };
  function num() { const m = /^-?\d*\.?\d+/.exec(s.slice(i)); if (!m) throw new Error(`css number at "${s.slice(i, i + 20)}" in ${src}`); i += m[0].length; let v = parseFloat(m[0]); if (s.startsWith('px', i)) i += 2; else if (s.startsWith('vw', i)) { i += 2; v = v * vw / 100; } else if (s.startsWith('vh', i)) throw new Error('vh not supported'); return v; }
  function call(name) { const args = []; ws(); do { i++; args.push(sum()); ws(); } while (peek() === ','); if (peek() !== ')') throw new Error(`css ) at "${s.slice(i, i + 20)}"`); i++; return args; }
  function atom() {
    ws();
    if (s.startsWith('var(', i)) { i += 4; const m = /^--[\w-]+/.exec(s.slice(i)); i += m[0].length; ws(); let fb; if (peek() === ',') { i++; fb = sum(); ws(); } if (peek() !== ')') throw new Error('var('); i++; if (m[0] in vars) return vars[m[0]]; if (fb === undefined) throw new Error(`unknown ${m[0]}`); return fb; }
    const fn = /^(clamp|min|max|calc)\(/.exec(s.slice(i));
    if (fn) { i += fn[1].length; if (fn[1] === 'calc') { i++; const v = sum(); ws(); i++; return v; } const a = call(fn[1]); return fn[1] === 'clamp' ? Math.min(a[2], Math.max(a[0], a[1])) : fn[1] === 'min' ? Math.min(...a) : Math.max(...a); }
    if (peek() === '(') { i++; const v = sum(); ws(); i++; return v; }
    return num();
  }
  function prod() { let v = atom(); for (;;) { ws(); if (peek() === '*') { i++; v *= atom(); } else if (peek() === '/') { i++; v /= atom(); } else return v; } }
  function sum() { let v = prod(); for (;;) { ws(); if (peek() === '+') { i++; v += prod(); } else if (peek() === '-') { i++; v -= prod(); } else return v; } }
  const v = sum(); ws(); if (i < s.length) throw new Error(`css leftover "${s.slice(i)}" in ${src}`); return v;
}

// ── media queries: (max-width: Npx), (min-width: Npx), (max-height: Npx), (orientation: portrait|landscape), joined by "and"; "," is or ──
export function mq(query, w, h) {
  return query.split(',').some((alt) => alt.split(/\band\b/).every((c) => {
    const m = /\(\s*([a-z-]+)\s*:\s*([\w.]+?)(px)?\s*\)/.exec(c.trim());
    if (!m) throw new Error(`media feature "${c}"`);
    const [, k, v] = m;
    switch (k) {
      case 'max-width': return w <= +v; case 'min-width': return w >= +v; case 'max-height': return h <= +v; case 'min-height': return h >= +v;
      case 'orientation': return v === 'portrait' ? h >= w : h < w;
      default: throw new Error(`media feature ${k}`);
    }
  }));
}

const decl = (css, name) => { const m = new RegExp(`${name}:\\s*([^;]*(?:\\([^;]*\\))?[^;]*);`).exec(css); if (!m) throw new Error(`the stylesheet has no ${name}`); return m[1].replace(/\/\*.*?\*\//g, '').trim(); };

async function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--from');
  if (at < 0 || !args[at + 1]) { console.error('usage: node scripts/gen-parity-2d.mjs --from <2D checkout> [--check]'); process.exit(2); }
  const root = resolve(args[at + 1]);
  const imp = (f) => import(pathToFileURL(resolve(root, f)).href);
  const [{ DEVICES }, scale, type, shuf] = await Promise.all([imp('src/ui/devices.js'), imp('src/ui/card-scale.js'), imp('src/ui/card-type.js'), imp('src/ui/card-shuffle.js')]);
  // util.js needs a page to load: its media-query strings are read from the source and evaluated in order (each may use the ones above it)
  const util = {};
  for (const m of readFileSync(resolve(root, 'src/ui/util.js'), 'utf8').matchAll(/^export const (\w+_MQ) = (.*);\s*(?:\/\/.*)?$/gm)) util[m[1]] = new Function(...Object.keys(util), `return ${m[2]}`)(...Object.values(util));
  for (const k of ['UPRIGHT_MQ', 'SIDEWAYS_MQ', 'SHORT_SIDE_MQ', 'STACK_MQ', 'TABLET_UP_MQ']) if (typeof util[k] !== 'string') throw new Error(`util.js: ${k} not read`);
  const css = readFileSync(resolve(root, 'styles/app-04-presenter.css'), 'utf8');
  const ladders = readFileSync(resolve(root, 'src/ui/presenter-ladders.js'), 'utf8');
  const zoom = readFileSync(resolve(root, 'src/ui/presenter-zoom.js'), 'utf8');
  const SHORT_H = +/const SHORT_H = (\d+)/.exec(zoom)[1];
  const figMinSrc = /const FIG_MIN = \(H\) => (.*?);/.exec(ladders)[1];
  const figMin = new Function('H', `return ${figMinSrc}`);
  let commit = 'unknown';
  try { commit = execFileSync('git', ['-C', root, 'rev-parse', '--short=10', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }

  const pzbF = decl(css, '--pz-b'), cmF = decl(css, '--pz-cm'), cpF = decl(css, '--pz-cp'), cwF = decl(css, '--pz-cw');
  // the sideways override: the one :root block in the (orientation: landscape) and (max-height: 500px) media query
  const sw = /@media \(orientation: landscape\) and \(max-height: 500px\) \{\s*:root \{ --pz-cm: ([^;]+); --pz-cp: ([^;]+); --pz-cw: ([^;]+); \}/.exec(css);
  if (!sw) throw new Error('the stylesheet\'s sideways :root block moved');

  const sizes = [...DEVICES.map((d) => ({ id: d.id, w: d.w, h: d.h })),
    { id: 'iphone-se', w: 375, h: 667 }, { id: 'iphone-small', w: 320, h: 568 }, { id: 'iphone-se-landscape', w: 667, h: 375 }, { id: 'iphone-max', w: 430, h: 932 },
    { id: 'ipad-mini', w: 744, h: 1133 }, { id: 'ipad-1024', w: 1024, h: 768 }, { id: 'mac-13', w: 1280, h: 720 }, { id: 'window-narrow', w: 700, h: 500 }, { id: 'mac-tall', w: 1600, h: 1000 }];
  const parts = ['text', 'panel', 'data', 'table', 'grid'];
  const out = {
    source: `qaddodi/portal-pressure-simulator at ${commit}`,
    constants: { SHORT_H, SIDEWAYS_MAX_H: type.SIDEWAYS_MAX_H, GRIP: +/const GRIP = (\d+)/.exec(zoom)[1], WIDE: type.WIDE, TITLE_RATIO: type.TITLE_RATIO, SHUF: { strip: shuf.SHUF.strip, gapTight: shuf.SHUF.gapTight, colsUsual: shuf.SHUF.colsUsual, edge: shuf.SHUF.edge, gap: shuf.SHUF.gap, cols: shuf.SHUF.cols } },
    sizes: sizes.map(({ id, w, h }) => {
      const stack = mq(util.STACK_MQ, w, h), shortSide = mq(util.SHORT_SIDE_MQ, w, h), tab = mq(util.TABLET_UP_MQ, w, h), sideways = mq(util.SIDEWAYS_MQ, w, h);
      const phone = stack && !shortSide;
      const layout = phone ? (tab ? 'tab' : 'stack') : h <= SHORT_H ? 'short' : 'wide';
      const pzh = scale.pzh(w, h);
      const vars = { '--pzh': pzh, '--pz-b': 0 };
      vars['--pz-b'] = cssEval(pzbF, vars, w);
      const swOn = mq('(orientation: landscape) and (max-height: 500px)', w, h);
      const geo = (a, b, c) => ({ cm: cssEval(a, vars, w), cp: cssEval(b, vars, w), cw: cssEval(c, vars, w) });
      const roles = {};
      for (const part of parts) for (const card of part === 'text' ? [true, false] : [false]) roles[`${part}${part === 'text' ? (card ? ':card' : ':bare') : ''}`] = { ...scale.cardScale({ vw: w, vh: h, layout, part, card, ts: 1, bk: 1, tk: 1 }) };
      return {
        id, w, h, layout, phone, tab, shortSide, sideways, pzh, b: vars['--pz-b'],
        geometry: swOn ? geo(sw[1], sw[2], sw[3]) : geo(cmF, cpF, cwF),
        roles,
        figMin: figMin(h), figFloor: type.figFloorOf(h), maxH: [0, 1, 2].map((r) => shuf.shufMaxH(h, r)),
        shufCols: shuf.SHUF.cols.map((c) => cssEval(c, vars, w)),
        shufTop: [0.5, 0.7, 0.9].map((f) => ({ h: Math.round(f * h), top: shuf.shufTop(h, Math.round(f * h), shuf.SHUF.edge) })),
      };
    }),
    phonePlans: [],
    titleFloor: [[40, 17], [32, 17], [32, 22], [67, 28], [30, 22]].map(([t, b]) => ({ title: t, body: b, k: type.titleFloorK(t, b) })),
  };
  // phonePlan over a grid of heights and card heights (the pure function the 3D phone stack ports)
  for (const H of [568, 667, 736, 812, 844, 932, 1133])
    for (const data of [0, 120, 220, 330, 450]) for (const regular of [140, 220, 300, 380])
      out.phonePlans.push({ in: { room: H - 70 - 24, dtop: 8, data, dmax: 0.42 * H, lip: 0, regular, mine: 0.62 * H, grip: out.constants.GRIP, figMin: figMin(H), figFloor: type.figFloorOf(H), gone: data === 0, hasData: data > 0 }, out: type.phonePlan({ room: H - 70 - 24, dtop: 8, data, dmax: 0.42 * H, lip: 0, regular, mine: 0.62 * H, grip: out.constants.GRIP, figMin: figMin(H), figFloor: type.figFloorOf(H), gone: data === 0, hasData: data > 0 }) });
  const text = `${JSON.stringify(out, null, 1)}\n`;
  if (args.includes('--check')) {
    const strip = (t) => t.replace(/"source": "[^"]*"/, '');
    if (strip(readFileSync(OUT, 'utf8')) !== strip(text)) { console.error('tests/fixtures/parity-2d.json differs from the 2D app: run scripts/gen-parity-2d.mjs again'); process.exit(1); }
    console.log('parity-2d.json matches the 2D app'); return;
  }
  writeFileSync(OUT, text);
  console.log(`wrote ${OUT} (${out.sizes.length} sizes, 2D at ${commit})`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
