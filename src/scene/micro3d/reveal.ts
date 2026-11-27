// The sinusoid comes in from the middle out (Mohammad, 27 Nov 2026: "when we reach close to the sinusoid from the lobule, the sinusoid appears from middle out, during the blur,
// then unblurs slowly"). Over the dive's dissolve (sinusoid3d FOCUS[1] to FOCUS[2]) its parts are drawn first at the middle of the sinusoid on the screen, and the drawn area spreads
// out to the screen's farthest corner; then the picture sharpens (the focus pull, FOCUS[2] to 1). The edge is a ramp REVEAL_SOFT of the whole reach wide, dissolved in the screen
// pattern every fade uses and under the blur, so no circle, rim or window ever shows (20 Nov: a disc read as "an old TV"). One rule for every dive path and screen, a function of the
// dive's share alone (the camera's distance), so the way out is the way in run backward. Pure numbers and the shader's twin; no GPU, no clock.
import { Vector4 } from 'three';
import { SCREEN_DITHER_GLSL } from '../materials/shaders.ts';

/** The edge's width, a share of the reach (the middle to the screen's farthest corner): half the screen fades across it at once, so the front is a soft spread, never a line. */
export const REVEAL_SOFT = 0.6;

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number): number => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const smoother = (a: number, b: number, x: number): number => { const t = clamp01((x - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };

/** Where the front stands at dive share `d` over the band `from` to `to` (a share of the reach; at `from` nothing is drawn, at `to` the farthest corner is whole). Null (at rest): -1, no reveal. */
export function revealFront(d: number | null, from: number, to: number): number {
  return d == null ? -1 : (1 + REVEAL_SOFT) * smoother(from, to, d);
}
/** How much of the sinusoid is drawn at `rho` (its distance on the screen from the sinusoid's middle, a share of the reach) with the front at `front`;
 *  `fade` the view's one dissolve, used when the reveal is off. */
export function revealAt(rho: number, front: number, fade = 1): number {
  return front < 0 ? fade : 1 - smooth(front - REVEAL_SOFT, front, rho);
}
/** The reach (device px): the distance from the middle `(cx, cy)` to the canvas's farthest corner, so every pixel is whole when the front has passed 1. */
export function revealReach(cx: number, cy: number, w: number, h: number): number {
  return Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy), 1);
}

/** The uniform a micro part's fade reads (x, y the middle in device px, gl_FragCoord's frame; z the reach; w the front, negative: off). Off by default: a part without one draws its one fade. */
export const revealUniform = (): { value: Vector4 } => ({ value: new Vector4(0, 0, 1, -1) });
/** The one every micro part shares unless it brings its own (the lobule's parts: their reveal is always off). */
export const REVEAL_OFF = revealUniform();

/** The fade test of the micro shaders (MICRO_FS, MICRO_INK_FS), the twin of revealAt line for line: the reveal's level when it is on, the view's one `fade` when it is off. */
export const REVEAL_FADE_GLSL = /* glsl */ `
uniform float fade;
uniform vec4 uReveal;
float revealK() {
  if (uReveal.w < 0.0) return fade;
  float rho = length(gl_FragCoord.xy - uReveal.xy) / max(uReveal.z, 1.0);
  return 1.0 - smoothstep(uReveal.w - ${REVEAL_SOFT.toFixed(4)}, uReveal.w, rho);
}
bool fadedOut() { float k = revealK(); return k < 0.999 && ${SCREEN_DITHER_GLSL} >= k; }
`;
