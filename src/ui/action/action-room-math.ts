// The action card's share of the room, pure (see action-room.ts).
import type { Room as Rect } from '../../scene/camera/room.ts';

/** The part of the sheet that stands over the figure's room: its height less the 8 px it overlaps the foot, plus a 6 px breath; never more than half the room, so a tall card still leaves the figure a place. */
export const takenBy = (cardH: number, room: Rect): number => (cardH > 0 ? Math.min(room.h * 0.55, Math.max(0, cardH - 8 + 6)) : 0);

/** The room left over: the same box with the card's share off its bottom. */
export function roomAbove(room: Rect, cardH: number): Rect {
  const t = takenBy(cardH, room);
  return t > 0 ? { ...room, h: Math.max(0, room.h - t) } : room;
}
