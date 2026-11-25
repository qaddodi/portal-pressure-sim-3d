// Audit 5.1–5.6 (20 Nov 2026, 2D pin b3058ef3): the Tests card comes and goes as 2D's does, a sheet pulled shut is never seen back in its place, an instrument's data card has 2D's corner Enlarge button, the top bar glides,
// and one arrive curve and one card height glide are used everywhere. Source-level checks (nothing is run in a browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { easeArrive, ARRIVE_CSS, cubicBezier } from '../src/clock/tween.ts';
import { EASE_ARRIVE } from '../src/ui/tests/copied/ease.copied.js';
import { GLIDE_MS } from '../src/ui/cards/rail.ts';

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const walk = (dir: string): string[] => readdirSync(new URL(`../${dir}`, import.meta.url)).flatMap((n) => {
  const p = `${dir}/${n}`;
  return statSync(new URL(`../${p}`, import.meta.url)).isDirectory() ? walk(p) : [p];
});

test('one arrive curve: the function, the CSS string and 2D\'s own are the same curve, and no file redefines it', () => {
  assert.equal(ARRIVE_CSS, EASE_ARRIVE);
  const two = cubicBezier(0.2, 0.8, 0.2, 1);
  for (const t of [0.05, 0.2, 0.5, 0.8, 0.95]) assert.ok(Math.abs(easeArrive(t) - two(t)) < 1e-9, `t=${t}`);
  assert.doesNotMatch(read('src/ui/shell/global.css'), /--ease-arrive\s*:/, 'tokens.css (2D) owns --ease-arrive; global.css re-declared it at (.2, .7, .2, 1)');
  const bad = walk('src').filter((f) => !f.startsWith('src/ui/styles/') && /\.(ts|tsx|css|js)$/.test(f)).filter((f) => /\(0?\.2, ?0?\.7, ?0?\.2, ?1\)/.test(read(f)));
  assert.deepEqual(bad, [], 'no copy of the old arrive curve (.2, .7, .2, 1)');
});

test('a card whose height changes glides 420 ms (2D glideCard: D_SURFACE), the card and the rows under it on one clock', () => {
  assert.equal(GLIDE_MS, 420);
  for (const f of ['src/ui/cards/CardFrame.tsx', 'src/ui/cards/CheckCard.tsx']) {
    const src = read(f);
    assert.match(src, /GLIDE_MS/, f);
    assert.doesNotMatch(src, /duration: 280/, `${f}: a 280 ms height glide`);
  }
});

