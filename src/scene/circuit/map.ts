// Where the 2D circuit's map stands in the 3D scene. The map is a flat plate in the scene, facing the camera, written in the 2D app's own units (VB_CIRC: x runs right, y down)
// and carried into scene units by one scale; the quarter turn that stands it upright (flow bottom to top) is applied to the course about the map's centre, as the 2D
// app lays the circuit's side out already turned (circ-turn.js), and is the same turn in the shader (shader.ts circRotate) and here.
import { VB_CIRC } from './data.copied.ts';

/** Scene units per map unit. The 3D body's warp scales the 2D anatomy by 0.0054 across and 0.0075 up; the map keeps the mean, so a vessel of a given diameter is as thick
 *  against its lane as it is against the 2D map's. */
export const MAP_K = 0.0065;
/** The map's centre in the scene, and the plane's depth (the camera looks straight at it). */
export const MAP_CENTRE = { x: 0, y: 0.45, z: 0 } as const;
/** The circuit's view-box centre in map units. */
export const CIRC_C: readonly [number, number] = [VB_CIRC[0] + VB_CIRC[2] / 2, VB_CIRC[1] + VB_CIRC[3] / 2];

/** A map point (units, y down) in the scene (x right, y up), unturned. */
export function mapToScene(x: number, y: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  out[0] = MAP_CENTRE.x + (x - CIRC_C[0]) * MAP_K;
  out[1] = MAP_CENTRE.y - (y - CIRC_C[1]) * MAP_K;
  out[2] = MAP_CENTRE.z;
  return out;
}
/** A scene point back on the unturned map (units). */
export function sceneToMap(x: number, y: number): [number, number] {
  return [CIRC_C[0] + (x - MAP_CENTRE.x) / MAP_K, CIRC_C[1] - (y - MAP_CENTRE.y) / MAP_K];
}

/** The turn's angle in the scene, counter-clockwise, for the turn's eased share rr (0 the wide map, 1 upright: the flow runs bottom to top). */
export const turnAngle = (rr: number): number => (Math.PI / 2) * rr;

/** A scene point (xy) turned about the map's centre by the turn's share. Writes into out. */
export function turnScenePt(x: number, y: number, rr: number, out: [number, number] = [0, 0]): [number, number] {
  const a = turnAngle(rr), c = Math.cos(a), s = Math.sin(a), dx = x - MAP_CENTRE.x, dy = y - MAP_CENTRE.y;
  out[0] = MAP_CENTRE.x + c * dx - s * dy; out[1] = MAP_CENTRE.y + s * dx + c * dy;
  return out;
}

/** Half the map's extent in the scene (width, height), wide and upright: what the camera shot must keep in the room. */
export const MAP_HALF_WIDE: readonly [number, number] = [(VB_CIRC[2] * MAP_K) / 2, (VB_CIRC[3] * MAP_K) / 2];
export const MAP_HALF_UPRIGHT: readonly [number, number] = [MAP_HALF_WIDE[1], MAP_HALF_WIDE[0]];
