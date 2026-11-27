import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { neighbourTab } from '../src/ui/surface/tab-swipe.ts';
import { swipeOn } from '../src/ui/tests/store.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const gone = (p: string) => !existsSync(new URL(`../${p}`, import.meta.url));

test('a swipe goes to the next tab on the left, the one before on the right, and stops at the ends', () => {
  const ids = ['drugs', 'fluids', 'procs'] as const;
  assert.equal(neighbourTab(ids, 'drugs', 1), 'fluids');
  assert.equal(neighbourTab(ids, 'fluids', 1), 'procs');
  assert.equal(neighbourTab(ids, 'fluids', -1), 'drugs');
  assert.equal(neighbourTab(ids, 'drugs', -1), null);
  assert.equal(neighbourTab(ids, 'procs', 1), null);
  assert.equal(neighbourTab(ids, 'fluids', 0), null);
});

test('the Tests card swipes on any touch screen with one instrument up, not only a phone sheet', () => {
  assert.equal(swipeOn({ open: true, focus: false, second: null }), true);
  assert.equal(swipeOn({ open: false, focus: false, second: null }), false);
  assert.equal(swipeOn({ open: true, focus: true, second: null }), false);
  assert.equal(swipeOn({ open: true, focus: false, second: 'doppler' }), false);
});

test('one tab swipe, one page pusher, one pull: the old copies are gone and every tabbed surface pages by surface/tab-swipe.ts (menu unification, stage 3)', () => {
  for (const f of ['src/ui/shell/tab-swipe.ts', 'src/ui/menu/swipe-tabs.ts', 'src/ui/treat/page-push.ts', 'src/ui/tests/dock/swipe.ts', 'src/ui/tests/dock/pull.ts', 'src/ui/treat/glide.ts']) {
    assert.ok(gone(f), `${f} is gone: its one replacement is in src/ui/surface`);
  }
  // every surface with tabs a finger reaches: the Tests card, Treat and the main menu
  for (const f of ['src/ui/tests/TestsLayer.tsx', 'src/ui/treat/TreatCard.tsx', 'src/ui/menu/UMenu.tsx']) {
    const s = read(f);
    assert.match(s, /from '\.\.\/surface\/tab-swipe\.ts'/, `${f} imports the one tab swipe`);
    assert.match(s, /attachTabSwipe(<[A-Za-z]+>)?\(/, `${f} wires it`);
    assert.ok(!/swipeTabs\(|attachSwipe\(|\bstep: \(dir\)/.test(s), `${f} has no swipe of its own`);
  }
  // nothing else in the app pages tabs by its own touch handlers
  const sw = read('src/ui/surface/tab-swipe.ts');
  assert.match(sw, /follow\(tx\(cur\), tag\)/, 'the open pane follows the finger');
  assert.match(sw, /s\.mn!\.set\(s\.dx \+ d \* s\.w\)/, 'and the next peeks in beside it');
  assert.ok(!/requestAnimationFrame|setTimeout|performance\.now/.test(sw), 'the one clock');
  // one page pusher (Settings' pages and Treat's Changes page) and one height glide (Treat's sheet and the action card)
  for (const f of ['src/ui/surface/Menu.tsx', 'src/ui/treat/TreatCard.tsx']) assert.match(read(f), /import \{ pushPage, type Push \} from '\.\.?\/(surface\/)?page-push\.ts'/, `${f} pushes by surface/page-push.ts`);
  for (const f of ['src/ui/action/ActionCard.tsx', 'src/ui/treat/TreatCard.tsx']) {
    assert.match(read(f), /from '\.\.\/surface\/height-glide\.ts'/, `${f} glides by surface/height-glide.ts`);
    assert.ok(!/function glideHeight|\.animate\(\[\{ transform: from/.test(read(f)), `${f} has no height glide of its own`);
  }
});
