// The rule for every menu and popover (owner, 27 Nov, the Settings menu covered the top bar and ran past the foot of the screen): one placer (shell/place.ts) keeps a floating box between the top bar
// and the bottom, on whichever side it opens, and cuts it to that room (it scrolls inside). Pure numbers here, then the source rule that nothing places a menu any other way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fitRoom, type FitIn } from '../src/ui/shell/place.ts';
import { MENU_IDS, MENU_WIDTH_PX } from '../src/ui/surface/menu-head.ts';
import { surfaceModeOf } from '../src/ui/surface/mode.ts';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
// A phone-sized screen: the top bar ends at 100 (notch included), the foot of the stage is 700.
const base: FitIn = { aTop: 400, aBottom: 440, h: 200, side: 'below', gap: 8, top: 100, bottom: 692, flip: true };

test('a menu that fits where it was asked to open opens there, whole', () => {
  assert.deepEqual(fitRoom(base), { side: 'below', y: 448, maxH: 200 });
  assert.deepEqual(fitRoom({ ...base, side: 'above' }), { side: 'above', y: 192, maxH: 200 });
});

test('no room on the asked side flips to the other when it fits there', () => {
  const f = fitRoom({ ...base, aTop: 600, aBottom: 640, h: 300 });
  assert.equal(f.side, 'above'); assert.equal(f.maxH, 300); assert.equal(f.y, 292);
  const g = fitRoom({ ...base, side: 'above', aTop: 150, aBottom: 190, h: 300 });
  assert.equal(g.side, 'below'); assert.equal(g.y, 198);
});

test('a menu too tall for both sides takes the larger room and is cut to it: never over the top bar, never past the bottom (the Settings menu, 27 Nov)', () => {
  // The gear low on the screen, the menu 1100 tall: above it there are only 600 - 8 - 100 = 492 px, and it must not climb over the bar.
  const f = fitRoom({ ...base, side: 'above', aTop: 600, aBottom: 640, h: 1100 });
  assert.equal(f.side, 'above'); assert.equal(f.maxH, 492); assert.ok(f.y >= 100, `top ${f.y} is under the bar (100)`); assert.equal(f.y + f.maxH, 592);
  // A button high on the screen, a tall menu below it: cut at the foot.
  const g = fitRoom({ ...base, aTop: 60, aBottom: 100, h: 1100 });
  assert.equal(g.side, 'below'); assert.equal(g.y + g.maxH, 692); assert.ok(g.maxH < 1100);
});

test('over every screen, side and height the box lies between the top bar and the bottom', () => {
  for (const top of [0, 56, 100, 150]) for (const bottom of [400, 700, 1000]) for (const side of ['below', 'above'] as const) for (const flip of [true, false]) {
    for (let aTop = top; aTop < bottom; aTop += 37) for (const h of [40, 220, 480, 900, 2400]) {
      const f = fitRoom({ aTop, aBottom: aTop + 40, h, side, gap: 8, top, bottom, flip });
      assert.ok(f.maxH >= 0 && f.maxH <= h);
      if (f.maxH > 0) { assert.ok(f.y >= top - 1e-9, `y ${f.y} under top ${top}`); assert.ok(f.y + f.maxH <= bottom + 1e-9, `foot ${f.y + f.maxH} over ${bottom}`); }
    }
  }
});

test('flip off keeps the side and only cuts it (the main menu under its button)', () => {
  const f = fitRoom({ ...base, aTop: 600, aBottom: 640, h: 300, flip: false });
  assert.equal(f.side, 'below'); assert.equal(f.y, 648); assert.equal(f.maxH, 44);
});

