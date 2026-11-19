// The pure parts of the measurement card (2D tool-reading.js): which script a slide's procedure is drawn with, and what the monitor shows for the procedure clocks. No React, so node can hold them to the decks.
import { scriptOf, phaseOf, takenOf, readingWords, readingTitle } from '../tests/ir/copied/reading-scripts.copied.js';

export interface Script { id: string; kinds: string[]; clock: { now(tk: Record<string, number>): number }; vals(fp: unknown, o: Record<string, number>): Record<string, number>; marks: number[]; keys: string[] }

/** The script a slide's procedure is drawn with (null: no card follows it), and the card's title. Pure. */
export function readingPlan(procedure: unknown, of?: unknown): { script: Script | null; title: string } {
  const script = (scriptOf((procedure ?? of) as never) ?? null) as Script | null;
  return { script, title: readingTitle((procedure ?? of) as never) as string };
}

/** What the monitor shows for the procedure clocks `tk` (kind: ms) at the script's own time. Pure. */
export function readingAt(S: Script, tk: Record<string, number>, v: Record<string, number>): { ph: string; t: number; taken: boolean[]; words: string } {
  const ph = phaseOf(S, tk) as string, t = S.clock.now(tk), taken = takenOf(S, tk) as boolean[];
  return { ph, t: Number.isFinite(t) ? t : 0, taken, words: readingWords(S, v, taken) as string };
}

