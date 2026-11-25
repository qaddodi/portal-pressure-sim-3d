// Pause and Play EASE every visible motion that rides the blood (Mohammad, 20 Nov, twice: "pause and play should ease in stop and play not immediately stop and play abruptly").
// One shared rate (scene/flow-rate.ts `flowRate`, stepped once a frame by scene.update toward flowTarget(live.frame.running)) is multiplied into every site that advances a flow phase:
// the Anatomy/Circuit streams, the lobule's heads (flat and 3D), the sinusoid's traffic (flat and 3D). The model's numbers, the clock and the readouts keep pausing at once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FlowRate, flowRate, flowTarget } from '../src/scene/flow-rate.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import { Sinusoid3D } from '../src/scene/micro3d/sinusoid3d.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { Lobule3D } from '../src/scene/micro3d/lobule3d.ts';
import { bootEngine, engine } from '../src/engine/boot.ts';
import { live } from '../src/engine/store.ts';
import { togglePlay } from '../src/ui/shell/transport.ts';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import type { WorkerLike } from '../src/engine/client.ts';
import { sceneSource } from './helpers/scene-source.ts';

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const FRAME = 1 / 60;

test('one shared rate, exported from one module, is what the scene steps and every site reads', () => {
  const fr = src('scene/flow-rate.ts'), sc = sceneSource();
  assert.match(fr, /export const flowRate = new FlowRate\(\)/);
  assert.match(sc, /this\.flowRate = this\.twin \? new FlowRate\(\) : flowRate;/, 'the page\'s scene steps the shared instance; only a split-orbit twin has a copy of its own');
  assert.equal((sc.match(/new FlowRate\(/g) ?? []).length, 1);
  assert.match(sc, /this\.flowRate\.step\(dt \/ 1000, flowTarget\(this\.src\.liveFrame\(\)\?\.running\)\)/, 'the target is the live model\'s own running flag (not a pinned Compare frame)');
  assert.match(sc, /this\.lobule3d\.update\(this\.micro3d, under, now, this\.flowRate\.value, false, this\.fadeNow\)/);
  assert.match(sc, /this\.sinus3d\.update\(this\.micro3d, this\.flowRate\.value\)/);
  assert.match(sc, /streams\.step\(now, this\.flowRate\.value\)/);
  // no site still takes the boolean that froze the picture at once
  assert.doesNotMatch(sc, /frame\?\.running \?\? true\)/);
});

test('every phase advance multiplies by the rate (grep pins)', () => {
  const l3 = src('scene/micro3d/lobule3d.ts');
  assert.match(l3, /const k = clamp\(rate, 0, 1\) \* dt;/);
  assert.match(l3, /this\.flowT\.blood \+= k \* /);
  assert.match(l3, /this\.flowT\.lymph \+= k \* /);
  assert.match(l3, /this\.flowT\.bile \+= k \* /);
  assert.match(src('scene/micro3d/sinusoid3d.ts'), /f\.trafficSpeed = Math\.min\(1, Math\.max\(0, rate\)\) \* \(on \? PACE : 1\)/);
  assert.match(src('scene/blood/streams.ts'), /o\.speed = rate/);
});

test('flowTarget: running 1, paused 0, no frame yet 1', () => {
  assert.equal(flowTarget(true), 1); assert.equal(flowTarget(false), 0); assert.equal(flowTarget(undefined), 1);
});

test('the sinusoid traffic: a pause eases its advance per frame down to exactly 0 and a play back up (3D on and off)', () => {
  for (const on of [true, false]) {
    const shared = createShared();
    const flat = new SinusoidView(shared, { look: 'light' });
    const s3 = new Sinusoid3D(flat, shared);
    flat.group.add(s3.group); flat.setVisible(true);
    const r = new FlowRate();
    let now = 1000; flat.update(now);
    const F = flat as unknown as { trafficSpeed: number; traffic: { flowX: number } };
    const stepFrames = (target: number, n: number): number[] => {
      const out: number[] = [];
      for (let i = 0; i < n; i++) { r.step(FRAME, target); s3.update(on, r.value); const x0 = F.traffic.flowX; now += 16; flat.update(now); out.push(F.traffic.flowX - x0); }
      return out;
    };
    stepFrames(1, 3);
    const down = stepFrames(0, 45);
    assert.ok(Math.abs(down[0]!) > 0, 'moving at the pause');
    for (let i = 1; i < down.length; i++) assert.ok(Math.abs(down[i]!) <= Math.abs(down[i - 1]!) + 1e-9, `the advance only slows (${i})`);
    assert.ok(Math.abs(down[10]!) < Math.abs(down[0]!) * 0.9, 'a gentle slowing, not a cut');
    assert.equal(F.trafficSpeed, 0, 'exactly stood');
    assert.equal(down[down.length - 1], 0);
    const up = stepFrames(1, 45);
    assert.ok(Math.abs(up[0]!) < Math.abs(up[up.length - 1]!) * 0.2, 'a gentle start, not a jump');
    for (let i = 1; i < up.length; i++) assert.ok(Math.abs(up[i]!) >= Math.abs(up[i - 1]!) - 1e-9, `the advance only quickens (${i})`);
  }
});

test('the 3D lobule\'s flow clocks advance by the rate: slower mid-pause, none once settled, and it asks for no frame at rest', () => {
  const flat = new LobuleView(createShared()); flat.setVisible(true);
  const l3 = new Lobule3D(flat, createShared());
  const T = l3 as unknown as { flowT: { blood: number; lymph: number; bile: number } };
  let now = 1000; l3.update(true, 0, now, 1);
  const r = new FlowRate();
  const adv: number[] = [];
  for (let i = 0; i < 45; i++) { r.step(FRAME, 0); const b = T.flowT.blood; now += 16; l3.update(true, 0, now, r.value); adv.push(T.flowT.blood - b); }
  for (let i = 1; i < adv.length; i++) assert.ok(adv[i]! <= adv[i - 1]! + 1e-12, `slows (${i})`);
  assert.ok(adv[0]! > 0 && adv[10]! < adv[0]! * 0.9);
  assert.equal(adv[adv.length - 1], 0);
  const lym = T.flowT.lymph, bile = T.flowT.bile;
  now += 16;
  l3.update(true, 0, now, 0);
  assert.equal(T.flowT.lymph, lym); assert.equal(T.flowT.bile, bile);
});

test('the real button path: the play bar\'s action reaches the shared rate as its target (pause eases to 0, play back to 1)', async () => {
  const w: WorkerLike = {
    onmessage: null,
    postMessage(msg) { setTimeout(() => { void core.handle(msg as never); }, 0); },
    terminate() { core.dispose(); },
  };
  const core = createCore((m: unknown) => { setTimeout(() => w.onmessage?.({ data: m as never }), 0); });
  try {
    await bootEngine(w, 'healthy');
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(live.frame?.running, true, 'the model runs at boot');
    togglePlay();   // the Pause button
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(live.frame?.running, false, 'the engine\'s next frame says paused');
    const fr = new FlowRate(); flowRate.step(0, 1);
    assert.equal(flowTarget(live.frame?.running), 0, 'the scene\'s target is now 0');
    for (let i = 0; i < 12; i++) fr.step(FRAME, flowTarget(live.frame?.running));
    assert.ok(fr.value < 1 && fr.value > 0, `easing, not cut (${fr.value})`);
    togglePlay();   // the Play button
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(live.frame?.running, true);
    assert.equal(flowTarget(live.frame?.running), 1);
  } finally { engine().dispose(); }
});
