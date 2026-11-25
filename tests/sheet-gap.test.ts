// Every sheet and card that stands over the dock (vessel and device card, Tests, Treat, the menus) rests one gap above the dock's top edge: M.sheetGap, read through sheetFoot().
// 22 Nov 2026, Mohammad (iPhone, build c001291c): the Portal vein card sat tight on the time bar. Root cause: the card's foot was the dock's top less 8 px (it overlapped the bar), while the
// other sheets used +8 (Tests, menus) or a fallback of the dock plus the view pill's slot (Treat: --nb-occ was never published), and none of them included the bottom safe area the same way.
import { merged2d } from './merged-2d.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { M } from '../src/ui/shell/metrics.ts';
import { sheetFoot, layoutVars, dockHeight, dockInset } from '../src/ui/shell/room.ts';
import { testsPlace } from '../src/ui/tests/place.ts';
import { sheetPlace } from '../src/ui/treat/sheet-place.ts';
import { cardMaxHeight, takenBy } from '../src/ui/action/action-room-math.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SCREENS = [
  { vp: { w: 390, h: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } }, d: 'phone-portrait' as const },
  { vp: { w: 375, h: 667, safe: { top: 20, right: 0, bottom: 0, left: 0 } }, d: 'phone-portrait' as const },
  { vp: { w: 820, h: 1180, safe: { top: 24, right: 0, bottom: 20, left: 0 } }, d: 'tablet-portrait' as const },
];

test('the one gap is an elegant 12 px, the app\'s own gutter, and the foot is the dock\'s top plus it', () => {
  assert.equal(M.sheetGap, 12);
  assert.ok(M.sheetGap >= 12, 'never tight on the bar');
  for (const { d } of SCREENS) assert.equal(sheetFoot(d), dockInset(d) + dockHeight(d) + M.sheetGap);
});

test('the vessel card, the Tests sheet and the Treat sheet all rest at the same height over the dock, on a phone and an upright iPad', () => {
  for (const { vp, d } of SCREENS) {
    const foot = vp.safe.bottom + sheetFoot(d);
    const tests = testsPlace(vp, d);
    assert.equal(tests.kind, 'sheet');
    assert.equal(vp.h - (tests.rect.y + tests.rect.h), foot, `Tests at ${vp.w}`);
    const treat = sheetPlace(vp, sheetFoot(d), 300);
    assert.equal(vp.h - (treat.rect.y + treat.rect.h), foot, `Treat at ${vp.w}`);
    const v = layoutVars(vp, d);
    assert.equal(v['--nb-occ'], `${foot}px`, 'the cards\' own foot, 2D\'s --nb-occ, safe area included');
    assert.equal(v['--sheet-gap'], `${M.sheetGap}px`);
    // the gap over the dock's top edge is the same everywhere
    assert.equal(foot - (vp.safe.bottom + dockInset(d) + dockHeight(d)), M.sheetGap);
  }
});

test('the vessel card\'s code stands it on sheetFoot (never overlapping the bar), and its height cap and the room it takes read the same foot', () => {
  const card = read('src/ui/action/ActionCard.tsx');
  assert.match(card, /bottom: `calc\(var\(--safe-b, 0px\) \+ \$\{sheetFoot\(device\)\}px\)`/);
  assert.match(card, /cardMaxHeight\(vp\.h, vp\.safe\.top, topBarH\(vp, device\), vp\.safe\.bottom, sheetFoot\(device\)\)/);
  assert.ok(!/footHeight\(device\) - 8/.test(card), 'no foot sunk 8 px behind the bar');
  const { vp, d } = SCREENS[0]!;
  assert.equal(cardMaxHeight(vp.h, vp.safe.top, 50, vp.safe.bottom, sheetFoot(d)) + vp.safe.top + 50 + 6 + vp.safe.bottom + sheetFoot(d), vp.h, 'the card\'s top is 6 px under the top bar at its tallest');
  const room = { x: 0, y: 0, w: 390, h: 600 };
  assert.equal(takenBy(200, room), 200 + M.sheetGap - 8 + 6);
  assert.ok(takenBy(200, room) > 200 - 2, 'a card standing higher takes more of the figure\'s room than one sunk behind the bar');
});

test('the Treat and panel sheets read --nb-occ (published) and the clip under the sheet layer follows the same gap', () => {
  assert.match(read('src/ui/shell/Shell.tsx'), /vp\.safe\.bottom \+ sheetFoot\(d\)/);
  assert.match(read('src/ui/shell/Shell.tsx'), /setProperty\('--sheet-gap'/);
  assert.match(merged2d('app-07-floating.css'), /calc\(var\(--sheet-foot-screen, 8px\) - var\(--sheet-gap, 8px\)\)/);
  assert.match(merged2d('app-03-layouts.css'), /calc\(var\(--thumb-occ, 0px\) - var\(--sheet-gap, 8px\)\)/);
  assert.match(read('src/ui/treat/TreatCard.tsx'), /sheetPlace\(vp, sheetFoot\(layoutClass\(true\)\), h\)/);
});

test('the action row: each icon sits with its word, on every card', () => {
  assert.match(read('src/ui/action/ActionCard.tsx'), /className="ac-as ac-acts"/);
});
