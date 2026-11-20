// Search takes the keyboard the moment it opens (owner, 20 Nov: "when i hit search or / the search bar should be in focus right away so i can type").
// Root cause: the focus ran in an effect while the palette's box was still `hidden` (display:none, shown a render later), so nothing took it. Now the box is visible in the same commit as `open`,
// and the field is focused in a layout effect (inside the gesture, which a phone needs to raise its keyboard).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/ui/search/SearchSheet.tsx', 'utf8');
test('the palette is never hidden while open, and the field is focused in a layout effect', () => {
  assert.match(src, /hidden=\{!open && !shown\}/);
  assert.match(src, /useLayoutEffect\(\(\) => \{ if \(open\) \{[^}]*input\.current\?\.focus\(/);
  assert.doesNotMatch(src, /hidden=\{!shown\}/);
});
test('every way in goes through the one sheet: the top bar button, the thumb bar, "/" and Ctrl/Cmd K open `search` in the shell store', () => {
  const keys = readFileSync('src/ui/keys/useKeys.ts', 'utf8');
  assert.match(keys, /case 'search-open': sh\.open\('search'\)/);
  assert.match(keys, /a\.type === 'search-open'[\s\S]{0,80}e\.preventDefault\(\)/, 'the "/" is not typed into the field');
  assert.match(readFileSync('src/ui/shell/TopBar.tsx', 'utf8'), /data-opens="search"/);
  assert.match(readFileSync('src/ui/shell/ThumbBar.tsx', 'utf8'), /'search'/);
});

test('on a phone the keyboard moves the sheet: --pal-kb, --pal-vh and --pal-room follow the visual viewport (2D palette.js fitList), read by the lifted 2D sheet rules', () => {
  const s = readFileSync('src/ui/search/SearchSheet.tsx', 'utf8');
  assert.match(s, /vv\?\.addEventListener\('resize', fit\); vv\?\.addEventListener\('scroll', fit\)/);
  for (const v of ['--pal-kb', '--pal-vh', '--pal-room']) assert.ok(s.includes(v), v);
  const css = readFileSync('src/ui/css2d/app-03-layouts.css', 'utf8');
  assert.match(css, /var\(--pal-kb, 0px\)/); assert.match(css, /var\(--pal-vh, 100svh\)/); assert.match(css, /var\(--pal-room, 100svh\)/);
});
