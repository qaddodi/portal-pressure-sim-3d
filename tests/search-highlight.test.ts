// The Search palette highlights the active row (owner, 20 Nov: "this menu doesn't highlight my choice").
// Root cause: 2D draws the active row (`.pal-item.on`) as a transparent row and gives its tint to ONE piece under the rows (`.pal-glide`, in a `.pal-list.glides`) that glides to it
// (palette.js place). The port copied those CSS rules but built a plain `.pal-list` with no `.pal-glide` inside, so `.on` was transparent and nothing drew the fill. This holds the markup to the rules.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';

const src = readFileSync('src/ui/search/SearchSheet.tsx', 'utf8');
const css = readFileSync('src/ui/styles/app-03-layouts.css', 'utf8');

test('the list is a `glides` list and holds the one `.pal-glide` piece before its rows', () => {
  assert.match(src, /className="pal-list glides"/);
  assert.match(src, /<div ref=\{hl\} className="pal-glide" aria-hidden="true" \/>[\s\S]{0,80}hits\.length === 0/);
});
test('the rows are the 2D rows: `.on` and aria-selected follow the active one, and each is measured for the highlight', () => {
  assert.match(src, /className=\{`pal-item\$\{i === at \? ' on' : ''\}`\} aria-selected=\{i === at\}/);
  assert.match(src, /ref=\{\(b\) => \{ rowEls\.current\[i\] = b; \}\}/);
});
test('the highlight eases: moved by translate and scale on --d-flip, never by top or height; a new list lands with `still`, and no layout read runs in a key or a pointer move', () => {
  assert.match(css, /\.pal-glide \{[^}]*transition: translate var\(--d-flip\) var\(--ease-move\), scale var\(--d-flip\) var\(--ease-move\), opacity var\(--d-flip\) var\(--ease-move\)/);
  assert.match(css, /\.pal-list\.glides \.pal-item\.on \{ background: transparent; \}/);
  assert.match(css, /\.pal-glide \{[^}]*background: var\(--accent-soft\)/);
  const place = src.slice(src.indexOf('const place ='), src.indexOf('const measure ='));
  assert.match(place, /el\.style\.translate/); assert.match(place, /el\.style\.scale/); assert.match(place, /classList\.add\('still'\)/);
  assert.doesNotMatch(place.split('el.style.scale = `')[1] ?? '', /offset|getBoundingClientRect/);
  const onKey = src.slice(src.indexOf('const onKey ='), src.indexOf('// closing:'));
  assert.doesNotMatch(onKey, /offset|getBoundingClientRect|readMetric/);
  assert.match(src, /useEffect\(\(\) => \{ if \(live\.current\) place\(true\);/);
});
test('the same cause anywhere: every list the 2D sheet styles as `.<name>.glides` carries `glides` in its markup', () => {
  const lists = new Set<string>();
  for (const f of readdirSync('src/ui/styles')) if (f.endsWith('.css')) for (const m of readFileSync(`src/ui/styles/${f}`, 'utf8').matchAll(/\.([a-z][\w-]*)\.glides\b/g)) lists.add(m[1]!);
  assert.deepEqual([...lists], ['pal-list']);
  assert.match(src, /pal-list glides/);
});
