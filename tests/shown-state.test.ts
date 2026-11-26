// One state for the slide on show (src/ui/talk/shown-state.ts). Mohammad, 26 Nov (Landmark trials 3, PREDESCI): "Those buttons change nothing. What's the point?" A press of None put the HVPG
// tracing at 10.6 while the line, the figure's callouts and the tiles still read the slide's own 9.8: only the data card read the pressed state. This presses the beta-blocker response on that slide,
// on the engine host in node (no browser), and checks that every reader of the slide (the words' and callouts' readings, the tiles, the data card) prints the pressed patient's numbers, and that
// leaving the slide lets the press go.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { chainOf, sequencer, type StepResult } from '../src/decks/hp/numbers.ts';
import { loadSource } from '../src/decks/source.ts';
import { toDeck } from '../src/decks/hp/deck.ts';
import { variantStateOf, type Seq } from '../src/ui/talk/variant-state.ts';
import { useVariant } from '../src/ui/talk/variant-words.ts';
import { withVariant, shownResult, releaseVariantOff, variantAt } from '../src/ui/talk/shown-state.ts';
import { readingsOf } from '../src/decks/hp/readings-of.ts';
import { tilesAt } from '../src/ui/cards/tiles-2d.ts';
import { levelsOf } from '../src/ui/talk/hvpg-plan.ts';
import { valueText } from '../src/ui/text/tokens.ts';
import type { CopiedSlide } from '../src/decks/hp/types.ts';

const nodeSeq: Seq = async (steps, base) => {
  const got: { fp?: unknown; snap?: unknown; params?: unknown }[] = [];
  const core = createCore((m: { type: string; i?: number; fp?: unknown; snap?: unknown; params?: unknown }) => { if (m.type === 'seqStep') got[m.i!] = m; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps, base, reqId: 1 });
  core.dispose();
  return got;
};
const LIVE = { whvp: null, fhvp: null, hvpg: null, ivc: null, ra: null, pv: null };

test('Landmark trials 3: the beta-blocker response moves the words, the callouts, the tiles and the tracing together', async () => {
  const copied = await loadSource('landmark-trials');
  const deck = toDeck(copied);
  const slides = copied.slides as CopiedSlide[];
  const seq = sequencer(1), core = createCore((m: never) => seq.message(m));
  core.handle({ type: 'run', running: false });
  const i = slides.findIndex((s) => s.id === 'predesci-test');
  await core.handle({ type: 'sequence', steps: chainOf(slides.slice(0, i + 1)), reqId: 1 });
  core.dispose();
  const results = (seq.results as StepResult[]).slice(1);
  const ctl = deck.slides[i]!.controls?.compare;
  assert.ok(ctl, 'the slide has its response buttons');
  const key = `${deck.id}/${deck.slides[i]!.id}`;
  const ownText = valueText('hvpg', results[i]!.fp);
  useVariant.getState().set(key, null, null);
  assert.equal(withVariant(deck.id, results), results, 'nothing pressed: the same results back');
  for (const o of ctl.opts.filter((x) => !x.own)) {
    const got = await variantStateOf(nodeSeq, new Map(), { slideKey: key }, o, results[i], undefined);
    assert.ok(got?.state, `${o.label}: a state`);
    useVariant.getState().set(key, null, got.state);
    const pressed = got.state.fp, want = valueText('hvpg', pressed);
    assert.notEqual(want, ownText, `${o.label}: the press changes the HVPG the slide prints (${ownText})`);
    const shown = withVariant(deck.id, results)!;
    // the words and the figure's callouts (decks/hp/link.ts: the readings are the shown state's)
    assert.equal(valueText('hvpg', readingsOf(shown[i]!.fp, LIVE)), want, `${o.label}: the words and callouts`);
    // the tiles (TilesCard: tilesAt over the shown states)
    const t = tilesAt(slides, shown as never, i, true)!, t0 = tilesAt(slides, results as never, i, true)!;
    const fall = (x: typeof t) => x.tiles.find((v) => v.k === 'hvpgFall')?.text;
    assert.ok(fall(t0), 'the slide has its HVPG fall tile');
    assert.notEqual(fall(t), fall(t0), `${o.label}: the HVPG fall tile moves (${fall(t0)} → ${fall(t)})`);
    // the HVPG tracing (the data card: HvpgTool's levels of the shown state)
    const lv = levelsOf(shownResult(deck.id, results, i)!.fp as never)!;
    assert.equal(`${lv.hvpg.toFixed(1)} mmHg`, want, `${o.label}: the tracing`);
    // the other slides are their own
    for (let j = 0; j < results.length; j++) if (j !== i) assert.equal(shown[j], results[j], `${o.label}: slide ${j + 1} untouched`);
  }
  // another slide on show lets the press go
  releaseVariantOff(`${deck.id}/${deck.slides[i + 1]!.id}`);
  assert.equal(variantAt(deck.id), null, 'leaving the slide lets the press go');
  assert.equal(withVariant(deck.id, results), results);
});
