// The Tests sheet's pull on a phone claims a pull down from anywhere on the card with the finger's FIRST move (2D dock-sheet.js touchmove): iOS hands a pull on scrollable content to the page and
// cancels the touch before 6 px, so a swipe down from the pane never closed the card. A pull that starts in content scrolled away from its top is left to scroll it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachPull } from '../src/ui/tests/dock/pull.ts';

const rig = (scrollTop = 0) => {
  const L: Record<string, ((e: any) => void)[]> = {};
  const card: any = { addEventListener: (k: string, f: any) => (L[k] ??= []).push(f), removeEventListener() {}, parentElement: null };
  const pane: any = { scrollHeight: 900, clientHeight: 300, scrollTop, parentElement: card, closest: () => null };
  const g: any = globalThis;
  g.getComputedStyle = () => ({ overflowY: 'hidden auto' });
  const pos: any = { style: {} };
  attachPull(card, pos, { enabled: () => true, heights: () => ({ h0: 520, half: 520, full: 700, size: 0 }), setSize() {}, close() {} });
  const fire = (k: string, y: number, x = 100) => { let stopped = false; const e: any = { target: pane, touches: [{ clientX: x, clientY: y }], cancelable: true, preventDefault: () => { stopped = true; } }; L[k]!.forEach((f) => f(e)); return stopped; };
  return { fire };
};

test('a first small move down claims the touch', () => {
  const r = rig();
  r.fire('touchstart', 300);
  assert.equal(r.fire('touchmove', 303), true);   // 3 px, under the 6 px threshold
});

test('a move up or sideways is not claimed before the threshold', () => {
  const r = rig();
  r.fire('touchstart', 300);
  assert.equal(r.fire('touchmove', 297), false);
  const q = rig();
  q.fire('touchstart', 300);
  assert.equal(q.fire('touchmove', 300, 104), false);
});

test('content scrolled away from its top scrolls back first', () => {
  const r = rig(120);
  r.fire('touchstart', 300);
  assert.equal(r.fire('touchmove', 303), false);
  assert.equal(r.fire('touchmove', 312), false);
});
