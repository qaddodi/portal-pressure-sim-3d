// What the main thread does in ONE task before the first picture is held to a budget (24 Nov, "the splash takes long and snags a few seconds in"): the scene is built when Stage.tsx's module is first run, in a single task
// the cover's bar cannot move through. The numbers below are work counts, not clock readings (a clock on a shared runner judges nothing), plus one generous wall-time ceiling that only an order-of-magnitude regression reaches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { CelScene } from '../src/scene/scene.ts';
import { touchWork } from '../src/scene/lobule/weld-nodes.ts';

test('the scene\'s constructor measures the Lobule\'s junctions with boxes, not against every segment (work budget)', () => {
  touchWork.segments = 0;
  const t0 = performance.now(), s = new CelScene(), ms = performance.now() - t0;
  const segments = touchWork.segments;
  s.dispose?.();
  // the plain loop did ~12 million segment distances a pass, three passes; the boxed one does a thousand or two
  assert.ok(segments < 20_000, `${segments} segment distances in the constructor (the plain loop: tens of millions)`);
  // (a ceiling for the whole constructor, about four times what a laptop takes cold: it fails on a loop that went quadratic again, never on a slow runner)
  assert.ok(ms < 6000, `the scene's constructor took ${Math.round(ms)} ms`);
});
