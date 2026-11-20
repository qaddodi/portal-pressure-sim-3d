import type { Shot } from '../camera/shots.ts';
import { MAP_CENTRE, MAP_K, mapToScene, turnScenePt } from './map.ts';
import { VB_CIRC } from './data.copied.ts';

/** The map's drawn box in map units (2D stage-fit.js ART_CIRC): the figure the camera frames. The view box is 8% taller than it, and framing that left the map small, high under the top bar and short of the view pill. */
export const ART_CIRC: readonly [number, number, number, number] = [70, 30, 1330, 730];

/** The Circuit: straight on to the map's drawn box, the whole of it in the room (the room solver pulls the camera back as far as the room needs). Upright, the map is tall. */
export function circuitShot(upright: boolean): Shot {
  return circuitBoxShot(ART_CIRC, upright);
}

/** The map's plate for the hand's limits: its rectangle in the scene's plane, wide or upright. */
export function circuitBounds(upright: boolean): { x0: number; x1: number; y0: number; y1: number; z: number } {
  const w = (VB_CIRC[2] * MAP_K) / 2, h = (VB_CIRC[3] * MAP_K) / 2, hx = upright ? h : w, hy = upright ? w : h;
  return { x0: MAP_CENTRE.x - hx, x1: MAP_CENTRE.x + hx, y0: MAP_CENTRE.y - hy, y1: MAP_CENTRE.y + hy, z: MAP_CENTRE.z };
}

/** A part of the map in the room (a Circuit slide's `cam` or `zone`: a box in map units, x y x2 y2 as 2D's CIRC_REGIONS). Standing upright, the box is turned with the map about its centre.
 *  `kMax` is the slide's closest zoom as a multiple of the whole map's fit (2D's `kMax`): the shot never frames less than the whole map's half over it. */
export function circuitBoxShot(box: readonly [number, number, number, number], upright: boolean, kMax: number | null = null): Shot {
  const [x0, y0, x1, y1] = box;
  const c = mapToScene((x0 + x1) / 2, (y0 + y1) / 2), t = turnScenePt(c[0], c[1], upright ? 1 : 0);
  let hx = ((x1 - x0) * MAP_K) / 2, hy = ((y1 - y0) * MAP_K) / 2;
  if (upright) [hx, hy] = [hy, hx];
  if (kMax && kMax > 0) {
    const wide: [number, number] = [((ART_CIRC[2] - ART_CIRC[0]) * MAP_K) / 2, ((ART_CIRC[3] - ART_CIRC[1]) * MAP_K) / 2];
    const whole = upright ? [wide[1], wide[0]] : wide;
    hx = Math.max(hx, whole[0] / kMax); hy = Math.max(hy, whole[1] / kMax);
  }
  return { yaw: 0, pitch: 0, r: 5, target: [t[0], t[1], MAP_CENTRE.z], half: [hx, hy] };
}
