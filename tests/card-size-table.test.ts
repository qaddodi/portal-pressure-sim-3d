// Plan 45: one size table for every instrument's picture, from the screen's height; no picture is sized by its card's width or by the words above it. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chartH, CHART_MIN, CHART_MAX, usesTable } from '../src/ui/layout/card-size.ts';

const SCREENS: [string, number, number, number][] = [
  ['iPhone 390x844', 390, 844, 186], ['iPhone Max 430x932', 430, 932, 205], ['iPad upright 820x1180', 820, 1180, 260], ['iPad 13 upright 1024x1366', 1024, 1366, 300],
  ['iPad landscape 1180x820', 1180, 820, 221], ['iPad 13 landscape 1366x1024', 1366, 1024, 276], ['Mac 1440x900', 1440, 900, 243], ['Mac small 1280x720', 1280, 720, 194],
];

test('chartH is the table of the plan for the 8 screens', () => {
  for (const [n, w, h, want] of SCREENS) assert.equal(chartH(w, h), want, n);
});

test('it always lies between 150 and 300 px, never depends on the width of the screen at one height, and a phone on its side keeps 2D\'s own', () => {
  for (let h = 300; h <= 1500; h += 37) for (const w of [390, 820, 1180, 1440]) { const v = chartH(w, h); assert.ok(v >= CHART_MIN && v <= CHART_MAX, `${w}x${h}: ${v}`); }
  assert.equal(chartH(1180, 820), chartH(1440, 820), 'the same height on a wider floating screen');
  assert.equal(usesTable(844, 390), false);
  assert.equal(usesTable(390, 844), true);
});

test('no 3D rule sizes an instrument\'s box by the card\'s width or adds the Doppler\'s free room; every picture reads --pz-chart-px or the table', () => {
  const css = readFileSync('src/ui/css3d-over-2d.css', 'utf8');
  const plan = css.slice(css.lastIndexOf('/*', css.indexOf('Plan 45: one height for every instrument')));
  assert.ok(plan.length > 200);
  assert.doesNotMatch(plan.replace(/\/\*[\s\S]*?\*\//g, ''), /cqi|dop-free/, 'the table rules use neither');
  for (const box of ['dop-box', 'fibroscan-box', 'vitals-box', 'hvpg-box', 'pt-box']) assert.match(plan, new RegExp(`\\.${box}[ ,]`), box);
  assert.match(plan, /--pz-chart-h: var\(--pz-chart-px\)/, 'the stacked talk, shift and flow-time pictures');
  assert.match(plan, /\.pze-plot\.pze-incard/, 'the plane');
  assert.match(readFileSync('src/ui/DeckUi.tsx', 'utf8'), /'--pz-chart-px': `\$\{chartH\(vp\.w, vp\.h\)\}px`/);
  for (const [f, re] of [
    ['src/ui/charts/profile/ProfileCard.tsx', /tableH\(\) \?\? layoutHeight\(/], ['src/ui/charts/curve/frame.ts', /const t = tableH\(\); return t == null \? [^;]*17 \* f\)\) : Math\.round\(Math\.max\(t, 17 \* f\)\)/],
    ['src/ui/charts/curve/course-frame.ts', /curveHeight\(w, f\)/], ['src/ui/charts/menu/frame.ts', /curveHeight\(w, f\)/],
  ] as const) assert.match(readFileSync(f, 'utf8'), re, f);
});

test('the profile is held down by its room and never grown into what the words leave over', () => {
  const src = readFileSync('src/ui/charts/profile/ProfileCard.tsx', 'utf8');
  assert.match(src, /const own = height \?\? \(cell \? undefined : heldToRoom\(base, room, f\)\)/);
  assert.doesNotMatch(src, /fitToRoom\(/);
});
