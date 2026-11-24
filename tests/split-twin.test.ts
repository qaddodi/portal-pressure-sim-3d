// The split orbit's second figure (src/scene/twin): regions, its own patient, and that leaving the slide lets everything go.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitRegions, confine } from '../src/scene/twin/region.ts';
import { Twin, healthyFrame, liveTwins } from '../src/scene/twin/twin.ts';
import { dustTuner } from '../src/scene/blood/dust.ts';
import { flowRate } from '../src/scene/flow-rate.ts';

test('the canvas is cut into two whole-pixel regions with no gap and no overlap', () => {
  for (const [w, at] of [[1000, 0.5], [1001, 0.37], [3, 0.5], [2, 0], [2, 1]] as const) {
    const { twin, main } = splitRegions(w, 600, at);
    assert.equal(twin.x, 0); assert.equal(twin.x + twin.w, main.x); assert.equal(main.x + main.w, w);
    assert.ok(twin.w >= 1 && main.w >= 1 && Number.isInteger(twin.w));
  }
});

test('confine sets and lifts a target scissor', () => {
  const t = { scissorTest: false, scissor: { v: [0, 0, 0, 0], set(...a: number[]) { this.v = a; } } };
  confine(t, { x: 1, y: 2, w: 3, h: 4 }); assert.equal(t.scissorTest, true); assert.deepEqual(t.scissor.v, [1, 2, 3, 4]);
  confine(t, null); assert.equal(t.scissorTest, false);
});

test('a twin reads its own patient, leaves the page\'s dust and flow rate alone, and is let go on dispose', () => {
  const z = new Array(400).fill(0);
  const frame = healthyFrame({ P: z, Q: z, D: z.map(() => 1) });
  const wake = dustTuner.onWake;
  const before = liveTwins();
  const twin = new Twin(frame, null, { look: 'light', phone: false });
  assert.equal(liveTwins(), before + 1);
  assert.equal(dustTuner.onWake, wake, 'the twin did not take over the page\'s dust wake');
  assert.notEqual(twin.scene.flowRate, flowRate);
  assert.equal(twin.scene.src, twin.source);
  assert.equal(twin.scene.src.frame(), frame);
  twin.step(0); twin.step(16);
  twin.dispose();
  assert.equal(twin.disposed, true);
  assert.equal(liveTwins(), before, 'leaving the slide takes the count back');
  assert.equal(twin.step(32), false);
  twin.dispose();
  assert.equal(liveTwins(), before, 'a second dispose does not count twice');
});

import { halveRoom, cutShare } from '../src/scene/twin/region.ts';
import { sweepYaws, leaveSplit, splitDebug, splitGoTo, splitSetRoom, splitMainRoom, useSplitUi } from '../src/scene/twin/split.ts';
import { splitOf, splitDecks } from '../src/decks/split-slides.ts';
import { HVPG_DECK } from '../src/decks/hvpg.ts';

test('the free room is halved with the healthy liver on the left and the cut falls in the middle of it', () => {
  const { twin, main } = halveRoom({ x: 300, y: 40, w: 600, h: 500 });
  assert.deepEqual(twin, { x: 300, y: 40, w: 300, h: 500 });
  assert.deepEqual(main, { x: 600, y: 40, w: 300, h: 500 });
  assert.equal(cutShare({ x: 300, y: 40, w: 600, h: 500 }, 1200), 0.5);
});

test('the turn goes toward the patient\'s left, then the other way, then home', () => {
  const [a, b, c] = sweepYaws(0.1);
  assert.ok(a! < 0.1 && b! > 0.1 && c === 0.1);
  assert.ok(Math.abs((b! - a!) / 2 - (49 * Math.PI) / 180) < 1e-9);
});

test('the split is off unless asked for, and every slide it names is in the HVPG deck', () => {
  assert.equal(splitOf('hvpg', 'presin'), null, 'off without ?split');
  for (const id of splitDecks()) assert.equal(id, HVPG_DECK.id);
  for (const id of ['presin', 'heart']) assert.ok(HVPG_DECK.slides.some((s) => s.id === id), id);
});

test('with no twin up the page keeps its whole room and leaving is harmless', () => {
  const room = { x: 10, y: 20, w: 300, h: 200 };
  assert.deepEqual(splitGoTo('title', room, 500), room);
  assert.deepEqual(splitSetRoom(room), room);
  assert.deepEqual(splitMainRoom(room), room);
  leaveSplit(); leaveSplit();
  assert.deepEqual(splitDebug(), { twin: false, building: false, job: false });
  assert.equal(useSplitUi.getState().on, false);
});

import { CelScene } from '../src/scene/scene.ts';
import { bindSplit, splitEnterNow, splitActive } from '../src/scene/twin/split.ts';

test('entering puts a twin beside the page\'s scene and leaving takes it all back', () => {
  try {
  const page = new CelScene();
  bindSplit({ scene: page, stage: () => ({ w: 1200, h: 800 }), look: () => 'light', phone: () => false });
  const z = new Array(400).fill(0);
  const before = liveTwins();
  splitGoTo('title', { x: 300, y: 0, w: 600, h: 800 }, 0);
  splitEnterNow({ P: z, Q: z, D: z.map(() => 1) }, { left: 'Healthy', right: 'Schistosomiasis' });
  assert.equal(liveTwins(), before + 1);
  assert.ok(page.split, 'the page draws the twin into its target');
  assert.equal(splitActive(), true);
  assert.deepEqual(splitMainRoom({ x: 300, y: 0, w: 600, h: 800 }), { x: 600, y: 0, w: 300, h: 800 });
  assert.equal(useSplitUi.getState().on, true);
  assert.equal(useSplitUi.getState().right, 'Schistosomiasis');
  leaveSplit();
  assert.equal(page.split, null);
  assert.equal(liveTwins(), before, 'the twin is disposed when the slide is left');
  assert.equal(splitActive(), false);
  assert.equal(useSplitUi.getState().on, false);
  bindSplit(null);
  // (the page scene is left to the process)
  } finally { leaveSplit(); bindSplit(null); }
});
