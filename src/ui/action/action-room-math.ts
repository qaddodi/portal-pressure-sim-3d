// The action card's share of the room, pure (see action-room.ts).
import type { Room as Rect } from '../../scene/camera/room.ts';
import { M } from '../shell/metrics.ts';

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
