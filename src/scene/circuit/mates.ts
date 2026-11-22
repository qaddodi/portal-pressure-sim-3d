// Where one vessel carries on into another on the Circuit's map, and how they change calibre there: ONE rule for every pair, drawn by the vessel shader (vessels/shaders.ts circSwell).
//
// The 2D map draws a vessel at one width and blends two calibres across a join over a fixed run of the map (veins-gl.js: the caliber blends over the fillet's reach, not over a share of the lengths). The 3D map used to ease each vessel over
// 30 % of ITS OWN length, to the mean of the two widths, with each side's ease ending flat at the node (Mohammad, 20 Nov: "why is this not smooth tapering?"):
//   - the share is of each vessel's own length, so the same change of calibre took 6 map units on the 20 unit stretch before the right portal node and 36 on the bed after it: a short angled step on one side of the node, a long taper on the other;
//   - both sides ending flat at the node made a plateau at the node (a shoulder) instead of one S curve through it;
//   - the pair was found by the body's rule (smooth-joins.ts), which leaves out a node with a collateral or a shunt hanging on it and every end a junction skin has taken over, so the left portal node, where the
//     vein meets its bed under the umbilical collateral and the REX shunt, had no pair and no ease at all: a square shoulder.
// Now the pair is found by the map's own rule (every node where exactly two permanent vessels of one kind meet, plus the body's run-ons), and the two widths are joined by ONE smoothstep through the node over `CIRC_EASE` map units each way.
import { NETWORK, NETWORK_BY_ID, sameSegment, type NetVessel } from '../vessels/network.ts';
import { SMOOTH } from '../vessels/smooth-joins.ts';
import { isPermanent } from '../vessels/skin/inventory.ts';
import { indexOf } from '../../engine/vessel-data.ts';
import { COURSES } from './course.ts';
import { MAP_K } from './map.ts';

/** How far each way from the node (map units) two vessels of different calibre are joined by one smoothstep: 12 map units each way, 24 in all, a taper of about 8 degrees for a vein meeting a bed. The 2D fillet's blend runs for about this long. */
export const CIRC_EASE = 12;

export interface CircuitMate { /** the vessel this end carries on into */ id: string; /** the half length of their taper, map units: CIRC_EASE, or less where a short vessel could not take it (the same number on both sides of the pair) */ ease: number }
/** [start, end]: what each end of a vessel carries on into on the map, or null. */
export type CircuitMates = readonly [CircuitMate | null, CircuitMate | null];

/** A vessel's map course in map units, or 0 where it has none. */
export const mapLen = (id: string): number => { const c = COURSES.get(id); return c ? c.lenC / MAP_K : 0; };

/** The share of the shorter of two vessels the half length of their taper may be (so a 20 unit stretch still takes the whole 12 and a shorter one is never all taper). Where a short vessel has a taper at both ends the two overlap a little: their changes of width add, still smooth. */
export const EASE_SHARE = 0.6;
/** The half length of the taper between two vessels: CIRC_EASE, held to EASE_SHARE of the shorter of the two. */
export const easeOf = (a: string, b: string): number => Math.min(CIRC_EASE, EASE_SHARE * mapLen(a), EASE_SHARE * mapLen(b));

