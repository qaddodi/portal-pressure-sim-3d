// The stent editor's layout M1 (owner, 22 Nov 2026; mocks /mnt/project-files/visual-mocks/tips-card/M1-*-min.png) and the humanized rules it answers (docs/HUMANIZED-DESIGN.md): plain ruled rows instead of tiles, the editor
// indented right under its row with no band, no margin line and no underline, a choice told by weight (no pill, no thumb, no dot), Done and the status as plain words, the card's actions kept with their icons.
// The root rule (owner): the one shared editor serves every stent card (TIPS, DIPS, a custom shunt, Tests > IR), and the same two-way choice look serves every card's choice. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string): string => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const editorCss = read('src/ui/action/stent/stent-editor.css');
const panel = read('src/ui/action/stent/StentPanel.tsx');
const actionCss = read('src/ui/action/action.css');
const stentCss = read('src/ui/charts/stent/stent.css');
const plate = read('src/ui/styles/app-06-plate.css');
const rules = (src: string) => [...src.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]! }));
const bodyOf = (src: string, sel: string): string => rules(src).filter((r) => r.sel === sel).map((r) => r.body).join(' ');

test('no tile, band, margin line, underline, thumb or dot is left in the editor\'s own stylesheet or markup', () => {
  const css = editorCss.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const bad of [/text-decoration:\s*underline/, /border-left/, /repeat\(3/, /--surface-2/, /--surface-3/, /border-radius:\s*(50%|999)/, /\.sr-thumb/, /::before\s*\{[^}]*border-radius/]) assert.doesNotMatch(css, bad, String(bad));
  for (const bad of ['se-tfill', 'se-paper', 'se-thumb', 'se-join', 'se-bg', 'se-tin', 'se-tc']) assert.ok(!panel.includes(bad), `${bad} is gone from StentPanel.tsx`);
});

test('the rows keep the app\'s own type: the name 12 px, the value 16 px, the small line 12 px', () => {
  assert.match(bodyOf(editorCss, '.stent-editor .sr-n'), /font: 500 var\(--fs-12\)/);
  assert.match(bodyOf(editorCss, '.stent-editor .sr-v b'), /font: 500 var\(--fs-16\)/);
  assert.match(bodyOf(editorCss, '.stent-editor .sr-ts'), /font: 500 var\(--fs-12\)/);
  assert.match(bodyOf(editorCss, '.sr-panel .sr-done'), /font: 600 var\(--fs-14\)/);
});

test('the open row takes the accent on its name and its chevron turns up (eased); the editor is indented under it, with no fill', () => {
  assert.match(bodyOf(editorCss, '.stent-editor .sr-row[aria-expanded="true"] .sr-n'), /color: var\(--accent-ink\)/);
  assert.match(bodyOf(editorCss, '.stent-editor .sr-row[aria-expanded="true"] .sr-c'), /rotate\(180deg\)/);
  assert.match(bodyOf(editorCss, '.stent-editor .sr-c'), /transition: transform var\(--d-surface\)/);
  const p = bodyOf(editorCss, '.sr-panel');
  assert.match(p, /padding: 0 0 4px 14px/);
  assert.doesNotMatch(p, /background/);
});