test('every floating menu is placed by the one placer, and it scrolls inside the room it is cut to', () => {
  const place = src('src/ui/shell/place.ts').replace(/\/\/.*$/gm, '');
  assert.ok(/fitRoom\(/.test(place) && /stageTop\(/.test(place) && /style\.maxHeight/.test(place), 'placeAt cuts every box to the room under the top bar');
  assert.ok(/--top-safe/.test(place) && /--safe-b/.test(place), 'the top is the room\'s own top bar, the foot clear of the home indicator');
  // the one menu shell places every floating menu: placePopover by its opener, or placeAt (the main menu's own options); none places itself
  const shell = src('src/ui/surface/Menu.tsx').replace(/\/\/.*$/gm, '');
  assert.ok(/placePopover\(el, a, \{ align, place: side \}\)/.test(shell) && /placeAt\(el, a, at\)/.test(shell), 'the shell places a floating menu through place.ts');
  assert.ok(/visualViewport/.test(shell), 'and again when the keyboard moves the room');
  for (const f of ['src/ui/menu/UMenu.tsx', 'src/ui/shell/Pop.tsx', 'src/ui/deck/JumpList.tsx']) assert.ok(!/place(Popover|At)\(/.test(src(f)), `${f} leaves its placement to the shell`);
  const menuCss = src('src/ui/surface/menu.css');
  assert.ok(/\.menu\.sf-menu\[data-mode="float"\]:not\(\.app-menu\):not\(\.fr-pop\) \{ overflow-y: auto;/.test(menuCss), 'a menu without its own scroll scrolls inside its cut');
  assert.ok(/\.app-menu \{ max-height[^}]*overflow-y: auto/.test(src('src/ui/styles/app-07-floating.css')), 'a menu scrolls inside its cut');
  // No other file writes a floating menu's own translate or max-height from its button.
  const walk = (d: string): string[] => readdirSync(new URL(`../${d}`, import.meta.url)).flatMap((n) => { const p = `${d}/${n}`; return statSync(new URL(`../${p}`, import.meta.url)).isDirectory() ? walk(p) : /\.(tsx|ts)$/.test(n) ? [p] : []; });
  const own = walk('src/ui').filter((p) => p !== 'src/ui/shell/place.ts' && /var\(--safe-l\)\), \$\{/.test(src(p)));
  assert.deepEqual(own, [], 'a menu that places itself from its button misses the top bar and the foot');
});

// Extended to every menu of the one shell (stage 4 of the menu unification) and the presenter's slide list: each floats by its opener through the one placer above, so each lies
// between the top bar and the foot; each width tier fits the narrowest screen a menu floats on, with the placer's margins.
test('every <Menu> and the slide list is placed by the shell, and each width tier fits between the margins of the screens a menu floats on', () => {
  const css = src('src/ui/surface/menu.css');
  for (const [w, px] of Object.entries(MENU_WIDTH_PX)) {
    assert.ok(css.includes(`--menu-${w}: ${px}px`), `--menu-${w} is ${px} px in menu.css`);
    assert.ok(new RegExp(`\\[data-w="${w}"\\] \\{ width: min\\(var\\(--menu-${w}\\), calc\\(100vw - \\d+px\\)\\); \\}`).test(css), `tier ${w} is held inside the screen`);
  }
  // a menu floats on a wide screen or a phone held sideways (surface/mode.ts); the narrowest of those is 667 x 375, and the widest tier and both margins fit it
  for (const [w, h] of [[667, 375], [844, 390], [1024, 768], [1180, 820], [1440, 900]] as const) {
    assert.equal(surfaceModeOf(w, h), 'float');
    assert.ok(Math.max(...Object.values(MENU_WIDTH_PX)) + 2 * 12 <= w, `${w} x ${h}`);
  }
  // every menu id of the surfaces table but the TIPS views menu (inline in its Tests pane) is a <Menu> or a useMenu, so it has this placement
  const walk = (d: string): string[] => readdirSync(new URL(`../${d}`, import.meta.url)).flatMap((n) => {
    const p = `${d}/${n}`;
    return statSync(new URL(`../${p}`, import.meta.url)).isDirectory() ? walk(p) : /\.tsx$/.test(n) ? [p] : [];
  });
  const all = walk('src/ui').map((p) => src(p)).join('\n');
  for (const id of MENU_IDS) if (id !== 'tips-views') assert.ok(new RegExp(`<Menu id="${id}"|useMenu\\('${id}'|<Menu id=\\{kind\\}`).test(all), `${id} goes through the shell`);
  // the slide list is a <Menu> like the others: its opener is the pill's count, it floats above it, from the window's corner (the deck's stylesheet centres it by left and translate)
  const list = src('src/ui/deck/JumpList.tsx'), bar = src('src/ui/deck/PresenterBar.tsx'), shell = src('src/ui/surface/Menu.tsx');
  assert.match(list, /useMenu\('slides', \{ state, side: 'above', align: 'end' \}\)/);
  assert.match(bar, /className="pzb-n" data-opens="slides"/);
  assert.match(shell, /skin === 'jump' && !sheet \? FROM_CORNER/);
  assert.match(shell, /const FROM_CORNER: CSSProperties = \{ left: 0, top: 0, right: 'auto', bottom: 'auto' \}/);
});
