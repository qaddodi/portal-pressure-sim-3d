// Anatomy editor re-anchoring (?editor; docs/editor-plan.md WS-D). Every consumer that used to read the reference 2D plan (EDGE_PATH_2D, NODE_POS_2D, the organ names' fixed spots)
// reads it here instead, so a figure edited with overrides (src/editor) moves its catheter route, scope targets, station dots, organ names and framing with it.
// With no vessel, node or organ edit every function returns its reference value UNCHANGED (the same array or number), so the unedited figure is byte-identical.
import { overrides } from '../editor/store.ts';
import { EDGE_PATH_2D, NODE_POS_2D } from './vessels/paths.copied.ts';
import { NETWORK_BY_ID, courseOf } from './vessels/network.ts';

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

/** The depth of a vessel's course at point `i` of `n` (as path2D lists them): `tier` unedited; once edited, the built course's depth, which already carries the edited dz (network.ts courseOf adds it once, so nothing here adds it again). */
export function zAtPoint(id: string, i: number, n: number, tier: number): number {
  if (!planEdited()) return tier;
  const c = courseOf(id);
  if (!c.length) return tier;
  const t = n > 1 ? (i / (n - 1)) * (c.length - 1) : 0, k = Math.min(c.length - 2, Math.floor(t)), u = t - k;
  return c.length < 2 ? c[0]![2] : c[k]![2] + (c[k + 1]![2] - c[k]![2]) * u;
}

/** A topology node's place on the 2D figure: the reference place plus the node's edited move. */
export function nodePos2D(id: string): P2 | undefined {
  const p = NODE_POS_2D[id];
  const m = overrides().nodes?.[id];
  return p && m ? [p[0] + m.dx, p[1] + m.dy] : p;
}
/** The depth an edited node adds to the one the vessels give it (0 unedited). */
export const nodeDz = (id: string): number => overrides().nodes?.[id]?.dz ?? 0;

// @ts-ignore copied plain JS
import { ORGANS } from './labels/organ2d/outlines.copied.js';
// @ts-ignore copied plain JS
import { flattenPath } from './labels/organ2d/flatten.js';
import { organPointMap } from '../editor/organ-apply.ts';
import { ORGAN_Z } from './organs/z.ts';
import { x3, y3, x2d, y2d } from './frame2d.ts';
import type { V3 } from '../editor/types.ts';

type Ring = [number, number][];
const rings = (id: string): Ring[] => {
  const o = (ORGANS as { id: string; d?: string; ring?: string }[]).find((q) => q.id === id);
  const polys: { pts: number[] }[] = o ? flattenPath((o.ring ?? o.d)!, 4) : [];
  return polys.map((p) => Array.from({ length: p.pts.length / 2 }, (_, i) => [p.pts[2 * i]!, p.pts[2 * i + 1]!] as [number, number])).filter((q) => q.length > 2);
};
/** The outlines an organ mesh is extruded from (the esophagus is part of the stomach's mesh). */
const OUTLINES: Readonly<Record<string, readonly string[]>> = { stomach: ['stomach', 'esophagus'] };
const kept = new Map<string, { rs: Ring[]; centre: V3 }>();
function outlineOf(organ: string): { rs: Ring[]; centre: V3 } {
  let k = kept.get(organ);
  if (!k) {
    const rs = (OUTLINES[organ] ?? [organ]).flatMap(rings);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const r of rs) for (const [x, y] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    // (the mesh is the outline extruded by the one map, so its box middle is the outline's; its depth middle is ORGAN_Z)
    kept.set(organ, k = { rs, centre: rs.length ? [x3((x0 + x1) / 2), y3((y0 + y1) / 2), ORGAN_Z[organ] ?? 0] : [0, 0, 0] });
  }
  return k;
}
let mapsFor: unknown = null, maps = new Map<string, ((p: V3) => V3) | null>();
/** An organ's edit as a scene-point map (move, rotY, scale about its centre), or null when it is not edited. */
export function organMap(organ: string): ((p: V3) => V3) | null {
  const o = overrides();
  if (mapsFor !== o) { mapsFor = o; maps = new Map(); }
  if (!maps.has(organ)) maps.set(organ, o.organs?.[organ] ? organPointMap(o.organs[organ], outlineOf(organ).centre) : null);
  return maps.get(organ)!;
}
/** A scene point that hangs on an organ, carried with the organ's edit (the same array when unedited). */
export function organPoint(organ: string | undefined, p: V3): V3 {
  const m = organ ? organMap(organ) : null;
  return m ? m(p) : p;
}
/** A 2D figure point on an organ (at depth `z`, the organ's own by default), carried with the organ's edit: the same array when the organ is not edited. */
export function withOrgan(organ: string | undefined, p: P2, z?: number): P2 {
  const m = organ ? organMap(organ) : null;
  if (!m) return p;
  const q = m([x3(p[0]), y3(p[1]), z ?? ORGAN_Z[organ!] ?? 0]);
  return [x2d(q[0]), y2d(q[1])];
}
/** The organ mesh each 2D organ caption (names.copied ORGAN_AT keys) belongs to. */
export const ORGAN_OF_CAPTION: Readonly<Record<string, string>> = { Liver: 'liver', Spleen: 'spleen', Stomach: 'stomach', Colon: 'colon', Kidney: 'kidney-l', 'Small bowel': 'bowel', Esophagus: 'stomach', 'Right atrium': 'heart-ra' };
const inside = (rs: Ring[], x: number, y: number): boolean => {
  let c = false;
  for (const P of rs) for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i]![1] > y) !== (P[j]![1] > y) && x < ((P[j]![0] - P[i]![0]) * (y - P[i]![1])) / (P[j]![1] - P[i]![1]) + P[i]![0]) c = !c;
  return c;
};
/** A fixed 2D point that sits on an organ's outline (a card's anchor): carried with the first edited organ that holds it; unchanged when no organ is edited or none holds it. */
export function followOrganAt(p: P2, z?: number): P2 {
  const os = overrides().organs;
  if (!os) return p;
  for (const id of Object.keys(os)) if (organMap(id) && inside(outlineOf(id).rs, p[0], p[1])) return withOrgan(id, p, z);
  return p;
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
