// What the scene reads from the UI: the shot and catheter state of the slide on show, and the figure's free room.
// (The scene never reads the deck itself; it reads these and frames the subject in `boxes.free`.)

import { viewAt, lastSlideShot, type View } from './presenter-machine.ts';
import type { UiState } from '../ui-store.ts';

export function selectView(s: Pick<UiState, 'stops' | 'pos'>): View | null {
  return s.stops.length ? viewAt(s.stops, s.pos, lastSlideShot(s.stops)) : null;
}
export const selectShot = (s: Pick<UiState, 'stops' | 'pos'>) => selectView(s)?.shot ?? 'plate';
export const selectCath = (s: Pick<UiState, 'stops' | 'pos'>) => selectView(s)?.cath ?? null;
export const selectFree = (s: Pick<UiState, 'boxes'>) => s.boxes.free;
