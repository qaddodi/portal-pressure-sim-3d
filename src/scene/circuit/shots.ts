import type { Shot } from '../camera/shots.ts';
import { MAP_CENTRE, MAP_HALF_UPRIGHT, MAP_HALF_WIDE, MAP_K, mapToScene, turnScenePt } from './map.ts';
import { VB_CIRC } from './data.copied.ts';

/** The Circuit: straight on to the map, the whole map in the room (the room solver pulls the camera back as far as the room needs). Upright, the map is tall. */
export function circuitShot(upright: boolean): Shot {
  const half = upright ? MAP_HALF_UPRIGHT : MAP_HALF_WIDE;
  return { yaw: 0, pitch: 0, r: 5, target: [MAP_CENTRE.x, MAP_CENTRE.y, MAP_CENTRE.z], half: [half[0], half[1]] };
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
    const whole = upright ? MAP_HALF_UPRIGHT : MAP_HALF_WIDE;
    hx = Math.max(hx, whole[0] / kMax); hy = Math.max(hy, whole[1] / kMax);
  }
  return { yaw: 0, pitch: 0, r: 5, target: [t[0], t[1], MAP_CENTRE.z], half: [hx, hy] };
}
