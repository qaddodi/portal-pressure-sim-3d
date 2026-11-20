import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { closes } from '../src/ui/shell/sheet-swipe.ts';
// @ts-ignore plain JS copied from the 2D app
import { SHEET_CLOSE_PX, SHEET_CLOSE_SHARE } from '../src/ui/tests/copied/ease.copied.js';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('a let-go closes the sheet past a short pull down or on a flick, and eases back otherwise (2D swipeSheet rules)', () => {
  const H = 600, short = Math.min(SHEET_CLOSE_PX, H * SHEET_CLOSE_SHARE);
  assert.equal(closes(short + 5, 0.05, 0.05, H), true, 'past the short way');
  assert.equal(closes(short - 10, 0.05, 0.05, H), false, 'a short slow pull eases back');
  assert.equal(closes(50, 1.6, 0.4, H), true, 'a quick flick closes even a short pull');
  assert.equal(closes(30, 1.6, 0.4, H), false, 'but not one shorter than 40 px');
  assert.equal(closes(-120, 0, 0, H), false, 'a pull up never closes');
  assert.equal(closes(0, 0, 0, H), false);
  assert.equal(closes(H * SHEET_CLOSE_SHARE * 0.9, 0.05, 0.05, 80), true, 'a short sheet closes by its own share of its height');
});

test('every phone sheet takes the swipe: the shell frames, the menu, the Treat card and the action card', () => {
  assert.match(read('src/ui/shell/Frame.tsx'), /useSheetSwipe\(ref,/);
  assert.match(read('src/ui/menu/UMenu.tsx'), /useSheetSwipe\(ref, close, \(\) => sheet/);
  assert.match(read('src/ui/treat/TreatCard.tsx'), /useSheetSwipe\(ref, close, \(\) => thumb\)/);
  assert.match(read('src/ui/action/ActionCard.tsx'), /useSheetSwipe\(ref, .*\(\) => bottom\)/);
});

test('no sheet has its own head-only drag written to the style any more (the one swipe is shell/sheet-swipe.ts)', () => {
  const bad: string[] = [];
  const walk = (d: URL) => { for (const n of readdirSync(d)) { const u = new URL(n, d); if (statSync(u).isDirectory()) walk(new URL(n + '/', d)); else if (/\.tsx$/.test(n) && /style\.transform = `translateY\(\$\{Math\.max\(0,/.test(readFileSync(u, 'utf8'))) bad.push(u.pathname); } };
  walk(new URL('../src/', import.meta.url));
  assert.deepEqual(bad, []);
});

test('the swipe moves the sheet by `translate` and makes the stylesheet give its own entrance and exit way', () => {
  const src = read('src/ui/shell/sheet-swipe.ts');
  assert.match(src, /el\.style\.translate/);
  assert.ok(!/requestAnimationFrame/.test(src), 'the one clock');
  const css = read('src/ui/shell/chrome-3d.css');
  assert.match(css, /\[data-pulling\], \[data-swiped\] \{ transition: none !important; animation: none !important; \}/);
  assert.match(css, /\[data-pulled\] \{ animation: none !important; \}/);
  assert.match(src, /pointerType === 'mouse'/, 'a mouse is not a swipe, as in 2D');
});

test('a phone\'s shell sheet is laid like 2D\'s thumb sheets (inset 6 px, rounded all round) and its close button has a 44 px target', () => {
  const css = read('src/ui/shell/shell.css');
  const rule = /\.sh-root\[data-bottom="true"\]\[data-mode="free"\] \.sh-sheet \{([^}]*)\}/.exec(css)![1]!;
  assert.match(rule, /left: calc\(var\(--safe-l, 0px\) \+ 6px\) !important; right: calc\(var\(--safe-r, 0px\) \+ 6px\) !important/);
  assert.match(rule, /border-radius: var\(--r-sheet\)/);
  assert.match(css, /\.sh-x::after \{ content: ''; position: absolute; inset: -4px; \}/);
});

test('the shell\'s own small controls reach 44 px for a thumb (a taller box or a hit area)', () => {
  const sh = read('src/ui/shell/shell.css');
  for (const r of ['.sh-seg-row button { flex: 1; min-height: 44px;', '.sh-tabs button { flex: 1; height: 44px;', '.sh-fig button { height: 44px;']) assert.ok(sh.includes(r), r);
  assert.match(read('src/ui/action/action.css'), /\.ac-x::after \{ content: ''; position: absolute; inset: -6px; \}/);
  assert.match(read('src/ui/compare/compare.css'), /\.cmp-seg button::after, \.cmp-table-btn::after \{ content: ''; position: absolute; inset: -6px 0; \}/);
});

test('every phone sheet draws the 36 x 4 grab bar (the action card has its own, the same size), and the menu and the popover-sheets are wired to the swipe', () => {
  for (const f of ['src/ui/shell/Frame.tsx', 'src/ui/menu/UMenu.tsx', 'src/ui/shell/Menu.tsx', 'src/ui/treat/TreatCard.tsx', 'src/ui/tests/TestsLayer.tsx']) assert.match(read(f), /className="sh-grabbar"/, f);
  assert.match(read('src/ui/action/action.css'), /\.ac-grab i \{ width: 36px; height: 4px;/);
  assert.match(read('src/ui/shell/chrome-3d.css'), /\.sh-grabbar \{[^}]*width: 36px; height: 4px;[^}]*pointer-events: none;/);
  assert.match(read('src/ui/shell/Menu.tsx'), /useSheetSwipe\(ref, /);
});
