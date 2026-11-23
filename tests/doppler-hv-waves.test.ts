// Hepatic vein Doppler on a slide (Mohammad, 23 Nov, "Restore a, v, S, D waves on hepatic Doppler"): the slide's own patient plays as a replay of the record (tests/doppler-pin.test.ts). The replay was cut at
// 1 s of clock time, part-way through a beat, and its loop blended the late diastole (where the atrial reversal sits) into the start: the trace had V-shaped dips, nothing above the baseline, "Biphasic",
// and the display put the baseline at the top (no room for a reversal). The replay now loops whole beats (about a breath's worth) and joins their ends level. For every hepatic vein slide that names its waves:
// the patient's own record through the engine in node (no browser), the slide's state pinned, the replay read as the page reads it: the same pattern word as the live record, and for the healthy patient the four
// waves named in order (a above the baseline, S and D below it, v between them) with room above the baseline. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { loadAgDeck } from '../src/decks/ag/index.ts';
import { loadHpDeck } from '../src/decks/hp/index.ts';
import { chainOf, sequencer } from '../src/decks/hp/numbers.ts';
import { SampleFeed } from '../src/ui/tests/feed.ts';
import { DopplerModel } from '../src/ui/tests/doppler/model.ts';
import { hvWaves } from '../src/ui/tests/doppler/waves.ts';
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

test('a hepatic vein slide replays its patient with its waves: the same pattern as the live record, the four waves named on the healthy one', async () => {
  const hits = await hepaticSlides();
  assert.ok(hits.length >= 4, `${hits.length} hepatic vein slides that name their waves`);
  const bad: string[] = [];
  for (const h of hits) {
    const rec = await liveRecord(h.preset, h.vessel);
    const pieces = chunks(rec);
    useDopplerProbe.setState({ probe: h.vessel, gate: null });
    // (the live record alone: what the instrument reads off the Tests card, no slide)
    setSlidePin(null);
    const feed0 = new SampleFeed(); const live = new DopplerModel();
    for (const p of pieces) { feed0.adopt({ jump: false, probe: h.vessel, samples: p } as never); live.ingest(frame(), feed0); }
    const want = live.report().pattern;
    // (the slide: its state pinned, the record growing half a second at a time, then ten seconds of replay)
    setSlidePin(h.fp as never);
    const feed = new SampleFeed(); const m = new DopplerModel() as Any; m.slide = true; m.configure({ waves: true });
    let first: string | null = null;
    for (const p of pieces) { feed.adopt({ jump: false, probe: h.vessel, samples: p } as never); m.ingest(frame(), feed); }
    for (let k = 0; k < 40; k++) {
      if (m.synth) m.synth.wall -= 250;
      m.ingest(frame(), feed);
      if (m.synth && first == null) first = m.report().pattern;
    }
    assert.ok(m.synth && m.tpl, `${h.deck}/${h.id}: the replay is standing`);
    const rep = m.report();
    const tag = `${h.deck}/${h.id} (${h.preset})`;
    if (rep.pattern !== want) bad.push(`${tag}: reads "${rep.pattern}", its live record reads "${want}"`);
    if (first !== want) bad.push(`${tag}: the replay's first reading is "${first}", not "${want}"`);
    // the template is whole beats: it starts and ends on beat marks and holds at least 3 s
    assert.ok(m.tpl.L >= 3, `${tag}: the template holds ${m.tpl.L.toFixed(2)} s`);
    const marks: number[] = []; for (let j = Math.max(0, m.beatN - 16); j < m.beatN; j++) marks.push(m.rd.beatT[j % 16]);
    const near = (x: number) => marks.some((b) => Math.abs(b - x) < 0.021);
    if (!near(m.tpl.t0) || !near(m.tpl.t0 + m.tpl.L)) bad.push(`${tag}: the template is cut part-way through a beat`);
    if (h.preset === 'healthy') {
      const tNow = m.buf[m.buf.length - 1][0] as number, sgn = m.rd.pol() as number;
      const w = hvWaves(m.buf, tNow - 6, tNow, sgn);
      assert.ok(w, `${tag}: a, S, v and D are named on a beat of the replay`);
      const [a, S, v, D] = w!;
      assert.deepEqual([a[2], S[2], v[2], D[2]], ['a', 'S', 'v', 'D']);
      const ys = (m.buf as number[][]).filter((q) => q[0]! >= tNow - 6).map((q) => sgn * q[1]!), top = Math.max(...ys), bot = Math.min(...ys);
      assert.ok(top > 0.5, `${tag}: the atrial reversal rises above the baseline (${top.toFixed(1)})`);
      assert.ok(a[1] > bot * 0.15, `${tag}: the a wave sits at the baseline (${a[1].toFixed(1)}, the deepest forward flow ${bot.toFixed(1)})`);
      assert.ok(S[1] < -5 && D[1] < -5, `${tag}: S and D are below it (${S[1].toFixed(1)}, ${D[1].toFixed(1)})`);
      assert.ok(a[0] < S[0] && S[0] < v[0] && v[0] < D[0], `${tag}: in the order a, S, v, D`);
      assert.ok(v[1] > S[1] && v[1] > D[1], `${tag}: v is the turn toward the baseline between the two troughs`);
      assert.ok(D[0] - S[0] > 0.2, `${tag}: S and D are two minima`);
      m.frameFor(400, 190, 1000, rep.aria);
      assert.ok(m.scaleSt.baseF > 0.12, `${tag}: the baseline leaves room above it for the reversal (${m.scaleSt.baseF})`);
      assert.equal(rep.pattern, 'Triphasic');
    }
  }
  setSlidePin(null);
  assert.deepEqual(bad, []);
});
