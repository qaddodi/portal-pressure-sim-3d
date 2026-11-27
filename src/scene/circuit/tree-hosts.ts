// The map's liver branches (circuit/tubes.ts) leave a tube, fork, rejoin one, and run on from tube to tube. Everything the join needs to know about WHICH tube each end lies in lives here, pure (no GL, no scene), so the
// Circuit's depth order (map-depth.ts), the ends' sewing (tubes.ts treeEnds), the union outline's `nbr` attribute (treeNbr) and the tests read ONE answer.
//   - treeHost: the tube a branch's START lies in (its host); treeEndHost: the tube its END lies in (a sinusoid branch rejoining the one it forked from, or the lane), or null for a free tip / a tip that runs on.
//   - treeNbr: for every vertex of a branch, where it stands against that host, in the body's own encoding (vessels/neighbour.ts): the outline of the two tubes together is the outline of their UNION.
import { courseOf, type Pt } from './paths.ts';
import { CIRCUIT_TREES } from './data.copied.ts';
import { CIRCUIT_COURSE_D } from './junction-cuts.ts';
import { MAP_K, mapToScene } from './map.ts';
import { NETWORK_BY_ID, vesselPx } from '../vessels/network.ts';
import { CIRC_ARTERY, CIRC_BED, CIRC_BRANCH_MIN, CIRC_VEIN_MAX, CIRC_VEIN_MIN, MIN_PX, circuitWidthMap } from './width.ts';

/** A vessel's radius on the map (scene units, at boost 1: what circuit/skins.ts builds its rings at). */
export const mapRadius = (v: { widthKind: 0 | 1 | 2; baseD: number; circFine?: number }): number => 0.5 * circuitWidthMap(v.widthKind, v.baseD, 1, v.circFine ?? 1) * MAP_K;

/** A liver branch's own radius on the map (scene units): its lane's width times its share, never under the least branch width. */
export function treeOwn(lane: string, i: number): number {
  const parent = NETWORK_BY_ID.get(lane), list = CIRCUIT_TREES[lane];
  return parent && list?.[i] ? 0.5 * Math.max(CIRC_BRANCH_MIN, circuitWidthMap(parent.widthKind, parent.baseD, 1, parent.circFine ?? 1) * list[i]!.k) * MAP_K : 0;
}
/** The distance (map units) from a point to a course. */
export function distToCourse(pts: readonly (readonly [number, number])[], p: readonly [number, number]): number {
  let best = Infinity;
  for (let q = 1; q < pts.length; q++) {
    const a = pts[q - 1]!, b = pts[q]!, dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, u = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(a[0] + dx * u - p[0], a[1] + dy * u - p[1]));
  }
  return best;
}

export interface TreeHost { host: string; r: number; dist: number; runOn: boolean }
/** Every tube a branch can lie in: the four lanes (PRE_R, PRE_L, SIN_RR, SIN_LL) and every branch, with its course (map units) and its radius (scene units, boost 1). */
function candidates(): { id: string; pts: [number, number][]; r: number }[] {
  const out: { id: string; pts: [number, number][]; r: number }[] = [];
  for (const [l, ls] of Object.entries(CIRCUIT_TREES)) {
    const v = NETWORK_BY_ID.get(l), d = CIRCUIT_COURSE_D[l];
    if (v && d) out.push({ id: l, pts: courseOf(d), r: mapRadius(v) });
    ls.forEach((b, j) => out.push({ id: `${l}#${j}`, pts: courseOf(b.d), r: treeOwn(l, j) }));
  }
  return out;
}
let candMemo: ReturnType<typeof candidates> | null = null;
const cands = (): ReturnType<typeof candidates> => (candMemo ??= candidates());

/** The tube a liver branch's start lies in, and its radius (scene units): the nearest of every lane and every other branch (the sinusoid branches start at the tips of the portal venules: the lane they are named for lies a few units off). */
export function treeHost(lane: string, i: number): TreeHost | null {
  const list = CIRCUIT_TREES[lane];
  if (!list?.[i]) return null;
  const s = courseOf(list[i]!.d)[0]!, me = `${lane}#${i}`;
  let best: TreeHost | null = null;
  // (a start that lies at the END of the tube it is in carries on from it: a run-on, which is sunk but does not flare, as a flare there would be a bulge wider than the tube it continues)
  for (const c of cands()) {
    if (c.id === me) continue;
    const dist = distToCourse(c.pts, s), last = c.pts[c.pts.length - 1]!;
    if (!best || dist < best.dist - 1e-9) best = { host: c.id, r: c.r, dist, runOn: Math.hypot(last[0] - s[0], last[1] - s[1]) < 0.5 };
  }
  return best;
}
/** The tube a liver branch's END lies in, or null: the nearest tube whose wall the end lies inside (its distance from the course within its radius), not one that starts at this very end (a tube that carries on from it: the portal venule's tip at x = 800 has none, the
 *  sinusoid branch that starts there is its run-on). A sinusoid branch that rejoins its sibling ends in it (x = 858) and each of the two that reach the central vein ring ends in the lane (x = 892). */