function build(): ReadonlyMap<string, [CircuitMate | null, CircuitMate | null]> {
  const out = new Map<string, [CircuitMate | null, CircuitMate | null]>();
  const set = (v: string, end: 0 | 1, m: string): boolean => {
    const cur = out.get(v) ?? [null, null];
    if (cur[end]) return false;
    cur[end] = { id: m, ease: easeOf(v, m) }; out.set(v, cur);
    return true;
  };
  const pair = (a: { id: string; end: 0 | 1 }, b: { id: string; end: 0 | 1 }): void => {
    if (a.id === b.id || !COURSES.has(a.id) || !COURSES.has(b.id)) return;
    if ((out.get(a.id) ?? [])[a.end] || (out.get(b.id) ?? [])[b.end]) return;
    set(a.id, a.end, b.id); set(b.id, b.end, a.id);
  };
  // 1. the body's own pairs (the 2D rule's run-ons, and every node of exactly two): the same pairs, now drawn whether or not a skin took the end over
  for (const [id, s] of SMOOTH) for (const end of [0, 1] as const) { const m = s.mate[end]; if (m) pair({ id, end }, { id: m, end: otherEnd(id, end, m) }); }
  // 2. the map's rule: a node where exactly two permanent vessels of one kind meet carries one on into the other, whatever hangs on it (a collateral, a shunt: they are branches)
  const at = new Map<string, { id: string; end: 0 | 1 }[]>();
  for (const v of NETWORK) {
    if (!isPermanent(v) || !COURSES.has(v.id)) continue;
    for (const [n, end] of [[v.from, 0], [v.to, 1]] as const) { const k = `${n}|${v.tone === 'artery' ? 1 : 0}`; const l = at.get(k) ?? []; l.push({ id: v.id, end }); at.set(k, l); }
  }
  for (const l of at.values()) if (l.length === 2) pair(l[0]!, l[1]!);
  // 3. one segment (network.ts SEGMENT_OF): the engine's halves of one collateral route (the coronary vein and the varices' drain to the azygos) carry on into one another at their station, as one lane
  const stations = new Map<string, { id: string; end: 0 | 1 }[]>();
  for (const v of NETWORK) {
    if (v.feeder || v.kind !== 'collateral' || !COURSES.has(v.id)) continue;
    for (const [n, end] of [[v.from, 0], [v.to, 1]] as const) { const l = stations.get(n) ?? []; l.push({ id: v.id, end }); stations.set(n, l); }
  }
  for (const l of stations.values()) if (l.length === 2 && sameSegment(l[0]!.id, l[1]!.id)) pair(l[0]!, l[1]!);
  return out;
}

/** The end of `m` that lies at the node `id`'s `end` is at. */
function otherEnd(id: string, end: 0 | 1, m: string): 0 | 1 {
  const v = NETWORK_BY_ID.get(id)!, w = NETWORK_BY_ID.get(m)!, node = end ? v.to : v.from;
  return w.from === node ? 0 : 1;
}

/** Per vessel (by id): what its two ends carry on into on the map. */
export const CIRCUIT_MATES: ReadonlyMap<string, CircuitMates> = build();

/** What the vessel shader takes for one end: the mate's data texel, the diameter its tube was built at, its width rule. */
export interface MateUniform { index: number; baseD: number; widthKind: number }
export function mateUniform(m: CircuitMate | null): MateUniform | null {
  const v = m ? NETWORK_BY_ID.get(m.id) : undefined;
  return v ? { index: indexOf(v.lensId), baseD: v.baseD, widthKind: v.widthKind } : null;
}

/** The map's width at a vessel's two ends against its mate's, for a test: the shader's own rule (circSwell) in JS. `own` and `mate` are the two widths (map units, floors already applied), `s` the map distance from the node along this vessel,
 *  `e` the half length of the taper: one smoothstep from the mate's width at -e to this vessel's at +e, the mean at the node. */
export function taperWidth(own: number, mate: number, s: number, e: number): number {
  if (!(e > 0)) return own;
  const t = Math.min(1, Math.max(0, (s + e) / (2 * e)));
  return mate + (own - mate) * (t * t * (3 - 2 * t));
}

/** The length a vessel's flow marks run over in the view `t` (0 the body, 1 the map), in the units its shader draws them in: the body's figure units at 0, map units at 1 (the shader's `len * vU`). The chain's and the dust's
 *  arcs are made from these lengths, so a head that crosses from one vessel into the next lands at the place the next one's lattice has it (a head drawn in the body's length on the map's arc was cut at the seam). */
export function flowLenAt(id: string, bodyLen: number, t: number): number {
  if (!(t > 0)) return bodyLen;
  const c = mapLen(id);
  return c > 0 ? bodyLen + (c - bodyLen) * Math.min(1, t) : bodyLen;
}
