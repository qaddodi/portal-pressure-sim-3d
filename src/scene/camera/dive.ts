// The dive (atlas-look-plan WP8): the pure numbers of the move Anatomy -> Lobule -> Sinusoid and its exact reverse. Nothing here touches the GPU or the clock; scene.ts and
// camera/rig.ts read them, tests/scene-dive-wp8.test.ts holds them.
//
// Two kinds of number live here, and the difference is what makes the way out the way in run backward:
//   - the LENS (fovBump) is the camera's own, a function of how far through THIS move it is, with the move's start carried (so a move reversed half-way never jumps);
//   - everything else the picture does (the liver's cutaway window, the field's focus, the body's dissolve) is a function of the camera's DISTANCE from the place dived to,
//     so going in and coming out is the same picture run both ways, and reversing mid-move is the same picture run back.
import { FOV } from './shots.ts';

/** How long each dive takes (ms): body to lobule 1.6 s, lobule to sinusoid 1.1 s, body straight to the sinusoid the two together (and back). A move that is none of those keeps `fallback`. */
export const DIVE_BODY_MS = 1600, DIVE_SINUSOID_MS = 1100;
export type DiveView = 'body' | 'circuit' | 'lobule' | 'sinusoid';
export function diveMs(from: DiveView, to: DiveView, fallback?: number): number | undefined {
  if (from === to) return fallback;
  const inside = (v: DiveView) => v === 'lobule' ? 1 : v === 'sinusoid' ? 2 : 0;
  const a = inside(from), b = inside(to);
  if (a === b) return fallback;   // body and Circuit (the map's own length is the caller's)
  if (Math.min(a, b) === 0) return Math.abs(a - b) === 2 ? DIVE_BODY_MS + DIVE_SINUSOID_MS : DIVE_BODY_MS;
  return DIVE_SINUSOID_MS;
}

/** The widest the lens goes in the plunge (degrees): 14 -> 35 -> back to the long lens (atlas plan §6: the dolly zoom that makes a dive feel like going INTO something). */
export const DIVE_FOV = 35;
/** The part of a body-sized dive's time the lens is widening and narrowing: 0.3 s to 1.3 s of 1.6 s. */
export const BUMP_FROM = 0.3 / 1.6, BUMP_TO = 1.3 / 1.6;
/** A move is a plunge into the figure (and gets the lens) when the two distances differ by this much (the body to the lobule is 200 to 1; lobule to sinusoid is 20 to 1: no lens). */
export const PLUNGE_RATIO = 60;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** The lens's share (0 the long lens, 1 the widest) at fraction `u` (0..1) of a plunge: zero outside 0.3 s to 1.3 s, a smooth bell inside. */
export function fovBell(u: number): number {
  if (u <= BUMP_FROM || u >= BUMP_TO) return 0;
  const s = Math.sin((Math.PI * (u - BUMP_FROM)) / (BUMP_TO - BUMP_FROM));
  return s * s;
}
/** The lens's share `u` of the way through a move that began with the lens at `carried` (a move reversed mid-plunge): the carried share lets go over the first third of the move, the move's
 *  own bell (`plunge`) rides on top, and the sum never passes 1. At u = 0 it is exactly `carried`: nothing jumps. */
export function fovBump(u: number, carried: number, plunge: boolean): number {
  const keep = carried * (1 - smooth(0, 0.33, u));
  return Math.min(1, keep + (plunge ? fovBell(u) : 0));
}
/** The vertical field of view (degrees) at a lens share. */
export const fovAt = (bump: number, base = FOV): number => base + (DIVE_FOV - base) * clamp01(bump);
/** The distance that keeps the subject the size it was when the lens widens (the dolly zoom): the camera comes in by the same ratio the tangent grows. */
export const dollyDistance = (r: number, fov: number, base = FOV): number => (r * Math.tan((base * Math.PI) / 360)) / Math.tan((fov * Math.PI) / 360);

// ---- what follows the camera's distance to the place dived to (the liver's point) -------------------------------------------------------------------------------

/** The cutaway window in the liver's wash opens as the camera comes in from CUT_FAR to CUT_NEAR scene units from the place (the nearest body shot sits at about 6.5, the body dissolves from 1.9). */
export const CUT_FAR = 5.5, CUT_NEAR = 1.9;
/** How far (ndc half-heights) the soft edge of the window reaches past its clear part. */
export const CUT_SOFT = 0.3;
/** How open the window is with the camera `d` from the place: 0 closed (every body shot), 1 open (the whole figure is cleared). */
export function cutOpen(d: number): number { return 1 - smooth(CUT_NEAR, CUT_FAR, d); }
/** The window as the organ shader takes it: x, y the dive point on the screen (ndc), z the clear radius (ndc half-heights; negative: nothing cleared), w the screen's aspect. */
export function cutUniform(d: number, ndcX: number, ndcY: number, aspect: number, out: [number, number, number, number] = [0, 0, 0, 1]): [number, number, number, number] {
  const k = cutOpen(d);
  out[0] = ndcX; out[1] = ndcY; out[2] = k <= 0 ? -1 : -CUT_SOFT + k * (2 * Math.hypot(aspect, 1) + CUT_SOFT); out[3] = aspect;
  return out;
}

/** The field's softness (0 sharp, 1 as far out of focus as the dive's start) with the camera `d` from the place, against `rest`, the distance the camera sits at when the lobule is framed in this room (it is
 *  a few times larger on a phone than on a Mac): the neighbours resolve out of the blur as the camera lands in the lobule (1.0 s to 1.6 s of 1.6 s), and are sharp from the lobule's own framing in. */
export const FIELD_SOFT_NEAR = 1.3, FIELD_SOFT_FAR = 8;
export function fieldSoft(d: number, rest: number): number { return smooth(rest * FIELD_SOFT_NEAR, rest * FIELD_SOFT_FAR, d); }
