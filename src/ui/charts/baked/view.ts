// A deck's states as the charts read them: the live ones (decks/hp/calc.ts, with their snapshots) where the second engine has worked them out, the baked ones (key.ts, store.ts) in every slot it has not.
// A chart therefore never waits on the worker for the readings of a state: its first frame has them. A baked state carries `baked: true` and no snapshot: anything that must START from the state
// (a live sweep, a what-if) waits for the live one (`settled`).
import type { StepResult } from '../../../decks/hp/numbers.ts';
import { bakedById } from './store.ts';

export type ViewState = StepResult & { baked?: true };

/** The states of a deck for a chart: live where there, else baked. The live array itself when nothing is baked (so a memo keyed on it holds). */
export function mergeStates(deckId: string, live: readonly (StepResult | undefined)[] | undefined): readonly (ViewState | undefined)[] | undefined {
  const b = bakedById(deckId);
  if (!b) return live;
  if (live && live.length >= b.states.length && live.every(Boolean)) return live;
  const n = Math.max(live?.length ?? 0, b.states.length), out: (ViewState | undefined)[] = [];
  for (let i = 0; i < n; i++) {
    const l = live?.[i], s = b.states[i];
    out[i] = l ?? (s ? ({ fp: s.fp, snap: undefined, params: s.params, trail: s.trail, start: s.start, before: s.before, baked: true } as ViewState) : undefined);
  }
  return out;
}

/** Whether a state can start a sweep or a what-if: a live one (a baked one has no snapshot). */
export const settled = (r: ViewState | undefined): boolean => !!r && !r.baked;
