// Mohammad, 28 Nov (Cardiac 6/12, "Tricuspid regurgitation reverses the S wave"): the what-if slider moved and the hepatic vein's Doppler tracing did not change.
// Root cause: on a slide the trace is a REPLAY (DopplerModel.startSynth / runSynth) of a template of the live record taken when the card came up; the slide's state only rescales it to the slide's mean.
// Tricuspid regurgitation turns the S wave round while the vein's mean hardly moves, so every slider value drew the shape of the first one. Now the live record, which the model keeps laying, is kept
// beside the replay; once the model has settled on the slide's changed state and 3 s of whole beats are in, the replay takes its template from it (DopplerModel.follow / retake) and enters it at the same
// point of the beat, the step easing out. Node only: the engine's own record of the slide at the slider's two ends, through the model, with the slide's pin moved from one to the other.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { copiedDecks } from './helpers-deck-chain.ts';
import { planOf } from '../src/ui/talk/instruments.ts';
import type { CopiedSlide } from '../src/decks/hp/types.ts';
import { chainOf, sequencer } from '../src/decks/hp/numbers.ts';
import { patchOf } from '../src/decks/controls.ts';
import { SampleFeed } from '../src/ui/tests/feed.ts';
import { DopplerModel } from '../src/ui/tests/doppler/model.ts';
import { useDopplerProbe } from '../src/ui/tests/doppler/probe-state.ts';
import { setSlidePin } from '../src/ui/tests/slide/pin.ts';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import { clock } from '../src/clock/frame.ts';
import { bankFor, type BankAsk } from '../src/ui/tests/doppler/shape-bank.ts';
import { useSliderAt } from '../src/ui/talk/variant-words.ts';
import { sliderStops } from '../src/decks/controls.ts';

const EN = (EDGES as unknown[]).length;
const KEYS = ['t', 'ph', 'vel', 'pvVel', 'hvVel'] as const;
const frame = (settling = false) => ({ clock: 'hemo', running: true, speed: 1, settling, D: new Float32Array(EN).fill(12), Q: new Float32Array(EN), metrics: {} });
type Rec = Record<(typeof KEYS)[number], number[]>;
interface St { fp: Record<string, unknown>; snap: unknown; base: unknown; params: unknown }

/** The slide's own state and the state the slider gives at x (settled, off screen, as the app works it out). */
async function states(deck: string, slide: string, param: string, xs: number[]): Promise<{ own: St; at: St[] }> {
  const d = (await copiedDecks()).find((x) => x.id === deck)!;
  const i = d.slides.findIndex((s) => s.id === slide);
  const seq = sequencer(1), core = createCore((m: never) => seq.message(m));
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps: chainOf(d.slides.slice(0, i + 1) as never), reqId: 1 });
  core.dispose();
  const own = seq.results[i + 1] as unknown as St;
  const at: St[] = [];
  for (const x of xs) {
    const got: St[] = [];
    const c = createCore((m: { type: string; i?: number }) => { if (m.type === 'seqStep') got[m.i!] = m as never; });
    c.handle({ type: 'run', running: false });
    await c.handle({ type: 'sequence', steps: [{ params: patchOf([param], x) }], base: own.base, reqId: 1 });
    c.dispose();
    at.push(got[0]!);
  }
  return { own, at };
}
/** The engine's own record of a vessel in a state, 8 s of the bedside clock. */
async function recordOf(snap: unknown, vessel: string): Promise<Rec> {
  const out: { type: string; samples?: Record<string, ArrayLike<number>> }[] = [];
  const core = createCore((m: never) => out.push(m));
  await core.handle({ type: 'init' });
  await core.handle({ type: 'run', running: false });
  await core.handle({ type: 'restore', snap });
  await core.handle({ type: 'probe', id: vessel });
  await core.handle({ type: 'history', secs: 8, reqId: 9 });
  for (let q = 0; q < 400 && !out.find((m) => m.type === 'history'); q++) await new Promise((r) => setTimeout(r, 25));
  const s = out.find((m) => m.type === 'history')?.samples;
  core.dispose();
  assert.ok(s?.t?.length, 'the engine gave a record');
  return Object.fromEntries(KEYS.map((k) => [k, Array.from(s![k]!).filter((_, i) => i % 5 === 0)])) as Rec;
}
const slice = (r: Rec, from: number, to: number, shift: number): Rec => Object.fromEntries(KEYS.map((k) => [k, r[k].slice(from, to).map((x) => (k === 't' ? x + shift : x))])) as Rec;
/** How deep the trace swings against its own mean over its last `s` seconds: the shape's size, whatever the scale the slide's pin gives it. */
const swing = (b: number[][], s: number): number => {
  const t1 = b[b.length - 1]![0]!, w = b.filter((q) => q[0]! > t1 - s).map((q) => q[1]!);
  const mean = w.reduce((a, x) => a + x, 0) / w.length;
  return (Math.max(...w) - Math.min(...w)) / Math.max(Math.abs(mean), 1);
};

