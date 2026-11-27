import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('the Treat card is mounted inside #app (InApp), as in 2D: the 2D stylesheet defines its variables (--gap, --card-head-pad, --top-h, --panel-w) and its .app rules there', () => {
  assert.match(read('src/ui/shell/Sheets.tsx'), /<InApp><TreatCard \/><\/InApp>/, 'TreatCard goes through InApp');
  // what only .app defines in 2D's tokens: a card outside it would read nothing
  const chrome = read('src/ui/styles/app-01-chrome.css');
  const rule = chrome.slice(chrome.indexOf('\n.app {'), chrome.indexOf('}', chrome.indexOf('\n.app {')));
  for (const v of ['--gap', '--top-h', '--panel-w']) assert.ok(rule.includes(v), `.app defines ${v}`);
  // (the head's padding is every panel's, in #app or in the shell's root: one token on :root, surface/PanelHead.tsx)
  assert.match(chrome, /\n:root \{ --card-head-pad: 12px 8px 8px 16px; \}/, ':root defines --card-head-pad');
});

test('the brand mark has its bitmap (2D index.html style): without it the top bar showed a solid square of --brand-bg', () => {
  const css = read('src/ui/shell/chrome-3d.css');
  assert.match(css, /\.brand-mark\s*\{[^}]*background-image:\s*url\("\.\.\/brand\/icons\/mark\.png"\)/);
  assert.ok(readFileSync(new URL('../src/ui/brand/icons/mark.png', import.meta.url)).length > 1000, 'the bitmap is there');
});

test('every icon the shell draws from the atlas has its cell in the stylesheet (a missing one is a blank or wrong glyph)', () => {
  const have = new Set([...read('src/ui/styles/icons.css').matchAll(/^\.ic-([a-z0-9-]+) \{/gm)].map((m) => m[1]));
  const atlas = read('src/ui/shell/icons.tsx').match(/ATLAS = new Set\(\[(.*?)\]\)/s)![1]!.match(/'([^']+)'/g)!.map((x) => x.slice(1, -1));
  assert.deepEqual(atlas.filter((n) => !have.has(n)), []);
});

test('Treat is `hidden` while closed, as in 2D (its stylesheet puts the phone view pill away only while #treatCard is not hidden), and stays displayed so it can fade', () => {
  assert.match(read('src/ui/treat/TreatCard.tsx'), /id="treatCard" hidden=\{!open\}/);
  assert.match(read('src/ui/treat/treat.css'), /\.sh-root #treatCard\.treat-card\[hidden\]\s*\{\s*display:\s*block !important/);
  assert.match(read('src/ui/styles/app-10-thumb-dock.css'), /:has\(#treatCard:not\(\[hidden\]\)\)/);   // (the 2D rule this answers)
});

test('the Layers tab is never disabled: 2D dims no tab, and Anatomy and Circuit have Layers content (Fit to screen, Turn upright, the Blood rows)', () => {
  const bar = read('src/ui/shell/ThumbBar.tsx');
  assert.ok(!/disabled=/.test(bar), 'no tab of the thumb bar is disabled');
  const sheet = read('src/ui/shell/FigureMenu.tsx');
  assert.match(sheet, /<FigureRows kind=\{lobule \? 'layers' : 'blood'\} \/>/, 'the sheet holds the Blood rows outside the lobule');
  assert.match(sheet, /view === 'circuit' &&/, 'and Turn upright in Circuit');
  assert.match(bar, /view === 'sinusoid' && \(t\.id === 'treat' \|\| t\.id === 'tests' \|\| t\.id === 'layers'\)\) goToView\('lobule'\)/, 'from the sinusoid view the tab first goes out to the lobule (2D outOfSin)');
});

test('the colour-lens menu is the 2D markup (lens-grid of .lens), so its own phone rule makes it one column that fits; our two-column 420 px grid is gone', () => {
  const top = read('src/ui/shell/TopBar.tsx');
  assert.match(top, /className="lens-grid"/);
  assert.match(top, /className=\{`lens\$\{lens === id \? ' on' : ''\}`\}/);
  assert.match(top, /cls="layers-pop"/, 'the 2D popover class sizes it: min(360px, 100vw - 16px)');
  assert.ok(!/\.sh-grid\b/.test(read('src/ui/shell/shell.css')), 'no min-width: 420px grid');
  const lens2d = read('src/ui/styles/app-02-controls.css');
  assert.match(lens2d, /\.lens-grid \{ grid-template-columns: minmax\(0, 1fr\);/, '2D: one column on a phone');
});