test('a two-way choice is told by weight: plain words, the chosen one heavier and darker, the heavy width kept so nothing moves', () => {
  const css = editorCss;
  assert.match(css, /\.sr-panel \.sr-seg button\[aria-pressed="true"\] \{ color: var\(--text\); font-weight: 600; \}/);
  assert.match(css, /\.sr-panel \.sr-seg button::before \{ content: attr\(data-t\)/);
  assert.match(panel, /data-t=\{o\[1\]\}/);
  assert.doesNotMatch(panel, /se-thumb|data-at/);
});

test('the editor stands in the open row\'s own item, right under it, and the card\'s actions are no longer folded away (the icons stay as they are)', () => {
  assert.match(panel, /className="sr-item"[\s\S]*?className="sr-row"[\s\S]*?\{open === r\.id \? editor\(r, false\)/);
  assert.doesNotMatch(panel, /--as-top|--as-left|--as-w/);
  assert.doesNotMatch(editorCss, /\.ac-as/);
  const actions = readFileSync(new URL('../src/ui/action/ActionCard.tsx', import.meta.url), 'utf8');
  assert.match(actions, /\{v\.icon && <OrderIcon n=\{v\.icon\} className="ac-ic" \/>\}<span className="ac-bl">/, 'the action buttons keep their icons');
});

test('what stands below the open row rides to its place and the editor fades up: transforms and opacity only', () => {
  assert.match(panel, /translateY\(\$\{dy\.toFixed\(1\)\}px\)/);
  assert.match(panel, /opacity: 0, transform: 'translateY\(-6px\)'/);
  assert.match(panel, /\[\{ opacity: 1 \}, \{ opacity: 0 \}\]/);
  assert.match(panel, /prefers-reduced-motion/);
  assert.doesNotMatch(panel, /\.animate\(\[\{ ?(height|width|top|left)/);
});

test('the 2D tile rules are gone from src/ui/styles and no 3D markup uses their class names', () => {
  assert.doesNotMatch(plate, /\.se-row\b/, 'the 2D tile rules are gone from the base sheet: nothing in 3D makes their classes');
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const f = join(d, n); return statSync(f).isDirectory() ? (n === 'styles' ? [] : walk(f)) : /\.(tsx|ts|css)$/.test(n) ? [f] : []; });
  for (const f of walk('src/ui')) {
    if (/\.copied\./.test(f)) continue;
    const src = readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /className="[^"]*\bse-(row|panel|tin|paper|rows)\b/, `${f} uses a 2D tile class`);
  }
});

test('one editor serves every stent card: the vessel card (TIPS, DIPS, custom shunts) through the stent panel, and Tests > IR', () => {
  assert.match(panel, /registerPanel\('stent', StentPanel\)/);
  assert.match(panel, /export function StentEditor/);
  assert.match(read('src/ui/tests/ir/TipsView.tsx'), /<StentEditor id=\{at\} lead \/>/);
  const cards = read('src/ui/action/cards.ts');
  assert.equal([...cards.matchAll(/type: 'panel', id: '([a-z]+)'/g)].map((m) => m[1]).filter((x, i, a) => a.indexOf(x) === i).join(), 'stent', 'the stent panel is the only pop-out editor a card has');
  assert.match(editorCss, /\.ir-zone \.sr-item:last-child/);
});

test('every card\'s two-way choice has the same look: the action card\'s .ac-seg and the stent chart\'s switch are plain words told by weight, no pill', () => {
  assert.doesNotMatch(bodyOf(actionCss, '.ac-seg'), /background|border-radius|padding: 2px/);
  assert.match(actionCss, /\.ac-card \.ac-seg\.ac-seg button\[aria-pressed="true"\] \{ color: var\(--text\); font-weight: 600; \}/);
  assert.doesNotMatch(bodyOf(stentCss, '.pz-stent-sw'), /background|border-radius/);
  assert.match(stentCss, /\.pz-stent-btn\[aria-pressed="true"\] \{ color: var\(--text\); font-weight: 600; \}/);
  for (const f of ['src/ui/action/ActionCard.tsx', 'src/ui/charts/stent/StentCard.tsx']) assert.match(read(f), /data-t=\{name\}/, f);
  assert.doesNotMatch(stentCss, /box-shadow/);
});

test('the card that holds the editor stands up to 560 px tall on a side card, so its actions, rows and open controls all fit without scrolling inside it', () => {
  assert.match(editorCss, /\.ac-card:not\(\[data-bottom\]\):has\(\.stent-editor\) \{ max-height: min\(560px/);
});

test('the action card\'s height glides when its content changes height: the paper is a plate scaled by a transform, the words ride on a sheet, the first frame is written inline, nothing animates a layout property', () => {
  const card = read('src/ui/action/ActionCard.tsx');
  assert.match(card, /<i ref=\{plate\} className="ac-plate" aria-hidden="true" \/>/);
  // (the one height glide, surface/height-glide.ts, over the copied frames of 2D card-glide.js)
  const glide = read('src/ui/surface/height-glide.ts'), frames = read('src/ui/treat/card-glide.copied.ts');
  assert.match(frames, /scaleY\(\$\{k\.toFixed\(4\)\}\)/);
  assert.match(frames, /translateY\(\$\{d\.toFixed\(1\)\}px\)/);
  assert.match(glide, /c\.style\.transform = frames\[0\]!\.transform;/, 'the frame that finds the new height never shows it');
  assert.match(card, /new ResizeObserver\(\(es\) => \{[\s\S]*?glideHeight\(el, h0, h1, \{ foot: bottom, plate: plate\.current, prior: run, inline: true, mark: true \}\)/);
  assert.doesNotMatch(card, /function glideHeight/, 'no glide of its own');
  assert.match(card, /reducedMotion\(\)/);
  assert.doesNotMatch(card, /\.animate\(\[\{ ?(height|width|top|left)/);
  const plateRule = bodyOf(actionCss, '.ac-card > .ac-plate');
  assert.match(plateRule, /background: var\(--surface\)/);
  assert.match(plateRule, /box-shadow:/);
  assert.match(bodyOf(actionCss, '.ac-card'), /border: 1px solid transparent/);
  assert.doesNotMatch(bodyOf(actionCss, '.ac-card'), /background:|box-shadow:|opacity:/, 'the card itself is clear; its plate and words carry the fade, so the frost is drawn while it fades');
  assert.match(actionCss, /\.ac-card\[data-bottom\] > \.ac-plate \{ transform-origin: 50% 100%; \}/);
  assert.match(actionCss, /\.ac-card\[data-glide\] \{ overflow: visible; \}/);
  assert.match(read('src/ui/glass.css'), /\.ac-card > \.ac-plate/);
});
test('the editor\'s rows ride relative to the editor itself, so a sheet\'s own ride is not counted twice', () => {
  assert.match(panel, /box\(el\)\.top - box\(root\.current!\)\.top/);
});
