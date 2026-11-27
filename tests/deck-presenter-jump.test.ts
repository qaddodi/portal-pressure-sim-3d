// The slide list (G), the black screen and the notes window carry the 2D app's own markup and rules (presenter.js toggleJump, toggleBlack; presenter-view-page.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { jumpGroups, viewsOf } from '../src/ui/deck/presenter-link.ts';
import { builtinDeck } from '../src/decks/registry.ts';
import { clickerKey } from '../src/ui/deck/clicker.ts';
import { stopsOf } from '../src/ui/deck/presenter-machine.ts';
import { keepAwake, awakeState } from '../src/ui/deck/from2d/wake-lock.js';

test('the slide list groups the stops under their kicker, a new group wherever the kicker changes, every stop once and in order', () => {
  const g = jumpGroups([{ kicker: '' }, { kicker: 'A' }, { kicker: 'A' }, { kicker: 'B' }, { kicker: 'A' }, { kicker: '' }]);
  assert.deepEqual(g, [{ k: '', items: [0] }, { k: 'A', items: [1, 2] }, { k: 'B', items: [3] }, { k: 'A', items: [4] }, { k: '', items: [5] }]);
  const d = builtinDeck('hvpg')!;
  const views = viewsOf(d), groups = jumpGroups(views);
  assert.equal(views.length, stopsOf(d).length, 'the list has the stops the talk plays: the outline, each slide, the quick check');
  assert.deepEqual(groups.flatMap((x) => x.items), views.map((_, i) => i));
  assert.equal(groups[0]!.k, '', 'the outline has no kicker');
});

test('with the list open only G, Esc, Up and Down are the list\'s: Esc and G shut it, everything else is left to the focused title', () => {
  const c = { digits: '', jumpOpen: true, wallet: false, controlOwnsEnter: false, controlOwnsArrows: false, inField: false, stops: 10 };
  assert.deepEqual(clickerKey({ key: 'Escape' }, c), { type: 'jump' });
  assert.deepEqual(clickerKey({ key: 'G' }, c), { type: 'jump' });
  for (const k of ['ArrowDown', 'ArrowUp', 'Enter', ' ', 'b', '3']) assert.equal(clickerKey({ key: k }, c), null, k);
});

test('the list and the black screen use the 2D app\'s classes, so its lifted stylesheet draws them (pz-jump, pzj-h, pzj-list, pz-black)', () => {
  const src = readFileSync('src/ui/deck/JumpList.tsx', 'utf8').replace(/^\/\/.*$/gm, '');
  // the list's frame, head and leave are the menu shell's jump skin (surface/menu-head.ts), its rows the list's own
  assert.match(src, /<Menu id="slides" ctl=\{ctl\} skin="jump"/);
  assert.match(readFileSync('src/ui/surface/menu-head.ts', 'utf8'), /jump: \{ base: 'pz-jump stage-blocker', sheet: '', leaving: 'pz-leave', head: 'pzj-h'/);
  for (const cls of ['pzj-list', 'pz-black']) assert.ok(src.includes(cls), cls);
  assert.ok(!/dk-jump|dk-black/.test(src), 'no second set of classes');
  const css = readFileSync('src/ui/styles/app-05-presenter-cards.css', 'utf8');
  for (const rule of ['.pz-jump {', '.pz-black {', '.pz-black.on {', '.pzj-list button']) assert.ok(css.includes(rule), rule);
});

test('the notes window keeps its screen awake with the 2D wake-lock (asked again when the page returns), not a copy of it', () => {
  const src = readFileSync('src/ui/deck/presenter-window.ts', 'utf8');
  assert.match(src, /from '\.\/from2d\/wake-lock\.js'/);
  assert.ok(!/wakeLock\.request/.test(src));
  keepAwake(false);   // (no browser here: nothing is held, nothing throws)
  assert.equal(awakeState().held, false);
});
