// Where the foot note stands (the toast: the first-run hint "Click a vessel or the liver to change it.", a preset's note), measured by the Toast and published for the figure's labels: 2D stands a note
// above the dock (toast-foot.js) and a name under it is unreadable, so the lobule's and the sinusoid's names keep out of its rectangle while it shows and come back, as the layer settles, when it goes.
// Set when the note shows, hides or changes size; never per frame.
import { create } from 'zustand';

export interface FootRect { x0: number; y0: number; x1: number; y1: number }
export const useFootNote = create<{ rect: FootRect | null }>(() => ({ rect: null }));

/** The note's rect (CSS px, the screen's), or null when it is not showing. A rect that has not changed leaves the store alone. */
export function setFootNote(rect: FootRect | null): void {
  const r = useFootNote.getState().rect;
  if (r === rect || (r && rect && r.x0 === rect.x0 && r.y0 === rect.y0 && r.x1 === rect.x1 && r.y1 === rect.y1)) return;
  useFootNote.setState({ rect });
}

/** What a label keeps out of: the note's rect with a little air (4 px, the solver's AIR_BLOCKER less its own). */
export const FOOT_AIR = 4;
export function footBlocker(rect: FootRect | null): FootRect | null {
  return rect ? { x0: rect.x0 - FOOT_AIR, y0: rect.y0 - FOOT_AIR, x1: rect.x1 + FOOT_AIR, y1: rect.y1 + FOOT_AIR } : null;
}
