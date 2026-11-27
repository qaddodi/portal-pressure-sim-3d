// Search takes the keyboard the moment it opens (owner, 20 Nov: "when i hit search or / the search bar should be in focus right away so i can type").
// Root cause: the focus ran in an effect while the palette's box was still `hidden` (display:none, shown a render later), so nothing took it. Now the box is visible in the same commit as `open`,
// and the field is focused in a layout effect (inside the gesture, which a phone needs to raise its keyboard). Since 27 Nov Search is a dialog of the dialog shell (surface/Dialog.tsx), which keeps
// that rule for every dialog: always in the page, never display: none, and the dialog's `initialFocus` focused in the layout effect of the commit that opens it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/ui/search/SearchSheet.tsx', 'utf8');
test('the palette is never hidden while open, and the field is focused in a layout effect', () => {
  assert.match(src, /<Dialog id="search" size="l" open=\{open\}[^>]*initialFocus=\{input\}/);
  assert.doesNotMatch(src, /hidden=\{/, 'the palette is never display: none (a field there cannot take focus)');
  const d = readFileSync('src/ui/surface/Dialog.tsx', 'utf8');
  assert.doesNotMatch(d, /hidden=\{/);
  assert.match(d, /useLayoutEffect\(\(\) => \{\s*const el = box\.current;\s*if \(!open \|\| !el\) return;[\s\S]{0,200}focusOf\(el, size, initialFocus\?\.current\)\.focus\(/);
  assert.match(d, /const focusOf = [^\n]*\n\s*initial \?\?/, 'the initial focus is taken first');
});
test('every way in goes through the one sheet: the top bar button, the thumb bar, "/" and Ctrl/Cmd K open `search` in the shell store', () => {
  const keys = readFileSync('src/ui/keys/useKeys.ts', 'utf8');
  assert.match(keys, /case 'search-open': sh\.open\('search'\)/);
  assert.match(keys, /a\.type === 'search-open'[^\n]*\) e\.preventDefault\(\)/, 'the "/" is not typed into the field');
  assert.match(readFileSync('src/ui/shell/TopBar.tsx', 'utf8'), /data-opens="search"/);
  assert.match(readFileSync('src/ui/shell/ThumbBar.tsx', 'utf8'), /'search'/);
});

test('on a phone the keyboard moves the sheet: the dialog shell follows the visual viewport (2D palette.js fitList) and the palette\'s list keeps --pal-vh', () => {
  // (the fit is the shell's for every dialog now: tests/dialog-shell.test.ts holds its arithmetic; the list above the keyboard on a wide screen shrinks in the box, in place of --pal-room)
  const d = readFileSync('src/ui/surface/Dialog.tsx', 'utf8');
  assert.match(d, /vv\?\.addEventListener\('resize', fit\); vv\?\.addEventListener\('scroll', fit\)/);
  const shell = readFileSync('src/ui/surface/dialog.css', 'utf8');
  assert.match(shell, /--pal-vh: var\(--dlg-vh, 100svh\)/);
  assert.match(shell, /\.sf-dialog\.pal > \.pal-list \{ flex: 0 1 auto; min-height: 0; \}/);
  const css = readFileSync('src/ui/styles/app-03-layouts.css', 'utf8');
  assert.match(css, /var\(--pal-vh, 100svh\)/);
});
