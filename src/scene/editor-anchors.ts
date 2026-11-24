// Anatomy editor re-anchoring (?editor; docs/editor-plan.md WS-D). Every consumer that used to read the reference 2D plan (EDGE_PATH_2D, NODE_POS_2D, the organ names' fixed spots)
// reads it here instead, so a figure edited with overrides (src/editor) moves its catheter route, scope targets, station dots, organ names and framing with it.
// With no vessel, node or organ edit every function returns its reference value UNCHANGED (the same array or number), so the unedited figure is byte-identical.
import { overrides } from '../editor/store.ts';
import { EDGE_PATH_2D, NODE_POS_2D } from './vessels/paths.copied.ts';
import { NETWORK_BY_ID } from './vessels/network.ts';
import { UNITS_PER_SCENE as U } from './frame2d.ts';

type P2 = readonly [number, number];

/** Whether any vessel or node geometry is edited (organ edits do not touch the 2D plan). */
export const planEdited = (): boolean => { const o = overrides(); return !!(o.nodes && Object.keys(o.nodes).length) || !!(o.vessels && Object.keys(o.vessels).length); };

/** A vessel's 2D course (figure units): the reference course, or, once edited, the course the figure is built from (the built vessel's plan, which carries the overrides). */
export function path2D(id: string): readonly P2[] | undefined {
  const ref = EDGE_PATH_2D[id] as readonly P2[] | undefined;
  if (!planEdited()) return ref;
  const plan = NETWORK_BY_ID.get(id)?.plan;
  return plan && plan.kind === 'coil' ? plan.base : ref;
}

/** A topology node's place on the 2D figure: the reference place plus the node's edited move. */
export function nodePos2D(id: string): P2 | undefined {
  const p = NODE_POS_2D[id];
  const m = overrides().nodes?.[id];
  return p && m ? [p[0] + m.dx, p[1] + m.dy] : p;
}
/** The depth an edited node adds to the one the vessels give it (0 unedited). */
export const nodeDz = (id: string): number => overrides().nodes?.[id]?.dz ?? 0;

/** An organ's 2D offset (figure units, y down) from its edited move; null when it is not moved. Rotation and scale act about the organ's centroid and are not carried. */
export function organShift2D(organ: string): P2 | null {
  const m = overrides().organs?.[organ]?.move;
  return m && (m[0] !== 0 || m[1] !== 0) ? [m[0] * U, -m[1] * U] : null;
}
/** The organ mesh each 2D organ caption (names.copied ORGAN_AT keys) belongs to. */
export const ORGAN_OF_CAPTION: Readonly<Record<string, string>> = { Liver: 'liver', Spleen: 'spleen', Stomach: 'stomach', Colon: 'colon', Kidney: 'kidney-l', 'Small bowel': 'bowel', Esophagus: 'stomach', 'Right atrium': 'heart-ra' };
/** A point on an organ's caption or silhouette, moved with the organ (the same point when the organ is not moved). */
export function withOrgan(organ: string | undefined, p: P2): P2 {
  const s = organ ? organShift2D(organ) : null;
  return s ? [p[0] + s[0], p[1] + s[1]] : p;
}

/** The follow of a framing point near edited nodes: the nodes' moves (figure units), each fading smoothly to nothing `reach` units from where the node stood. [0, 0] unedited. */
export function nodeFollow2D(x: number, y: number, reach = 160): P2 {
  const ns = overrides().nodes;
  if (!ns) return [0, 0];
  let dx = 0, dy = 0;
  for (const id of Object.keys(ns)) {
    const p = NODE_POS_2D[id], m = ns[id];
    if (!p || !m) continue;
    const t = Math.min(1, Math.max(0, 1 - Math.hypot(p[0] - x, p[1] - y) / reach)), w = t * t * (3 - 2 * t);
    dx += m.dx * w; dy += m.dy * w;
  }
  return [dx, dy];
}
