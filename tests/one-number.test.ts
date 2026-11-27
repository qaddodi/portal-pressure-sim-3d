// One number, one value (capture 3531bdfa, group G3: the same quantity printed different values on the words, the tiles, the chart, the figure's labels and across devices; project rule 11).
// The rules pinned here, over every slide that can be worked out in node (the engine host, no browser):
//  1. a reading prints at its tile's precision in the words as everywhere else: {hvpg:0} no longer prints "3" beside a chart's 3.4 (every line, title and button line of every deck);
//  2. the figure's station labels print the slide's own pressures while the live model rests on the slide's state (scene/labels/settled.ts), so a label can never print another digit than the
//     slide's number for the station, at any beat of the live model; away from the slide's state (easing, a time-lapse, a held strain, a slider) the label is the live one;
//  3. a time-lapse chart starts at the state its days are lived from, not at the state its arrows count from (17.4 began at the pre-cure 11.1 where slide 3 ended at 7.3);
//  4. the header of the beta-blocker path prints the MAP the blood pressure prints, "117/69 (85)", not the model's own mean rounded (79 against 80);
//  5. a compare button that names another slide holds that slide's words in the card (so its height is decided once), and every button's words print the button's own state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { chainOf, sequencer, stepOf, type StepResult } from '../src/decks/hp/numbers.ts';
import { loadSource } from '../src/decks/source.ts';
import { UI } from '../src/ui/strings.generated.ts';
import { TILE } from '../src/ui/charts/tiles.generated.ts';
import { tokensOf, valueText, parseToken } from '../src/ui/text/tokens.ts';
import { parseWords } from '../src/decks/rw/numbers.ts';
import { controlsOf, speaks } from '../src/decks/controls.ts';
import { variantsOf } from '../src/ui/cards/variants.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { variantStateOf, replayOf, type Seq } from '../src/ui/talk/variant-state.ts';
import { fmtPressure } from '../src/ui/text/line.ts';
import { stationP } from '../src/ui/action/read.ts';
import { NODES } from '../src/engine/hales/portal/topology.js';
import { atRest, settledFrame, REST_P } from '../src/scene/labels/settled.ts';
import { flowStartOf } from '../src/ui/talk/flow-start.ts';
import { flowTimeSeries } from '../src/ui/charts/flowtime/model.ts';
import { patientOf } from '../src/ui/charts/path/model.ts';
import { bedsideMean } from '../src/engine/hales/portal/bedside-mean.js';
import type { CopiedSlide } from '../src/decks/hp/types.ts';

const nodeSeq: Seq = async (steps, base) => {
  const got: { fp?: unknown; snap?: unknown; params?: unknown }[] = [];
  const core = createCore((m: { type: string; i?: number; fp?: unknown }) => { if (m.type === 'seqStep') got[m.i!] = m; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps, base, reqId: 1 });
  core.dispose();
  return got;
};
async function resultsOf(id: string, upTo: number): Promise<{ slides: CopiedSlide[]; res: StepResult[] }> {
  const d = await loadSource(id), slides = d.slides as CopiedSlide[];
  const seq = sequencer(1), core = createCore((m: never) => seq.message(m));
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps: chainOf(slides.slice(0, upTo + 1)), reqId: 1 });
  core.dispose();
  return { slides, res: (seq.results as StepResult[]).slice(1) };
}

test('1. a reading prints at its tile\'s precision in every line: {key:0} is whole only where the tile prints a whole number', async () => {
  let seen = 0;
  const probe = { hvpg: 3.4, ppg: 15.6, eus: 14.9, pv: 20.6, varix: 4.9, hr: 71.4, plt: 82, liver: 64.6 } as Record<string, number>;
  for (const d of UI.decks) {
    let c: { slides: Record<string, unknown>[] };
    try { c = await loadSource(d.id) as never; } catch { continue; }
    const texts: string[] = [];
    for (const s of c.slides) {
      for (const f of ['line', 'title', 'kicker']) if (typeof s[f] === 'string') texts.push(s[f] as string);
      for (const o of (s.compare as { line?: string; title?: string }[] | undefined) ?? []) for (const t of [o.line, o.title]) if (typeof t === 'string') texts.push(t);
    }
    for (const text of texts) {
      for (const m of text.matchAll(/\{(\w+):0\}/g)) {
        const key = m[1]!, tk = parseToken(m[0].slice(1, -1));
        assert.equal(tk.kind, 'value');
        const whole = valueText(key, probe, (tk as { whole: boolean }).whole), plain = valueText(key, probe, false);
        assert.equal(whole, plain, `${d.id}: {${key}:0} prints ${whole}, its tile prints ${plain}`);
        const w = parseWords(m[0]).find((p) => p.t === 'value') as { decimals: number | null } | undefined;
        assert.equal(w?.decimals ?? null, TILE[key]?.d === 0 ? 0 : null, `${d.id}: {${key}:0} in the rw words`);
        seen++;
      }
    }
  }
  assert.ok(seen >= 6, `the decks use {key:0} (${seen})`);
});

