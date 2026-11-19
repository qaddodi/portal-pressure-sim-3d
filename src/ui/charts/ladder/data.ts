// The six ladders' numbers from the engine (2D: presenter-question.js rowsOf, the deck's states and the healthy base). Each row is a slide of the deck (its own state, from the
// deck's chain of states: src/decks/rw/numbers.ts) or a patient no slide shows (a fresh model with its preset and parameters), and the healthy patient is the dashed
// reference the red blocks are judged against. `run` is the worker's 'sequence' (EngineClient.sequence): a test hands it a fake.
import { deckFingerprints, type Fingerprint, type RunSteps, type Step } from '../../../decks/rw/numbers.ts';
import type { CopiedDeck } from '../../../decks/rw/types.ts';
import { extraStep, rowsOf, type Fp, type LadderRow, type OfRow } from './model.ts';

export interface LadderData { rows: LadderRow[]; healthy: Fp | null }
const states = new WeakMap<object, Promise<Fingerprint[]>>();
/** The deck's states, worked out once per deck. */
export function deckStates(deck: CopiedDeck, run: RunSteps): Promise<Fingerprint[]> {
  let p = states.get(deck);
  if (!p) { p = deckFingerprints(deck, run); states.set(deck, p); p.catch(() => states.delete(deck)); }
  return p;
}

/** The steps for the rows that bring a patient of their own, preceded by the healthy patient. Each starts on a fresh model (a preset starts the patient over). */
export const extraSteps = (of: readonly OfRow[]): Step[] => [{ preset: 'healthy' }, ...of.map(extraStep).filter((s): s is NonNullable<typeof s> => !!s).map((s) => ({ ...s, restart: true }) as Step)];

/** The slide's rows and the healthy reference. */
export async function ladderData(slide: { of?: readonly OfRow[] }, deck: CopiedDeck, run: RunSteps): Promise<LadderData> {
  const of = slide.of ?? [];
  const [fps, ex] = await Promise.all([deckStates(deck, run), run(extraSteps(of))]);
  return { rows: rowsOf(of, deck.slides as never, fps as Fp[], ex.slice(1) as Fp[]), healthy: (ex[0] as Fp) ?? null };
}
