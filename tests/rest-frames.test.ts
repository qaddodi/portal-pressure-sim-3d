// The figure rests (review D1, D2): a paused Anatomy asks for no frames, a playing one asks only for ambient ones, and ?perf names whatever still moves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { organsReady, setOrganData } from '../src/scene/organs/meshes.ts';
import { CelScene } from '../src/scene/scene.ts';
import { bodyTargets } from '../src/scene/disease/targets.ts';
import { fixedSource } from '../src/scene/model-source.ts';
import { presetState } from './b4-presets.ts';
import { perfReport } from '../src/ui/perf/report.ts';

async function sceneOf(running: boolean) {
  const p = await presetState('cirr-decomp');
  const s = new CelScene({ source: fixedSource({ ...p.frame, running } as never, p.params, { P: p.healthyP, Q: p.frame.Q as never }) });
  s.disease.organs.setBody(bodyTargets(p.frame, p.params, p.healthyP), true);
  const b = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
  setOrganData(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  await organsReady; await new Promise((r) => setTimeout(r, 0));
  s.dataChanged();
  return s;
}
/** Runs 60 fps frames for `sec` page seconds; returns how many asked for another, how many of those were ambient only, and the systems named in the last 5 s. */
function run(s: CelScene, sec: number) {
  let now = 1000, asked = 0, ambient = 0; const named = new Set<string>();
  for (let i = 0; i < sec * 60; i++) {
    now += 1000 / 60;
    const m = s.update(now);
    if (i >= (sec - 5) * 60 && m) { asked++; if (s.ambientOnly) ambient++; for (const id of s.movingSystems) named.add(id); }
  }
  return { asked, ambient, named: [...named] };
}

test('Anatomy paused: after the eases settle, no system asks for a frame (the bleed jet no longer restarts its drain every frame)', async () => {
  const s = await sceneOf(false);
  const r = run(s, 15);   // (the first seconds are the figure's own settling: the dust swirl and the flow's Pause ease)
  assert.equal(r.asked, 0, `still asking for frames: ${r.named.join(', ')}`);
  s.dispose();
});

test('Anatomy playing with nobody touching it: every frame asked for is ambient (flow marks, cells, the pool ripple), never an eased change', async () => {
  const s = await sceneOf(true);
  const r = run(s, 15);
  assert.ok(r.asked > 0, 'the marks go round');
  assert.equal(r.ambient, r.asked, `not ambient: ${r.named.join(', ')}`);
  assert.ok(r.named.every((id) => ['flow', 'disease'].includes(id)), r.named.join(', '));
  s.dispose();
});

test('a bleed that never started has no tail to drain: its set() settles at once and stays settled', async () => {
  const s = await sceneOf(false);
  const bleed = s.disease.bleed;
  const idle = { active: false, site: 'VAR', rate: 50, total: 0 } as never;
  for (let i = 0; i < 5; i++) assert.equal(bleed.set(idle, 0.016), false, `frame ${i}`);
  s.dispose();
});

test('?perf names the moving systems and the ambient rate', () => {
  const base = { framesDrawn: 10, windowFrames: 10, p50: 1, p95: 2, max: 3, slow: [], awake: true, holds: [], ambientFps: 30, deferred: 4 };
  const ctx = { ua: 'x', dpr: 1, size: '1x1', look: 'light', hash: 'h' };
  const a = perfReport(base, { ...ctx, scene: { moving: ['disease', 'flow'], ambientOnly: false } });
  assert.match(a, /scene still moving: disease, flow\n/);
  assert.match(a, /run at 30 a second; 4 display ticks/);
  assert.match(perfReport(base, { ...ctx, scene: { moving: ['flow'], ambientOnly: true } }), /flow \(ambient only/);
  assert.match(perfReport(base, { ...ctx, scene: { moving: [], ambientOnly: false } }), /scene still moving: nothing/);
});
