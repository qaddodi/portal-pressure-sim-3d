// Anatomy editor re-anchoring (?editor; docs/editor-plan.md WS-D). Every consumer that used to read the reference 2D plan (EDGE_PATH_2D, NODE_POS_2D, the organ names' fixed spots)
// reads it here instead, so a figure edited with overrides (src/editor) moves its catheter route, scope targets, station dots, organ names and framing with it.
// With no vessel, node or organ edit every function returns its reference value UNCHANGED (the same array or number), so the unedited figure is byte-identical.
import { overrides } from '../editor/store.ts';
import { EDGE_PATH_2D, NODE_POS_2D } from './vessels/paths.copied.ts';
import { NETWORK_BY_ID, courseOf } from './vessels/network.ts';
import { editedPlan } from '../editor/vessel-plan.ts';
import { TIER_Z } from './frame2d.ts';

type P2 = readonly [number, number];

/** Whether any vessel or node geometry is edited (organ edits do not touch the 2D plan). */
export const planEdited = (): boolean => { const o = overrides(); return !!(o.nodes && Object.keys(o.nodes).length) || !!(o.vessels && Object.keys(o.vessels).length); };

/** The depth of a vessel's course at point `i` of `n` (as path2D lists them): `tier` unedited; once edited, the built course's depth, which already carries the edited dz (network.ts courseOf adds it once, so nothing here adds it again). */
export function zAtPoint(id: string, i: number, n: number, tier: number): number { return zAtU(id, n > 1 ? i / (n - 1) : 0, tier); }
/** The depth of a vessel's course at share `u` (0..1) of its points: `tier` unedited, the built course's depth (dz in it once) once edited. */
export function zAtU(id: string, u: number, tier: number): number {
  if (!planEdited()) return tier;
  const c = courseOf(id);
  if (!c.length) return tier;
  if (c.length < 2) return c[0]![2];
  const t = Math.min(1, Math.max(0, u)) * (c.length - 1), k = Math.min(c.length - 2, Math.floor(t)), w = t - k;
  return c[k]![2] + (c[k + 1]![2] - c[k]![2]) * w;
}

/** The depth of a vessel's course at share `f` (0..1) of its LENGTH (where pointOn puts a target): the course's edited depth there, which carries every dz offset (a node's, eased down the arm by vessel-apply, and control points') once. `tier` unedited. */
export function zAtArc(id: string, f: number, tier: number): number {
  if (!planEdited()) return tier;
  const p = (editedPlan() as Record<string, readonly P2[] | undefined>)[id];
  if (!p || p.length < 2) return zAtU(id, f, tier);
  let total = 0;
  const cum = [0];
  for (let i = 1; i < p.length; i++) { total += Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]); cum.push(total); }
  const s = Math.min(1, Math.max(0, f)) * total;
  let i = 1;
  while (i < p.length - 1 && cum[i]! < s) i++;
  const span = cum[i]! - cum[i - 1]!, u = span > 0 ? (s - cum[i - 1]!) / span : 0;
  return zAtU(id, (i - 1 + u) / (p.length - 1), tier);
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
import { organBoxes, organCentroids, organPointMap, type Box } from '../editor/organ-apply.ts';
import { ORGAN_Z } from './organs/z.ts';
import { x3, y3, x2d, y2d, UNITS_PER_SCENE as U } from './frame2d.ts';
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
let mapsFor: unknown = null, maps = new Map<string, { m: ((p: V3) => V3) | null; exact: boolean }>();
/** The organ's cage frame before its mesh is in: its outline's box in x and y, and a depth of 0.1 each side of ORGAN_Z (the mesh's own box replaces it once the organs are made). */
const approxBox = (organ: string): Box => {
  const { rs, centre: c } = outlineOf(organ);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const r of rs) for (const [x, y] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { lo: [x3(x0), y3(y1), c[2] - 0.1], hi: [x3(x1), y3(y0), c[2] + 0.1] };
};
/** An organ's edit as a scene-point map (move, turn, scale, liquify, cage and grid: the mesh's own arithmetic), or null when it is not edited. It uses the mesh's own centre and box once the organs are made. */
export function organMap(organ: string): ((p: V3) => V3) | null {
  const o = overrides();
  if (mapsFor !== o) { mapsFor = o; maps = new Map(); }
  const exact = !!organBoxes[organ], c = maps.get(organ);
  if (!c || (!c.exact && exact)) {
    const e = o.organs?.[organ];
    maps.set(organ, { m: e ? organPointMap(e, organCentroids[organ] ?? outlineOf(organ).centre, organBoxes[organ] ?? (e.cage ? approxBox(organ) : undefined)) : null, exact });
  }
  return maps.get(organ)!.m;
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
/** How far (figure units) the abdominal wall feels an organ that bounds it: the whole move at the organ's outline, nothing this far from it. */
export const WALL_REACH = 120;
/** The organs that bound the cavity the ascites fills. */
export const WALL_ORGANS = ['liver', 'spleen', 'bowel'] as const;
const distToRings = (rs: Ring[], x: number, y: number): number => {
  let best = Infinity;
  for (const P of rs) for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const ax = P[j]![0], ay = P[j]![1], bx = P[i]![0], by = P[i]![1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + dx * t), y - (ay + dy * t)));
  }
  return best;
};
/** A point of the abdominal wall (figure units) carried by the organs that bound it: each edited organ (move, turn, scale, liquify: its point map) pulls the wall near its outline by what it does there, fading to
 *  nothing WALL_REACH units away (smoothly). The same array when none of them is edited. */
