// What only the map has: the liver's branch trees (the portal venules dividing, the sinusoids gathering), the caudate's own lane, and the custom shunts a learner opens, each routed as a
// transit-map line. They are real vessel tubes (the same shader, so the lens colour, the width and the flow marks follow the engine) laid along their map course; they carry the morph's
// attributes with the body course set equal to the map course, so the map's quarter turn takes them along, and they are drawn only as the map comes in (the ramp of the change) -
// the body never shows them. Each fades with the map and with its own presence (a branch with its parent; the caudate lane while a slide is about the caudate; a shunt while open).
import { Group, Vector3 } from 'three';
import { TIER_Z, x3, y3 } from '../frame2d.ts';
import { EDGES } from '../../engine/hales/portal/topology.js';
import { indexOf, hasVessel } from '../../engine/vessel-data.ts';
import { buildTube } from '../anatomy/vessels.ts';
import type { BloodShared } from '../blood/field.ts';
import { markSpeed } from '../flow.ts';
import { len3 } from '../frame2d.ts';
import type { CelShared } from '../materials/cel.ts';
import type { Palette } from '../palette.ts';
import { NETWORK_BY_ID, radiusOf, vesselPx, widthPx } from '../vessels/network.ts';
import { CIRC_ARTERY, CIRC_BED, CIRC_BRANCH_MIN, CIRC_VEIN_MAX, CIRC_VEIN_MIN, MIN_PX } from './width.ts';
import { VesselObject, type LensShared } from '../vessels/vessel-object.ts';
import { attachCircuit } from './geometry.ts';
import { CIRCUIT_D, CIRCUIT_TREES, CUSTOM_EDGES, CUSTOM_SHUNT_PATH, NODE_CIRCUIT, ROUTER_STATIONS, VB_CIRC } from './data.copied.ts';
import { mapCurve } from './course.ts';
import { MAP_K, mapToScene } from './map.ts';
import { circuitWidthMap } from './width.ts';
import { permanentEndsByNode } from '../vessels/skin/inventory.ts';
import { NETWORK } from '../vessels/network.ts';
import { BURY } from '../vessels/smooth-joins.ts';
import { flatOf, growOf } from './grow.ts';
import { courseOf, cumulative, resample } from './paths.ts';
import type { CircuitShared } from './uniforms.ts';
import { createRouter, route as routeText } from './router.copied.js';
import { applyEnds, runOnEnd, sunkEnd } from './map-ends.ts';
import type { ShuntEnd } from '../vessels/shunt-ends.ts';

type Edge = { id: string; from: string; to: string; kind: string; shunt?: string; portal?: boolean; d?: number; dMax?: number; label?: string; zone?: string };
const edges = EDGES as Edge[];
const edgeById = new Map(edges.map((e) => [e.id, e]));

/** A vessel's radius on the map (scene units, at boost 1: what circuit/skins.ts builds its rings at). */
const mapRadius = (v: { widthKind: 0 | 1 | 2; baseD: number; circFine?: number }): number => 0.5 * circuitWidthMap(v.widthKind, v.baseD, 1, v.circFine ?? 1) * MAP_K;
/** The radius of the widest permanent vessel at a node (the trunk a map-only tube ends in), 0 where there is none. */
const trunkRadius = (node: string): number => Math.max(0, ...(permanentEndsByNode(NETWORK).get(node) ?? []).map((e) => mapRadius(e.v)));
/** The map's own tubes (the liver's branches, the caudate lane, the custom shunts) end INSIDE the vessel they leave or reach, as every declared branch of the body does: their outline is not drawn there (the body's rule, scene.ts applyMates: "a child's outline is not drawn where it lies inside its parent's lumen"). `BURY` of the trunk's radius, per end. */
const buryOf = (startTrunk: number, endTrunk: number): [number, number] => [BURY * startTrunk, BURY * endTrunk];
/** How wide the tube a liver branch leaves is, as a share of the lane's: 1 for a branch off the lane itself, the parent branch's `k` for a branch of a branch (its start lies on that branch's course). */
function parentShare(list: readonly { d: string; k: number }[], i: number): number {
  const start = courseOf(list[i]!.d)[0]!;
  for (let j = 0; j < i; j++) {
    const pts = courseOf(list[j]!.d);
    for (let q = 1; q < pts.length; q++) {   // (the nearest point of each segment: a straight run has no points of its own along it)
      const a = pts[q - 1]!, b = pts[q]!, dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      const u = l2 > 0 ? Math.max(0, Math.min(1, ((start[0] - a[0]) * dx + (start[1] - a[1]) * dy) / l2)) : 0;
      if (Math.hypot(a[0] + dx * u - start[0], a[1] + dy * u - start[1]) < 1.5) return list[j]!.k;
    }
  }
  return 1;
}