/** Every Doppler slide with a what-if slider, in every deck (found, not listed): the slide, its slider's parameter and ends, the vessel and sample spot its instrument is set to. */
const sliders = async () => {
  const out: { deck: string; slide: string; param: string; lo: number; hi: number; vessel: string; gate: unknown }[] = [];
  for (const d of await copiedDecks()) {
    for (const sl of d.slides as CopiedSlide[]) {
      const w = (sl as unknown as { whatIf?: { param?: string | string[]; min: number; max: number } }).whatIf;
      if (!w?.param || (sl.tool as { kind?: string } | undefined)?.kind !== 'doppler') continue;
      const plan = planOf('doppler', sl.tool as never).doppler!;
      out.push({ deck: d.id, slide: sl.id as string, param: Array.isArray(w.param) ? w.param[0]! : w.param, lo: w.min, hi: w.max, vessel: plan.vessel, gate: plan.gate ?? null });
    }
  }
  return out;
};

test('every what-if slider on a Doppler slide is found (the six of today, none lost)', async () => {
  const got = (await sliders()).map((x) => `${x.deck}/${x.slide}`).sort();
  assert.ok(['outflow/tr', 'outflow/constrict', 'outflow/web', 'prehepatic/clot', 'shunts/tips', 'tips-doppler/warn'].every((k) => got.includes(k)), got.join());
});

