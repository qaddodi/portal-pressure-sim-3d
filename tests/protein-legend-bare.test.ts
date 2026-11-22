// The Protein legend is a bare word (humanized.css: background none), never glass: no later, stronger rule may fill it, and on a phone it hangs under the pill
// from the right edge only (Plan 36 A: the black bar across the top, 22 Nov). Source-reading, node only; the cascade is checked by specificity, not by running a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../src/', import.meta.url);
const walk = (u: URL): URL[] => readdirSync(u, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? (d.name === 'engine' ? [] : walk(new URL(d.name + '/', u))) : d.name.endsWith('.css') ? [new URL(d.name, u)] : []);
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

// [selector, body] of every plain rule (media blocks flattened).
const rules = (css: string) => [...strip(css).matchAll(/([^{}@][^{}]*)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]] as const);

// Specificity (ids, classes/attrs/pseudo-classes, types) of one complex selector; :is/:not take their strongest argument.
function spec(sel: string): [number, number, number] {
  let s = sel, a = 0, b = 0, c = 0;
  for (;;) {
    const m = /:(is|not|where|has)\(([^()]*)\)/.exec(s); if (!m) break;
    const inner = m[2].split(',').map((x) => spec(x.trim()));
    if (m[1] !== 'where') { const top = inner.sort((x, y) => y[0] - x[0] || y[1] - x[1] || y[2] - x[2])[0]; a += top[0]; b += top[1]; c += top[2]; }
    s = s.replace(m[0], '');
  }
  a += (s.match(/#[\w-]+/g) ?? []).length;
  b += (s.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length;
  c += (s.match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
  return [a, b, c];
}
const gt = (x: number[], y: number[]) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];

test('no rule fills the Protein legend more strongly than humanized.css\'s background: none', () => {
  const human = rules(readFileSync(new URL('ui/humanized.css', root), 'utf8')).find(([s, b]) => /^html:root \.sv-legend$/.test(s) && /background: none/.test(b));
  assert.ok(human, 'humanized.css keeps the legend bare');
  const floor = spec(human![0]);
  const bad: string[] = [];
  for (const f of walk(root)) for (const [sel, body] of rules(readFileSync(f, 'utf8'))) {
    if (!/background(-color)?\s*:\s*(?!none|transparent)/.test(body) && !/\bbackground\s*:\s*(?!none|transparent)/.test(body)) continue;
    for (const one of sel.split(/,(?![^()]*\))/)) {
      // a selector whose subject is the legend itself (not a descendant such as `.sv-legend i.alb`)
      const subject = one.trim().replace(/::?[\w-]+(\([^()]*\))?$/, '');
      if (/\.sv-legend(?![\w-])/.test(one) && /(^|[\s>+~])(\.sv-legend|[^\s>+~]*\.sv-legend[^\s>+~]*)(\[[^\]]*\]|:[\w-]+(\([^()]*\))?)*$/.test(subject) && gt(spec(one.trim()), floor) > 0) bad.push(`${f.pathname.split('/src/')[1]}: ${one.trim()}`);
    }
  }
  assert.deepEqual(bad, [], 'these fill the legend over humanized.css (the black bar)');
});

test('no :is() list in any stylesheet that fills glass names the legend', () => {
  const bad: string[] = [];
  for (const f of walk(root)) for (const [sel, body] of rules(readFileSync(f, 'utf8'))) if (/\.sv-legend/.test(sel) && /\bbackground\s*:\s*var\(--(surface|glass|frost)/.test(body) && /:is\([^)]*\.sv-legend/.test(sel)) bad.push(`${f.pathname.split('/src/')[1]}: ${sel.slice(0, 80)}`);
  assert.deepEqual(bad, []);
});

test('on a phone the legend hangs under the pill from the right edge only, left cleared', () => {
  const css = readFileSync(new URL('scene/sinusoid/legend.css', root), 'utf8');
  const r = rules(css).find(([s]) => /^\.app\.thumb \.topbar \.stage-bar\.top > \.sv-legend$/.test(s));
  assert.ok(r, 'phone rule present');
  assert.match(r![1], /position: absolute/);
  assert.match(r![1], /left: auto/);
  assert.match(r![1], /right: 0/);
  assert.match(r![1], /top: calc\(100% \+ 8px\)/);
});

// ── the legend's box, computed ──────────────────────────────────────────────────────────────────────────────────────────────────────
// Geometry from the CSS: on a phone (.app.thumb, an upright phone or iPad) the legend is absolute at right: 0 of #stageTop, 8 px under it; elsewhere it is an in-flow flex item of the bar (it cannot
// overlap a sibling). #stageTop's row is min-height 46 (app-07-floating.css) under the safe top and 8 px margin. The word is "Protein" at 600 weight, 12 px at 390 wide growing to 14 px
// (tokens.css --t-lab) times --label-scale (the Figure size setting, up to 1.7 as the labels clamp it); an upper bound on its width is 7 glyphs at 0.66 em, its height one 1.3 line.
// The only things the top band holds are the patient pill (left) and the lens key (right, above the legend); cards exist only in a talk, and a talk hides the whole top bar (TopBar data-hidden).
const SCREENS = [
  { n: 'iPhone 393x852', w: 393, h: 852, top: 59, bottom: 34, l: 0, r: 0 },
  { n: 'iPhone SE', w: 375, h: 667, top: 20, bottom: 0, l: 0, r: 0 },
  { n: 'iPhone side', w: 852, h: 393, top: 0, bottom: 21, l: 59, r: 59 },
  { n: 'iPad up', w: 820, h: 1180, top: 24, bottom: 20, l: 0, r: 0 },
  { n: 'iPad side', w: 1180, h: 820, top: 24, bottom: 20, l: 0, r: 0 },
  { n: 'Mac', w: 1440, h: 900, top: 0, bottom: 0, l: 0, r: 0 },
];
const tLab = (w: number, h: number) => Math.min(14, Math.max(12, 12 + (Math.min(w, h) - 390) * 0.00392));   // clamp(12px, 12 + (100vmin - 390) * .00392, 14px)

test('the phone legend lies on screen, under the pill, and clear of the lens key and every other box, at every size and label scale', () => {
  for (const s of SCREENS) {
    const upright = s.h > s.w;   // .app.thumb: the upright phone / iPad rule; the others keep the legend in the bar's row
    if (!upright) continue;
    for (const scale of [1, 1.3, 1.7]) {
      const fs = tLab(s.w, s.h) * scale, w = Math.ceil(7 * 0.66 * fs), h = Math.ceil(1.3 * fs);
      const barL = s.l + 8, barR = s.w - s.r - 8, barTop = s.top + 8, barBottom = barTop + 46;
      const box = { x: barR - w, y: barBottom + 8, w, h };   // right: 0, left: auto, top: 100% + 8
      const at = `${s.n} scale ${scale}: ${JSON.stringify(box)}`;
      assert.ok(box.x >= barL && box.x + box.w <= barR, `outside the bar's width: ${at}`);
      assert.ok(box.x >= 0 && box.x + box.w <= s.w && box.y >= s.top && box.y + box.h <= s.h - s.bottom, `off screen: ${at}`);
      assert.ok(box.y >= barBottom + 8, `touches the pill above: ${at}`);
      assert.ok(box.w < (barR - barL) / 2, `wider than half the bar, so it would reach the patient pill: ${at}`);
      assert.ok(box.y + box.h < s.h * 0.5, `reaches into the figure's lower half or the dock: ${at}`);
    }
  }
});

test('a talk hides the top bar with the legend in it, so no card ever stands under the legend', () => {
  assert.match(readFileSync(new URL('ui/shell/TopBar.tsx', root), 'utf8'), /data-hidden=\{mode === 'deck' \|\| undefined\}/);
  const css = readFileSync(new URL('scene/sinusoid/legend.css', root), 'utf8');
  assert.match(css, /\.topbar \.stage-bar\.top > \.sv-legend \{ position: static;/, 'in the bar\'s own row off a phone, so it cannot overlap a sibling');
});
