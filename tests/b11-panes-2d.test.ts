// The Tests card's panes are the 2D app's own markup, so the 2D stylesheets (src/ui/styles) lay them out and dress them: a pane's view is `.instrument-view[data-pane]`, the child
// of the card's `.dock-pane`, with its head row (a switch) before it, as dock.js builds them. No class of ours lays a pane out, and no rule of ours gives a pane a padding (the .dock-pane has 2D's).
// What cannot be the same element, a 2D <canvas>, is a <div class="cv"> placed by the 2D canvas rules copied by script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { cvRules, rulesOf, splitTop } from '../scripts/copy-b11-panes.mjs';
import { cvHeight } from '../src/ui/tests/cv-size.ts';
import { riseTxt, slideTxt } from '../src/ui/tests/abdomen/model.ts';
import { pinned2D } from './two-d-pin.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const TWO_D = pinned2D('src/ui/instruments.js').repo;
const baseCss = () => readdirSync(new URL('../src/ui/styles/', import.meta.url)).filter((f) => f.endsWith('.css') && f !== 'index.css').map((f) => read(`src/ui/styles/${f}`)).join('\n');

test('the card puts a pane\'s parts straight into .dock-pane: no wrapper between the pane and its view, so 2D\'s child rules (.dock-pane > .instrument-view) reach it', () => {
  const layer = read('src/ui/tests/TestsLayer.tsx');
  assert.match(layer, /<PaneHost\.Provider value="dock">\{body\(/, 'a context provider renders no element');
  assert.doesNotMatch(layer, /display: 'contents'/);
  // the 2D sheets do lean on that child relation
  assert.ok((baseCss().match(/\.dock-pane(\[[^\]]*\])*(\.active)? > \.instrument-view/g) ?? []).length > 40);
});

test('every pane\'s view is 2D\'s .instrument-view with its data-pane, and its switch is 2D\'s .pressure-switch of .ps-btn, before the view', () => {
  const views: [string, RegExp[]][] = [
    ['src/ui/tests/ir/IrPane.tsx', [/className="pressure-switch ir-switch" role="group" aria-label="IR view"/, /className=\{host\.view\} data-pane="hvpg" data-view=\{view\}/, /className="hvpg-ir" data-state=\{R\.ppg\.take\}/, /className="chart-side"/]],
    ['src/ui/tests/fibro/FibroPane.tsx', [/className="pressure-switch fs-organ" role="group" aria-label="Organ" style=\{\{ position: 'relative', zIndex: 2, flex: 'none', minHeight: 30 \}\}/, /className=\{host\.view\} data-pane="fibroscan"/, /className="chart-box fibroscan-box"/, /className="kv compact fs-key" style=\{\{ flex: 'none' \}\} aria-label="Cut-offs, kPa"/]],
    ['src/ui/tests/endo/EndoPane.tsx', [/className="pressure-switch" role="group" aria-label=\{W\.switchAria\}/, /className=\{host\.view\} data-pane="endoscopy"/, /className="endo-stage"/, /className="chart-box square"/, /className="btn primary"/, /pane\.dataset\.sub = view/]],
    ['src/ui/tests/endo/WallView.tsx', [/wall-view`\} data-pane="varixwall"/, /className="chart-box square wall-box"/]],
    ['src/ui/tests/abdomen/AbdomenPane.tsx', [/className=\{`ab \$\{host\.view\}`\} data-pane="abdomen" data-belly="84"/, /className="ab-vol-l"><div className="ab-trend"/, /className="ab-belly"/, /className="ab-belly-fill" style=\{\{ translate: riseTxt\(v\.fill\) \}\}/, /className="ab-big"/, /className="ab-rate" data-dir=\{v\.rateDir\}/, /className="ab-dial-box svg-gl-box"/, /className="ab-iap-fill" data-sev=\{v\.iapSev\} style=\{\{ translate: slideTxt\(v\.iapFill\) \}\}/, /<I n="drop" \/>/, /<I n="pill" \/>/, /ab-dp-alb\$\{warn \? ' ab-warn' : ''\}/]],
    ['src/ui/tests/trace/OverTimePane.tsx', [/className=\{`pt \$\{host\.view\}`\} data-pane="scope"/, /className="chart-box pt-box"/, /className="seg pt-range"/]],
    ['src/ui/tests/trace/PressureTab.tsx', [/className="pressure-switch" role="group" aria-label="Pressure view"/]],
    ['src/ui/tests/profile/ProfilePane.tsx', [/className=\{host\.view\} data-pane="profile"/]],
    ['src/ui/tests/doppler/DopplerPane.tsx', [/className="dop instrument-view" data-pane="doppler"/, /className="chart-box dark dop-box"/]],
    ['src/ui/trials/TrialsPane.tsx', [/className="instrument-view trials-view" data-pane="trials" data-mode=\{mode\}/, /className="pressure-switch" role="group" aria-label="Trials view"/, /className="ps-btn" data-view=\{v\}/, /className="tr-body"/]],
  ];
  for (const [file, res] of views) { const src = read(file); for (const re of res) assert.match(src, re, `${file}: ${re}`); }
  // the view's class on a slide's card is 2D's .pz-inst (presenter-tools.js), in the Tests card .instrument-view
  assert.match(read('src/ui/tests/Cv.tsx'), /view: slide \? 'pz-inst' : 'instrument-view'/);
  assert.match(read('src/ui/tests/Cv.tsx'), /createContext<'dock' \| 'slide'>\('slide'\)/, 'only the Tests card is the dock: a card anywhere else keeps the height it is handed');
});

test('no pane carries a class or a stylesheet of ours for its layout: the invented rules are gone', () => {
  for (const gone of ['src/ui/tests/abdomen/abdomen.css', 'src/ui/tests/fibro/fibro.css', 'src/ui/tests/endo/endo.css', 'src/ui/tests/endo/wall.copied.css', 'src/ui/tests/doppler/doppler.css']) assert.ok(!existsSync(new URL(`../${gone}`, import.meta.url)), `${gone} is gone`);
  const tsx = ['ir/IrPane.tsx', 'ir/TipsView.tsx', 'ir/CurvesView.tsx', 'ir/CompareView.tsx', 'ir/Monitor.tsx', 'ir/HandOver.tsx', 'fibro/FibroPane.tsx', 'endo/EndoPane.tsx', 'endo/WallView.tsx', 'endo/EusPpg.tsx', 'abdomen/AbdomenPane.tsx', 'trace/OverTimePane.tsx', 'trace/PressureTab.tsx', 'profile/ProfilePane.tsx', 'doppler/DopplerPane.tsx']
    .map((f) => [f, read(`src/ui/tests/${f}`)] as const);
  const OURS = /\b(t-seg|fs-pane|fs-box|fs-bar|ir-pane|ir-side|pt-tab|pt-stack|en-view|en-wall|en-stage|en-pic|en-side|en-band|ir-stent-line)\b|className="en"/;
  for (const [f, src] of tsx) assert.doesNotMatch(src, OURS, `${f} has a class of ours`);
  // a pane never nests a second .dock-pane (a size container: it collapsed), and never sets the card's padding itself
  for (const [f, src] of tsx) { assert.doesNotMatch(src, /className="dock-pane"/, `${f} nests a .dock-pane`); assert.doesNotMatch(src, /padding/i, `${f} sets a padding`); }
  // what is left of the panes' own stylesheets lays nothing out
  for (const f of ['src/ui/tests/ir/ir.css', 'src/ui/tests/trace/trace.css']) {
    for (const [sel, body] of rulesOf(read(f))) { if (sel.startsWith('@')) continue; assert.doesNotMatch(body, /\b(display|padding|margin|gap|flex|grid|width|height)\s*:/, `${f}: ${sel} lays out`); }
  }
  assert.doesNotMatch(read('src/ui/tests/tests.css'), /\.t-seg/);
  assert.doesNotMatch(read('src/ui/trials/trials.css'), /\.tr-pane|\.tr-sw/, 'the Trials pane has no .tr-pane (the Treat card has one of its own: the two rules met)');
});

test('the chart\'s place in its box is 2D\'s canvas rules with `canvas` rewritten to `.cv`, copied by script', () => {
  const css = read('src/ui/tests/copied/cv-2d.copied.css');
  assert.match(css, /^\/\* GENERATED by scripts\/copy-b11-panes\.mjs/);
  assert.match(css, /\.chart-box \.cv \{ position: absolute; inset: 0; width: 100%; height: 100%; \}/);
  assert.match(css, /\.instrument-workspace :is\(\.dop-box, \.hvpg-box, \.fibroscan-box\) > \.cv \{ inset: auto; left: var\(--cv-l\); top: var\(--cv-t\); margin: 0; width: var\(--cv-w\); height: var\(--cv-h\);/);
  assert.doesNotMatch(css.split('\n').slice(1).join('\n'), /\bcanvas\b|\.pz\b|\.pz-/);
  // every rule in it is in the lifted 2D sheets with `canvas` in the place of `.cv`, body unchanged
  const all = baseCss().replace(/\s+/g, ' ');
  for (const [sel, body] of rulesOf(css)) for (const part of splitTop(sel)) assert.ok(all.includes(`${part.replace(/\.cv\b/g, 'canvas')}`) && all.includes(body.replace(/\s+/g, ' ').slice(0, 60)), `${part} is 2D's`);
  // the walker keeps an at-rule's wrapper and leaves the slide cards' rules to the slides
  const made = cvRules('@media (max-width: 9px) { .a .chart-box > canvas { top: 0; } .pz-tool .dop-box > canvas { top: 1px; } } .hvpg-box canvas:first-child, .x { left: 0; }', 'x.css');
  assert.deepEqual(made, ['@media (max-width: 9px) {\n  .a .chart-box > .cv { top: 0; }   /* x.css */\n}', '.hvpg-box .cv:first-child { left: 0; }   /* x.css */']);
  if (existsSync(`${TWO_D}/index.html`)) execFileSync('node', ['scripts/copy-b11-panes.mjs', '--from', TWO_D, '--check'], { stdio: 'pipe' });
  // each instrument's box holds a .cv, and the chart is drawn at the height the stylesheet gave it (the handed height only until the box has one)
  for (const f of ['ir/Monitor.tsx', 'fibro/FibroPane.tsx', 'endo/EndoPane.tsx', 'endo/WallView.tsx', 'trace/OverTimePane.tsx', 'profile/ProfilePane.tsx', 'doppler/DopplerPane.tsx']) assert.match(read(`src/ui/tests/${f}`), /<Cv at=\{cv\.ref\}>/, `${f} draws into a .cv`);
  assert.equal(cvHeight(0, 212.4), 212); assert.equal(cvHeight(263, 212), 263);
  // in the Tests card no box is handed a height inline (2D sizes it: a share of the card, a shape); only a slide's card, which has no 2D wrapper yet, keeps the handed one
  for (const f of ['ir/Monitor.tsx', 'fibro/FibroPane.tsx', 'trace/OverTimePane.tsx', 'profile/ProfilePane.tsx', 'doppler/DopplerPane.tsx']) assert.doesNotMatch(read(`src/ui/tests/${f}`), /style=\{\{ height: h \}\}/, `${f} sets its box's height inline`);
});

test('every container the panes\' 2D container queries ask for is on 2D\'s own element in the card', () => {
  const all = baseCss();
  // the named ones: ws is the card, tpane and ab-pane the pane; the unnamed ones resolve against the nearest (the pane, .endo-stage, a tile, .ab-vol, .ab-belly, .ir-tips, .ir-keys, the boxes)
  assert.match(all, /\.instrument-workspace\.float-ui \{ container-name: ws; container-type: inline-size;/);
  assert.match(all, /\.instrument-workspace \.dock-pane \{ container-type: size; container-name: tpane; \}/);
  assert.match(all, /\.dock-pane:has\(> \.instrument-view\.ab\) \{ container-name: ab-pane; \}/);
  const named = new Set([...all.matchAll(/@container ([a-z][\w-]*) \(/g)].map((m) => m[1]!));
  const have = new Set([...all.matchAll(/container-name: ([\w-]+)/g), ...all.matchAll(/container: ([\w-]+) \//g)].map((m) => m[1]!));
  for (const n of named) assert.ok(have.has(n), `@container ${n}: no element is named ${n}`);
  const layer = read('src/ui/tests/TestsLayer.tsx');
  assert.match(layer, /instrument-workspace float-ui/); assert.match(layer, /className=\{`dock-pane \$\{cls\}`\} data-pane=\{id\} id=\{leaver == null \? `pane-\$\{id\}` : undefined\}/);
  // the side card says one column the way 2D does (.instrument-workspace.side { --one-col: 1 }), and the card hands 2D's two sizes to its panes
  assert.match(layer, /side \? ' side' : ''/); assert.match(layer, /--plot-h/); assert.match(layer, /--square-size/);
  // nothing of ours overrides a container on the card or the pane
  for (const f of ['src/ui/tests/tests.css', 'src/ui/tests/ir/ir.css', 'src/ui/tests/trace/trace.css']) assert.doesNotMatch(read(f), /container(-type|-name)?\s*:/, `${f} sets a container`);
});

test('the belly\'s fluid and the pressure bar are written as 2D writes them (translate only)', () => {
  assert.equal(riseTxt(0.5), '0px 50%'); assert.equal(slideTxt(0.667), '-33.3% 0px');
  if (!existsSync(`${TWO_D}/src/ui/instruments.js`)) return;
  const src = readFileSync(`${TWO_D}/src/ui/instruments.js`, 'utf8');
  assert.ok(src.includes('`${k / 10 - 100}% 0px`') && src.includes('`0px ${100 - p}%`'), '2D instruments.js slideTxt and riseTxt');
});
