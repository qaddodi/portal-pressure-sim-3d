// Plan 42, part B (Mohammad, 23 Nov: the acute clot slide read "31 cm/s Hepatopetal" in a portal vein the slide itself has occluded). A reading instrument on a slide shows the slide's own patient
// (tests/slide/pin.ts: "at any moment of the slide"), but the Doppler adopted the pin only once the live record had already landed on it; part-way through the model's eased change it showed the
// in-between patient. Now a pinned slide's record is the replay (the lapse's own synth) scaled to the pin from the first frame. For EVERY Doppler slide of every tour: its own state through the
// engine in node, a live record of a DIFFERENT patient (healthy), and the model must read the pin. Node only, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { loadAgDeck, AG_IDS } from '../src/decks/ag/index.ts';
import { loadHpDeck, HP_IDS } from '../src/decks/hp/index.ts';
import { RW_IDS } from '../src/decks/rw/copied/index.ts';
import { DECKS as RW } from '../src/decks/rw/copied/all.ts';
import { chainOf, sequencer } from '../src/decks/hp/numbers.ts';
import type { CopiedDeck } from '../src/decks/hp/types.ts';
import { SampleFeed } from '../src/ui/tests/feed.ts';
import { DopplerModel } from '../src/ui/tests/doppler/model.ts';
import { useDopplerProbe } from '../src/ui/tests/doppler/probe-state.ts';
import { setSlidePin } from '../src/ui/tests/slide/pin.ts';
import { planOf } from '../src/ui/talk/instruments.ts';
import { dopplerVel } from '../src/scene/lenses/vel-normal.copied.js';
import { EDGES, dopplerK } from '../src/engine/hales/portal/topology.js';
import { EI } from '../src/ui/tests/doppler/copied/doppler-tables.copied.js';

const EN = (EDGES as unknown[]).length;
const frame = () => ({ clock: 'hemo', running: true, speed: 1, settling: false, D: new Float32Array(EN).fill(12), Q: new Float32Array(EN), metrics: {} });
const bump = (ph: number, at: number, w: number, h: number) => h * Math.exp(-(((ph - at) / w) ** 2));
/** A healthy portal vein as the live model would be sampling it, if the slide's own change had not yet reached it: 20 cm/s with its beat. */
function live(rec: SampleFeed, probe: string, secs: number, mean: number) {
  const n = Math.round(secs * 50), t: number[] = [], v: number[] = [], ph: number[] = [];
  for (let i = 0; i < n; i++) { const tt = i / 50, p = (tt / 0.8) % 1; t.push(tt); ph.push(p); v.push(mean + 4 * bump(p, 0.3, 0.15, 1) - 2 * bump(p, 0.7, 0.1, 1)); }
  rec.adopt({ jump: false, probe, samples: { t, vel: v, ph, pvVel: v.map(() => NaN), hvVel: v.map(() => NaN) } } as never);
}

interface Hit { deck: string; slide: string; probe: string; at: { Q: ArrayLike<number>; D: ArrayLike<number> }; fp: Record<string, unknown> }

