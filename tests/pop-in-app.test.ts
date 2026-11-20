// The speed and jump menus (and every anchored popover) open where their button is (owner, 20 Nov: "hitting the fast forward or 1x menus doesn't actually show any menus").
// Root cause: the popover was a `position: fixed` sibling of its button INSIDE the dock, and the Mac's dock is centred with `transform: translateX(-50%)`: a transformed ancestor is the containing block
// of a fixed box, so the popover's viewport coordinates were measured from the dock and it landed below the page. It is now mounted in #app (shell/InApp.tsx), whichever bar its button is in.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

test('Anchored mounts its popover in #app, not beside its button', () => {
  const src = readFileSync('src/ui/shell/Pop.tsx', 'utf8');
  assert.match(src, /<InApp><div ref=\{pop\}[^>]*className=\{`sh-pop/);
  assert.match(src, /import \{ InApp \} from '\.\/InApp\.tsx'/);
});
test('the Mac dock is centred with a transform (why a popover inside it cannot be fixed to the screen), and #app has none', () => {
  const css = readFileSync('src/ui/css2d/app-10-thumb-dock.css', 'utf8');
  assert.match(css, /\.vdock \{ left: 50%; right: auto; transform: translateX\(-50%\); \}/);
  const chrome = readFileSync('src/ui/shell/chrome-3d.css', 'utf8') + readFileSync('src/ui/shell/shell.css', 'utf8');
  assert.doesNotMatch(chrome, /(^|\n)\s*(\.sh-root > )?(#app|\.app)\s*\{[^}]*(transform|filter|contain)\s*:/);
});

test('a popover is put by the 2D placer (`translate` from the corner, left and top 0, bottom and right auto), or a fixed box stretched between `top` and the CSS `bottom: calc(100% + 8px)` has no height (no panel, rows spilled over the figure)', () => {
  const src = readFileSync('src/ui/shell/Pop.tsx', 'utf8');
  assert.match(src, /style=\{\{ left: 0, top: 0, right: 'auto', bottom: 'auto'/);
  assert.match(src, /placePopover\(p, b, \{ align, place \}\)/);
  assert.match(src, /vv\?\.addEventListener\('resize', put\)/, 'a keyboard coming up moves it');
  const css = readFileSync('src/ui/shell/shell.css', 'utf8');
  assert.match(css, /\.sh-pop\[data-place="above"\] \{ bottom: calc\(100% \+ 8px\)/);
});
