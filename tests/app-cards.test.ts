import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('the Treat card is mounted inside #app (InApp), as in 2D: the 2D stylesheet defines its variables (--gap, --card-head-pad, --top-h, --panel-w) and its .app rules there', () => {
  assert.match(read('src/ui/shell/Sheets.tsx'), /<InApp><TreatCard \/><\/InApp>/, 'TreatCard goes through InApp');
  // what only .app defines in 2D's tokens: a card outside it would read nothing
  const chrome = read('src/ui/css2d/app-01-chrome.css');
  const rule = chrome.slice(chrome.indexOf('\n.app {'), chrome.indexOf('}', chrome.indexOf('\n.app {')));
  for (const v of ['--gap', '--card-head-pad', '--top-h', '--panel-w']) assert.ok(rule.includes(v), `.app defines ${v}`);
});

test('the brand mark has its bitmap (2D index.html style): without it the top bar showed a solid square of --brand-bg', () => {
  const css = read('src/ui/shell/chrome-3d.css');
  assert.match(css, /\.brand-mark\s*\{[^}]*background-image:\s*url\("\.\.\/brand\/icons\/mark\.png"\)/);
  assert.ok(readFileSync(new URL('../src/ui/brand/icons/mark.png', import.meta.url)).length > 1000, 'the bitmap is there');
});

test('every icon the shell draws from the atlas has its cell in the stylesheet (a missing one is a blank or wrong glyph)', () => {
  const have = new Set([...read('src/ui/css2d/icons.css').matchAll(/^\.ic-([a-z0-9-]+) \{/gm)].map((m) => m[1]));
  const atlas = read('src/ui/shell/icons.tsx').match(/ATLAS = new Set\(\[(.*?)\]\)/s)![1]!.match(/'([^']+)'/g)!.map((x) => x.slice(1, -1));
  assert.deepEqual(atlas.filter((n) => !have.has(n)), []);
});