for (const sl of ['outflow/tr', 'outflow/constrict', 'outflow/web', 'prehepatic/clot', 'shunts/tips', 'tips-doppler/warn']) test(`what-if slider, ${sl}: the replayed trace takes the shape of the value the slider is moved to, with no step`, async () => {
  const me = (await sliders()).find((x) => `${x.deck}/${x.slide}` === sl)!;
  const { at } = await states(me.deck, me.slide, me.param, [me.lo, me.hi]);
  // (the slide's own state is the card's first: the slider's high end, then moved to the low end and back)
  const [none, severe] = at as [St, St];
  const vessel = me.vessel;
  const recNone = await recordOf(none.snap, vessel), recSev = await recordOf(severe.snap, vessel);
  const rawNone = swing(recNone.t.map((t, i) => [t, recNone.vel[i]!]), 8), rawSev = swing(recSev.t.map((t, i) => [t, recSev.vel[i]!]), 8);
  const differ = Math.max(rawSev, rawNone) > Math.min(rawSev, rawNone) * 1.5 + 0.5;

  useDopplerProbe.setState({ probe: vessel, gate: me.gate as never });
  const feed = new SampleFeed(), m = new DopplerModel(); m.slide = true;
  let now = 1000; (clock as unknown as { now: () => number }).now = () => now;
  const give = (r: Rec) => { feed.adopt({ jump: false, probe: vessel, samples: Object.fromEntries(KEYS.map((k) => [k, r[k]])) } as never); };
  // the card comes up on the slide's own patient (severe): the model's record is that patient's
  setSlidePin(severe.fp as never);
  give(recSev);
  m.ingest(frame(), feed);
  for (let f = 0; f < 500; f++) { now += 16; m.ingest(frame(), feed); }
  assert.ok(m.pinned && (m as unknown as { synth: unknown }).synth, 'the replay stands');
  const before = swing(m.buf, 3);
  // the slider is moved to None: the pin follows at once, the live model lays the new patient's record (settling for its first moment), and the card's frames go on
  setSlidePin(none.fp as never);
  const t0 = feed.last + 0.02;
  const live = slice(recNone, 0, recNone.t.length, t0 - recNone.t[0]!);
  const per = 25, n = live.t.length;
  let worst = 0, seen = -Infinity, ownMax = 0;
  for (const r of [recSev, recNone]) for (let i = 1; i < r.vel.length; i++) ownMax = Math.max(ownMax, Math.abs(r.vel[i]! - r.vel[i - 1]!));
  for (let i = 0; i < n; i += per) {
    give(slice(live, i, i + per, 0));
    for (let f = 0; f < 31; f++) {   // (half a second of the card's frames per half second of record)
      now += 16; m.ingest(frame(i === 0), feed);
      for (let j = Math.max(1, m.buf.length - 40); j < m.buf.length; j++) { if (m.buf[j]![0]! <= seen) continue; worst = Math.max(worst, Math.abs(m.buf[j]![1]! - m.buf[j - 1]![1]!)); }
      seen = m.buf[m.buf.length - 1]![0]!;
    }
  }
  for (let f = 0; f < 700; f++) {   // (the record is out: the replay runs on its new template)
    now += 16; m.ingest(frame(), feed);
    for (let j = Math.max(1, m.buf.length - 40); j < m.buf.length; j++) { if (m.buf[j]![0]! <= seen) continue; worst = Math.max(worst, Math.abs(m.buf[j]![1]! - m.buf[j - 1]![1]!)); }
    seen = m.buf[m.buf.length - 1]![0]!;
  }
  const after = swing(m.buf, 3);
  if (differ) assert.ok(Math.abs(after - before) > 0.3 * Math.abs(rawSev - rawNone), `the trace's swing moved with the slider: ${before.toFixed(1)} at the high end, ${after.toFixed(1)} at the low (the engine's own: ${rawSev.toFixed(1)}, ${rawNone.toFixed(1)})`);
  assert.ok(Math.abs(after - rawNone) <= Math.max(1.5, rawNone * 0.5), `the low end's shape (${after.toFixed(1)} against the engine's ${rawNone.toFixed(1)})`);
  const meanNow = m.buf.slice(-150).reduce((a, q) => a + q[1]!, 0) / 150;
  const rawMean = (r: Rec) => Math.max(1, Math.abs(r.vel.reduce((a, x) => a + x, 0) / r.vel.length));
  assert.ok(worst <= ownMax * Math.max(1, Math.abs(meanNow) / Math.min(rawMean(recSev), rawMean(recNone))) * 2 + 1, `the trace never steps: steepest sample step ${worst.toFixed(1)} cm/s`);
  // and back up to Severe: it follows that way too
  setSlidePin(severe.fp as never);
  const back = slice(recSev, 0, recSev.t.length, feed.last + 0.02 - recSev.t[0]!);
  for (let i = 0; i < back.t.length; i += per) { give(slice(back, i, i + per, 0)); for (let f = 0; f < 31; f++) { now += 16; m.ingest(frame(i === 0), feed); } }
  for (let f = 0; f < 700; f++) { now += 16; m.ingest(frame(), feed); }
  assert.ok(Math.abs(swing(m.buf, 3) - rawSev) <= Math.max(1.5, rawSev * 0.5), `and back at the high end it is that shape (${swing(m.buf, 3).toFixed(1)} against ${rawSev.toFixed(1)})`);
  setSlidePin(null);
});

/** The bank's engine questions answered by the host on this thread. */
const nodeAsk = (): BankAsk => ({
  snapAt: async (base, paths, x) => {
    const got: { snap?: unknown }[] = [];
    const c = createCore((m: { type: string; i?: number }) => { if (m.type === 'seqStep') got[m.i!] = m as never; });
    c.handle({ type: 'run', running: false });
    await c.handle({ type: 'sequence', steps: [{ params: patchOf([...paths], x) }], base, reqId: 1 });
    c.dispose();
    return got[0]?.snap ?? null;
  },
  record: async (snap, vessel) => recordOf(snap, vessel),
  dispose: () => {},
});

