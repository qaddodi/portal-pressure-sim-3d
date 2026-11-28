import { FOV, NARROW_STAGE, type Shot } from './shots.ts';
import { FRAMING_TILT_RAD } from './tilt.ts';

// Room first (look-and-feel.md section 8): the cards take their room, then the camera frames the subject in the free room left over,
// by shifting the projection centre. The art is never squeezed and the camera never fights the cards.

/** A rectangle in CSS pixels of the canvas: the free room the cards leave. */
export interface Room { x: number; y: number; w: number; h: number }

/** Fraction of the room the subject may fill; the rest is breathing room. */
export const FILL = 0.92;

export function fullRoom(width: number, height: number): Room { return { x: 0, y: 0, w: width, h: height }; }

/** The nearest camera distance at which the shot's half extents fit in the room. */
export function fitDistance(half: [number, number], room: Pick<Room, 'w' | 'h'>, viewportH: number, fill = FILL): number {
  const tan = Math.tan((FOV * Math.PI) / 360);
  const perPx = viewportH / (2 * tan); // pixels per world unit at distance 1
  const needW = (half[0] * 2) / (Math.max(room.w, 1) * fill);
  const needH = (half[1] * 2) / (Math.max(room.h, 1) * fill);
  return Math.max(needW, needH) * perPx;
}

/** How far inside the free room's edge a labelled station stands at least (px): room for its tag and leader (framing rule F3, docs/approved/framing-rules.md). */
export const KEEP_PX = 40;
/** Where the labelled stations stand in depth (the figure's plane, scene units: stationDot's z). */
export const KEEP_DEPTH = 0.03;

/**
 * How far inside the room's edge (px) a kept point stands at distance `d` when the camera is turned `dyaw`, `dpitch` about the shot's aim: the exact
 * pinhole projection of a point in the figure's plane.
 */
type Aimed = Pick<Shot, 'target'> & Partial<Pick<Shot, 'yaw' | 'pitch'>>;
function tiltedMargin(shot: Aimed, p: readonly number[], room: Pick<Room, 'w' | 'h'>, perPx: number, d: number, dyaw: number, dpitch: number): number {
  const yaw = (shot.yaw ?? 0) + dyaw, pitch = (shot.pitch ?? 0) + dpitch, cp = Math.cos(pitch), t = shot.target;
  const ex = t[0] + Math.sin(yaw) * cp * d, ey = t[1] + Math.sin(pitch) * d, ez = t[2] + Math.cos(yaw) * cp * d;
  const fx = (t[0] - ex) / d, fy = (t[1] - ey) / d, fz = (t[2] - ez) / d, rl = Math.hypot(fz, fx) || 1, rx = -fz / rl, rz = fx / rl;
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
  const qx = p[0]! - ex, qy = p[1]! - ey, qz = KEEP_DEPTH - ez;
  const Z = qx * fx + qy * fy + qz * fz || 1e-9;
  return Math.min(room.w / 2 - Math.abs((perPx * (qx * rx + qz * rz)) / Z), room.h / 2 - Math.abs((perPx * (qx * ux + qy * uy + qz * uz)) / Z));
}
const TILT_TURNS: readonly (readonly [number, number])[] = [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
/** The nearest distance at which every point the shot must keep stands KEEP_PX inside the room (0 for a shot with none). A point is judged from the shot's aim, which the room's middle shows. */
export function keepDistance(shot: Pick<Shot, 'target' | 'keep'> & Partial<Pick<Shot, 'yaw' | 'pitch'>>, room: Pick<Room, 'w' | 'h'>, viewportH: number): number {
  if (!shot.keep?.length) return 0;
  const perPx = viewportH / (2 * Math.tan((FOV * Math.PI) / 360));
  let d = 0;
  for (const p of shot.keep) {
    const dx = Math.abs(p[0] - shot.target[0]), dy = Math.abs(p[1] - shot.target[1]);
    // (px per unit at the nearest allowed distance d: the point stands d-independent offset * perPx / d from the middle; it must be at most half the room less the margin)
    if (dx > 0) d = Math.max(d, (dx * perPx) / Math.max(room.w / 2 - KEEP_PX, 1));
    if (dy > 0) d = Math.max(d, (dy * perPx) / Math.max(room.h / 2 - KEEP_PX, 1));
  }
  // the gentle tilt (tilt.ts; on slides too, 28 Nov) turns the camera about the aim by up to 5 degrees across and 3.5 up and down, which moves a station
  // that stands off the aim's depth: the room keeps the air for the worst corner of the tilt
  // (the least distance, found by halving between this one and a quarter further, at which every kept point still stands KEEP_PX inside the room at every corner)
  if (d > 0) {
    const ok = (dist: number, p: readonly number[]) => TILT_TURNS.every(([a, b]) => tiltedMargin(shot, p, room, perPx, dist, a * FRAMING_TILT_RAD, b * FRAMING_TILT_RAD) >= KEEP_PX);
    let need = d;
    for (const p of shot.keep!) {
      if (ok(need, p)) continue;
      let lo = need, hi = need * 1.25;
      if (!ok(hi, p)) { need = hi; continue; }
      for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (ok(mid, p)) hi = mid; else lo = mid; }
      need = hi;
    }
    d = need;
  }
  return d;
}

/** The distance to use: the shot's own, or further out when the free room is too small for it or for the stations it keeps. */
export function effectiveDistance(
  shot: Pick<Shot, 'r' | 'half' | 'halfNarrow' | 'target' | 'keep' | 'fill'> & Partial<Pick<Shot, 'yaw' | 'pitch'>>,
  room: Pick<Room, 'w' | 'h'>, viewportH: number, viewportW = Infinity,
): number {
  const half = shot.halfNarrow && viewportW < NARROW_STAGE ? shot.halfNarrow : shot.half;
  return Math.max(shot.r, fitDistance(half, room, viewportH, shot.fill), keepDistance(shot, room, viewportH));
}

/** The projection shift (pixels) that moves the picture's centre from the middle of the canvas to the middle of the room. */
export function viewOffset(room: Room, width: number, height: number): { x: number; y: number } {
  return { x: width / 2 - (room.x + room.w / 2), y: height / 2 - (room.y + room.h / 2) };
}
