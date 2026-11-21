// The wedge's amber column: ONE field over the whole hepatic venous tree, shared by the tubes and the junction skins (vessels/shaders.ts, skin/shaders.ts).
//
// The field is a distance: how far along the network a point is from the balloon's distal edge (route units, the route's own `d`), growing up the vein and out into every branch. A tube knows its
// distance at any u (the line `d0 + slope u`, laid by the procedure catheter from the vessel's drawn centreline); a skin takes the distance of its arms' seams and blends them by the arms' weights, so
// a pixel in the join has the distance of the place it is at. The column's front is ONE advancing distance with a soft edge, so it crosses every tube and every skin at one speed and nothing can
// lag behind or jump ahead of its neighbour (Mohammad, 21 Nov: "the tubes filled, the join did NOT fill, then it filled all of a sudden").
//
// `wedgeCover(d, p)`: p = (behind, front, frontSoft): 1 from the balloon's edge to just behind the front, gone by the front, and softly gone just behind the balloon's edge (under its glass).
export const WEDGE_GLSL = `float wedgeCover(float d, vec3 p) {
  return smoothstep(-max(p.x, 1e-4), 0.0, d) * (1.0 - smoothstep(p.y - max(p.z, 1e-4), p.y, d));
}
`;
/** A distance no arm has: an arm whose tube carries no wedge (the skin blends only the arms that do). */
export const WEDGE_ABSENT = -1e4;

const ss = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-9))); return t * t * (3 - 2 * t); };
/** The same field on the CPU (tests, and the skin's seam values): the share of amber at route distance `d` from the balloon's edge. */
export function wedgeCover(d: number, behind: number, front: number, frontSoft: number): number {
  return ss(-Math.max(behind, 1e-4), 0, d) * (1 - ss(front - Math.max(frontSoft, 1e-4), front, d));
}
