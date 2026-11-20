// Pause and Play EASE the visible flow (Mohammad, 20 Nov: "when i stop the motion, it should EASE stop and EASE begin on pause and play"): one eased rate (scene/flow-rate.ts) drives the streams' distance, which the
// chevrons, the streaks and the Circuit's heads all ride; nothing is asked of the clock once it has settled at rest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FLOW_EASE_S, FlowRate } from '../src/scene/flow-rate.ts';

const FRAME = 1 / 60;

test('after a pause the rate falls monotonically to exactly 0 within 0.6 s, with no jump at either end; after a play it rises monotonically to exactly 1', () => {
  assert.ok(FLOW_EASE_S >= 0.4 && FLOW_EASE_S <= 0.6, 'about half a second');
  const r = new FlowRate();
  assert.equal(r.value, 1);
  assert.equal(r.step(FRAME, 1), true, 'playing: frames');
  const down: number[] = [r.value];
  let t = 0;
  while (t < 0.6 + 1e-9) { r.step(FRAME, 0); down.push(r.value); t += FRAME; }
  for (let i = 1; i < down.length; i++) assert.ok(down[i]! <= down[i - 1]! + 1e-12, `monotone down at ${i}`);
  assert.equal(down[down.length - 1], 0, 'lands exactly on 0');
  assert.ok(down[1]! > 0.95, `no jump at the start (${down[1]})`);
  const settledAt = down.findIndex((v) => v === 0) * FRAME;
  assert.ok(settledAt <= 0.6, `settled at ${settledAt.toFixed(3)} s`);
  const lastStep = down[down.findIndex((v) => v === 0) - 1]!;
  assert.ok(lastStep < 0.02, `no jump at the end (${lastStep})`);
  // the play
  const up: number[] = [r.value];
  t = 0;
  while (t < 0.6 + 1e-9) { r.step(FRAME, 1); up.push(r.value); t += FRAME; }
  for (let i = 1; i < up.length; i++) assert.ok(up[i]! >= up[i - 1]! - 1e-12, `monotone up at ${i}`);
  assert.equal(up[up.length - 1], 1);
  assert.ok(up[1]! < 0.05, `no jump at the start (${up[1]})`);
});

test('an interrupted ease restarts from where it is (no jump) and a settled pause asks for no frame: no hold remains once stopped', () => {
  const r = new FlowRate();
  for (let i = 0; i < 15; i++) r.step(FRAME, 0);   // a quarter second into a pause
  const mid = r.value;
  assert.ok(mid > 0.05 && mid < 0.95);
  r.step(FRAME, 1);   // play again
  assert.ok(Math.abs(r.value - mid) < 0.05, `continuous (${mid} to ${r.value})`);
  for (let i = 0; i < 60; i++) r.step(FRAME, 1);
  assert.equal(r.value, 1);
  assert.equal(r.active, true, 'playing: the flow moves');
  let asked = 0;
  for (let i = 0; i < 120; i++) if (r.step(FRAME, 0)) asked++;
  assert.ok(asked >= 25 && asked <= 40, `asked for ${asked} frames while easing, then none`);
  assert.equal(r.value, 0);
  assert.equal(r.active, false, 'settled at 0: nothing is asked of the clock');
  for (let i = 0; i < 10; i++) assert.equal(r.step(FRAME, 0), false);
});

test('the eased rate drives the streams\' distance (the chevrons, the streaks and the Circuit\'s heads ride it) and the scene hands it the pause; the stream asks for no frame at rest', () => {
  const streams = readFileSync(new URL('../src/scene/blood/streams.ts', import.meta.url), 'utf8');
  assert.match(streams, /step\(nowMs: number, rate = 1\): boolean \{/);
  assert.match(streams, /o\.speed = rate;/);
  assert.match(streams, /\(sm\.vd !== 0 && rate > 0\.0005\)/, 'a stood stream asks for no frame');
  const scene = readFileSync(new URL('../src/scene/scene.ts', import.meta.url), 'utf8');
  assert.match(scene, /this\.flowRate\.step\(dt \/ 1000, flowTarget\(live\.frame\?\.running\)\);/);
  assert.match(scene, /this\.blood\.streams\.step\(now, this\.flowRate\.value\)/);
  assert.doesNotMatch(readFileSync(new URL('../src/scene/flow-rate.ts', import.meta.url), 'utf8'), /requestAnimationFrame\(/, 'one clock: no raw rAF');
  // the advance is D += vd * speed * dt in the 2D app's own stream (blood.copied.js): speed 0 stands it, speed 1 runs it, in between is the ease
  assert.match(readFileSync(new URL('../src/scene/blood/blood.copied.js', import.meta.url), 'utf8'), /st\.D = \(\(\(st\.D \+ st\.vd \* speed \* dt\)/);
});

test('the Lobule and Sinusoid (3D) ride the same eased rate: none of them reads the abrupt running flag for its flow', () => {
  const scene = readFileSync(new URL('../src/scene/scene.ts', import.meta.url), 'utf8');
  assert.match(scene, /this\.lobule3d\.update\([^)]*this\.flowRate\.value\)/);
  assert.match(scene, /this\.sinus3d\.update\(this\.micro3d, this\.flowRate\.value\)/);
  const lob3 = readFileSync(new URL('../src/scene/micro3d/lobule3d.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(lob3, /if \(running\)/);
});
