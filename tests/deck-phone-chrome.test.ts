import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planLayout, barOf, PILL_W, PILL_W_SIDE, type Need } from '../src/ui/layout/plan.ts';
import { GRIP } from '../src/ui/layout/rules2d.ts';
import { useUi } from '../src/ui/ui-store.ts';

// The phone's talk chrome (Mohammad, 20 Nov, iPhone): he could not close a talk, could not see which slide he was on, could not hide the top card as in 2D, and could move the figure in a talk.
const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const phone = { w: 393, h: 852, safe: { top: 59, right: 0, bottom: 34, left: 0 } };
const mac = { w: 1440, h: 900, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
const side = { w: 852, h: 393, safe: { top: 0, right: 59, bottom: 21, left: 59 } };
const needs: Need[] = [{ id: 'teach', slot: 'words', h: 230 }, { id: 'ladder', slot: 'data', h: 200 }];
const hit = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

test('the presenter pill ends with Exit (2D: "Exit the presentation"), shows the count, and stands above the cards it sits inside', () => {
  const bar = read('src/ui/deck/PresenterBar.tsx');
  assert.match(bar, /stopTalk\(\)/, 'Exit leaves the talk');
  assert.match(bar, /Exit the presentation/);
  assert.match(bar, /Stop presenting/, 'a wide screen\'s Exit is 2D\'s "Stop presenting" (Esc)');
  assert.match(bar, /pzb-nt/, 'the count is drawn on every screen, an iPhone on its side too');
  assert.doesNotMatch(bar, /\{!sideways && \(\s*\/\/ 2D presenter-scales/, 'the count is no longer left out on its side');
  const css = read('src/ui/deck-ui.css');
  const z = (sel: string) => Number(new RegExp(`${sel.replace(/[.]/g, '\\.')}\\s*\\{[^}]*z-index:\\s*(\\d+)`).exec(css)?.[1]);
  assert.ok(z('.dk-bar') >= 4, 'the pill is above the cards (they come after it in the page; a phone\'s pill is inside the words card\'s foot)');
  assert.ok(z('.deck-ui .pz-jump') > z('.dk-bar'), 'the slide list is over the pill');
});

test('the pill is wide enough for its buttons and stays on the screen', () => {
  assert.ok(PILL_W >= 5 * 44 + 40 && PILL_W_SIDE >= 3 * 38 + 40);
  for (const vp of [phone, mac, side]) { const r = barOf(vp).rect; assert.ok(r.x >= 0 && r.x + r.w <= vp.w && r.y + r.h <= vp.h, `${vp.w}x${vp.h}`); }
});

test('the dock (2D): a phone with both cards up puts the data card away to a strip at the top, and the figure gets the room it left', () => {
  const open = planLayout(phone, needs), away = planLayout(phone, needs, 'words', 0, true);
  assert.equal(open.docked, false); assert.equal(away.docked, true);
  assert.deepEqual(away.cards.map((c) => c.id), ['teach'], 'only the words stay');
  assert.equal(away.strip?.slot, 'data'); assert.equal(away.strip?.id, 'ladder'); assert.equal(away.strip?.rect.h, GRIP); assert.equal(GRIP, 34, '2D\'s closed card edge');
  const css = read('src/ui/deck-ui.css'); assert.match(css, /\.dk-strip\[data-dock\] \{ height: 34px; \}/);
  assert.deepEqual(away.cards[0].rect, open.cards.find((c) => c.slot === 'words')!.rect, 'the words do not move');
  assert.ok(away.free.h > open.free.h, `the figure's room grows (${open.free.h} -> ${away.free.h})`);
  assert.ok(!hit(away.free, away.strip!.rect) && !hit(away.free, away.cards[0].rect), 'and it clears the strip and the words');
});

test('the dock is a phone\'s and an upright iPad\'s: a wide screen never puts a card away (an iPhone on its side tucks the instrument to a side strip), and a slide with one card has nothing to dock', () => {
  assert.equal(planLayout(mac, needs, 'words', 0, true).docked, false);
  assert.equal(planLayout(mac, needs, 'words', 0, true).cards.length, 2);
  assert.equal(planLayout(side, needs, 'words', 0, true).docked, true);
  assert.equal(planLayout(side, needs, 'words', 0, true).cards.length, 1);
  assert.equal(planLayout(side, [needs[0]!], 'words', 0, true).docked, false);
  assert.equal(planLayout(phone, [needs[0]!], 'words', 0, true).docked, false);
  assert.equal(planLayout(phone, [needs[1]!], 'words', 0, true).docked, false);
});

test('the reader\'s dock is kept from slide to slide, put back when a talk starts, and the swap key brings a docked card back first', () => {
  const ui = useUi.getState();
  ui.openDeck(null);
  assert.equal(useUi.getState().docked, false);
  useUi.getState().setDocked(true);
  useUi.getState().publishPlan(planLayout(phone, needs, 'words', 0, true));
  assert.equal(useUi.getState().dockShown, true);
  useUi.getState().swapWallet();
  assert.equal(useUi.getState().docked, false, 'the key undocks first');
  useUi.getState().setDocked(true);
  useUi.getState().openDeck(null);
  assert.equal(useUi.getState().docked, false, 'a new talk starts with the card up');
});

test('the figure is locked while a talk plays: the stage hands the gestures the deck check (the gesture controller test covers what it blocks) and the tilt stands still', () => {
  const stage = read('src/scene/Stage.tsx');
  assert.match(stage, /locked: \(\) => talkOn\(\)/);
  assert.match(stage, /rig\.tiltGate = \{[^}]*talkOn\(\)/);
});
