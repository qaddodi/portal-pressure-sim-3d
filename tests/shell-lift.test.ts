// The always-on chrome is the 2D app's own markup under the 2D app's own stylesheets (owner, 19 Nov: "the shell is definitely still not good… doesn't look like the 2D version").
// One test per item of his side-by-side list: each checks the markup the 2D stylesheet is keyed on, the copied stylesheet's numbers and the numbers the shell computes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { DEFAULTS } from '../src/state/settings.ts';
import { layoutVars, layoutClass, footHeight, freeRoom } from '../src/ui/shell/room.ts';
import { M } from '../src/ui/shell/metrics.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = (f: string) => readFileSync(join(root, f), 'utf8');
const css2d = readdirSync(join(root, 'src/ui/css2d')).filter((f) => f.endsWith('.css')).map((f) => src(`src/ui/css2d/${f}`)).join('\n');

test('0. the 2D stylesheets are imported once, right after global.css, and the shell lays them over the canvas with one small overlay', () => {
  const main = src('src/main.tsx');
  assert.ok(main.indexOf("./ui/shell/global.css") < main.indexOf("./ui/css2d/index.css"));
  assert.equal(main.split("css2d/index.css").length, 2);
  assert.match(src('src/ui/shell/Shell.tsx'), /import '\.\/chrome-3d\.css'/);
  const shellCss = src('src/ui/shell/shell.css');
  for (const dead of ['.sh-id', '.sh-figpill', '.sh-acts', '.sh-dock', '.sh-zoom', '.sh-play', '.sh-thumb', '.sh-views', '.sh-credit', '.sh-fps', '.sh-legend']) assert.ok(!shellCss.includes(dead + ' ') && !shellCss.includes(dead + '{'), `${dead} is still restyled by hand`);
  assert.ok(src('src/ui/shell/chrome-3d.css').split('\n').length < 60, 'the overlay stays small: the 2D stylesheet does the work');
});

test('1. the first screen is Light, as the 2D page opens', () => {
  assert.equal(DEFAULTS.look, 'light');
  assert.ok(/:root\[data-theme="light"\]|html\[data-theme="light"\]|data-theme="light"/.test(css2d), 'the 2D tokens are keyed on data-theme');
});

test('2. the view pill floats above the dock, centred (2D .nb-views: bottom calc(100% + 8px), padding 6, radius 21)', () => {
  const dock = src('src/ui/shell/Dock.tsx');
  assert.ok(dock.indexOf('className="nb-views"') > dock.indexOf('className="vdock'), 'the pill is inside the dock');
  assert.match(css2d, /\.nb-views\s*\{[^}]*bottom:\s*calc\(100% \+ 8px\)/);
  assert.match(css2d, /\.nb-views\s*\{[^}]*padding:\s*6px/);
  assert.match(css2d, /\.nb-views\s*\{[^}]*border-radius:\s*21px/);
  assert.equal(M.viewGapAbove, 8); assert.equal(M.viewPad, 6); assert.equal(M.viewRadius, 21);
});

test('3. the play bar is centred at the foot with HVPG and PPG inside the same card (2D .vdock: min(100% - 24px, 640px) wide, readouts 274 px)', () => {
  const dock = src('src/ui/shell/Dock.tsx');
  assert.ok(dock.indexOf('<Timeline') < dock.indexOf('<Readouts'), 'the timeline row, then the readouts, in one .vdock');
  assert.match(css2d, /\.vdock:not\(\.mini\) \{ width: min\(calc\(100% - 2 \* var\(--gap\)\), 640px\)/);
  assert.match(css2d, /\.vdock:not\(\.mini\) \.readouts \{ width: 274px; \}/);
  assert.equal(M.dockMaxW, 640); assert.equal(M.readoutsW, 274);
  const play = src('src/ui/shell/PlayBar.tsx');
  assert.ok(play.includes('cuts.HVPG_CUTS') && play.includes('cuts.PPG_CUTS'), 'the tiles take the cut-offs from the engine\'s one table');
});

test('4. the top bar is the 2D one: app icon and patient menu, Blood and the lens with its key, Treat / Tests / History in one group, the gear and Search', () => {
  const tb = src('src/ui/shell/TopBar.tsx');
  const at = (s: string) => tb.indexOf(s);
  for (const c of ['topbar float-ui stage-blocker', 'float-pill tb-id', 'brand-mark', 'menu-btn', 'stage-bar top', 'sb-left', 'sb-right has-face', 'lens-btn', 'id="btnLayers"', 'top-right float-pill stage-blocker', 'tb-act', 'tb-sep', 'pal-btn', 'tb-hc'])
    assert.ok(tb.includes(c), `TopBar.tsx has no ${c}`);
  assert.ok(at('float-pill tb-id') < at('stage-bar top') && at('stage-bar top') < at('top-right float-pill'), '2D order: patient, figure controls, actions');
  assert.ok(at('tb-sep') < at('pal-btn'), 'a divider before the gear and Search');
  assert.ok(tb.includes('LensKey'), 'the colour key sits in the lens button');
  assert.match(css2d, /\.topbar\s*\{[^}]*padding:[^;]*10px/);
});

test('5. the zoom group has Zoom in, Fit and Zoom out (and Rotate for the Circuit), above the dock on the right', () => {
  const z = src('src/ui/shell/ZoomGroup.tsx');
  for (const id of ['zoomIn', 'zoomFit', 'zoomOut', 'rotateCircuit']) assert.ok(z.includes(`id="${id}"`), id);
  assert.ok(z.indexOf('id="zoomIn"') < z.indexOf('id="zoomOut"'), 'plus, then minus, then Fit (2D index.html)');
  assert.match(css2d, /bottom: calc\(var\(--bot-occ, 120px\) \+ 8px\)/, 'the zoom pill rides on --bot-occ');
});

test('6. the © credit and the frame-rate readout are the 2D elements (.stage-credit placed 12 px in; .fps-counter 8 px in)', () => {
  assert.ok(src('src/ui/shell/Credit.tsx').includes('className="stage-credit"'));
  assert.ok(src('src/ui/shell/Diagnostics.tsx').includes('className="fps-counter"'));
  assert.match(css2d, /\.stage-credit \{[^\n]*font-size: var\(--fs-12\)[^\n]*line-height: 1\.4/);
  assert.match(css2d, /\.fps-counter \{ position: fixed; left: max\(8px, env\(safe-area-inset-left\)\); bottom: max\(8px/);
  assert.equal(M.creditInset, 12); assert.equal(M.fpsInset, 8);
});

test('the numbers main.js publishes on .app (--top-safe, --vdock-h, --bot-occ…) are computed from the same sums, and the figure keeps clear of them', () => {
  const vp = { w: 1280, h: 800, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
  const v = layoutVars(vp, layoutClass(false));
  // dock 60 + 8 + view pill (6 + 30 + 6) = 110; with the 12 px under the dock: 122
  assert.equal(v['--vdock-h'], '110px');
  assert.equal(v['--bot-occ'], '122px');
  assert.equal(v['--top-safe'], '64px');
  assert.equal(layoutVars({ ...vp, safe: { ...vp.safe, top: 47 } }, 'desktop')['--top-safe'], '111px');
  const room = freeRoom(vp, layoutClass(false));
  assert.equal(room.y, 64);
  assert.equal(room.y + room.h, 800 - (footHeight('desktop') + M.zoomAboveDock));
  assert.ok(footHeight(layoutClass(true)) > footHeight(layoutClass(false)), 'the thumb layout keeps its tab row too');
});
