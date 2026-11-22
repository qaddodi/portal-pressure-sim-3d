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
const plate = read('src/ui/css2d/app-06-plate.css');
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

test('the 2D tile rules stay byte for byte in css2d and no 3D markup uses their class names', () => {
  assert.match(plate, /\.stent-editor \.se-row \{/);
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const f = join(d, n); return statSync(f).isDirectory() ? (n === 'css2d' ? [] : walk(f)) : /\.(tsx|ts|css)$/.test(n) ? [f] : []; });
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
