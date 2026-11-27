// The room an open action card takes from the figure (Mohammad, 21 Nov, iPhone: the DIPS card covered the stent it describes). On a device whose card is a sheet over the bottom of the figure, the card's own
// height (measured by the card, never read from the layout) is taken off the room the camera frames the figure in, so the figure pans up into what is left and never zooms; closing the card gives it back.
import { create } from 'zustand';
import type { Room as Rect } from '../../scene/camera/room.ts';
import { M } from '../shell/metrics.ts';

export const useActionRoom = create<{ h: number; over: boolean; set(h: number, over?: boolean): void }>((set) => ({ h: 0, over: false, set: (h, over = h > 0) => set((s) => (Math.abs(s.h - h) < 1 && s.over === over ? s : { h, over })) }));

// The card's share of the room, pure numbers.
/** The part of the sheet that stands over the figure's room. `cardH` is the card less the view pill's slot (it stands over it); the room's own foot is the dock's top + that slot + 8 px, and the card's foot is the dock's top + `gap`,
 *  so the overlap is cardH + gap - 8; plus a 6 px breath; never more than 55 % of the room, so a tall card still leaves the figure a place. */
export const takenBy = (cardH: number, room: Rect, gap: number = M.sheetGap): number => (cardH > 0 ? Math.min(room.h * 0.55, Math.max(0, cardH + gap - 8 + 6)) : 0);

/** The room left over: the same box with the card's share off its bottom. */
export function roomAbove(room: Rect, cardH: number, gap: number = M.sheetGap): Rect {
  const t = takenBy(cardH, room, gap);
  return t > 0 ? { ...room, h: Math.max(0, room.h - t) } : room;
}

/** The tallest an action sheet may stand: from 6 px under the top bar down to its foot (`cardFoot`, above the bottom safe area: sheetFoot(), the dock's top and the one gap over it). */
export const cardMaxHeight = (vpH: number, safeTop: number, topBar: number, safeBottom: number, cardFoot: number): number =>
  Math.max(140, Math.floor(vpH - safeTop - topBar - 6 - (safeBottom + cardFoot)));
