// Plan 42, part C: the 2D stylesheets say "showing" as `:not([hidden])`; the 3D app never sets `hidden` (a fade leaves `data-fade="off"`), so every such selector was always true: scaled tiles lost their
// change line, off Doppler stat tiles took room, the top bar's legend was narrowed on a phone. scripts/fade-hidden.mjs (a PostCSS plugin in vite.config.ts) makes `:not([hidden])` also exclude a faded-off
// element, and fade.css gives a faded-off box display: none whatever its own display rule says. Node only, source-reading.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fadeAwareSelector, fadeHidden } from '../scripts/fade-hidden.mjs';
import { parseCss, splitSel } from './css-parse.ts';

const walk = (d: string, ext: RegExp, out: string[] = []): string[] => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p, ext, out); else if (ext.test(e.name)) out.push(p); } return out; };
const sheets = walk('src', /\.css$/);
const FADED = '[data-fade="off"]';

test('the selector rewrite: `:not([hidden])` also excludes a faded-off element, once, and a plain selector is left alone', () => {
  assert.equal(fadeAwareSelector('.pz-tile:has(.pzb-was:not([hidden])) .pzt-d'), '.pz-tile:has(.pzb-was:not([hidden]):not([data-fade="off"])) .pzt-d');
  assert.equal(fadeAwareSelector('.dop-stats > div:not([hidden]):first-child'), '.dop-stats > div:not([hidden]):not([data-fade="off"]):first-child');
  assert.equal(fadeAwareSelector('.a:not([hidden]), .b:not([hidden])'), '.a:not([hidden]):not([data-fade="off"]), .b:not([hidden]):not([data-fade="off"])');
  const once = fadeAwareSelector('.x:not([hidden])');
  assert.equal(fadeAwareSelector(once), once, 'idempotent');
  assert.equal(fadeAwareSelector('.x[hidden], .y:not(.z)'), '.x[hidden], .y:not(.z)');
});

test('the PostCSS plugin rewrites a rule\'s selector and leaves the declarations', () => {
  const rule = { selector: '.instrument-workspace .dop-stats > div:not([hidden])' };
  (fadeHidden() as unknown as { Rule: (r: typeof rule) => void }).Rule(rule);
  assert.equal(rule.selector, '.instrument-workspace .dop-stats > div:not([hidden]):not([data-fade="off"])');
});

test('the build registers the plugin, so every copied 2D rule that says `:not([hidden])` is read the 3D way', () => {
  const cfg = readFileSync('vite.config.ts', 'utf8');
  assert.match(cfg, /import \{ fadeHidden \} from '\.\/scripts\/fade-hidden\.mjs'/);
  // (the twins plugin joins it only when PPS_DK_TWINS=1: vite.config.ts)
  assert.match(cfg, /css: \{ postcss: \{ plugins: [^\n]*\[fadeHidden\(\)(, dkInTwins\(\))?\] \} \}/);
});

test('every stylesheet that says `:not([hidden])` is covered by the rewrite (none leaves the plugin\'s reach)', () => {
  let n = 0;
  for (const f of sheets) for (const r of parseCss(f, readFileSync(f, 'utf8'))) {
    if (!r.sel.includes(':not([hidden])')) continue;
    n++;
    const out = fadeAwareSelector(r.sel);
    assert.ok(!/:not\(\[hidden\]\)(?!:not\(\[data-fade="off"\]\))/.test(out), `${f}: ${r.sel}`);
  }
  assert.ok(n >= 30, `${n} rules read "showing" as :not([hidden])`);
});

test('fade.css: a faded-off element that is not a grid-collapsing one goes to display: none whatever its own rule says, and its fade still plays', () => {
  const css = readFileSync('src/ui/fade.css', 'utf8');
  const m = /html \[data-fade="off"\]:not\(\[data-fade-axis\]\) \{([^}]*)\}/.exec(css);
  assert.ok(m, 'the raised rule');
  assert.match(m![1]!, /display: none !important/);
  assert.match(m![1]!, /transition:[^;]*opacity[^;]*display var\(--d-small\) allow-discrete !important/, 'the off transition lists opacity and display, so an element\'s own `transition` cannot make the fade-out pop');
});

test('a positive `[hidden]` rule on a class that fades only hides (display: none): fade.css does that for a faded-off element, so it needs nothing more', () => {
  const classes = new Set<string>();
  for (const f of walk('src', /\.tsx$/)) {
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((l, i) => { if (/fadeAttrs\(|useFadePresence\(|<Fade\b/.test(l)) for (const m of lines.slice(Math.max(0, i - 3), i + 1).join(' ').matchAll(/className="([^"]+)"/g)) for (const c of m[1]!.split(/\s+/)) classes.add(c); });
  }
  assert.ok(classes.size >= 10, `${classes.size} faded classes found`);
  const bad: string[] = [];
  for (const f of sheets) for (const r of parseCss(f, readFileSync(f, 'utf8'))) {
    for (const one of splitSel(r.sel)) {
      if (!/\[hidden\]/.test(one) || /:not\(\[hidden\]\)/.test(one)) continue;
      if (![...classes].some((c) => new RegExp(`\\.${c}(?![\\w-])`).test(one))) continue;
      if (!r.decls.every((d) => d.prop === 'display' && d.value === 'none')) bad.push(`${f}: ${one} { ${r.decls.map((d) => d.prop).join(', ')} }`);
    }
  }
  assert.deepEqual(bad, [], `a [hidden] rule on a class that fades does more than hide: restate it for ${FADED}`);
});
