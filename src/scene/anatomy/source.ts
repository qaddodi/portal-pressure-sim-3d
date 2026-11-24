// THE ANATOMY SOURCE (anatomy integration plan, phase 1: /mnt/project-files/anatomy-integration-plan.md; approved by Mohammad 24 Nov 2026).
// Every place in the app that reads where an organ or a vessel is reads it here, and nowhere else: the vessels' courses and the stations, the sets that say how a vessel is
// drawn, and the camera regions the slides frame. Today this is the 2D figure's own data (paths.copied.ts, the decks' region boxes) carried by the one map of frame2d.ts, so
// nothing on screen changes (tests/anatomy-source.test.ts freezes what every reader gets). The new placement (the rotatable mock) replaces the data HERE, in one place, and the
// readers follow. The lint rule `anatomy-through-source` (scripts/lint-rules.mjs) keeps it the only door: no file outside src/scene/anatomy imports the copied courses or regions.
export {
  NODE_POS_2D, EDGE_PATH_2D, HIDDEN_EDGES, ANAT_HIDDEN, CONTEXT_EDGES, NEEDS_C3, IVC_EDGES, BACK_EDGES, REX_UNDER, HIDDEN_NODES,
} from '../vessels/paths.copied.ts';
export { REGIONS_2D, CIRC_REGIONS_2D } from '../../decks/ag/regions.generated.ts';
export { REGIONS as REGIONS_HP, CIRC_REGIONS as CIRC_REGIONS_HP } from '../../decks/hp/regions.copied.ts';

/** Which placement the source holds: 'today' (the 2D figure's, as shipped). */
export const ANATOMY_ID = 'today' as const;
