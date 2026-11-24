// The ONE accessor for the 2D vessel plan the scene builds from: paths.copied.ts's EDGE_PATH_2D with the editor's overrides applied (src/editor/vessel-apply.ts).
// Every module under src/scene/vessels reads the plan from here, so a moved node or edited course reaches the starts, liver branches, fades, seams and the network alike.
// With nothing edited it is the very same table. Leaf imports only (no network.ts), so nothing here is a cycle.
import { EDGES, dMinOf } from '../engine/hales/portal/topology.js';
import { EDGE_PATH_2D } from '../scene/vessels/paths.copied.ts';
import { type Edge, widthPx } from '../scene/vessels/width.ts';
import { overrides } from './store.ts';
import { applyAll } from './vessel-apply.ts';
import { anchorsOf } from '../scene/vessels/organ-follow.ts';

type Plan = Record<string, readonly (readonly [number, number])[]>;
let built: ReturnType<typeof applyAll> | null = null, builtFor: unknown = null;
const build = (): ReturnType<typeof applyAll> => {
  if (built && builtFor === overrides()) return built;
  const edges = EDGES as Edge[], byId = new Map(edges.map((e) => [e.id, e]));
  // (an arm eases over at most 6 radii: the vessel's drawn half width in plan units, as the network sizes its hosts)
  const radius = (id: string): number => { const e = byId.get(id); return e ? widthPx(e, e.d ?? e.dMax ?? (dMinOf(e) || 3)) / 2 : 0; };
  builtFor = overrides();
  return (built = applyAll(EDGE_PATH_2D as Plan, edges, overrides(), radius, anchorsOf));
};
/** The 2D plan as built: EDGE_PATH_2D itself when nothing is edited. */
export const editedPlan = (): typeof EDGE_PATH_2D => build().paths as typeof EDGE_PATH_2D;
/** Depth offsets (scene units) per edited vessel, per path point. */
export const editedDz = (): ReadonlyMap<string, Float64Array> => build().dz;
