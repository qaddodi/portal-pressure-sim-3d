// The liver carries its lobules (Mohammad, 27 Nov 2026: "every zoom should feel like one continuous zoom"). Before the dive hands over to the lobule's neighbour field
// (lobule/field.ts), the liver's own surface
// already shows what is under it: a faint hexagonal mosaic on the lattice the field draws (lobule/tiling.ts, the one source: the same centres, size and orientation round
// LIVER_POINT at LOBULE_SCALE), and the liver's colour
// grades toward the tone the field and its ground draw (lobule/tones.ts field), so the body's dissolve reveals what was already there. It is procedural in the organ shader
// and gated by one uniform that is 0 outside a dive.
import { Vector3 } from 'three';
import { LIVER_POINT, LOBULE_SCALE } from '../lobule/frames.ts';
import { LOBULE_HEX_GLSL } from '../lobule/tiling.ts';
import { LOBULE_R } from '../lobule/sizes.ts';
import { LOBULE_PALETTES } from '../lobule/tones.ts';
import type { LookId } from '../../looks/looks.ts';
import { rgbOf } from './organ-look.ts';

/** The lobule's diameter (two radii, corner to corner) in scene units: the size the mosaic's fade is measured by. */
export const LOBULE_SPAN = 2 * LOBULE_R * LOBULE_SCALE;
/** The lobule's diameter on the screen (px) where the mosaic starts and where it is whole. The lines are gone below about the first (a hexagon of 3 px is a texture, not a shape). */
export const MOSAIC_PX: readonly [number, number] = [3, 8];
/** The body's share (bodyFade) the mosaic is held to: nothing while the body is whole (every body shot, the first frame of a dive), whole by the time the dissolve has gone
 * half way, whatever the screen.
 *  A small screen sees the lobule at only a few px while the body is already half gone (the dissolve is in the camera's distance, the pixels in the screen's), so the
 * dissolve's own share also brings it in. */
export const MOSAIC_BODY: readonly [number, number] = [0.9, 0.5];

const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** How much of the mosaic is drawn (0 none, 1 whole): a pure function of the camera's distance `d` from the place dived to, the screen's `pxPerUnit` (its height in px over
 * twice the tangent of half the field of view)
 *  and the body's share `body` (bodyFade at that distance). In and out are one picture run both ways; 0 while the body is whole; never falls as `d` falls. */
export function mosaicShare(d: number, pxPerUnit: number, body: number): number {
  if (!(d > 0) || !(pxPerUnit > 0)) return 0;
  const px = (LOBULE_SPAN * pxPerUnit) / d;
  const bySize = smooth(MOSAIC_PX[0], MOSAIC_PX[1], px), byBody = smooth(MOSAIC_BODY[0], MOSAIC_BODY[1], body);
  return Math.max(bySize, byBody) * (1 - smooth(MOSAIC_BODY[0] + 0.05, 1, body));
}

/** The uniforms the liver's shader reads (shared by reference, written by the scene each frame and on a look change): `mos` the share (0 outside a dive: nothing runs),
 * `tone` the field's colour, `line` its seam's. */
export const LIVER_LOBULES = { mos: { value: 0 }, tone: { value: new Vector3() }, line: { value: new Vector3() } };
export function setLobuleTones(look: LookId): void {
  const t = LOBULE_PALETTES[look].tones as Record<string, string>;
  LIVER_LOBULES.tone.value.set(...rgbOf(t.field!));
  // (the seam between two lobules is the tissue between the plates, a little deeper than the cells: the field's floor)
  LIVER_LOBULES.line.value.set(...rgbOf(t.floor!));
}

/** GLSL: the liver's position in the lobule frame (the field's vLob), from the vertex's world place; the vertex shader's. */
export const LIVER_LOBULES_VS = /* glsl */ `
uniform float lobMos;
varying vec2 vLobPos;
const vec2 LOB_ORIGIN = vec2(${LIVER_POINT[0].toFixed(8)}, ${LIVER_POINT[1].toFixed(8)});
const float LOB_PER_UNIT = ${(1 / (LOBULE_SCALE * LOBULE_R)).toFixed(6)};
void lobuleVertex(vec4 world) { vLobPos = lobMos > 0.0 ? vec2(world.x - LOB_ORIGIN.x, LOB_ORIGIN.y - world.y) * LOB_PER_UNIT : vec2(0.0); }`;

/** GLSL: the fragment shader's declarations, the one derivative (taken before the window's discard, in uniform control flow) and the mosaic itself. */
export const LIVER_LOBULES_DECL = /* glsl */ `
uniform float lobMos;   // the mosaic's share (liver-lobules.ts mosaicShare): 0 outside a dive and on every other organ, so none of it runs
uniform vec3 lobTone;   // the field's colour (lobule/tones.ts field)
uniform vec3 lobLine;   // the field's seam (its floor)
varying vec2 vLobPos;
${LOBULE_HEX_GLSL}`;
export const LIVER_LOBULES_FW = /* glsl */ `
  vec2 lobFw = vec2(0.0);
  if (lobMos > 0.0) lobFw = fwidth(vLobPos);`;
export const LIVER_LOBULES_PAINT = /* glsl */ `
  if (lobMos > 0.0) {
    // the liver grades toward the field's tone, and the lobules' seams come up faint on it: a hairline a little wider than a pixel, gone when the lobule is too small to be a
    // shape (about 3 px, MOSAIC_PX)
    vec3 hx = lobuleHex(vLobPos);
    float aa = max(lobFw.x, lobFw.y);
    float seam = (1.0 - smoothstep(0.0, clamp(0.035 + 1.5 * aa, 0.0, 0.2), hx.z)) * (1.0 - smoothstep(${(2 / MOSAIC_PX[1]).toFixed(4)}, ${(2 / MOSAIC_PX[0]).toFixed(4)}, aa));
    fill = mix(fill, lobTone, lobMos);
    fill = mix(fill, lobLine, seam * 0.5 * lobMos);
  }`;
