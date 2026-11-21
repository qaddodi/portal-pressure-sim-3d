// The Circuit's turn follows the screen: upright when it is taller than wide, wide when it is wider (user, 21 Nov 2026). Every way in (view switch, talk slide, deep link)
// asks `entryUpright()`; a turn of the screen while the map shows is followed by `followScreen` (view-actions.ts), eased. The turn button still changes it until the screen turns.
import { create } from 'zustand';

/** True when the screen is taller than wide. */
export function screenPortrait(w = typeof window === 'undefined' ? 0 : window.innerWidth, h = typeof window === 'undefined' ? 0 : window.innerHeight): boolean { return h > w; }

export const useCircuitTurn = create<{ upright: boolean; set(on: boolean): void }>((set) => ({
  upright: screenPortrait(),
  set: (on) => set({ upright: on }),
}));

/** The turn to enter the Circuit with: the screen's own. */
export function entryUpright(): boolean {
  const on = screenPortrait();
  if (useCircuitTurn.getState().upright !== on) useCircuitTurn.getState().set(on);
  return on;
}