test('2. a station label prints the slide\'s own pressure while the live model rests on its state, at any beat', async () => {
  const { slides, res } = await resultsOf('hyperdynamic', 6);
  const i = 6, r = res[i]!, fp = r.fp as Record<string, number> & { at: { P: Float32Array; Q: Float32Array } };
  assert.ok(fp.at?.P, 'the fingerprint holds the node pressures');
  const core = createCore(() => undefined);
  core.handle({ type: 'run', running: false });
  const e = core.engine() as { restore(s: unknown): void; step(dt: number): void; quiet: boolean; beat: boolean; P: Float64Array; Pf: Float64Array; Q: Float64Array; Qf: Float64Array };
  e.restore(r.snap); e.quiet = false; e.beat = true;
  const NI: Record<string, number> = Object.fromEntries((NODES as { id: string }[]).map((n, k) => [n.id, k]));
  const STATIONS: [string, string][] = [['CONF', 'pv'], ['SIN_R', 'whvp'], ['RHV', 'fhvp'], ['RA', 'ra'], ['IVCS', 'ivc']];
  let strayed = 0, checked = 0;
  for (let t = 0; t < 40; t += 0.004) {
    e.step(0.004);
    if (t < 30 || Math.round(t * 250) % 25) continue;
    const frame = { P: Float32Array.from(e.P), Pf: Float32Array.from(e.Pf), Q: Float32Array.from(e.Q), Qf: Float32Array.from(e.Qf), metrics: {} };
    assert.ok(atRest(frame, fp), `the model rests on the slide's state (t=${t.toFixed(1)})`);
    const view = settledFrame(frame, fp)!;
    for (const [node, key] of STATIONS) {
      const label = fmtPressure(stationP(view as never, node, view.Pf)), words = valueText(key, fp).replace(/ mmHg$/, '');
      // (the label prints the slide's number: the key's own reading, rounded once)
      assert.equal(label, words, `${node} label ${label} against the slide's ${key} ${words}`);
      if (fmtPressure(frame.Pf[NI[node]!]!) !== words) strayed++;
      checked++;
    }
  }
  core.dispose();
  assert.ok(checked >= 20);
  void slides;
  // (the proof the live frame alone was a second reading: some beat of the live model printed another digit than the slide's number)
  assert.ok(strayed > 0, `the live frame printed another digit than the slide somewhere (${strayed} of ${checked})`);
});

test('2b. away from the slide\'s state the label is the live frame\'s, and a free model is never pinned', () => {
  const P = Float32Array.from([10, 20, 30]), Q = Float32Array.from([1, 2]);
  const fp = { pv: 12, at: { P: Float32Array.from([10, 20.1, 30]), Q: Float32Array.from([1, 2]) } };
  const frame = { P, Pf: P, Q, Qf: Q, metrics: {} };
  assert.equal(settledFrame(frame, fp as never)!.Pf, fp.at.P, 'at rest: the slide\'s pressures');
  const easing = { ...frame, Pf: Float32Array.from([10, 20 + 2 * REST_P, 30]) };
  assert.equal(settledFrame(easing, fp as never), easing, 'easing to the state: the live frame');
  assert.equal(settledFrame(frame, null), frame, 'no slide: the live frame');
  const flowing = { ...frame, Qf: Float32Array.from([1, 3]) };
  assert.equal(settledFrame(flowing, fp as never), flowing, 'flows away from the state (a time-lapse, a procedure): the live frame');
  assert.equal(settledFrame(null, fp as never), null);
});

