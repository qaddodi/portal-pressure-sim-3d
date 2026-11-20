// A number's roll never shows the old and the new value stacked: "IVC 4.6" with a grey 4.5 behind it, for seconds after a settings change or the Tests card opening (Mac play-test, 19 Nov).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { roll } from '../src/scene/labels/roll.ts';

class Anim { onfinish: (() => void) | null = null; oncancel: (() => void) | null = null; cancelled = false; cancel() { this.cancelled = true; this.oncancel?.(); } }
class El {
  className = ''; textContent = ''; style: Record<string, string> = {}; children: El[] = []; parentElement: El | null = null; anims: Anim[] = [];
  appendChild(e: El) { this.children.push(e); e.parentElement = this; }
  remove() { if (this.parentElement) { this.parentElement.children = this.parentElement.children.filter((c) => c !== this); this.parentElement = null; } }
  querySelectorAll(sel: string) { return this.children.filter((c) => sel === `.${c.className}`); }
  animate() { const a = new Anim(); this.anims.push(a); return a; }
}
const timers: (() => void)[] = [];
(globalThis as unknown as { document: unknown }).document = { createElement: () => new El() };
const realSet = globalThis.setTimeout;
(globalThis as unknown as { setTimeout: unknown }).setTimeout = (fn: () => void) => { timers.push(fn); return 0; };
test.after(() => { (globalThis as unknown as { setTimeout: unknown }).setTimeout = realSet; });

function setup() { const box = new El(), cur = new El(); box.appendChild(cur); cur.textContent = '4.5'; return { box, cur, r: { cur: cur as unknown as HTMLElement } }; }

test('before the animations start only the old number is seen: the new one is held at opacity 0, never both stacked', () => {
  const { cur, r } = setup();
  roll(r, '4.6', '4.5');
  assert.equal(cur.textContent, '4.6');
  assert.equal(cur.style.opacity, '0', 'the new number waits for its own animation (a busy first frame cannot show it over the old)');
});

test('when the roll ends the old number is gone and the new one shows by its own style', () => {
  const { box, cur, r } = setup();
  roll(r, '4.6', '4.5');
  const old = box.children.find((c) => c.className === 'lb-old')!;
  old.anims[0]!.onfinish!(); cur.anims[0]!.onfinish!();
  assert.ok(!box.children.includes(old), 'the old number is removed');
  assert.equal(cur.style.opacity, '', 'the new number is not held any more');
});

test('a cancelled animation leaves nothing behind either, and a roll whose animations never report is cleared by its own timer', () => {
  const a = setup();
  roll(a.r, '4.6', '4.5');
  const old = a.box.children.find((c) => c.className === 'lb-old')!;
  old.anims[0]!.oncancel!(); a.cur.anims[0]!.oncancel!();
  assert.ok(!a.box.children.includes(old));
  assert.equal(a.cur.style.opacity, '');
  const b = setup();
  timers.length = 0;
  roll(b.r, '4.7', '4.6');
  assert.ok(b.box.children.some((c) => c.className === 'lb-old'));
  timers.forEach((t) => t());
  assert.ok(!b.box.children.some((c) => c.className === 'lb-old'), 'no old number outlives its roll by more than a moment');
  assert.equal(b.cur.style.opacity, '');
});

test('a second roll before the first ends leaves one old number and holds the new one; the first roll\'s end does not let it show early', () => {
  const { box, cur, r } = setup();
  roll(r, '4.6', '4.5');
  const firstIn = cur.anims[0]!;
  roll(r, '4.7', '4.6');
  assert.equal(box.children.filter((c) => c.className === 'lb-old').length, 1);
  firstIn.onfinish!();
  assert.equal(cur.style.opacity, '0', 'the first roll finishing does not reveal the second\'s number before its animation starts');
});

// ── a reading that flickers round a rounding boundary swaps in place and never rolls ──
import { rollsFor, showNumber } from '../src/scene/labels/roll.ts';

test('a change under half an mmHg is swapped in place, a real change rolls', () => {
  assert.equal(rollsFor('4.6', '4.5'), false);
  assert.equal(rollsFor('4.5', '4.6'), false);
  assert.equal(rollsFor('5.1', '4.6'), true);
  assert.equal(rollsFor('—', '4.6'), false, 'a word is not rolled');
  assert.equal(rollsFor('4.6', ''), false);
});

test('a flicker 4.5 / 4.6 / 4.5 leaves exactly one number and no old one, however often it flips', () => {
  const { box, cur, r } = setup();
  for (let i = 0; i < 20; i++) showNumber(r, i % 2 ? '4.5' : '4.6', i % 2 ? '4.6' : '4.5');
  assert.equal(box.children.filter((c) => c.className === 'lb-old').length, 0);
  assert.equal(cur.anims.length, 0, 'no animation was started');
  assert.equal(cur.style.opacity, '');
});

test('a flicker that comes while a real roll is running clears it: the old number is not left under the new one', () => {
  const { box, cur, r } = setup();
  showNumber(r, '5.6', '4.5');
  assert.equal(box.children.filter((c) => c.className === 'lb-old').length, 1);
  showNumber(r, '5.5', '5.6');
  assert.equal(box.children.filter((c) => c.className === 'lb-old').length, 0);
  assert.equal(cur.textContent, '5.5');
  assert.equal(cur.style.opacity, '');
});