export function treeEndHost(lane: string, i: number): TreeHost | null {
  const list = CIRCUIT_TREES[lane];
  if (!list?.[i]) return null;
  const pts = courseOf(list[i]!.d), e = pts[pts.length - 1]!, me = `${lane}#${i}`;
  let best: TreeHost | null = null;
  for (const c of cands()) {
    if (c.id === me) continue;
    const first = c.pts[0]!;
    if (Math.hypot(first[0] - e[0], first[1] - e[1]) < 0.5) continue;   // (it starts here: it carries on from this tube, or it leaves it)
    const dist = distToCourse(c.pts, e);
    if (dist * MAP_K > c.r) continue;
    if (!best || dist < best.dist - 1e-9) best = { host: c.id, r: c.r, dist, runOn: false };
  }
  return best;
}
/** A liver branch whose start lies at the END of another tube carries on from it (the portal venules' tips run on into the sinusoid lanes at x = 800): a run-on, not a side branch. Its outline is held back nowhere (the shader's own rule: "never at a run-on's ring"; bury is for a branch inside its trunk, and a tube that ends there has no wall past its end to show the ink), and both rings run on a hair into each other (the mates). */
export function treeRunOn(lane: string, i: number): boolean { return treeHost(lane, i)?.runOn === true; }
/** For each liver branch (`lane#i`), whether its start and its end carry on into another branch's start/end: the rings the vessel shader runs on a hair, so two flat rings that meet exactly leave no light line or ink seam across the lane. */
export function treeRunOns(): ReadonlyMap<string, readonly [boolean, boolean]> {
  const out = new Map<string, [boolean, boolean]>();
  for (const [lane, list] of Object.entries(CIRCUIT_TREES)) list.forEach((_, i) => out.set(`${lane}#${i}`, [false, false]));
  for (const [lane, list] of Object.entries(CIRCUIT_TREES)) list.forEach((_, i) => {
    const h = treeRunOn(lane, i) ? treeHost(lane, i) : null;
    if (!h) return;
    out.get(`${lane}#${i}`)![0] = true;
    const prev = out.get(h.host);
    if (prev) prev[1] = true;
  });
  return out;
}

/** The shader's uniform for a liver branch (2D `cb.w = max(1.2, w * k)`, w the host's own Circuit width): [map units before the boost, 1 if the boost applies, the least width]; the host's diameter is the one its tube was built at. */
export function treeCircW(hostKind: 0 | 1 | 2, hostBaseD: number, fine: number, k: number): readonly [number, number, number, number] {
  const host = hostKind === 1 ? CIRC_ARTERY * fine : hostKind === 2 ? CIRC_BED : Math.min(CIRC_VEIN_MAX, Math.max(CIRC_VEIN_MIN, vesselPx(hostBaseD) * 0.95));
  return [host * k, hostKind === 1 ? 0 : 1, CIRC_BRANCH_MIN, MIN_PX.branch];
}
/** A lane's own width rule, as the vessel object's `circuitWidth` gives it (the two are tested equal): the liver's lanes are beds, 8 map units times the boost. A vein would read the engine's diameter and has no fixed width: the branch trees have none. */
export function laneCircW(widthKind: 0 | 1 | 2, fine = 1): readonly [number, number, number, number] {
  if (widthKind === 1) return [CIRC_ARTERY * fine, 0, 0, MIN_PX.artery];
  if (widthKind === 2) return [CIRC_BED, 1, 0, MIN_PX.bed];
  throw new Error('a vein lane has no fixed width');
}
/** The width rule (the shader's `circW`) of a tube a branch can lie in: a lane's, or a branch's (its lane's width times its share). */
export function hostCircW(host: string): readonly [number, number, number, number] {
  const [lane, k] = host.split('#') as [string, string | undefined], parent = NETWORK_BY_ID.get(lane);
  if (!parent) throw new Error(`no lane ${lane}`);
  if (k == null) return laneCircW(parent.widthKind, parent.circFine ?? 1);
  return treeCircW(parent.widthKind, parent.baseD, parent.circFine ?? 1, CIRCUIT_TREES[lane]![Number(k)]!.k);
}
/** A host's radius on the map NOW (scene units), by the vertex shader's rule (shaders.ts vNbr, the same as circSwell): the width before the boost's floor on the screen, times the boost where it applies, never under the least width or the least on the screen. */
export const hostRadiusNow = (w: readonly [number, number, number, number], boost: number, perPx: number): number => 0.5 * Math.max(Math.max(w[2], w[0] * (1 + (boost - 1) * w[1])), w[3] * perPx) * MAP_K;

