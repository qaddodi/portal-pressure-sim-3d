// The sinusoid comes in from the middle out (Mohammad, 27 Nov 2026: "when we reach close to the sinusoid from the lobule, the sinusoid appears from middle out, during the blur,
// then unblurs slowly"). Over the dive's dissolve (sinusoid3d FOCUS[1] to FOCUS[2]) its parts are drawn first at the sinusoid's middle, and the drawn patch spreads out through the
// tissue; then the picture sharpens (the focus pull, FOCUS[2] to 1). The front is measured in the sinusoid's own micrometres, not in screens: the scene is a tile (REACH along,
// ACROSS across), so a front in screens would have shown the tile's straight edges while the camera is still far; this one never passes FRONT_END, inside the tile. Its edge is a
// ramp SOFT_UM wide, dissolved in the screen pattern every fade uses and under the blur, so no circle, rim or window ever shows (20 Nov: a disc read as "an old TV"). The lobule
// under it stands aside only once the screen's farthest corner is whole (`cornerWhole`). One rule for every dive path and screen, a function of the camera's distance alone,
// so the way out is the way in run backward. Pure numbers and the shader's twin; no GPU, no clock.
import { Vector4 } from 'three';
import { SCREEN_DITHER_GLSL } from '../materials/shaders.ts';

/** The patch's radius (µm from the sinusoid's middle) that is whole once the front has spread: wider than any screen's corner at the landing (about 60 µm), inside the tile. */
export const WHOLE_UM = 80;
/** The front's soft edge (µm): the ramp from drawn to not drawn. */
export const SOFT_UM = 40;
/** Where the front ends (µm): the whole patch plus its edge; the tile reaches ACROSS + 20 across (138 µm), so its edge never shows. */
export const FRONT_END = WHOLE_UM + SOFT_UM;

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number): number => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const smoother = (a: number, b: number, x: number): number => { const t = clamp01((x - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };

/** Where the front stands (µm from the middle) at dive share `d` over the band `from` to `to`: 0 at `from`, FRONT_END at `to`. Null (at rest): -1, no reveal. */
export function revealFront(d: number | null, from: number, to: number): number {
  return d == null ? -1 : FRONT_END * smoother(from, to, d);
}
/** How much of the sinusoid is drawn `um` micrometres from its middle with the front at `front`; `fade` the view's one dissolve, used when the reveal is off. */
export function revealAt(um: number, front: number, fade = 1): number {
  return front < 0 ? fade : 1 - smooth(front - SOFT_UM, front, um);
}
/** The distance (px) from the middle `(cx, cy)` to the farthest corner of a `w` by `h` picture. */
export function cornerReach(cx: number, cy: number, w: number, h: number): number {
  return Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy));
}
/** How far the lobule under the sinusoid has stood aside (0 whole, 1 gone) with the front at `front` and the screen's farthest corner `cornerUm` micrometres from the middle:
 *  only as that corner's sinusoid becomes whole, so nothing of the page ever shows between the two. At rest (front off): gone. */
export function cornerWhole(front: number, cornerUm: number): number {
  return front < 0 ? 1 : smooth(0.95, 1, revealAt(cornerUm, front));
}

/** The uniform a micro part's fade reads (x, y the middle in device px, gl_FragCoord's frame; z device px per µm; w the front in µm, negative: off). Off by default. */
export const revealUniform = (): { value: Vector4 } => ({ value: new Vector4(0, 0, 1, -1) });
/** The one every micro part shares unless it brings its own (the lobule's parts: their reveal is always off). */
export const REVEAL_OFF = revealUniform();

/** The fade test of the micro shaders (MICRO_FS, MICRO_INK_FS), the twin of revealAt line for line: the reveal's level when it is on, the view's one `fade` when it is off. */
export const REVEAL_FADE_GLSL = /* glsl */ `
uniform float fade;
uniform vec4 uReveal;
float revealK() {
  if (uReveal.w < 0.0) return fade;
  float um = length(gl_FragCoord.xy - uReveal.xy) / max(uReveal.z, 1e-4);
  return 1.0 - smoothstep(uReveal.w - ${SOFT_UM.toFixed(4)}, uReveal.w, um);
}
bool fadedOut() { float k = revealK(); return k < 0.999 && ${SCREEN_DITHER_GLSL} >= k; }
`;
