import type { Shot } from '../camera/shots.ts';
import { MAP_CENTRE, MAP_HALF_UPRIGHT, MAP_HALF_WIDE, MAP_K } from './map.ts';
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
