// The ways into a case from the rest of the page (docs/approved/play-the-case.md): "Play the case" on a model patient's card in the Histories menu and in its History panel, and History's
// "Show on the figure" while a case plays. Light on purpose: the case's own code (run.ts, with the slides' planner its shots go through) is read only when a case is played, so the first
// load does not grow by it. What the doors read (the case's state and its stops) is small.
import { useCase } from './store.ts';
import { nearestStop } from './stops.ts';
import type { Stop } from './types.ts';

/** the case's own code, read once, on the first Play */
const run = () => import('./run.ts');

/** Play a model patient's case from its first stop. False when it could not start (not a model patient, or its history could not be read). */
export async function playCase(id: string): Promise<boolean> {
  return (await run()).startCase(id);
}

/** Whether a case is playing (waiting at a stop, or on its way to the next). */
export const casePlaying = (): boolean => { const p = useCase.getState().phase; return p === 'stop' || p === 'travel'; };

/** History's "Show on the figure" while a case plays: the case goes to that moment's stop instead of being left. A moment that is a stop has the stop's entry (both are the last of its day
 *  that kept the model); a moment that is not one (a key moment the course dropped) goes to the stop nearest its day, the earlier on a tie. Kept simple: the case never stands between
 *  stops, so the figure lands on a stop's own model and the case waits there as at any other. False when no case is playing (History moves the figure itself). */
export function showInCase(entry: number, day: number): boolean {
  if (!casePlaying()) return false;
  const at = stopFor(useCase.getState().stops, entry, day);
  void run().then((m) => m.goStop(at));
  return true;
}
/** The stop a History moment goes to: the one standing on its entry, else the one nearest its day. */
export function stopFor(stops: readonly Stop[], entry: number, day: number): number {
  const i = stops.findIndex((s) => s.entry === entry);
  return i >= 0 ? i : nearestStop(stops, day);
}
