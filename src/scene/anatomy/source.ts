// THE ANATOMY SOURCE (anatomy integration plan, phase 1: /mnt/project-files/anatomy-integration-plan.md; approved by Mohammad 24 Nov 2026).
// Every place in the app that reads where an organ or a vessel is reads it here, and nowhere else: the vessels' courses and the stations, the sets that say how a vessel is
// drawn, and the camera regions the slides frame. It exports the 2D figure's own data (paths.copied.ts, the decks' region boxes: the engine's topology, names and regions the
// placed network and the cameras build on) and the approved placement (placed-bounds.ts, placed-organs.generated.ts), which is what the figure draws (tests/anatomy-source.test.ts
// freezes what every reader gets). The lint rule `anatomy-through-source` (scripts/lint-rules.mjs) keeps it the only door: no file outside src/scene/anatomy imports the copied courses or regions.
export {
  NODE_POS_2D, EDGE_PATH_2D, HIDDEN_EDGES, ANAT_HIDDEN, CONTEXT_EDGES, NEEDS_C3, IVC_EDGES, BACK_EDGES, REX_UNDER, HIDDEN_NODES,
} from '../vessels/paths.copied.ts';
export { REGIONS_2D, CIRC_REGIONS_2D } from '../../decks/ag/regions.generated.ts';
export { REGIONS as REGIONS_HP, CIRC_REGIONS as CIRC_REGIONS_HP } from '../../decks/hp/regions.copied.ts';

/** Which placement the source holds. Since the cut-over (Mohammad, 24 Nov 2026 5:31 PM ET: "After the thread is done make this the default and remove the old"; done 25 Nov) it is the approved placement only
 *  (docs/approved/anatomy-placement.md), with one path through the code; the 2D figure's own placement was last the default at commit f17b151a. The baked skins' digest carries the name (skin/baked.ts). */
export type AnatomyId = 'placed';
export const ANATOMY_ID: AnatomyId = 'placed';

/** The approved placement by name (placed-bounds.ts): each engine edge's placed course, each node's place, each organ part's 3D box, the camera regions as lists of names, and the
 *  organs' placed silhouettes and name anchors (placed-organs.generated.ts, measured once by scripts/gen-placed-organs.mjs). The cameras and the organ names read them. */
export {
  placedEdge, placedNode, placedMorph, placedBoxOfName, RECTUM_SEEN_Y, todayBoxOfName, boxOfNames, growBox3, box2Of, centreOf, unionBox3, REGION_SUBJECTS, placedRegionBox,
  subjectOfBox2, placedBoxOfBox2, FIGURE_NAMES, VISIBLE_FIGURE_NAMES, WHOLE_OF, GROW, GROW_FLOOR, type Box3, type Box2,
} from './placed-bounds.ts';
export { PLACED_ORGAN_BOX, PLACED_ORGAN_RINGS, PLACED_ORGAN_NAMES } from './placed-organs.generated.ts';