test('the Tests card comes in and goes out as 2D\'s: a side card slides 16 px in from the edge while it fades (240 in, 120 out), a sheet fades and rises 24 px behind the dock (240 both ways)', () => {
  const css = read('src/ui/tests/tests.css');
  assert.match(css, /\.t-pos \{ --t-x: 16px; --t-y: 0px; --t-o: 0; --t-out: var\(--d-flip\);/, 'a side card: 16 px, faded, out in --d-flip (slide-from-edge / slide-to-edge)');
  assert.match(css, /\.t-pos\[data-kind="sheet"\] \{ --t-x: 0px; --t-y: var\(--sheet-rise, 24px\); --t-o: 0; \}/, 'a sheet: the one phone-sheet motion, a short rise while it fades (23 Nov: unify menus)');
  assert.match(css, /\[data-kind="sheet"\]\[data-thumb="true"\] \{ --t-out: var\(--d-small\); \}/, 'over the thumb dock it sinks in 240 ms');
  assert.match(css, /transform: translate\(var\(--t-x\), var\(--t-y\)\);/);
  assert.match(css, /transition: opacity var\(--t-out\) var\(--ease-in\), transform var\(--t-out\) var\(--ease-in\), visibility 0s linear var\(--t-out\);/, 'out: --ease-in, then hidden');
  assert.match(css, /transform: none; transition: opacity var\(--d-small\) var\(--ease-arrive\), transform var\(--d-small\) var\(--ease-arrive\), visibility 0s;/, 'in: 240 ms on --ease-arrive');
  assert.doesNotMatch(css, /translateY\(16px\)/, 'the one generic 16 px rise is gone');
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.t-pos, \.t-pos\[data-kind="sheet"\] \{ --t-x: 0px; --t-y: 0px; --t-o: 0;/, 'Reduce Motion fades in place');
  const layer = read('src/ui/tests/TestsLayer.tsx');
  assert.match(layer, /data-thumb=\{thumb\}/);
});

test('a sheet pulled shut closes with nothing of its own to play (2D sheet-hold): marked, closed in the same task, and the mark taken off on the next open', () => {
  const css = read('src/ui/tests/tests.css');
  assert.match(css, /#app \.t-pos\[data-open="false"\]\[data-swiped\] > \.t-card\.instrument-workspace\.float-ui \{ transition: none; \}/, 'the card is hidden at once, out of sight already');
  const pull = read('src/ui/tests/dock/pull.ts');
  assert.match(pull, /pos\.dataset\.swiped = ''; api\.close\(\); pos\.style\.translate = '';/, 'marked before it closes, and the offset goes after');
  const layer = read('src/ui/tests/TestsLayer.tsx');
  assert.match(layer, /close: \(\) => flushSync\(\(\) => useTests\.getState\(\)\.close\(\)\)/, 'the close is committed in that task: the offset is never cleared under a card that is still open');
  assert.match(layer, /if \(open\) posRef\.current\?\.removeAttribute\('data-swiped'\)/);
});

test('an instrument\'s data card has 2D\'s corner Enlarge button, on a wide screen where the card has room to grow; Show and the lip are not drawn by 2D at the pin, so they are not here', () => {
  const tiles = read('src/ui/cards/TilesCard.tsx');
  assert.match(tiles, /className="pz-zbtn" aria-label="Enlarge this card" aria-expanded=\{zoomed\} title="Enlarge"/, '2D presenter-start.js zbtn');
  assert.match(tiles, /<I n="fullscreen" \/><I n="shrink" \/>/);
  const layer = read('src/ui/cards/CardLayer.tsx');
  assert.match(layer, /onZoom=\{sn\.dslide\.tool \? zoomButton : undefined\}/, 'an instrument card only (2D: its header is hidden on a tiles-only card)');
  assert.match(layer, /zoomPlan\(\{ left: dataBox\.x/, '`pz-zoomable` when the card would grow by at least ZOOM_MIN (2D zoom.plan() is not null)');
  assert.match(layer, /e\.stopPropagation\(\);/, 'the button is not also a tap on the card');
  // 2D's own rules for the button, the header one box deeper
  const two = read('src/ui/styles/app-09-tests.css').split('\n').filter((l) => l.startsWith('.pz.pz-wide .pz-data.pz-zoomable > .pz-dh'));
  const mine = read('src/ui/deck-ui.css');
  assert.equal(two.length, 2);
  for (const rule of two) assert.ok(mine.includes(rule.replace('.pz-zoomable > .pz-dh', '.pz-zoomable > .dk-in > .pz-dh')), `lifted: ${rule.slice(0, 70)}`);
  // Show (.pz-fold) and the lip (.pz-lip) belong to a card with an instrument AND readings (has-tool and not tool-only); 2D's toolOnly(s) is `!!s.tool`, so it never builds that card
  assert.doesNotMatch(tiles, /pz-fold|pz-lip/);
});

test('the top bar glides: 2D\'s topbar-motion.js is copied whole, started with the bar, and moves only transform and opacity', () => {
  const copy = read('src/ui/shell/topbar-motion.copied.js');
  assert.match(copy, /^\/\/ GENERATED by scripts\/copy-b11-shell\.mjs from the 2D app at [0-9a-f]{8} \(topbar-motion\.js\)/);
  assert.doesNotMatch(copy, /requestAnimationFrame/, 'no raw frame request (one clock)');
  assert.match(copy, /return \(\) => \{ dead = true; mo\.disconnect\(\); ro\.disconnect\(\); \};/, 'it hands back its stop');
  for (const m of copy.matchAll(/from '(\.[^']+)'/g)) assert.doesNotThrow(() => readFileSync(new URL(`../src/ui/shell/${m[1]}`, import.meta.url)), `its import ${m[1]} exists`);
  assert.match(read('src/ui/shell/TopBar.tsx'), /useEffect\(\(\) => startTopbarMotion\(\), \[\]\)/);
  assert.match(read('src/ui/shell/topbar-motion.ts'), /initTopbarMotion/);
  // (the 3D bar has no GPU glass: the plate-copy path)
  const deps = read('src/ui/shell/topbar-motion-deps.ts');
  assert.match(deps, /gpuGlass\(_el: Element\): boolean \{ return false; \}/);
});

test('every data card carries 2D\'s dock handle, the summary table\'s too (it docks like the instrument card)', () => {
  assert.match(read('src/ui/cards/CardFrame.tsx'), /\(entry\.id === 'ladder' \|\| entry\.id === 'table'\) && lay !== 'wide' && lay !== 'short' && <span className="pz-grip"/);
});