test('3. a time-lapse chart starts at the state its days are lived from', async () => {
  const { slides, res } = await resultsOf('cause-treated', 3);
  const i = slides.findIndex((s) => s.id === 'year2'), s = slides[i]!;
  const tool = s.tool as { lines: string[]; clock: string }, delta = String((s as { delta?: unknown }).delta);
  assert.equal(tool.clock, 'days');
  const lines = tool.lines, at = (j: number) => res[j]!.fp as Record<string, number>;
  const ref = at(slides.findIndex((x) => x.id === delta)), prev = at(i - 1);
  assert.notEqual(ref.hvpg!.toFixed(1), prev.hvpg!.toFixed(1), 'the delta names an earlier state than the slide before\'s');
  const before = flowStartOf(true, prev, ref)!;
  const ser = flowTimeSeries(res[i]!.trail as never, 'days', lines, null, { before: before as never })!;
  assert.equal(ser.pv[0]!.toFixed(1), prev.hvpg!.toFixed(1), 'the first point is where slide 3 ended');
  assert.notEqual(ser.pv[0]!.toFixed(1), ref.hvpg!.toFixed(1));
  assert.equal(flowStartOf(false, prev, ref), ref, 'a meal chart keeps the delta\'s state');
});

test('4. the beta-blocker path prints the MAP the blood pressure prints', () => {
  let different = 0;
  for (let sbp = 95.2; sbp < 140; sbp += 3.37) for (let dbp = 55.4; dbp < 90; dbp += 2.41) {
    const raw = dbp + (sbp - dbp) / 3, fp = { sbp, dbp, map: raw };
    const words = valueText('map', fp as never), n = Number(/\((\d+)\)/.exec(words)![1]);
    const p = patientOf('holdcarv', { held: false, hrs: false }, fp as never) as { map: number };
    assert.equal(p.map, n, `${words}: the path header says MAP ${p.map}`);
    assert.equal(n, Math.round(bedsideMean(Math.round(sbp), Math.round(dbp))));
    if (Math.round(raw) !== n) different++;
  }
  assert.ok(different > 0, 'the old rounding would have disagreed somewhere in the sweep');
});

test('5. a button that names another slide holds that slide\'s words; every pressed button prints its own state', { timeout: 300_000 }, async () => {
  let named = 0;
  for (const d of UI.decks) {
    const deck = await loadBuiltin(d.id);
    if (!deck) continue;
    for (const s of deck.slides) {
      const opts = s.controls?.compare?.opts ?? [];
      if (!opts.some((o) => o.slide)) continue;
      assert.ok(speaks(opts), `${deck.id}/${s.id}: a row of buttons that name slides speaks`);
      const list = variantsOf(s, deck);
      for (const o of opts) {
        if (!o.slide) continue;
        const at = deck.slides.find((x) => x.id === o.slide)!;
        // (the slide keeps its own title, owner 27 Nov L7: only the named slide's line is held)
        assert.ok(list.some((w) => w.title === s.title && w.line === at.line), `${deck.id}/${s.id}: "${o.label}" holds ${o.slide}'s line under this slide's title`);
        named++;
      }
    }
  }
  assert.ok(named >= 5, `compare buttons that name a slide (${named})`);
  // the words of a button print the button's own run: prehepatic 4 "No anticoagulation" (the review's 03.5: "the PPG is still 4.0" over a patient at 14.1)
  const { slides, res } = await resultsOf('prehepatic', 4);
  const i = slides.findIndex((s) => s.id === 'anticoag'), s = slides[i]!, c = controlsOf(s)!.compare!;
  const replay = replayOf(stepOf(s) as never, res[i - 1]);
  for (const o of c.opts.filter((x) => !x.own)) {
    const got = await variantStateOf(nodeSeq, new Map(), { slideKey: 'prehepatic/anticoag', ...(replay && o.how === 'params' ? { replay } : {}) }, o, res[i], undefined);
    const fp = got!.state!.fp as never, own = res[i]!.fp as never;
    const text = String(o.line ?? s.line), keys = tokensOf(text).flatMap(({ token }) => (token.kind === 'value' && !token.at ? [token.key] : []));
    assert.ok(keys.length > 0);
    for (const k of keys) assert.notEqual(valueText(k, fp), valueText(k, own), `${o.label}: {${k}} differs from the slide's own`);
    assert.ok((fp as Record<string, number>).ppg! > 10, 'untreated, the PPG stays high');
  }
});
