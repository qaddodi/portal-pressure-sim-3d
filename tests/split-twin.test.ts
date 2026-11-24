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
