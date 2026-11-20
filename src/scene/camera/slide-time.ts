import type { Shot } from './shots.ts';
import { FOV } from './shots.ts';
import { type Room, effectiveDistance } from './room.ts';
import type { View } from '../gesture/ease.ts';

// What a deck slide's camera move takes and how its clock runs: 2D's src/ui/slide-cam.js (planSlide, createSlideClock) and ease.js (slideMs), lifted for the 3D rig.
// Pure numbers, no GPU and no clock: tests/camera-slide-time.test.ts holds them.

/** 2D's glide times (ease.js): 480 ms up to half a screen of reach, then in proportion to 900 ms (a hand's glide), and a slide's move slows on toward CAM_MS_FAR instead of stopping. */
export const CAM_MS_MIN = 480, CAM_MS_MAX = 900, CAM_MS_FAR = 1300;
/** The least and most a slide's move takes, ms (slide-cam.js: "a third of a screen in 480 ms read as a swoop"). */
export const SLIDE_MIN_MS = 800, SLIDE_MAX_MS = 1400;
/** The most one frame moves a slide's move on, ms (slide-cam.js STEP_MAX, a 20 fps frame): a longer frame pauses the move where it stood instead of landing the next part of it in one jump. */
export const STEP_MAX = 50;

/** 2D's `slideMs`: a slide's glide for a reach of `d` screens (the pan in screens wide, the zoom with a doubling counting half a screen). */
export function slideMsOf(d: number): number {
  const knee = (CAM_MS_MAX / CAM_MS_MIN) * 0.5;
  return Math.round(d <= knee ? CAM_MS_MIN * Math.max(1, d / 0.5) : CAM_MS_MAX + (CAM_MS_FAR - CAM_MS_MAX) * (1 - Math.exp(-(d - knee) / 1.5)));
}
/** 2D's `planSlide` span: the slide's glide time clamped to 800 to 1400 ms. */
export const slideSpanOf = (d: number): number => Math.min(SLIDE_MAX_MS, Math.max(SLIDE_MIN_MS, slideMsOf(d)));

/** How much further a clock goes after a frame that took `dt` ms: never more than STEP_MAX, never backwards (2D createSlideClock). */
export const stepOf = (dt: number): number => Math.min(Math.max(0, dt), STEP_MAX);

/** The hand view that frames `whole` (the whole body, the whole Circuit map) in the room, seen from the framing of `shot`; null when `shot` already is that (or is wider).
 *  Zoom: the camera sits at the shot's distance and would sit at the whole's, so the zoom that looks like the whole is the ratio of the two. Pan: the whole's aim stands off the shot's aim by a
 *  few world units, `px per unit` on screen at the shot's distance (the figure's plane faces the camera: yaw and pitch are zero or near it); the hand's pan moves with the zoom, p = c + pan + k (p0 - c). */
export function wholeViewOf(shot: Shot, whole: Shot, room: Pick<Room, 'w' | 'h'>, viewportH: number, viewportW: number, fov = FOV): View | null {
  const ds = effectiveDistance(shot, room, viewportH, viewportW), dw = effectiveDistance(whole, room, viewportH, viewportW);
  if (!(ds > 0) || !(dw > 0)) return null;
  const k = ds / dw;
  if (k >= 0.98) return null;
  const perUnit = viewportH / (2 * Math.tan((fov * Math.PI) / 360)) / ds;
  return { k, x: -k * perUnit * (whole.target[0] - shot.target[0]), y: k * perUnit * (whole.target[1] - shot.target[1]) };
}

/** The share of a move's zoom done at progress `k` when the distance goes from `da` to `db` evenly on a log scale: (1/d - 1/da) / (1/db - 1/da), 2D's lerpInto `a`. The aim and the room go with it,
 *  so every point of the figure travels a straight line on the screen and the zoom goes one way (STG-4). With no change of distance it is `k`. */
export function zoomShare(da: number, db: number, k: number): number {
  if (!(da > 0) || !(db > 0) || Math.abs(1 / da - 1 / db) < 1e-9) return k;
  const d = da * Math.pow(db / da, k);
  return Math.min(1, Math.max(0, (1 / d - 1 / da) / (1 / db - 1 / da)));
}
