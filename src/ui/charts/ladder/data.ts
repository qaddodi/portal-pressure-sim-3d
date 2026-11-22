// The six ladders' numbers from the engine (2D: presenter-question.js rowsOf, the deck's states and the healthy base). Each row is a slide of the deck (its own state, from the
// deck's chain of states: src/decks/rw/numbers.ts) or a patient no slide shows (a fresh model with its preset and parameters), and the healthy patient is the dashed
// reference the red blocks are judged against. `run` is the worker's 'sequence' (EngineClient.sequence): a test hands it a fake.
import { deckFingerprints, type Fingerprint, type RunSteps, type Step } from '../../../decks/rw/numbers.ts';
import { bakedById } from '../baked/store.ts';
import type { CopiedDeck } from '../../../decks/rw/types.ts';
import { extraStep, rowsOf, type Fp, type LadderRow, type OfRow } from './model.ts';

export interface LadderData { rows: LadderRow[]; healthy: Fp | null }
/** The rows baked at build time for a slide (null: not baked). */
export const bakedLadders = (slide: { id?: string }, deck: { id: string }): LadderData | null => (bakedById(deck.id)?.ladders[slide.id ?? ''] as LadderData | undefined) ?? null;
const states = new WeakMap<object, Promise<Fingerprint[]>>();
/** The deck's states: the talk's own, which it has already worked out for its cards (decks/hp/calc.ts: slide i at results[i]; entry 0 the outline, which reads the first slide's); only a deck it has not, worked out once. */
export async function deckStates(deck: CopiedDeck, run: RunSteps): Promise<Fingerprint[]> {
  // (the store is loaded when asked, so this module and its tests need no store of their own to stand: a missing one is the old run)
  const talk = await import('../../../decks/hp/calc.ts').then((m) => m.useStates.getState().results[deck.id], () => undefined);
  if (talk?.length) { const fps = talk.map((r) => (r?.fp ?? {}) as Fingerprint); return [fps[0]!, ...fps]; }
  let p = states.get(deck);
  if (!p) { p = deckFingerprints(deck, run); states.set(deck, p); p.catch(() => states.delete(deck)); }
  return p;
}

/** The steps for the rows that bring a patient of their own, preceded by the healthy patient. Each starts on a fresh model (a preset starts the patient over). */
export const extraSteps = (of: readonly OfRow[]): Step[] => [{ preset: 'healthy' }, ...of.map(extraStep).filter((s): s is NonNullable<typeof s> => !!s).map((s) => ({ ...s, restart: true }) as Step)];

/** The slide's rows and the healthy reference. */
export async function ladderData(slide: { id?: string; of?: readonly OfRow[] }, deck: CopiedDeck, run: RunSteps): Promise<LadderData> {
  const baked = bakedLadders(slide, deck);
  if (baked) return baked;
  const of = slide.of ?? [];
  const [fps, ex] = await Promise.all([deckStates(deck, run), run(extraSteps(of))]);
  return { rows: rowsOf(of, deck.slides as never, fps as Fp[], ex.slice(1) as Fp[]), healthy: (ex[0] as Fp) ?? null };
}
