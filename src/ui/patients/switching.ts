// A patient is being switched: the numbers shown roll to the new patient's instead of landing at once (the model's own numbers never blend; only what is shown travels).
// Set when the load starts, cleared a moment after the new patient's first frames are in, so the first change of each tile happens inside the window.
import { create } from 'zustand';

export const SWITCH_WINDOW_MS = 900;
export const useSwitching = create<{ on: boolean }>(() => ({ on: false }));
let timer: ReturnType<typeof setTimeout> | undefined;
export function switchBegins(): void { clearTimeout(timer); useSwitching.setState({ on: true }); timer = setTimeout(switchEnds, 4000); }   // (a load that never answers lets go)
export function switchLands(): void { clearTimeout(timer); timer = setTimeout(switchEnds, SWITCH_WINDOW_MS); }
export function switchEnds(): void { clearTimeout(timer); useSwitching.setState({ on: false }); }
