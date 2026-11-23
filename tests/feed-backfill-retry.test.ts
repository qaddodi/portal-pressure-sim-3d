// A card that comes in while the model eases to a slide's state asked for its past once, at mount, and the worker answered empty (it takes no samples while it morphs). Nothing asked again, so the
// plot stood empty for the seconds the live samples took to fill it (beat-chart plan, sweep C). The feed now asks once for each record that begins on a landed state, whatever the card did at mount.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootEngine } from '../src/engine/boot.ts';
import type { WorkerLike } from '../src/engine/client.ts';
import { SampleFeed, CHANNELS } from '../src/ui/tests/feed.ts';

const asked: number[] = [];
let answer: 'empty' | 'past' = 'empty';
/** the model's past: 100 Hz up to model time 3.02 (the last sample the worker posted) */
function past(secs: number): Record<string, number[]> {
  const o: Record<string, number[]> = { t: [] }; for (const k of CHANNELS) o[k] = [];
  for (let t = 3.02 - secs; t < 3.02 + 1e-9; t += 0.01) { o.t!.push(+t.toFixed(4)); for (const k of CHANNELS) o[k]!.push(k === 'ph' ? (t / 0.8) % 1 : 12); }
  return o;
}
const worker: WorkerLike = {
  onmessage: null,
  postMessage(msg) {
    const m = msg as { type: string; reqId: number; secs?: number };
    const reply = (x: unknown) => setTimeout(() => worker.onmessage?.({ data: { reqId: m.reqId, ...(x as object) } as never }), 0);
    if (m.type === 'preset') reply({ type: 'presetLoaded', params: {} });
    else if (m.type === 'healthyProfile') reply({ type: 'healthy', P: [], Q: [], metrics: {} });
    else if (m.type === 'history') { asked.push(m.secs!); reply({ type: 'history', samples: answer === 'past' ? past(m.secs!) : null, t: 3.02 }); }
  },
};
const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const samples = (t0: number, n: number) => { const o: Record<string, number[]> = { t: [] }; for (const k of CHANNELS) o[k] = []; for (let i = 0; i < n; i++) { const t = t0 + i * 0.01; o.t!.push(t); for (const k of CHANNELS) o[k]!.push(k === 'ph' ? (t / 0.8) % 1 : 12); } return o; };

test('a past asked for during a morph is asked for again once the slide has landed, once for each record, and joins the live samples with no seam', async () => {
  await bootEngine(worker, 'csph');
  const f = new SampleFeed();
  const release = f.want('beat-card', 7);
  let now = 9000;
  f.head[0] = 50; f.head[1] = now;   // (the paper had been drawn: a record that begins goes on from its head)
  // the card mounts during the morph: the worker answers empty
  answer = 'empty';
  assert.equal(await f.backfill(7), false);
  assert.equal(asked.length, 1);
  // the morph's frames: a jump, no samples, nothing is asked
  now += 20; f.adopt({ jump: true, clock: 'hemo', morphing: true, samples: null }, now);
  now += 20; f.adopt({ jump: false, clock: 'hemo', morphing: true, samples: null }, now);
  await wait();
  assert.equal(asked.length, 1, 'nothing is asked while the model eases');
  // the landing: the restore is a jump, the first samples come; the engine now has its past
  answer = 'past';
  now += 20; f.adopt({ jump: true, clock: 'hemo', morphing: false, samples: samples(3.0, 3) }, now);
  await wait();
  assert.equal(asked.length, 2, 'the landed record asked once');
  assert.ok(f.t.length > 600, `7 s of past arrived (${f.t.length} samples)`);
  assert.ok(f.last - f.t[0]! > 6.9, 'the record spans the card');
  for (let i = 1; i < f.t.length; i++) assert.ok(f.t[i]! > f.t[i - 1]!, 'time only runs forward through the seam');
  // history times are shifted by off, and end just before the first live sample
  const firstLive = 3.0 + f.off, gaps = f.t.filter((t) => t >= firstLive - 1e-9);
  assert.equal(gaps.length, 3, 'the three live samples are the end of the record');
  const lastPast = f.t[f.t.length - 4]!;
  assert.ok(firstLive - lastPast > 0 && firstLive - lastPast < 0.0125, `no seam: ${firstLive - lastPast}`);
  assert.ok(f.last - 50 >= 0.12 && f.last - 50 <= 0.12 + 0.25, `the record goes on from the paper's head (the lag ahead of it), ${f.last}`);
  // later frames of the same record do not ask again
  now += 20; f.adopt({ jump: false, clock: 'hemo', morphing: false, samples: samples(3.03, 2) }, now);
  await wait();
  assert.equal(asked.length, 2);
  // a new record (another slide) asks again
  now += 20; f.adopt({ jump: true, clock: 'hemo', morphing: false, samples: samples(3.0, 3) }, now);
  await wait();
  assert.equal(asked.length, 3, 'the next generation asks once more');
  // and a card that has gone wants nothing
  release();
  now += 20; f.adopt({ jump: true, clock: 'hemo', morphing: false, samples: samples(3.0, 3) }, now);
  await wait();
  assert.equal(asked.length, 3, 'released: nothing is asked');
});
