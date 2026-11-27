// The depth of an organ's front face, read from the organ as the approved placement draws it (anatomy/placed-organs.generated.ts PLACED_ORGAN_BOX: the box's front z). Pure arithmetic.
// Root cause of an organ's mark and its name's silhouette standing beside the organ (27 Nov, the same one as the spleen caliper): they laid the 2D figure's point on ONE plane for every
// organ (z 0.26, "every organ's front"), from before the placement gave each organ its own depth. The spleen's front is -0.12 and the kidney's -0.17, so the point stood 0.38 and 0.43 in
// front of them, and the camera's turn turned that gap into a slide on the canvas. Anything that stands on an organ asks here for the depth it stands at.
import { PLACED_ORGAN_BOX } from '../anatomy/placed-organs.generated.ts';

/** The organs' ids as the figure's cards name them, where they differ from the placement's. */
const PLACED_ID: Readonly<Record<string, string>> = { kidney: 'kidney-l' };

/** Whether the placement has this organ (an id of the figure's organ layer, or `kidney`). */
export const hasOrganFront = (id: string): boolean => (PLACED_ID[id] ?? id) in PLACED_ORGAN_BOX;

/** The z of the organ's front face, scene units. Throws for an id the placement has no organ for: a point that stands on an organ must know which one. */
export function organFrontZ(id: string): number {
  const b = PLACED_ORGAN_BOX[PLACED_ID[id] ?? id];
  if (!b) throw new Error(`organ-front: the placement has no organ "${id}"`);
  return b[5];
}

/** The z of the organ's middle, scene units: where its rim (its silhouette on the canvas, the line a camera turned a little sees as the organ's edge) lies on an inflated organ. */
export function organMidZ(id: string): number {
  const b = PLACED_ORGAN_BOX[PLACED_ID[id] ?? id];
  if (!b) throw new Error(`organ-front: the placement has no organ "${id}"`);
  return (b[2] + b[5]) / 2;
}