/** One map-only tube's two ends as the map sews them: the host each lies in (sunk and flared, map-ends.ts), null for a free tip, and the tube's own radius on the map (scene units). */
export interface MapEnds { ends: readonly [ShuntEnd | null, ShuntEnd | null]; own: number }
/** A liver branch's own radius on the map (scene units): its lane's width times its share, never under the least branch width. */
function treeOwn(lane: string, i: number): number {
  const parent = NETWORK_BY_ID.get(lane), list = CIRCUIT_TREES[lane];
  return parent && list?.[i] ? 0.5 * Math.max(CIRC_BRANCH_MIN, circuitWidthMap(parent.widthKind, parent.baseD, 1, parent.circFine ?? 1) * list[i]!.k) * MAP_K : 0;
}
/** The distance (map units) from a point to a course. */
function distToCourse(pts: readonly (readonly [number, number])[], p: readonly [number, number]): number {
  let best = Infinity;
  for (let q = 1; q < pts.length; q++) {
    const a = pts[q - 1]!, b = pts[q]!, dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, u = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(a[0] + dx * u - p[0], a[1] + dy * u - p[1]));
  }
  return best;
}
/** The tube a liver branch's start lies in, and its radius (scene units): the nearest of every lane and every other branch (the sinusoid branches start at the tips of the portal venules: the lane they are named for lies a few units off). */
export function treeHost(lane: string, i: number): { host: string; r: number; dist: number; runOn: boolean } | null {
  const list = CIRCUIT_TREES[lane];
  if (!list?.[i]) return null;
  const s = courseOf(list[i]!.d)[0]!;
  let best: { host: string; r: number; dist: number; runOn: boolean } | null = null;
  // (a start that lies at the END of the tube it is in carries on from it: a run-on, which is sunk but does not flare, as a flare there would be a bulge wider than the tube it continues)
  const take = (host: string, pts: readonly (readonly [number, number])[], r: number): void => { const dist = distToCourse(pts, s), last = pts[pts.length - 1]!; if (!best || dist < best.dist - 1e-9) best = { host, r, dist, runOn: Math.hypot(last[0] - s[0], last[1] - s[1]) < 0.5 }; };
  for (const [l, ls] of Object.entries(CIRCUIT_TREES)) {
    const v = NETWORK_BY_ID.get(l), d = CIRCUIT_D[l];
    if (v && d) take(l, courseOf(d), mapRadius(v));
    ls.forEach((b, j) => { if (l !== lane || j !== i) take(`${l}#${j}`, courseOf(b.d), treeOwn(l, j)); });
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
/** A liver branch: its start sunk in the tube it leaves, its tip free in the bed. */
export function treeEnds(lane: string, i: number): MapEnds | null {
  const own = treeOwn(lane, i), h = treeHost(lane, i);
  if (!h || !(own > 0)) return null;
  return { ends: [h.runOn ? runOnEnd(h.r) : sunkEnd(h.r), null], own };
}
/** What a node of the map is for a tube that ends at it: the widest permanent vessel there; a station of no vessel (the varices' VAR and GV) takes the tube's own caliber, so its end still sinks and flares there. */
const hostAt = (node: string, own: number): ShuntEnd => sunkEnd(trunkRadius(node) || own);
/** The caudate lane: sunk at both ends, in CV_R and in IVCS. */
export function caudEnds(): MapEnds | null {
  const caud = edgeById.get('CAUD');
  if (!caud || !CIRCUIT_D.CAUD) return null;
  const own = 0.5 * circuitWidthMap(0, caud.d ?? caud.dMax ?? 2, 1, 1) * MAP_K;
  return { ends: [hostAt('CV_R', own), hostAt('IVCS', own)], own };
}
/** A custom shunt: sunk at both ends, in the vessels at the two nodes it joins. */
export function customEnds(id: string, dmm: number): MapEnds | null {
  const c = CUSTOM_EDGES.find((q) => q[0] === id);
  if (!c) return null;
  const own = 0.5 * circuitWidthMap(0, dmm, 1, 1) * MAP_K;
  return { ends: [hostAt(c[1], own), hostAt(c[2], own)], own };
}

/** The least a branch is drawn: 1.2 figure units wide (the 2D app's `Math.max(1.2, w * k)`). */
const MIN_BRANCH_W = 1.2;
/** The caudate lane's own colour is its vein's; this is how long it takes to come in or go (ms), as a vessel that comes and goes does. */
const EASE_MS = 320;
/** The camera layer of everything drawn over the organs (scene.ts VESSEL_LAYER). */
const VESSEL_LAYER = 1;

/** A course (map units) as scene points, even in arc length and dense enough that corners keep their rounding. */
function scenePoints(dense: readonly (readonly [number, number])[]): Vector3[] {
  const { total } = cumulative(dense);
  const n = Math.max(12, Math.min(600, Math.ceil(total / 2.5)));
  return resample(dense, n).map(([x, y]) => { const p = mapToScene(x, y); return new Vector3(p[0], p[1], p[2]); });
}

/** The body course of a custom shunt as scene points: its anatomy-plate path (custom-shunt-paths.js) in the plate's own frame, at the tier of the vessels drawn over the rest (2D: an `over` lane). */
function bodyPoints(d: string, n: number): Vector3[] {
  return resample(courseOf(d), n).map(([x, y]) => new Vector3(x3(x), y3(y), TIER_Z.over));
}

export type TubeKind = 'tree' | 'caud' | 'custom';
interface Entry { id: string; kind: TubeKind; obj: VesselObject; parent: string; goal: number; amount: number; /** a custom shunt closed and opened again: the old tube eases out and goes */ dead?: boolean; /** the vessel's two course lengths (scene units), when it has two */ lens?: readonly [number, number] }

export interface TubesContext {
  /** the map's ramp of the change (0 the body, 1 the map) */
  ramp: number;
  /** the change's own share (0 the body, 1 the map): a vessel with two courses is drawn on both, carried between them by it */
  t: number;
  /** the dive's fade of the whole body (1 whole) */
  body: number;
  /** whether the vessel is drawn now (its presence) */
  drawn(id: string): boolean;
  /** a slide is about the caudate lobe: its lane shows */
  caudPin: boolean;
  /** the diameters (mm) of the custom shunts that are open, by edge ID */
  open: Readonly<Record<string, number>>;
}

/** The shader's uniform for a liver branch (2D `cb.w = max(1.2, w * k)`, w the host's own Circuit width): [map units before the boost, 1 if the boost applies, the least width]; the host's diameter is the one its tube was built at. */
export function treeCircW(hostKind: 0 | 1 | 2, hostBaseD: number, fine: number, k: number): readonly [number, number, number, number] {
  const host = hostKind === 1 ? CIRC_ARTERY * fine : hostKind === 2 ? CIRC_BED : Math.min(CIRC_VEIN_MAX, Math.max(CIRC_VEIN_MIN, vesselPx(hostBaseD) * 0.95));
  return [host * k, hostKind === 1 ? 0 : 1, CIRC_BRANCH_MIN, MIN_PX.branch];
}

let runOnsMemo: ReadonlyMap<string, readonly [boolean, boolean]> | null = null;
const RUN_ONS = { get(id: string) { return (runOnsMemo ??= treeRunOns()).get(id); } };

export class CircuitTubes {
  readonly group = new Group();
  private readonly entries: Entry[] = [];
  private readonly routed = new Map<string, [number, number][]>();
  private palette: Palette | null = null;
  private phone = false;
  private useData = false;
  private readonly deps: { shared: CelShared; lens: LensShared; blood: BloodShared; circuit: CircuitShared };

  constructor(shared: CelShared, lens: LensShared, blood: BloodShared, circuit: CircuitShared) {
    this.deps = { shared, lens, blood, circuit };
    this.group.name = 'circuit-only';
    // the liver's branches: each a tube from its parent's lane to where it ends, a share of the parent's caliber
    for (const [id, list] of Object.entries(CIRCUIT_TREES)) {
      const parent = NETWORK_BY_ID.get(id);
      if (!parent) continue;
      list.forEach((b, i) => this.add(`${id}#${i}`, 'tree', id, courseOf(b.d), Math.max(len3(MIN_BRANCH_W / 2), parent.radius * b.k), parent.tone === 'artery' ? 'portal' : parent.tone, parent.baseD, 2, undefined, treeCircW(parent.widthKind, parent.baseD, parent.circFine ?? 1, b.k), [0, 1], undefined, buryOf(treeRunOn(id, i) ? 0 : mapRadius(parent) * parentShare(list, i), 0), treeEnds(id, i) ?? undefined));
    }
    // the caudate's own vein, drawn only while a slide is about the caudate lobe
    const caud = edgeById.get('CAUD');
    const d = CIRCUIT_D.CAUD;
    if (caud && d && hasVessel('CAUD')) this.add('CAUD', 'caud', 'CAUD', courseOf(d), radiusOf(widthPx(caud, caud.d ?? caud.dMax ?? 2)), 'sys', caud.d ?? caud.dMax ?? 2, 0, undefined, undefined, undefined, undefined, buryOf(trunkRadius('CV_R'), trunkRadius('IVCS')), caudEnds() ?? undefined);
  }

  /** `body`: the body course of a vessel that lies on the body too (a custom shunt: custom-shunt-paths.js); the tube is built along it and the map course carries it, as every vessel of the figure is. */
  private add(id: string, kind: TubeKind, edge: string, dense: [number, number][], radius: number, tone: 'portal' | 'sys' | 'artery', baseD: number, widthKind: 0 | 1 | 2, body?: string, circW?: readonly [number, number, number, number], circCap?: readonly [number, number], host?: string, bury?: readonly [number, number], mapEnds?: MapEnds): Entry {
    const mapPts = scenePoints(dense);
    let built, courseLens: readonly [number, number] | undefined;
    if (body) {
      const curveC = mapCurve(dense), lenC = curveC.getLength();
      // as many slices as the map course's rounded corners need (geometry.ts slicesFor: 24 to a scene unit of the longer course)
      const apts = bodyPoints(body, Math.max(12, Math.min(600, Math.ceil(lenC * 24))));
      built = buildTube(apts, radius, true, Math.min(360, Math.max(16, Math.ceil(lenC * 24))));
      if (mapEnds) applyEnds(built.geometry, built.curve, built.tubular, built.radial, mapEnds.ends, mapEnds.own, lenC);
      attachCircuit(built, { curveA: built.curve, curveC, lenA: built.length, lenC } as never, radius);
      courseLens = [built.length, lenC];
    } else {
      built = buildTube(mapPts, radius, true, 0);
      // the body course IS the map course: the morph only turns it (the tube is the body's own where the map is not showing, and hidden then)
      if (mapEnds) applyEnds(built.geometry, built.curve, built.tubular, built.radial, mapEnds.ends, mapEnds.own, built.length);
      attachCircuit(built, { curveA: built.curve, curveC: built.curve, lenA: built.length, lenC: built.length } as never, radius);
    }
    const { shared, lens, blood, circuit } = this.deps;
    const o = new VesselObject(built.geometry, {
      tone, artery: tone === 'artery', lensIndex: indexOf(edge), widthKind, circW, circCap, bands: 2, spec: 1, px: kind === 'tree' ? 0.9 : 1.2,
      vessel: { index: indexOf(edge), len: built.length, stubSpeed: markSpeed(1), radius, baseD },
    }, shared, lens, blood, circuit);
    if (bury) o.setBury(bury[0], bury[1]);
    // (tree lanes that run on into one another: the hair of overlap and nothing else, a width-1 mate of the bed kind swells nothing)
    const ro = kind === 'tree' ? RUN_ONS.get(id) : undefined;
    if (ro) { const m = { index: indexOf(edge), baseD, widthKind: 2 }; o.setMates(ro[0] ? m : null, ro[1] ? m : null); }
    o.edge = { id: edge, from: edgeById.get(edge)?.from ?? '', to: edgeById.get(edge)?.to ?? '', length: built.length };
    o.group.visible = false;
    o.setFade(0);
    if (kind === 'tree') { const a = built.curve.getPointAt(0); o.setStretchAnchors(a, a); }
    // drawn over the organs with the rest of the figure's vessels (scene.ts VESSEL_LAYER)
    o.group.traverse((c) => c.layers.set(VESSEL_LAYER));
    if (this.palette) o.applyPalette(this.palette);
    o.setPhone(this.phone);
    o.setUseData(this.useData);
    this.group.add(o.group);
    const e: Entry = { id, kind, obj: o, parent: host ?? edge, goal: 0, amount: 0, lens: courseLens };
    this.entries.push(e);
    return e;
  }

  applyPalette(p: Palette): void { this.palette = p; for (const e of this.entries) e.obj.applyPalette(p); }
  setPhone(phone: boolean): void { this.phone = phone; for (const e of this.entries) e.obj.setPhone(phone); }
  setUseData(on: boolean): void { this.useData = on; for (const e of this.entries) e.obj.setUseData(on); }

  /** The routed course (map units) of a custom shunt, or null when none could be made. Kept: a shunt keeps its course while it is open, and nothing else on the map moves when another opens. */
  routeOf(id: string): readonly [number, number][] | null { return this.routed.get(id) ?? null; }

  /** Routes the custom shunts that are open and have no course yet, each round everything drawn before it (2D routeCustomShunts). Returns the ones routed now. */
  routeOpen(open: Readonly<Record<string, number>>): string[] {
    const want = Object.keys(open).filter((id) => open[id]! > 0 && CUSTOM_EDGES.some((c) => c[0] === id)).sort();
    for (const id of this.routed.keys()) if (!want.includes(id)) this.routed.delete(id);
    // past a dozen at once there is no room left to route another clear of the rest (and the search would stall): those stay unrouted
    const room = Math.max(0, 12 - this.routed.size), fresh = want.filter((id) => !this.routed.has(id)).slice(0, room);
    if (!fresh.length) return [];
    const lines: [number, number][][] = Object.values(CIRCUIT_D).map((d) => courseOf(d));
    for (const list of Object.values(CIRCUIT_TREES)) for (const b of list) lines.push(courseOf(b.d));
    const router = createRouter({ lines, stations: ROUTER_STATIONS.map((p) => [p[0], p[1]]), bounds: [VB_CIRC[0], 100, VB_CIRC[0] + VB_CIRC[2], VB_CIRC[1] + VB_CIRC[3] + 10] });
    for (const r of this.routed.values()) router.addLine(r, true);
    const done: string[] = [];
    for (const id of fresh) {
      const c = CUSTOM_EDGES.find((q) => q[0] === id)!, a = NODE_CIRCUIT[c[1]], b = NODE_CIRCUIT[c[2]];
      if (!a || !b) continue;
      const pts = router.route([a[0], a[1]], [b[0], b[1]]) as [number, number][] | null;
      if (!pts) continue;
      const dense = courseOf(routeText(pts, 16) as string);
      router.addLine(dense, true);
      this.routed.set(id, dense);
      const e = edgeById.get(id)!, dmm = open[id]!;
      for (const old of this.entries) if (old.id === id) old.dead = true;
      this.add(id, 'custom', id, dense, radiusOf(widthPx(e, dmm)), e.portal ? 'portal' : 'sys', dmm, 0, CUSTOM_SHUNT_PATH[id], undefined, undefined, undefined, undefined, customEnds(id, dmm) ?? undefined);
      done.push(id);
    }
    return done;
  }

  /** Eases each tube in or out with the map and its own presence, and writes its fade. Returns true while any is easing. */
  update(dtMs: number, c: TubesContext): boolean {
    const k = Math.min(1, dtMs / EASE_MS);
    let moving = false;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const gone = this.entries[i]!;
      // a closed shunt's tube, once it has eased out and its route is forgotten (or a newer one stands for it), is let go
      if (gone.kind === 'custom' && gone.amount === 0 && (gone.dead || !this.routed.has(gone.id))) { this.group.remove(gone.obj.group); gone.obj.dispose(); this.entries.splice(i, 1); }
    }
    for (const e of this.entries) {
      // (a liver branch is the map's alone and follows the change itself, so it draws back along its flow when the body returns, not a moment after the camera turns)
      const grown = e.kind === 'tree' ? growOf(e.parent, c.t) : null;
      const want = e.dead ? false : e.kind === 'caud' ? c.caudPin : e.kind === 'custom' ? (c.open[e.id] ?? 0) > 0 : grown != null ? c.t > 0 : c.drawn(e.parent);
      // a custom shunt lies on the body too: it is on while it is open, in either view (the map-only branches wait for the map)
      e.goal = want && (e.lens || c.t > 0) ? 1 : 0;
      if (e.amount !== e.goal) { e.amount = Math.abs(e.goal - e.amount) <= k ? e.goal : e.amount + Math.sign(e.goal - e.amount) * k; moving = true; }
      // a liver branch grows along its flow on the change's own clock (circuit/grow.ts) instead of fading in: the portal venules, then the sinusoids, never a pop
      const f = grown != null ? e.amount * c.body : (e.lens ? 1 : c.ramp) * e.amount * c.body;
      if (grown != null) { e.obj.setReveal(grown); e.obj.setFlat(flatOf(grown)); }
      // the flow marks keep their pitch in scene units: the vessel's length is its body course's, then the map course's (circuit/view.ts)
      if (e.lens) (e.obj.toon.uniforms.len as { value: number }).value = e.lens[0] + (e.lens[1] - e.lens[0]) * c.t;
      e.obj.setFade(f);
      e.obj.group.visible = f > 0.002 && (grown == null || grown > 0.002);
    }
    return moving;
  }

  /** The tubes' own objects, for tests. */
  get objects(): readonly VesselObject[] { return this.entries.map((e) => e.obj); }
  /** Which entries there are and what each follows, for tests. */
  get ids(): readonly { id: string; kind: TubeKind; parent: string }[] { return this.entries.map(({ id, kind, parent }) => ({ id, kind, parent })); }

  dispose(): void { for (const e of this.entries) e.obj.dispose(); }
}

