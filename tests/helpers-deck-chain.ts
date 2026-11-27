// The engine's own state at each slide of a deck, in node, by the host's `sequence` (no browser): for tests that judge a chart or a card on every slide of every deck.
// One chain a deck, kept for the next test and run again only for a later slide.
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { chainOf, sequencer, changes } from '../src/decks/hp/numbers.ts';
import { deckOrder, loadBuiltin } from '../src/decks/registry.ts';
import { copiedOf } from '../src/decks/hp/deck.ts';
import type { CopiedDeck, CopiedSlide } from '../src/decks/hp/types.ts';

export type Result = { fp?: Record<string, number | null>; params?: unknown } | undefined;
let all: Promise<CopiedDeck[]> | null = null;
/** Every talk's copied words, in the registered order. */
export const copiedDecks = (): Promise<CopiedDeck[]> => (all ??= (async () => {
  const out: CopiedDeck[] = [];
  for (const id of deckOrder()) { await loadBuiltin(id); const c = copiedOf(id); if (c) out.push(c); }
  return out;
})());
const runs = new Map<string, { n: number; run: Promise<Result[]> }>();
/** The engine's result at each slide of a deck up to slide `upto` (index i is slide i). */
export function resultsOf(d: CopiedDeck, upto = d.slides.length - 1): Promise<Result[]> {
  const had = runs.get(d.id);
  if (had && had.n >= upto) return had.run;
  const run = (async () => {
    const seq = sequencer(1);
    const core = createCore((m: never) => seq.message(m));
    core.handle({ type: 'run', running: false });
    await core.handle({ type: 'sequence', steps: chainOf(d.slides.slice(0, upto + 1) as never), reqId: 1 });
    core.dispose();
    return d.slides.slice(0, upto + 1).map((_, i) => seq.results[i + 1] as Result);
  })();
  runs.set(d.id, { n: upto, run });
  return run;
}
/** stateOf[j]: the slide whose state slide j shows (the chart cards' own rule). */
export const stateOfSlides = (slides: readonly CopiedSlide[]): number[] => { let last = 0; return slides.map((s, j) => (j === 0 || changes(s as never) ? (last = j) : last)); };
