// The hepatic vein's wave letters a, S, v and D (iPhone 05.5 and 05.8.2 of capture 3531bdfa: "v" printed over "S" and "D" inside about 30 px): `waveLetters` placed each letter at its wave's own x with no collision
// step. Now a letter keeps a letter's width from the next (`spreadLetters`). Judged on the real model with the healthy patient's own record, at every card width from a phone's up, and on the pure spreading
// of a clump. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { loadAgDeck } from '../src/decks/ag/index.ts';
import { loadHpDeck } from '../src/decks/hp/index.ts';
import { chainOf, sequencer } from '../src/decks/hp/numbers.ts';
import { SampleFeed } from '../src/ui/tests/feed.ts';
import { DopplerModel } from '../src/ui/tests/doppler/model.ts';
import { spreadLetters } from '../src/ui/tests/doppler/waves.ts';
import { useDopplerProbe } from '../src/ui/tests/doppler/probe-state.ts';
import { setSlidePin } from '../src/ui/tests/slide/pin.ts';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import type { CopiedDeck } from '../src/decks/hp/types.ts';

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const EN = (EDGES as unknown[]).length;
const frame = () => ({ clock: 'hemo', running: true, speed: 1, settling: false, D: new Float32Array(EN).fill(12), Q: new Float32Array(EN), metrics: {} });
const KEYS = ['t', 'ph', 'vel', 'pvVel', 'hvVel'] as const;

/** The patient's own record of a vessel through the engine, 8 s of the bedside clock, as the page's feed takes it. */
async function liveRecord(preset: string, vessel: string): Promise<Record<string, number[]>> {
  const out: Any[] = [];
  const core = createCore((m: never) => out.push(m));
  await core.handle({ type: 'init' });
  await core.handle({ type: 'run', running: false });
  await core.handle({ type: 'preset', id: preset, reqId: 1 });
  await core.handle({ type: 'probe', id: vessel });
  await core.handle({ type: 'history', secs: 8, reqId: 9 });
  for (let q = 0; q < 400 && !out.find((m) => m.type === 'history'); q++) await new Promise((r) => setTimeout(r, 25));
  const s = out.find((m) => m.type === 'history')?.samples;
  core.dispose();
  assert.ok(s?.t?.length, `${preset}: the engine gave a record`);
  const rec: Record<string, number[]> = {};
  for (const k of KEYS) rec[k] = Array.from(s[k] as ArrayLike<number>).filter((_, i) => i % 5 === 0);   // (every fifth: the 20 ms the worker's tick hands a page)
  return rec;
}
/** The record given to a feed in half-second pieces, as frames bring it. */
function chunks(rec: Record<string, number[]>, secs = 0.5): Record<string, number[]>[] {
  const out: Record<string, number[]>[] = [], t0 = rec.t![0]!;
  let from = 0;
  for (let i = 1; i <= rec.t!.length; i++) if (i === rec.t!.length || rec.t![i]! - t0 >= (out.length + 1) * secs) { out.push(Object.fromEntries(KEYS.map((k) => [k, rec[k]!.slice(from, i)]))); from = i; }
  return out;
}

interface Hit { deck: string; id: string; preset: string; vessel: string; fp: Record<string, unknown> }
async function hepaticSlides(): Promise<Hit[]> {
  const hits: Hit[] = [];
  const decks = [await loadAgDeck('doppler'), await loadHpDeck('outflow')] as unknown as CopiedDeck[];
  for (const d of decks) {
    for (let i = 0; i < d.slides.length; i++) {
      const s = d.slides[i] as Any;
      if (!(s.tool?.kind === 'doppler' && s.tool.waves)) continue;
      const seq = sequencer(1);
      const core = createCore((m: never) => seq.message(m));
      core.handle({ type: 'run', running: false });
      await core.handle({ type: 'sequence', steps: chainOf(d.slides.slice(0, i + 1)), reqId: 1 });
      core.dispose();
      const fp = seq.results[i + 1]?.fp as Record<string, unknown> | undefined;
      assert.ok(fp, `${d.id}/${s.id}: the slide has a state`);
      hits.push({ deck: d.id, id: s.id, preset: s.preset ?? 'healthy', vessel: s.tool.vessel, fp });
    }
  }
  return hits;
}


test('spreadLetters: a clump spreads to a letter\'s width, stays in order and inside its bounds; a clear row is left alone', () => {
  const gap = 18, lo = 10, hi = 300;
  const clump = spreadLetters([100, 106, 111, 118], gap, lo, hi);
  for (let i = 1; i < clump.length; i++) assert.ok(clump[i]! - clump[i - 1]! >= gap - 1e-6, `gap ${clump[i]! - clump[i - 1]!}`);
  assert.ok(clump[0]! >= lo && clump[3]! <= hi);
  assert.deepEqual(spreadLetters([20, 80, 140, 200], gap, lo, hi), [20, 80, 140, 200]);
  // a clump at the right edge slides back inside
  const edge = spreadLetters([296, 298, 299, 300], gap, lo, hi);
  assert.ok(edge[3]! <= hi + 1e-6 && edge[3]! - edge[2]! >= gap - 1e-6);
  // a room too narrow for the row spreads evenly over it
  assert.deepEqual(spreadLetters([5, 6, 7, 8], 30, 0, 60), [0, 20, 40, 60]);
});

test('on a hepatic vein slide the letters a, S, v, D never touch, at every card width', async () => {
  const hits = (await hepaticSlides()).filter((h) => h.preset === 'healthy');
  assert.ok(hits.length >= 1, 'a healthy hepatic vein slide that names its waves');
  const h = hits[0]!;
  const rec = await liveRecord(h.preset, h.vessel);
  const pieces = chunks(rec);
  useDopplerProbe.setState({ probe: h.vessel, gate: null });
  setSlidePin(h.fp as never);
  const seen = new Set<number>();
  for (const w of [180, 220, 260, 300, 360, 420, 520]) {
    const feed = new SampleFeed(); const m = new DopplerModel() as Any; m.slide = true; m.configure({ waves: true });
    for (const p of pieces) { feed.adopt({ jump: false, probe: h.vessel, samples: p } as never); m.ingest(frame(), feed); }
    let letters: Any[] = [];
    for (let k = 0; k < 60 && letters.length < 4; k++) {
      if (m.synth) m.synth.wall -= 250;
      m.ingest(frame(), feed);
      const fr = m.frameFor(w, 190, 1000 + k * 250, 'x');
      letters = fr.shapes.filter((s: Any) => s.k === 'text' && typeof s.key === 'string' && s.key.startsWith('wave-'));
    }
    if (letters.length < 4) continue;
    seen.add(w);
    const box = (s: Any) => ({ x0: s.x - 0.35 * s.size, x1: s.x + 0.35 * s.size });
    const row = [...letters].sort((a: Any, b: Any) => a.x - b.x);
    for (let i = 1; i < row.length; i++) assert.ok(box(row[i]).x0 >= box(row[i - 1]).x1 - 1e-6, `${w} px: ${row[i - 1].s} and ${row[i].s} touch (${row[i - 1].x.toFixed(1)}, ${row[i].x.toFixed(1)})`);
    const order = letters.map((s: Any) => s.s).join('');
    assert.equal(order, 'aSvD', `${w} px: the letters stay in time order`);
  }
  assert.ok(seen.size >= 4, `letters were drawn at ${[...seen]} px`);
  setSlidePin(null);
});
