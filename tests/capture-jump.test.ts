// The capture goes straight to a picked slide and stands on its END state (Mohammad, 25 Nov: "straight to the slide and straight to the end product of the slide, not the transition or animation to it").
// Root cause of the walk he saw: a random sample pressed Next through every slide of the talk before the picked one, and took every step of it, keeping the last. The jump is capture-jump.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wantedStops, needsBackJump, stepToEnd, type JumpWalker } from '../src/ui/debug/audit/capture-jump.ts';

/** A talk of stops with `steps[i]` presses within stop i (pages, beats, procedure steps); Next past the last leaves for the next stop, Back from a start lands on the last step of the stop before. */
function talk(steps: number[], at = 0) {
  const s = { stop: at, step: 0, presses: 0, backs: 0, stilld: 0 };
  const w: JumpWalker = {
    stop: () => s.stop,
    move: (m) => {
      if (m === 'next') {
        s.presses++;
        if (s.step < steps[s.stop]! - 1) { s.step++; return true; }
        if (s.stop + 1 >= steps.length) return false;
        s.stop++; s.step = 0; return true;
      }
      s.backs++;
      if (s.step > 0) { s.step--; return true; }
      if (s.stop === 0) return false;
      s.stop--; s.step = steps[s.stop]! - 1; return true;
    },
    still: async () => { s.stilld++; },
  };
  return { s, w };
}

test('the slides picked in a talk, in talk order, by stop', () => {
  const pick = new Set(['hvpg:7', 'outflow:2', 'hvpg:3', 'hvpg:x']);
  assert.deepEqual(wantedStops(pick, 'hvpg'), [3, 7]);
  assert.deepEqual(wantedStops(pick, 'tips'), []);
  assert.deepEqual(wantedStops(null, 'hvpg'), []);
});

test('a jump forward meets the case card, so the jump is made from the far side', () => {
  assert.equal(needsBackJump(0, 3, 10), true);
  assert.equal(needsBackJump(3, 3, 10), true);
  assert.equal(needsBackJump(5, 3, 10), false);   // (already past it: a plain jump back)
  assert.equal(needsBackJump(0, 9, 10), false);   // (the last stop has no far side)
});

test('the end state of a slide of three pages: the last page, not the first', async () => {
  const { s, w } = talk([1, 3, 2, 1], 1);
  assert.equal(await stepToEnd(w, 1), 'end');
  assert.deepEqual([s.stop, s.step], [1, 2]);
});

test('a slide of one step lands on that step and comes back to it', async () => {
  const { s, w } = talk([1, 1, 1], 1);
  assert.equal(await stepToEnd(w, 1), 'end');
  assert.deepEqual([s.stop, s.step], [1, 0]);
});

test('no press walks through the slides before it, and each press is waited for', async () => {
  const { s, w } = talk([1, 4, 4, 4, 1], 3);
  assert.equal(await stepToEnd(w, 3), 'end');
  assert.equal(s.stop, 3);
  assert.equal(s.presses, 4);   // (3 steps within the slide, then the one that leaves it)
  assert.equal(s.backs, 1);
  assert.ok(s.stilld >= s.presses);
});

test('the talk that cannot be left says so', async () => {
  const { w } = talk([1, 2], 1);
  assert.equal(await stepToEnd(w, 1), 'end');   // (the last stop: Next does nothing at its end, which is its end)
  const stuck: JumpWalker = { stop: () => 1, move: () => true, still: async () => {} };
  assert.equal(await stepToEnd(stuck, 1, 5), 'stuck');
});

test('a Back that does not return is reported, not trusted', async () => {
  const lost: JumpWalker = { stop: (() => { let n = 0; return () => (n++ < 2 ? 1 : 3); })(), move: () => true, still: async () => {} };
  assert.equal(await stepToEnd(lost, 1), 'lost');
});
