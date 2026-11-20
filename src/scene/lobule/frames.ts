// Where the lobule and the sinusoid stand: INSIDE the liver, one inside the other (owner, 19 Nov: "the lobule and sinusoid views have to be INSIDE. so like a
// dive in"). Three frames, each a place and a scale, each built in its own comfortable local units:
//   the scene (the body plate, 2D frame src/scene/frame2d.ts)  >  the lobule (a point inside the right lobe, 1/150 of the scene)  >  the sinusoid (a point on a
//   sinusoid of the lobule, about a tenth of the lobule's own scale again).
// The camera's dive is one straight move through them (camera/rig.ts blends the distance and the framing geometrically when the scales differ a lot).
// A point is "inside the liver" when it lies inside the liver mesh; the placeholder right lobe is an ellipsoid (anatomy/placeholder.ts), and the artist's
// real liver replaces it, so the place is ONE constant in the 2D frame (LIVER_2D) to move when the mesh differs (tests/scene-dive.test.ts checks it is inside).
import { x2d, x3, y2d, y3 } from '../frame2d.ts';
import type { V3 } from './shots.ts';

/** The place in the 2D figure's world units (x right, y down; the confluence is at 700, 556) the dive goes to: the open liver between the right portal branch (below: (602,442) up-left to the right sinusoid fan at about (450,340)), the right hepatic vein (above, y about 245) and the IVC (right, x about 620), about 65 units clear of each (owner, 20 Nov: zoom in between the right portal vein and the IVC, not to the edge). The courses are src/scene/vessels/paths.copied.ts. */
export const LIVER_2D = { x: 515, y: 330 } as const;
/** Depth of the place (the organs straddle z = 0; the right lobe's centre is a little behind the plate's middle). */
export const LIVER_Z = -0.15;
/** The lobule's frame in the scene: where its local (0, 0, 0) is, and how many scene units one local unit is. A real lobule (about 1 mm) is well over a thousand times smaller than a liver (owner, 20 Nov: it was ~10x too big and showed on the liver): 1/1500 of the scene. */
export const LIVER_POINT: V3 = [x3(LIVER_2D.x), y3(LIVER_2D.y), LIVER_Z];
export const LOBULE_SCALE = 1 / 1500;

/** Where the sinusoid stands in the lobule's local units (the 2D 'lobule:sinusoid' station: half-way from the left portal corner to the centre, on the slab), and its scale
 *  against the lobule's: one local sinusoid unit is SIN_REL lobule units, so the sinusoid's lumen (0.34) is as wide as the lobule's own sinusoid tube (0.036). */
export const SIN_LOCAL: V3 = [-1.3213, 0.2455, 0];
// (owner, 20 Nov: the sinusoid view lines up with a real sinusoid of the lobule, mid zone 2: this is point 23 of the lobule's own course 90 (a second-generation sinusoid, hexFrac 0.49,
//  running along +x within 0.01 rad), so the dive from the lobule lands on a sinusoid that is drawn there. tests/scene-dive.test.ts holds it against buildLobule(7).)
export const SIN_REL = 0.106;
export const SIN_SCALE = LOBULE_SCALE * SIN_REL;

/** A point of the lobule's local units in the scene. */
export function lobuleWorld(p: V3, out: V3 = [0, 0, 0]): V3 {
  out[0] = LIVER_POINT[0] + p[0] * LOBULE_SCALE; out[1] = LIVER_POINT[1] + p[1] * LOBULE_SCALE; out[2] = LIVER_POINT[2] + p[2] * LOBULE_SCALE;
  return out;
}
/** The sinusoid's place in the scene (its local origin). */
export const SIN_POINT: V3 = lobuleWorld(SIN_LOCAL);
/** A point of the sinusoid's local units in the scene. */
export function sinusoidWorld(p: V3, out: V3 = [0, 0, 0]): V3 {
  out[0] = SIN_POINT[0] + p[0] * SIN_SCALE; out[1] = SIN_POINT[1] + p[1] * SIN_SCALE; out[2] = SIN_POINT[2] + p[2] * SIN_SCALE;
  return out;
}

/** The place back in the 2D frame (for the artist and the tests). */
export const liver2d = (): { x: number; y: number } => ({ x: x2d(LIVER_POINT[0]), y: y2d(LIVER_POINT[1]) });