/** The most tubes one branch's outline is held back inside: the tube it leaves (or reaches) and the sibling that leaves (or reaches) the same place. */
export const NBR_HOSTS = 2;
/** `nbr` of a vertex that has no tube there (or lies past its end): beyond any radius, so the vertex stage reads "outside". */
export const NBR_NONE = 1e3;
export interface NbrAxis { id: string; P: [number, number][]; r: number; w: readonly [number, number, number, number] }
function axisOf(id: string, d: string, r: number): NbrAxis {
  return { id, P: courseOf(d).map(([x, y]) => { const p = mapToScene(x, y); return [p[0], p[1]] as [number, number]; }), r, w: hostCircW(id) };
}
const courseD = (id: string): string | null => { const [l, k] = id.split('#'); return k == null ? CIRCUIT_COURSE_D[l!] ?? null : CIRCUIT_TREES[l!]?.[Number(k)]?.d ?? null; };
/** The tubes branch `lane#i`'s outline is the union with, as axes in the scene's plane, in the order they claim a slot: the tube it leaves (not one it carries on from: a run-on's ring is joined by the mates, never held back), the tube it reaches, and the
 *  branches that leave or reach the same place (siblings: two branches that fork from one narrow tube overlap each other outside it, at the crotch). */
const axesMemo = new Map<string, NbrAxis[]>();
export function treeNbrAxes(lane: string, i: number): NbrAxis[] {
  const key = `${lane}#${i}`, hit = axesMemo.get(key);
  if (hit) return hit;
  const out: NbrAxis[] = [], me = `${lane}#${i}`, s = treeHost(lane, i), e = treeEndHost(lane, i);
  const add = (id: string, r: number): void => { const d = courseD(id); if (d && !out.some((a) => a.id === id)) out.push(axisOf(id, d, r)); };
  if (s && !s.runOn) add(s.host, s.r);
  if (e) add(e.host, e.r);
  const mine = courseOf(CIRCUIT_TREES[lane]![i]!.d), a = mine[0]!, b = mine[mine.length - 1]!;
  for (const [l, list] of Object.entries(CIRCUIT_TREES)) list.forEach((t, j) => {
    const id = `${l}#${j}`;
    if (id === me) return;
    const pts = courseOf(t.d), first = pts[0]!, last = pts[pts.length - 1]!;
    if ((s && !s.runOn && Math.hypot(first[0] - a[0], first[1] - a[1]) < 0.5) || (e && Math.hypot(last[0] - b[0], last[1] - b[1]) < 0.5)) add(id, treeOwn(l, j));
  });
  axesMemo.set(key, out);
  return out;
}
/** The vertex's place against ONE axis: the distance from it (scene units; NBR_NONE past its end: its ends are open cuts, not round), and how far inside its lumen at boost 1. */
export function nbrAgainst(a: NbrAxis, x: number, y: number): { dist: number; past: boolean } {
  const { P } = a, n = P.length;
  let best = Infinity, bs = 0, braw = 0;
  for (let i = 0; i < n - 1; i++) {
    const ax = P[i]![0], ay = P[i]![1], dx = P[i + 1]![0] - ax, dy = P[i + 1]![1] - ay, dl = dx * dx + dy * dy || 1e-12;
    const raw = ((x - ax) * dx + (y - ay) * dy) / dl, t = Math.min(1, Math.max(0, raw));
    const d = (x - (ax + dx * t)) ** 2 + (y - (ay + dy * t)) ** 2;
    if (d < best) { best = d; bs = i; braw = raw; }
  }
  return { dist: Math.sqrt(best), past: (bs === 0 && braw < 0) || (bs === n - 2 && braw > 1) };
}
/** One vertex's `nbr`: (distance from the first axis, distance from the second, 0) in scene units, UNSIGNED, NBR_NONE where there is no such tube or the vertex lies past its end. The vertex stage turns each into how far the vertex lies inside that tube's lumen NOW (its live radius less the distance) and keeps the deeper. */
export function nbrOf(axes: readonly NbrAxis[], x: number, y: number): [number, number, number] {
  const out: [number, number, number] = [NBR_NONE, NBR_NONE, 0];
  axes.slice(0, NBR_HOSTS).forEach((a, k) => { const m = nbrAgainst(a, x, y); out[k] = m.past ? NBR_NONE : m.dist; });
  return out;
}
/** `nbr` for every vertex of branch `lane#i`'s tube (`positions`: its xyz), three floats each, or null where it has no tube to be the union with. */
export function treeNbr(lane: string, i: number, positions: ArrayLike<number>): Float32Array | null {
  const axes = treeNbrAxes(lane, i);
  if (!axes.length) return null;
  const count = positions.length / 3, out = new Float32Array(count * 3);
  for (let v = 0; v < count; v++) out.set(nbrOf(axes, positions[v * 3]!, positions[v * 3 + 1]!), v * 3);
  return out;
}
/** The two width rules the vertex stage reads the axes' live radii from (the `circW` of the tube each lies in); zeros where the slot is empty. */
export function treeNbrWidths(lane: string, i: number): [readonly [number, number, number, number], readonly [number, number, number, number]] {
  const axes = treeNbrAxes(lane, i), none = [0, 0, 0, 0] as const;
  return [axes[0]?.w ?? none, axes[1]?.w ?? none];
}
export type { Pt };
