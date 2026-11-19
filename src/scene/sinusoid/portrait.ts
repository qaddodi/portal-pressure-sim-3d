// The sinusoid on a portrait screen (2D: sinusoid-view.js ensureGeo, layoutEnds, stepView). A screen narrower than 0.95 of its height runs the sinusoid TOP TO BOTTOM (portal end up),
// 2D turning its drawing by ang = PI / 2 on a y-down screen. Here the plane's own group is turned, so the tissue, the pores, the albumin, the names' anchors and the hits all turn
// together; the plane's y runs up, so the same turn is -PI / 2. Pure numbers, no GPU: tests/scene-sinusoid-portrait.test.ts.
import { FILL } from '../camera/room.ts';


/** 2D's rule: a stage narrower than 0.95 of its height is a portrait stage (W < H * 0.95). */
export const isPortrait = (w: number, h: number): boolean => w < h * 0.95;
/** The turn of the plane's group about z that puts the portal end at the top (2D's ang = PI/2 on a y-down screen). */
export const PORTRAIT_ANGLE = -Math.PI / 2;
/** Where the Kupffer cell stands (µm along): 22 on a wide screen, nearer the middle (12) on a tall one, clear of the central vein's name (2D: geo.xk). */
export const XK = { wide: 22, tall: 12 } as const;
/** The Kupffer cell's place for a screen. */
export const xkFor = (portrait: boolean): number => (portrait ? XK.tall : XK.wide);

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** How many micrometres show across the free room's short side (2D: lerp(40, 54, smooth(380, 720, short))): both plates whole on a large screen, closer in on a phone. */
export const acrossUm = (shortPx: number): number => lerp(40, 54, smooth(380, 720, shortPx));
/** Pixels per micrometre the camera rests at in a free room whose short side is `shortPx`: `across` µm fill FILL of that side (sinusoidShot frames it so; 2D: VW.tk = short / across, kept to 3 at least).
 *  The scene gives it to the view (setScreen) and the names lay themselves out against it, so the arrows and the names agree with the picture. */
export const restScale = (shortPx: number): number => Math.max(3, (shortPx * FILL) / acrossUm(shortPx));
/** The ends' arrows stand this far (px) inside the free room's ends: the arrow and its gaps (A = 22 + 26) halved, plus the 8 px of margin on a wide screen (2D: layoutEnds). */
export const END_INSET = { wide: 8 + (22 + 26) / 2, tall: (22 + 26) / 2 } as const;
/** Where the end arrows stand and how big they are (µm along the sinusoid from the view's centre: the portal venule's, the central vein's, the arrow's size), for a free room that is
 *  `alongPx` long in the flow's direction at `k` px per µm, and a lumen `lumenHalf` µm wide (half). 2D: layoutEnds, END[]. */
export function endsFor(k: number, alongPx: number, portrait: boolean, lumenHalf: number): [number, number, number] {
  const inset = portrait ? END_INSET.tall : END_INSET.wide, e = (alongPx / 2 - inset) / k;
  return [-e, e, Math.min(22 / k, lumenHalf * 0.95)];
}

/** A point of the sinusoid's own frame in micrometres (x along the flow, y across, DOWN as the shader has it) to the plane group's parent frame, in plane units (`u` per µm), turned by `angle`. */
export function framePoint(xum: number, yDown: number, u: number, angle: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const px = xum * u, py = -yDown * u, c = Math.cos(angle), s = Math.sin(angle);
  out[0] = px * c - py * s; out[1] = px * s + py * c; out[2] = 0;
  return out;
}
/** The reverse: a point of the plane group's parent frame (plane units) to micrometres along and across (y down). */
export function planePoint(fx: number, fy: number, u: number, angle: number): { x: number; y: number } {
  const c = Math.cos(angle), s = Math.sin(angle), px = fx * c + fy * s, py = -fx * s + fy * c;
  return { x: px / u, y: -py / u };
}

/** The turn the plane is at, from the dive and the target: while the camera flies between the lobule and this view the turn follows the dive's share (0 leaving the lobule, 1 landed), so
 *  the lobule turns into the portrait view in one move and out again by the same frames reversed (2D: ang = dive.ang + rot * (g - 1)); at rest it is the target. */
export const turnAt = (target: number, dive: number | null): number => (dive == null ? target : target * clamp(dive, 0, 1) + 0);   // (+ 0: never -0)
/** One step of the turn toward its target when nothing is flying (a phone turned in the view): 2D's critically damped glide (SPRING 10 /s, 95 % in 0.47 s); exactly there once under half a milliradian. */
export function glideTurn(cur: number, vel: number, target: number, dtSec: number): { a: number; v: number } {
  const SPRING = 10, s = Math.min(Math.max(dtSec, 0), 0.1), e = Math.exp(-SPRING * s), dx = cur - target, t = vel + SPRING * dx;
  const a = target + (dx + t * s) * e, v = (vel - SPRING * t * s) * e;
  return Math.abs(a - target) < 5e-4 && Math.abs(v) < 5e-3 ? { a: target, v: 0 } : { a, v };
}
