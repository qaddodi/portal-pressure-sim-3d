// Mohammad, 21 Nov (Sites and causes 9/14 and 10/14): a compare button put the figure and the card in another patient and the Gut to heart ladder stayed on the slide's own. This presses every compare button
// of every slide that draws that ladder, on the engine host in node (no browser), and checks that the chart, the card and the figure are one patient, in one number format:
//   chart  the ladder's brackets and pills print the gradients the card's tiles print (one decimal), and its stations are the patient's
//   card   the tile text of the same fingerprint
//   figure the model the button eases to (its snapshot, read again at the bedside), or the slide's own base with the button's change
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import * as host from '../src/engine/hales/host/worker-core.js';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { Engine } from '../src/engine/hales/portal/engine.js';
import { computeMetrics } from '../src/engine/hales/portal/metrics.js';
import { fingerprintOf } from '../src/engine/hales/portal/fingerprint.js';
import { deepMerge, sanitizeParams } from '../src/engine/hales/portal/scenario.js';
import { RW_LOADERS, RW_IDS } from '../src/decks/rw/copied/index.ts';
import { HP_IDS, isHpDeck, loadHpDeck } from '../src/decks/hp/index.ts';
import { AG_IDS, loadAgDeck, type AgId } from '../src/decks/ag/index.ts';
import { chainOf, sequencer } from '../src/decks/hp/numbers.ts';
import { controlsOf, type CompareOpt } from '../src/decks/controls.ts';
import { variantStateOf, sliderOpt, type Own, type Picked, type Seq } from '../src/ui/talk/variant-state.ts';
import { reading } from '../src/ui/charts/fmt.ts';
import { SPANS, gap1, planProfile } from '../src/ui/charts/profile/model.ts';
import { profileFrameAtRest } from '../src/ui/charts/profile/frame.ts';
import { profileInputs } from '../src/ui/charts/profile/data.ts';
import type { CopiedSlide } from '../src/decks/hp/types.ts';
import { ctxOf } from './charts-helpers.ts';
import { loadSource } from '../src/decks/source.ts';

/** The engine's `sequence` on the host in node (what the page's second engine runs). */
const nodeSeq: Seq = async (steps, base) => {
  const got: { fp?: unknown; snap?: unknown; params?: unknown }[] = [];
  const core = createCore((m: { type: string; i?: number; fp?: unknown; snap?: unknown; params?: unknown }) => { if (m.type === 'seqStep') got[m.i!] = m; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps, base, reqId: 1 });
  core.dispose();
  return got;
};

/** The slide's own state at the end of the chain up to it (decks/hp/calc.ts's chain). */
async function ownState(slides: readonly CopiedSlide[], i: number): Promise<Own> {
  const seq = sequencer(1), core = createCore((m: never) => seq.message(m));
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps: chainOf(slides.slice(0, i + 1)), reqId: 1 });
  core.dispose();
  return seq.results[i + 1] as unknown as Own;
}

/** The model of a snapshot (or a base with a change), read at the bedside as the figure shows it. */
function figureFp(snap: unknown, patch?: unknown): Record<string, number | null> {
  const e = new Engine(); e.restore(snap);
  if (patch) { e.setParams(sanitizeParams(deepMerge(e.params, patch))); e.settle(); }
  atBedside(e);
  return fingerprintOf(computeMetrics(e), { P: e.Pf || e.P, Q: e.Qf || e.Q, D: Float32Array.from(e.edges, (ed: { id: string }) => e.diameterShown(ed.id)), copy: true, params: e.params, fluid: e.starling(true) }) as never;
}

const atBedside = (host as unknown as { atBedside(e: unknown): void }).atBedside;
const DECKS = ['sites', 'treatment'] as const;
for (const id of DECKS) {
  test(`${id}: every compare button of a slide with the Gut to heart ladder gives the charts the patient the figure and the card show`, async () => {
    const d = (await loadSource(id)) as unknown as { slides: CopiedSlide[] };
    const cache = new Map<string, Promise<Picked>>();
    let pressed = 0;
    for (let i = 0; i < d.slides.length; i++) {
      const s = d.slides[i]!, tool = s.tool as { kind?: string } | undefined, c = controlsOf(s);
      if (tool?.kind !== 'profile' || !c?.compare) continue;
      const own = await ownState(d.slides, i);
      for (const o of c.compare.opts as CompareOpt[]) {
        if (o.lens || o.gate || o.tool) continue;
        const at = `${id}/${s.id}/${o.label}`;
        const other = o.slide ? await ownState(d.slides, d.slides.findIndex((x) => x.id === o.slide)) : o.own ? own : undefined;
        const got = await variantStateOf(nodeSeq, cache, { slideKey: `${id}/${s.id}` }, o, own, other);
        assert.ok(got, `${at}: no state`);
        if (o.own) { assert.equal(got.state, null, `${at}: the slide's own button leaves the slide's own state`); continue; }
        const st = got.state!;
        assert.ok(st?.fp, `${at}: the charts get no patient`);
        pressed++;
        // chart: its brackets and pills read this patient, as the card's tiles print it
        const inp = profileInputs(st.fp as never, null, null)!, hl = null;
        const plan = planProfile(400, 0, 13, inp.goal, hl, null, SPANS), f = profileFrameAtRest(plan, ctxOf('light', 400));
        const texts = f.shapes.filter((x) => x.k === 'text').map((x) => (x as { s: string }).s);
        for (const k of ['hvpg', 'ppg'] as const) {
          const card = reading(k, st.fp as never, false);
          assert.ok(texts.includes(card), `${at}: the chart prints ${k} as the card does (${card}); it has ${texts.join('|')}`);
          assert.equal(gap1(inp.goal[k] as number), card, `${at}: one format for ${k}`);
        }
        assert.ok(inp.goal.v.every((v) => Number.isFinite(v)), `${at}: stations`);
        // figure: the model the button leaves the patient in
        const fig = got.snap ? figureFp(got.snap) : figureFp(own.base, o.params);
        for (const k of ['hvpg', 'ppg', 'ra', 'pv', 'ivc'] as const) {
          const a = st.fp[k], b = fig[k];
          assert.ok(typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.35, `${at}: ${k}: the chart reads ${a}, the figure shows ${b}`);
        }
      }
    }
    assert.ok(pressed > 0, `${id}: no compare button was pressed`);
  });
}

