import { FOV, NARROW_STAGE, type Shot } from './shots.ts';

// Room first (look-and-feel.md section 8): the cards take their room, then the camera frames the subject in the free room left over,
// by shifting the projection centre. The art is never squeezed and the camera never fights the cards.

/** A rectangle in CSS pixels of the canvas: the free room the cards leave. */
export interface Room { x: number; y: number; w: number; h: number }

/** Fraction of the room the subject may fill; the rest is breathing room. */
export const FILL = 0.92;

export function fullRoom(width: number, height: number): Room { return { x: 0, y: 0, w: width, h: height }; }

/** The nearest camera distance at which the shot's half extents fit in the room. */
export function fitDistance(half: [number, number], room: Pick<Room, 'w' | 'h'>, viewportH: number): number {
  const tan = Math.tan((FOV * Math.PI) / 360);
  const perPx = viewportH / (2 * tan); // pixels per world unit at distance 1
  const needW = (half[0] * 2) / (Math.max(room.w, 1) * FILL);
  const needH = (half[1] * 2) / (Math.max(room.h, 1) * FILL);
  return Math.max(needW, needH) * perPx;
}

/** How far inside the free room's edge a labelled station stands at least (px): room for its tag and leader (framing rule F3, docs/approved/framing-rules.md). */
export const KEEP_PX = 40;
/** The nearest distance at which every point the shot must keep stands KEEP_PX inside the room (0 for a shot with none). A point is judged from the shot's aim, which the room's middle shows. */
export function keepDistance(shot: Pick<Shot, 'target' | 'keep'>, room: Pick<Room, 'w' | 'h'>, viewportH: number): number {
  if (!shot.keep?.length) return 0;
  const perPx = viewportH / (2 * Math.tan((FOV * Math.PI) / 360));
  let d = 0;
  for (const p of shot.keep) {
    const dx = Math.abs(p[0] - shot.target[0]), dy = Math.abs(p[1] - shot.target[1]);
    // (px per unit at the nearest allowed distance d: the point stands d-independent offset * perPx / d from the middle; it must be at most half the room less the margin)
    if (dx > 0) d = Math.max(d, (dx * perPx) / Math.max(room.w / 2 - KEEP_PX, 1));
    if (dy > 0) d = Math.max(d, (dy * perPx) / Math.max(room.h / 2 - KEEP_PX, 1));
  }
  return d;
}

/** The distance to use: the shot's own, or further out when the free room is too small for it or for the stations it keeps. */
export function effectiveDistance(shot: Pick<Shot, 'r' | 'half' | 'halfNarrow' | 'target' | 'keep'>, room: Pick<Room, 'w' | 'h'>, viewportH: number, viewportW = Infinity): number {
  const half = shot.halfNarrow && viewportW < NARROW_STAGE ? shot.halfNarrow : shot.half;
  return Math.max(shot.r, fitDistance(half, room, viewportH), keepDistance(shot, room, viewportH));
}

/** The projection shift (pixels) that moves the picture's centre from the middle of the canvas to the middle of the room. */
export function viewOffset(room: Room, width: number, height: number): { x: number; y: number } {
  return { x: width / 2 - (room.x + room.w / 2), y: height / 2 - (room.y + room.h / 2) };
}