export function wallFollow(p: P2): P2 {
  const os = overrides().organs;
  if (!os) return p;
  let dx = 0, dy = 0;
  for (const id of WALL_ORGANS) {
    const m = organMap(id);
    if (!m) continue;
    const o = outlineOf(id), d = inside(o.rs, p[0], p[1]) ? 0 : distToRings(o.rs, p[0], p[1]);
    if (d >= WALL_REACH) continue;
    const t = 1 - d / WALL_REACH, w = t * t * (3 - 2 * t), q = [x3(p[0]), y3(p[1]), ORGAN_Z[id] ?? 0] as V3, r = m(q);
    dx += (r[0] - q[0]) * U * w; dy -= (r[1] - q[1]) * U * w;
  }
  return dx === 0 && dy === 0 ? p : [p[0] + dx, p[1] + dy];
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

// ---- Named anchors for camera framings (audit item 9): a framing follows what it frames, by vessel id + share of its length, or by organ id, never by a guess of nearby nodes ----
export type Anchor = { organ: string } | { vessel: string; f?: number };
export type Shift = readonly [number, number, number];
const ZERO: Shift = [0, 0, 0];
const arcPoint = (p: readonly P2[], f: number): P2 => {
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1]! + Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]));
  const s = Math.min(1, Math.max(0, f)) * cum[cum.length - 1]!;
  let i = 1;
  while (i < p.length - 1 && cum[i]! < s) i++;
  const span = cum[i]! - cum[i - 1]!, u = span > 0 ? (s - cum[i - 1]!) / span : 0;
  return [p[i - 1]![0] + (p[i]![0] - p[i - 1]![0]) * u, p[i - 1]![1] + (p[i]![1] - p[i - 1]![1]) * u];
};
/** How far an anchor has moved from the reference figure: figure units in x and y (y down), scene units in depth. [0, 0, 0] unedited. */
export function anchorShift(a: Anchor): Shift {
  if ('organ' in a) {
    const m = organMap(a.organ);
    if (!m) return ZERO;
    const c = outlineOf(a.organ).centre, q = m(c);
    return [(q[0] - c[0]) * U, -(q[1] - c[1]) * U, q[2] - c[2]];
  }
  const ref = EDGE_PATH_2D[a.vessel] as readonly P2[] | undefined, ed = (editedPlan() as Record<string, readonly P2[] | undefined>)[a.vessel];
  if (!ref || !ed || ed === ref) return ZERO;
  const f = a.f ?? 0.5, r = arcPoint(ref, f), e = arcPoint(ed, f);
  const tier = TIER_Z[NETWORK_BY_ID.get(a.vessel)?.tier ?? 'net'];
  return [e[0] - r[0], e[1] - r[1], zAtArc(a.vessel, f, tier) - tier];
}
/** The mean shift of several anchors (the same zeros when none has moved). */
export function meanShift(as: readonly Anchor[]): Shift {
  if (!as.length) return ZERO;
  let x = 0, y = 0, z = 0;
  for (const a of as) { const s = anchorShift(a); x += s[0]; y += s[1]; z += s[2]; }
  return x === 0 && y === 0 && z === 0 ? ZERO : [x / as.length, y / as.length, z / as.length];
}
/** What each named plate region of the slides frames (2D `regions`): the organs and vessels whose edits move it. A region absent here (and listed in UNANCHORED_REGIONS) frames a fixed part of the plate. */
export const REGION_ANCHORS: Readonly<Record<string, readonly Anchor[]>> = {
  route: [{ vessel: 'SVC_RA' }, { vessel: 'IVCS_RA' }, { vessel: 'IVC_IS' }],
  liver: [{ organ: 'liver' }],
  portal: [{ vessel: 'PV_TRUNK' }, { vessel: 'PVH_L' }],
  gut: [{ organ: 'bowel' }],
  hepatic: [{ vessel: 'RHV_IVC' }, { vessel: 'MHV_IVC' }, { vessel: 'LHV_IVC' }],
  dips: [{ vessel: 'DIPS' }],
  heart: [{ organ: 'heart' }],
  varices: [{ vessel: 'C1a' }],
  bleed: [{ organ: 'stomach' }],
  gej: [{ organ: 'stomach' }],
  feeder: [{ vessel: 'C2' }],
  spleen: [{ organ: 'spleen' }],
  rectum: [{ organ: 'colon' }],
  fundus: [{ organ: 'stomach' }],
  splenic: [{ vessel: 'V_SPL' }],
};
/** Slide cameras that frame a fixed part of the plate and follow no edit: the abdominal wall, the whole figure and raw boxes (the Circuit view has its own regions). */
export const UNANCHORED_REGIONS: readonly string[] = ['wall', 'fit', 'box'];
/** The shift of a body slide's camera named by `names` (region names). */
export const regionShift = (names: readonly string[]): Shift => meanShift(names.flatMap((n) => REGION_ANCHORS[n] ?? []));
/** The shift of an organ's plate box (an `on: [organ]` camera). */
export const organBoxShift = (organ: string): Shift => anchorShift({ organ });
export function shiftBox(box: readonly [number, number, number, number], s: Shift): readonly [number, number, number, number] {
  return s[0] === 0 && s[1] === 0 ? box : [box[0] + s[0], box[1] + s[1], box[2] + s[0], box[3] + s[1]];
}
/** The shift of a framing point (x, y) the figure aims at: that of the nearest point on the named vessels' reference courses, kept as an offset from it. [0, 0, 0] unedited. */
export function pointShift(x: number, y: number, vessels: readonly string[]): Shift {
  let best = Infinity, pick: { id: string; f: number } | null = null;
  for (const id of vessels) {
    const p = EDGE_PATH_2D[id] as readonly P2[] | undefined;
    if (!p) continue;
    let total = 0, upTo = 0;
    const lens = p.slice(1).map((q, i) => Math.hypot(q[0] - p[i]![0], q[1] - p[i]![1]));
    for (const l of lens) total += l;
    for (let i = 1; i < p.length; i++) {
      const ax = p[i - 1]![0], ay = p[i - 1]![1], dx = p[i]![0] - ax, dy = p[i]![1] - ay, l2 = dx * dx + dy * dy, t = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
      const d = Math.hypot(x - ax - dx * t, y - ay - dy * t);
      if (d < best) { best = d; pick = { id, f: total > 0 ? (upTo + lens[i - 1]! * t) / total : 0 }; }
      upTo += lens[i - 1]!;
    }
  }
  return pick ? anchorShift({ vessel: pick.id, f: pick.f }) : ZERO;
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
