// The Tests sheet's pull on a phone (dock/pull.ts), as 2D's dock-sheet.js does it: it runs on POINTER events, so a finger, a pen and what a play-test dispatches (pointerdown, pointermoves,
// pointerup with pointerType "touch") all pull the card; and a touch's own first `touchmove` claims a pull down from the page (iOS took the touch for scrolling before 6 px, so the card never followed).
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Reduce Motion on, so a let-go lands at once (no clock frames in Node).
(globalThis as any).matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
const { attachPull } = await import('../src/ui/tests/dock/pull.ts');

const rig = (scrollTop = 0, size: 0 | 1 | 2 = 0) => {
  const L: Record<string, ((e: any) => void)[]> = {};
  const card: any = { addEventListener: (k: string, f: any) => (L[k] ??= []).push(f), removeEventListener() {}, setPointerCapture() {}, parentElement: null };
  const pane: any = { scrollHeight: 900, clientHeight: 300, scrollTop, parentElement: card, closest: () => null };
  (globalThis as any).getComputedStyle = () => ({ overflowY: 'hidden auto' });
  const pos: any = { style: { setProperty(k: string, v: string) { (this as any)[k] = v; }, removeProperty(k: string) { delete (this as any)[k]; } } };
  const calls: string[] = [];
  attachPull(card, pos, { enabled: () => true, heights: () => ({ h0: 520, half: 520, full: 700, peek: 72, size }), setSize: (n) => calls.push(`size${n}`), close: () => calls.push('close') });
  const tab: any = { parentElement: card, closest: () => null };
  const ptr = (k: string, y: number, x = 100, extra: object = {}) => L[k]!.forEach((f) => f({ target: pane, pointerId: 7, pointerType: 'touch', button: 0, buttons: 1, clientX: x, clientY: y, ...extra }));
  const touch = (y: number, x = 100) => { let stopped = false; const e: any = { target: pane, touches: [{ clientX: x, clientY: y }], cancelable: true, preventDefault: () => { stopped = true; } }; L.touchmove!.forEach((f) => f(e)); return stopped; };
  return { ptr, touch, calls, pos, card, tab };
};

test('a touch-type pointer drag down 300 px (pointerdown, 10 moves, pointerup) takes a sheet at Half to Peek, and from Peek closes it', () => {
  const half = rig();
  half.ptr('pointerdown', 300);
  for (let i = 1; i <= 10; i++) half.ptr('pointermove', 300 + i * 30);
  half.ptr('pointerup', 600);
  assert.deepEqual(half.calls, ['size2']);
  const r = rig(0, 2);
  r.ptr('pointerdown', 300);
  for (let i = 1; i <= 10; i++) r.ptr('pointermove', 300 + i * 30);
  r.ptr('pointerup', 600);
  assert.deepEqual(r.calls, ['close']);
});

test('a drag up from Half goes to Full; a short drag down eases back and does nothing', () => {
  const up = rig();
  up.ptr('pointerdown', 400);
  for (let i = 1; i <= 8; i++) up.ptr('pointermove', 400 - i * 12);
  up.ptr('pointerup', 304);
  assert.deepEqual(up.calls, ['size1']);
  const short = rig();
  short.ptr('pointerdown', 300);
  for (let i = 1; i <= 4; i++) short.ptr('pointermove', 300 + i * 5);
  short.ptr('pointerup', 320);
  assert.deepEqual(short.calls, []);
});

test('a sideways drag is the tabs\' swipe, not the sheet\'s', () => {
  const r = rig();
  r.ptr('pointerdown', 300);
  for (let i = 1; i <= 6; i++) r.ptr('pointermove', 302, 100 + i * 20);
  r.ptr('pointerup', 302, 220);
  assert.deepEqual(r.calls, []);
});

test('a first small touchmove down claims the touch; up, sideways or content scrolled away from its top does not', () => {
  const r = rig();
  r.ptr('pointerdown', 300);
  assert.equal(r.touch(303), true);   // 3 px, under the 6 px threshold
  const up = rig(); up.ptr('pointerdown', 300); assert.equal(up.touch(297), false);
  const side = rig(); side.ptr('pointerdown', 300); assert.equal(side.touch(300, 104), false);
  const scrolled = rig(120); scrolled.ptr('pointerdown', 300); assert.equal(scrolled.touch(303), false);
});

test('a mouse with no button down does not pull', () => {
  const r = rig();
  r.ptr('pointerdown', 300, 100, { pointerType: 'mouse', button: 0, buttons: 1 });
  for (let i = 1; i <= 10; i++) r.ptr('pointermove', 300 + i * 30, 100, { pointerType: 'mouse', buttons: 0 });
  assert.deepEqual(r.calls, []);
});

test('a phone\'s sheet always shows its 36 x 4 grab bar (2D hides it until focused)', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../src/ui/tests/tests.css', import.meta.url), 'utf8');
  assert.match(css, /\.t-pos\[data-kind="sheet"\] \.sheet-grab \{ opacity: 1;/);
  assert.match(css, /\.sheet-grab::before \{[^}]*width: 36px; height: 4px;/);
});

test('a drag that starts on a tab (a button) pulls the sheet, and the capture handed to the card does not end it', () => {
  const r = rig();
  r.ptr('pointerdown', 120, 100, { target: r.tab });
  for (let i = 1; i <= 10; i++) {
    r.ptr('pointermove', 120 + i * 30, 100, { target: r.tab });
    // (a touch is first captured by the tab; the card taking the capture at 6 px makes the tab lose it, and that event bubbles to the card)
    if (i === 1) r.ptr('lostpointercapture', 0, 0, { target: r.tab });
  }
  r.ptr('pointerup', 420, 100, { target: r.tab });
  assert.deepEqual(r.calls, ['size2']);
  // a tap on a tab moves nothing and leaves the click alone
  const tap = rig();
  tap.ptr('pointerdown', 120, 100, { target: tap.tab }); tap.ptr('pointermove', 122, 100, { target: tap.tab }); tap.ptr('pointerup', 122, 100, { target: tap.tab });
  assert.deepEqual(tap.calls, []);
});

test('a pulled card keeps a tail under its foot while it is off the screen\'s edge, and drops it once it has landed (no gap under a card lifted by a pull up or shrunk by a release)', () => {
  const up = rig();
  up.ptr('pointerdown', 400);
  for (let i = 1; i <= 4; i++) up.ptr('pointermove', 400 - i * 12);
  assert.ok(parseFloat(up.pos.style['--sheet-tail']) >= 180 + 60, 'the room Full gives, and a little for the band, sits under the card as it lifts');
  up.ptr('pointerup', 352);
  assert.equal(up.pos.style['--sheet-tail'], undefined, 'gone when it has landed');
  const down = rig(0, 1);
  down.ptr('pointerdown', 300);
  for (let i = 1; i <= 10; i++) down.ptr('pointermove', 300 + i * 12);
  down.ptr('pointerup', 420);
  assert.deepEqual(down.calls, ['size0']);
  assert.equal(down.pos.style['--sheet-tail'], undefined);
});
