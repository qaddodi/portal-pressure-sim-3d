// The beat card's paper moves one way (beat-chart plan, 23 Nov). The paper's clock is the feed's own: forward only, and never the model's, which runs from the old moment to the slide's (here backwards)
// while a slide eases in. A frame that says it is morphing, and has no samples, must not turn the paper round.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SampleFeed, CHANNELS } from '../src/ui/tests/feed.ts';

const FRAME_MS = 20, DT = 0.01;
/** `n` samples at 100 Hz from model time t0 */
function samples(t0: number, n: number): Record<string, number[]> {
  const o: Record<string, number[]> = { t: [] }; for (const k of CHANNELS) o[k] = [];
  for (let i = 0; i < n; i++) { const t = t0 + i * DT; o.t!.push(t); for (const k of CHANNELS) o[k]!.push(k === 'ph' ? (t / 0.8) % 1 : 10); }
  return o;
}
const live = { running: true, clock: 'hemo', speed: 1 };

test('the head never goes back: live frames, a morph whose model clock falls 30 s, then the landed state', () => {
  const f = new SampleFeed();
  let now = 5000, tm = 100, prev = -Infinity, first = NaN;
  const heads: number[] = [];
  const step = (frame: Parameters<SampleFeed['adopt']>[0], hf: Parameters<SampleFeed['headNow']>[0]) => {
    now += FRAME_MS;
    f.adopt(frame, now);
    const h = f.headNow(hf, now, now);
    assert.ok(h >= prev - 1e-12, `the head went back: ${prev} -> ${h}`);
    prev = h; heads.push(h);
    return h;
  };
  // (a) live: 2 s of frames, two samples each
  for (let i = 0; i < 100; i++) { step({ jump: i === 0, clock: 'hemo', samples: samples(tm, 2) }, live); tm += 2 * DT; if (i === 0) first = prev; }
  const before = prev;
  assert.ok(before - first > 1.5, `the paper ran on through the live frames (${before - first})`);
  // (b) a slide's change of patient: the worker's frame says jump and morphing, takes no samples, and its model clock runs from here back to the slide's moment (-30 s)
  const m0 = prev;
  for (let i = 0; i < 60; i++) { step({ jump: i === 0, clock: 'hemo', morphing: true, samples: null }, { ...live, morphing: true }); }
  const through = prev - m0;
  assert.ok(Math.abs(through - 1.2) < 0.05, `the paper kept its pace through the 1.2 s morph: ${through}`);
  // (c) landed: the model's clock is now 3 s, samples begin there (a second jump: the restore that lands the morph)
  const land = f.headNow(live, now, now);
  f.adopt({ jump: true, clock: 'hemo', morphing: false, samples: samples(3, 2) }, now);
  assert.ok(f.last - land <= 0.12 + 0.01 && f.last - land >= 0, `the first landed sample stands the lag ahead of the head (${f.last - land})`);
  tm = 3 + 2 * DT;
  const c0 = prev;
  for (let i = 0; i < 100; i++) { step({ jump: false, clock: 'hemo', samples: samples(tm, 2) }, live); tm += 2 * DT; }
  assert.ok(prev - c0 > 1.5 && prev - c0 < 2.3, `the paper runs on at its pace after the landing (${prev - c0})`);
});

test('a late frame (fewer seconds of samples than wall time passed) holds the head still, never draws it back', () => {
  const f = new SampleFeed();
  let now = 1000, tm = 0;
  for (let i = 0; i < 50; i++) { now += FRAME_MS; f.adopt({ jump: i === 0, clock: 'hemo', samples: samples(tm, 2) }, now); tm += 2 * DT; f.headNow(live, now, now); }
  const h0 = f.headNow(live, now, now);
  // 110 ms pass, the frame brings 80 ms of samples: last - LAG falls behind where the head had got to
  now += 110;
  f.adopt({ jump: false, clock: 'hemo', samples: samples(tm, 8) }, now);
  const h1 = f.headNow(live, now, now);
  assert.ok(h1 >= h0, `${h0} -> ${h1}`);
});

test("headNow reads no model time of the frame (the model's clock is not the paper's)", () => {
  const src = readFileSync(new URL('../src/ui/tests/feed.ts', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('  headNow('), src.indexOf('  /** An instrument wants'));
  assert.ok(body.length > 200);
  assert.doesNotMatch(body, /\bf\??\.t\b/, 'headNow reads f.t');
  assert.doesNotMatch(body, /\.t \?\?/);
  for (const file of ['slide/BeatCard.tsx', 'trace/OverTimePane.tsx']) {
    const s = readFileSync(new URL(`../src/ui/tests/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(s, /\(f\?\.t \?\? 0\)/, `${file} falls back to the model's clock`);
    assert.match(s, /feed\.headNow\(/, `${file} takes its head from the feed`);
  }
});