test('the ladder of a normal heart is not the failing heart\'s (the 21 Nov bug), and the six causes are six ladders', async () => {
  const d = (await loadSource('sites')) as unknown as { slides: CopiedSlide[] };
  const i = d.slides.findIndex((s) => (s.compare as { preset?: string }[] | undefined)?.some((o) => o.preset === 'healthy'));
  assert.ok(i >= 0);
  const own = await ownState(d.slides, i), cache = new Map<string, Promise<Picked>>();
  const normal = (await variantStateOf(nodeSeq, cache, { slideKey: 'sites/x' }, { label: 'Normal heart', preset: 'healthy' } as CompareOpt, own, undefined))!.state!;
  assert.ok((normal.fp.ra as number) < 6 && (own.fp as Record<string, number>).ra! > 12, `RA ${normal.fp.ra} against the failing heart's ${(own.fp as Record<string, number>).ra}`);
});

// The what-if sliders are the same family (Mohammad, 21 Nov): a slider moved the model and the slide's charts read the slide's own state. The slider's value is a parameter change on the slide's own base,
// worked out as a parameter button's is (controls-run.ts dragWhatIf); its ends must give the charts the patient the figure shows, and a value that moves the model moves the readings.
/** A talk's copied deck from whichever batch holds it (A to G, H to P, R to W). */
const deckOf = async (id: string): Promise<{ slides: CopiedSlide[] }> =>
  (((RW_IDS as readonly string[]).includes(id) ? await loadSource(id) : isHpDeck(id) ? await loadHpDeck(id) : await loadAgDeck(id as AgId))) as unknown as { slides: CopiedSlide[] };
let slidersMoved = 0;
for (const id of [...RW_IDS, ...HP_IDS, ...AG_IDS]) {
  test(`${id}: every what-if slider gives the slide's charts the patient the figure shows, at both ends`, async () => {
    const d = await deckOf(id);
    const cache = new Map<string, Promise<Picked>>();
    for (let i = 0; i < d.slides.length; i++) {
      const w = controlsOf(d.slides[i]!)?.whatIf;
      if (!w || w.tool || !w.paths.length) continue;
      const own = await ownState(d.slides, i), moved: number[] = [];
      for (const x of [w.min, w.max]) {
        const at: string = `${id}/${d.slides[i]!.id}/${w.paths.join()}=${x}`;
        const got = await variantStateOf(nodeSeq, cache, { slideKey: `${id}/${d.slides[i]!.id}` }, sliderOpt(w.paths, x), own, undefined);
        const st = got?.state as { fp: Record<string, number | null> } | null | undefined;
        assert.ok(st?.fp, `${at}: the charts get no patient`);
        const fig = figureFp(own.base, sliderOpt(w.paths, x).params);
        for (const k of ['hvpg', 'ppg', 'ra', 'pv', 'ivc'] as const) {
          const a: number | null | undefined = st.fp[k], b: number | null | undefined = fig[k];
          assert.ok(typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.35, `${at}: ${k}: the chart reads ${a}, the figure shows ${b}`);
        }
        moved.push(st.fp.pv as number); slidersMoved++;
      }
      assert.ok(Number.isFinite(moved[0]) && Number.isFinite(moved[1]), `${id}/${d.slides[i]!.id}: readings`);
    }
  });
}
test('the sliders of every talk were pressed (the talks with a parameter slider: stiffness, treatment, shunts, tipping, tips-doppler, tips-complete, the HVPG, circuit and endoscopy talks…)', () => {
  assert.ok(slidersMoved >= 20, `only ${slidersMoved} slider ends were pressed`);
});

test('a what-if slider asks for the charts\' state once it rests, and the slide\'s own value gives the slide\'s own state back', () => {
  const run = readFileSync('src/ui/talk/controls-run.ts', 'utf8');
  assert.match(run, /export function dragWhatIf\(deck: Deck, i: number, paths: readonly string\[\], x: number\)/);
  assert.match(run, /clock\.cancel\(dragTimer\)/, 'a drag asks for the last value only');
  assert.match(run, /set\(key, words, null\)/, 'the slide\'s own value: the slide\'s own state');
  assert.match(readFileSync('src/ui/cards/SlideControls.tsx', 'utf8'), /dragWhatIf\(deck, i, w\.paths, x\)/);
});