// The slider DRAGGED: the pin has not landed and the live record has not settled (the first moments of a drag), and the trace already reshapes with the slider's value, from the engine's own beats at the
// values either side, with no step; and the value dragged back, the shape comes back.
for (const sl of ['outflow/tr', 'outflow/constrict', 'outflow/web', 'prehepatic/clot', 'shunts/tips', 'tips-doppler/warn']) test(`what-if slider, ${sl}: while it is dragged the trace reshapes with its value at once`, async () => {
  const me = (await sliders()).find((x) => `${x.deck}/${x.slide}` === sl)!;
  const w = (await copiedDecks()).find((d) => d.id === me.deck)!.slides.find((x) => x.id === me.slide) as unknown as { whatIf: { min: number; max: number; step: number } };
  const { own, at } = await states(me.deck, me.slide, me.param, [me.lo, me.hi]);
  const [lo, hi] = at as [St, St];
  const vessel = me.vessel, key = `${me.deck}/${me.slide}`;
  const recLo = await recordOf(lo.snap, vessel), recHi = await recordOf(hi.snap, vessel);
  const rawLo = swing(recLo.t.map((t, i) => [t, recLo.vel[i]!]), 8), rawHi = swing(recHi.t.map((t, i) => [t, recHi.vel[i]!]), 8);
  const spec = { key, vessel, base: own.base, paths: [me.param], stops: sliderStops({ min: w.whatIf.min, max: w.whatIf.max, step: w.whatIf.step }), start: me.hi };
  const bank = bankFor(spec, nodeAsk)!;
  await bank.loading;
  assert.ok(bank.beats.size >= 2, 'the bank has the ends');
  useDopplerProbe.setState({ probe: vessel, gate: me.gate as never });
  useSliderAt.setState({ key: null });
  const feed = new SampleFeed(), m = new DopplerModel(); m.slide = true; m.setBank(spec);
  let now = 1000; (clock as unknown as { now: () => number }).now = () => now;
  setSlidePin(hi.fp as never);
  feed.adopt({ jump: false, probe: vessel, samples: Object.fromEntries(KEYS.map((k) => [k, recHi[k]])) } as never);
  m.ingest(frame(), feed);
  for (let f = 0; f < 500; f++) { now += 16; m.ingest(frame(), feed); }
  assert.ok(m.pinned && (m as unknown as { synth: unknown }).synth, 'the replay stands');
  const before = swing(m.buf, 3);
  // the drag: the slider goes from the high end to the low in 40 frames, then rests; nothing else changes (no new pin, the record the same)
  let worst = 0, seen = m.buf[m.buf.length - 1]![0]!;
  const lap = (n: number, f: (i: number) => void) => { for (let i = 0; i < n; i++) { f(i); now += 16; m.ingest(frame(), feed); for (let j = Math.max(1, m.buf.length - 40); j < m.buf.length; j++) { if (m.buf[j]![0]! <= seen) continue; worst = Math.max(worst, Math.abs(m.buf[j]![1]! - m.buf[j - 1]![1]!)); } seen = m.buf[m.buf.length - 1]![0]!; } };
  lap(40, (i) => useSliderAt.setState({ key, x: me.hi + (me.lo - me.hi) * (i / 39) }));
  lap(250, () => {});
  const down = swing(m.buf, 3);
  // (what the bank can carry is the beat's shape by phase; a change that is the breath's alone is the settled record's to bring, so the expectation is the mean beats' own difference at the two ends)
  const range = (x: number) => { const b = bank.at(x)!; return Math.max(...b) - Math.min(...b); };
  const meanNow = Math.max(1, Math.abs(m.buf.slice(-150).reduce((a, q) => a + q[1]!, 0) / 150));
  const expected = (range(me.lo) - range(me.hi)) * (meanNow / Math.max(1, Math.abs(recHi.vel.reduce((a, x) => a + x, 0) / recHi.vel.length))) / meanNow;
  if (Math.abs(expected) > 0.15) assert.ok((down - before) * Math.sign(expected) >= 0.4 * Math.abs(expected), `the swing followed the slider within seconds: ${before.toFixed(1)} at the high end, ${down.toFixed(1)} dragged to the low (the mean beats say ${expected.toFixed(2)} more; the engine's own swings ${rawHi.toFixed(1)}, ${rawLo.toFixed(1)})`);
  lap(40, (i) => useSliderAt.setState({ key, x: me.lo + (me.hi - me.lo) * (i / 39) }));
  lap(250, () => {});
  const up = swing(m.buf, 3);
  assert.ok(Math.abs(up - before) <= Math.max(1.2, 0.35 * Math.abs(rawHi - rawLo), 0.5 * Math.abs(down - before)), `and back at the high end the shape is back: ${before.toFixed(1)}, ${up.toFixed(1)}`);
  const ownMax = Math.max(...[recHi, recLo].map((r) => r.vel.reduce((a, v, i) => (i ? Math.max(a, Math.abs(v - r.vel[i - 1]!)) : 0), 0)));
  assert.ok(worst <= ownMax * 2 + 1 + 0.3 * Math.abs(rawHi - rawLo) * 5, `no step while dragging: steepest sample step ${worst.toFixed(1)} cm/s (the engine's own beat steps ${ownMax.toFixed(1)})`);
  setSlidePin(null);
});
