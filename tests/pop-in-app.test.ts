// The speed and jump menus (and every menu by its button) open where their button is (owner, 20 Nov: "hitting the fast forward or 1x menus doesn't actually show any menus").
// Root cause: the popover was a `position: fixed` sibling of its button INSIDE the dock, and the Mac's dock is centred with `transform: translateX(-50%)`: a transformed ancestor is the containing block
// of a fixed box, so the popover's viewport coordinates were measured from the dock and it landed below the page. Every menu is now the one menu shell (surface/Menu.tsx), which mounts it in the
// sheets clip, outside every bar, whichever bar its button is in; the button stays in its bar.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

test('the menu shell mounts a menu in the sheets clip, outside every bar, never beside its button', () => {
  const src = readFileSync('src/ui/surface/Menu.tsx', 'utf8');
  assert.match(src, /const root = mount === 'sheets' \? sheetRoot\(\) : null;/);
  assert.match(src, /createPortal\(<>\{sheet && <div className=\{`um-scrim[^\n]*\{menu\}\{beside\}<\/>, root!\)/);
  // the one menu kept in its own layer is the slide list (the deck layer, fixed to the screen with no transform: DeckUi.tsx)
  const inline = [...['src/ui/deck/JumpList.tsx', 'src/ui/shell/PlayBar.tsx', 'src/ui/shell/TopBar.tsx', 'src/ui/shell/FigureMenu.tsx', 'src/ui/menu/UMenu.tsx']
    .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/<Menu id="(\w+)"[^>]*mount="inline"/g)].map((m) => m[1]))];
  assert.deepEqual(inline, ['slides']);
  // the buttons stay in their bars, where the 2D stylesheet addresses them (`.tl-split > .tl-speed`, `.tl-jumps > .tl-ff`, `.sb-right > .chip-btn`)
  const bar = readFileSync('src/ui/shell/PlayBar.tsx', 'utf8');
  assert.match(bar, /<div className="tl-split">\s*<button type="button" className=\{`tl-speed/);
  assert.match(bar, /<div className="tl-jumps">\s*<button type="button" className="ib tl-ff"/);
});
test('the Mac dock is centred with a transform (why a menu inside it cannot be fixed to the screen), and #app has none', () => {
  const css = readFileSync('src/ui/styles/app-10-thumb-dock.css', 'utf8');
  assert.match(css, /\.vdock \{ left: 50%; right: auto; transform: translateX\(-50%\); \}/);
  const chrome = readFileSync('src/ui/shell/chrome-3d.css', 'utf8') + readFileSync('src/ui/shell/shell.css', 'utf8');
  assert.doesNotMatch(chrome, /(^|\n)\s*(\.sh-root > )?(#app|\.app)\s*\{[^}]*(transform|filter|contain)\s*:/);
  // nor the sheets clip, nor its inner box (menu-motion.css): no transform, filter or containment makes a containing block of a fixed menu
  const clip = [...readFileSync('src/ui/shell/menu-motion.css', 'utf8').matchAll(/(^|\n)([^\n{]*\.sh-clip(?:-in)?\b[^\n{]*)\{([^}]*)\}/g)].map((m) => m[3]!);
  assert.ok(clip.length > 0 && clip.every((r) => !/transform|filter|contain\s*:/.test(r)));
});

test('a menu is put by the 2D placer (`translate` from the corner, left and top 0, bottom and right auto), or a fixed box stretched between `top` and a CSS `bottom` has no height (no panel, rows spilled over the figure)', () => {
  const src = readFileSync('src/ui/surface/Menu.tsx', 'utf8');
  assert.match(src, /placePopover\(el, a, \{ align, place: side \}\)/);
  assert.match(src, /vv\?\.addEventListener\('resize', put\)/, 'a keyboard coming up moves it');
  // `.menu` and `.umenu` stand at left 0, top 0 by their 2D rule; the slide list's deck rule centres it by left and a bottom, which the shell takes off where it floats
  const css = readFileSync('src/ui/styles/app-02-controls.css', 'utf8') + readFileSync('src/ui/styles/app-07-floating.css', 'utf8');
  assert.match(css, /\.menu \{\s*position: fixed; left: 0; top: 0;/);
  assert.match(css, /\.umenu \{\s*position: fixed; left: 0; top: 0;/);
  assert.match(src, /const FROM_CORNER: CSSProperties = \{ left: 0, top: 0, right: 'auto', bottom: 'auto' \}/);
});
