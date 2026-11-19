// What the last tap on the lobule picked, for the tap-anything card (ui/action/boot.ts turns it into the selection, as it does the scene's vessel picks). The scene writes it; null: a tap on nothing.
import { create } from 'zustand';

export interface LobuleSelection { type: 'lobule'; part?: string; zone?: number }
export const useLobulePick = create<{ picked: LobuleSelection | null; n: number }>(() => ({ picked: null, n: 0 }));
/** A tap landed on `sel` (or on nothing). `n` counts taps, so a second tap on the same part is seen (it puts the card away, as a second tap on a vessel does). */
export function lobulePicked(sel: LobuleSelection | null): void { useLobulePick.setState((s) => ({ picked: sel, n: s.n + 1 })); }