test('every Doppler slide of every tour reads its own patient from the first frame, whatever the live model is at', async () => {
  const all = [...(await Promise.all(AG_IDS.map((id) => loadAgDeck(id)))), ...(await Promise.all(HP_IDS.filter((id) => id !== 'hvpg').map((id) => loadHpDeck(id)))), ...RW_IDS.map((id) => RW[id]!)] as unknown as CopiedDeck[];
  const hits: Hit[] = [];
  for (const d of all) {
    const idx = d.slides.map((s, i) => ({ s, i })).filter((x) => (x.s.tool as { kind?: string } | undefined)?.kind === 'doppler');
    if (!idx.length) continue;
    const last = idx[idx.length - 1]!.i;
    const seq = sequencer(1);
    const core = createCore((m: never) => seq.message(m));
    core.handle({ type: 'run', running: false });
    await core.handle({ type: 'sequence', steps: chainOf(d.slides.slice(0, last + 1)), reqId: 1 });
    core.dispose();
    for (const { s, i } of idx) {
      const fp = seq.results[i + 1]?.fp as Record<string, unknown> | undefined;
      const at = fp?.at as { Q?: ArrayLike<number>; D?: ArrayLike<number> } | undefined;
      assert.ok(at?.Q && at.D, `${d.id}/${s.id}: the slide's state has flows and widths`);
      hits.push({ deck: d.id, slide: s.id, probe: planOf('doppler', s.tool as never).doppler!.vessel, at: at as never, fp: fp! });
    }
  }
  assert.ok(hits.length >= 35, `${hits.length} Doppler slides`);
  const none: string[] = [], bad: string[] = [];
  for (const h of hits) {
    const k = (EI as Record<string, number>)[h.probe];
    if (k == null) { bad.push(`${h.deck}/${h.slide}: no vessel ${h.probe}`); continue; }
    const pin = dopplerVel({ Q: h.at.Q, D: h.at.D }, k) as number;
    // the slide's own state is pinned, the live record is a healthy patient's 20 cm/s: the model reads the pin
    setSlidePin(h.fp as never);
    useDopplerProbe.setState({ probe: h.probe, gate: null });
    const rec = new SampleFeed(); live(rec, h.probe, 9, 20);
    const m = new DopplerModel(); m.slide = true;
    m.ingest(frame(), rec);
    const rep = m.report();
    if (rep.acquiring) { bad.push(`${h.deck}/${h.slide}: still acquiring with nine seconds recorded`); continue; }
    // (a stent's reading is the pin at the sample spot: its gate's factor, 1 on a vein)
    const want = Math.abs(pin) * ((m as unknown as { rd: { gateFactor(): number } }).rd.gateFactor());
    const shown = Math.abs(Number(String(rep.vel).replace('\u2212', '-')));
    if (!(Math.abs(shown - want) <= (want < 10 ? 0.06 : 0.51))) bad.push(`${h.deck}/${h.slide} ${h.probe}: shows ${rep.vel} cm/s, the slide's own is ${want.toFixed(1)}`);
    if (Math.abs(pin) < 0.5) none.push(`${h.deck}/${h.slide}`);
    if (Math.abs(pin) < 0.5 && !(rep.none && rep.dir === 'No flow')) bad.push(`${h.deck}/${h.slide}: an occluded vessel reads "${rep.dir}", not "No flow"`);
  }
  assert.deepEqual(bad, []);
  assert.ok(none.includes('prehepatic/clot'), `the acute clot slide has no flow (${none.join(', ')})`);
  setSlidePin(null);
});

test('off a slide (no pin) the Doppler stays live: the Tests card reads what the model does', () => {
  setSlidePin(null);
  useDopplerProbe.setState({ probe: 'PV_TRUNK', gate: null });
  const rec = new SampleFeed(); live(rec, 'PV_TRUNK', 9, 20);
  const m = new DopplerModel(); m.ingest(frame(), rec);
  const rep = m.report();
  const k = dopplerK((EDGES as { id: string }[])[(EI as Record<string, number>).PV_TRUNK!]);   // (the record is the mean across the lumen; the scanner reads the peak: k times it)
  assert.ok(Math.abs(Number(rep.vel) - 20 * k) < 3, `reads the live 20 as the scanner does (${(20 * k).toFixed(1)}), got ${rep.vel}`);
  assert.equal(m.pinned, false);
});

test('a slide whose velocity changes eases to it (the replay\'s mean follows the pin), and the record leaves the pin when the card does', () => {
  useDopplerProbe.setState({ probe: 'PV_TRUNK', gate: null });
  const k = (EI as Record<string, number>).PV_TRUNK!;
  const D = new Float32Array(EN).fill(12), Q = new Float32Array(EN);
  const pinAt = (q: number) => { Q[k] = q; setSlidePin({ at: { Q: Float32Array.from(Q), D } } as never); return dopplerVel({ Q, D }, k) as number; };
  const v0 = pinAt(3);
  const rec = new SampleFeed(); live(rec, 'PV_TRUNK', 9, 20);
  const m = new DopplerModel(); m.slide = true; m.ingest(frame(), rec);
  assert.ok(Math.abs(Number(String(m.report().vel).replace('\u2212', '-')) - Math.abs(v0)) <= 0.51, 'on the first slide it reads its own');
  const v1 = pinAt(0);
  assert.equal(v1, 0);
  for (let i = 0; i < 400; i++) m.ingest(frame(), rec);
  assert.equal(m.pinned, true);
  setSlidePin(null);
  assert.equal(m.pinned, false, 'off the slide the model is live again');
});
