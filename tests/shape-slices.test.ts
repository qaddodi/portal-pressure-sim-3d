// C2 (27 Nov review): the scene audit's one 52 ms `shapes` frame on healthy to CSPH was a vessel's whole tube build (20 to 40 ms for four strands of 400 rings) and the first blend of its key-frame pair (a scan of every vertex, 20 ms),
// each done inside ONE frame because the frame budget could only stop between vessels. The unit of work is now a strand (tubes.ts buildTubesSteps) and a plan step (vessel-object.ts lerpPlanSteps), so a frame is never longer than one of them
// past the budget, whatever the vessel. The general rule pinned here: a build resumed in steps is exactly the build done at once, and a frame runs only as many steps as its budget allows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { clock, driveClockTime } from '../src/clock/frame.ts';
import { Ease } from '../src/clock/ease.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { REST, coursesOf, tubularOf } from '../src/scene/vessels/shape.ts';
import { slicesFor } from '../src/scene/circuit/geometry.ts';
import { buildTubes, buildTubesSteps } from '../src/scene/vessels/tubes.ts';
import { SHAPE_BUDGET_MS, type ShapeTracks } from '../src/scene/vessels/shape-track.ts';

const c4 = NETWORK_BY_ID.get('C4')!;
const grown = { ...REST, wig: 2.5, spr: 1.4, strandsOn: true, bead: 0.3 };
const courses = (): ReturnType<typeof coursesOf> => coursesOf(c4, grown), tubular = (): number[] => tubularOf(c4, slicesFor('C4'));

test('a tube build in steps is the build at once, with one step to a strand and one for the merge', () => {
  const whole = buildTubes(courses(), tubular(), c4.radius);
  const steps = buildTubesSteps(courses(), tubular(), c4.radius);
  let n = 0, r = steps.next();
  for (; !r.done; r = steps.next()) n++;
  assert.equal(n, courses().length, 'one yield after each strand, and the merge in the last resume');
  assert.ok(courses().length >= 4, 'C4 is a vessel of several strands: the case this is for');
  for (const name of ['position', 'normal', 'rk', 'tang', 'uv']) {
    const a = whole.geometry.getAttribute(name).array as Float32Array, b = r.value.geometry.getAttribute(name).array as Float32Array;
    assert.equal(a.length, b.length, name);
    for (let i = 0; i < a.length; i += 31) assert.equal(a[i], b[i], `${name} ${i}`);
  }
  assert.equal(r.value.length, whole.length);
  assert.equal(r.value.runs.length, whole.runs.length);
});

test('a frame runs only the steps its budget allows: with every clock read costing more than the budget, one strand a frame, and the vessel still ends as the fresh build', () => {
  const scene = new CelScene();
  let t = 5000, reads = 0;
  driveClockTime(() => { reads++; return t += SHAPE_BUDGET_MS + 1; });   // (every read of page time spends more than a whole budget)
  try {
    const shapes = (scene as unknown as { shapes: ShapeTracks }).shapes;
    const items = (shapes as unknown as { items: { v: { id: string }; shown: number; spread: number; strandsOn: boolean; state: typeof grown }[] }).items;
    for (const it of items) { it.shown = 0; it.spread = 1; it.strandsOn = false; }
    for (let f = 0; f < 2000 && shapes.step(16); f++);   // (everything settles at rest first)
    const item = items.find((it) => it.v.id === 'C4')!;
    item.shown = 1; item.strandsOn = true;
    let most = 0, frames = 0;
    for (let f = 0; f < 3000; f++) {
      const s0 = shapes.stats.slices;
      const moving = shapes.step(16);
      most = Math.max(most, shapes.stats.slices - s0);
      frames++;
      if (!moving && f > 5) break;
    }
    assert.ok(reads > 0);
    assert.equal(most, 1, 'one step (one strand, the merge, or a plan step) in a frame, however many vessels wait');
    assert.ok(frames > 10, `the growth took ${frames} frames of one step each`);
    assert.equal(shapes.step(16), false, 'settled: nothing waits');
    const live = (scene.vesselObject('C4') as unknown as { toonMesh: { geometry: { getAttribute(n: string): { array: Float32Array } } } }).toonMesh.geometry.getAttribute('position').array;
    const want = buildTubes(coursesOf(c4, item.state), tubularOf(c4, slicesFor('C4')), c4.radius).geometry.getAttribute('position').array as Float32Array;
    assert.equal(live.length, want.length);
    for (let i = 0; i < live.length; i += 97) assert.ok(Math.abs(live[i]! - want[i]!) < 1e-5, `vertex ${i}`);
  } finally { driveClockTime(null); scene.dispose(); }
});

test('a harness that turns the scene by hand drives page time with it: an ease asked to move at hand time steps by the frame, not by the gap between two timelines (the audit read 0.556 in one frame)', () => {
  let hand = 90000;
  driveClockTime(() => hand);
  const e = new Ease(0, 'slices-test');
  try {
    e.to(1, { perMs: 1 / 180 });
    hand += 16; e.step(hand);
    assert.ok(Math.abs(e.value - 16 / 180) < 1e-9, `the first step moved ${e.value}, a frame's worth is ${16 / 180}`);
    assert.equal(clock.now(), hand, 'page time is the hand time');
  } finally { e.dispose(); driveClockTime(null); }
  assert.ok(clock.now() < 90000, 'page time goes back to the browser\'s');
});
