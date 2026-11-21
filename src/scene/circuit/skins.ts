// The Circuit's junction skins: the Anatomy's welded junctions (vessels/skin, docs/junction-skin-spec.md) on the map. Until now the map's tubes simply overlapped where they meet: the Circuit's lines ran into a node as separate tubes (a pinched
// teardrop at the lower portal node, wedges where the hepatic veins reach the cava, a seam at the right hepatic vein; rebuild-3d/circuit-compare/circ-differences.md, items 5 and 6), because the map has no junction code at all.
// This is the same pipeline, one frame over:
//   - INVENTORY (`findCircuitJunctions`): the nodes the body welds (3 to 6 permanent tubes), read on the map's own courses and the map's own widths (circuit/width.ts: 2D's widthAt at t = 1, boost 1). Every arm ends exactly on its station
//     (tests/circuit-skins.test.ts pins it), so there are no side-wall landings on the map; the two beds' arterioles stop 30 map units short of the bed's station (the 2D art's own gap), which the skin's bridge spans.
//   - RINGS (`circuitTube`): the tube a vessel is on the map, to the last vertex: the body tube's own mesh carried to the map by the vertex shader's rule at circT = 1 (circuit/shader.ts circuitMorph: the map course's centre, the vertex's offset in the
//     frame fixed by the course's direction, the map's radius), computed here on the CPU. Ring k of the vertex shader's tube is ring k of this one, so a cut at u = k / tubular is a cut on a ring the tube really has, and the skin starts on its vertices:
//     no crack. Built on the UNTURNED map; the map's quarter turn is the skin's object matrix (`setTurn`), as the shader turns the tubes.
//   - CUTS AND MESH: cuts.ts planSkins and mesh.ts buildSkinSteady, unchanged: the cut, the merge of two crowded nodes (CONF and PVT_L), the smooth-union fillet, the weights. The skins are STATIC full-size shapes (the Anatomy's, skin-set.ts): a growing arm is a whole arm of the
//     welded skin, the permanent arms that stay get a plain trunk of their own (vessels/skin/plain.ts) while it grows, the map tube's own sunk and flared end is what grows (map-sewn.ts), and the welded skin dithers in over it from growth 0.9 to 1 (`weld`, below).
//   - DRAWING: skin-object.ts with `SKIN_CIRC` (skin/shaders.ts): the map's widths (the zoom's boost, the least width on the screen), its bolder line and inner line. It is in over the END of the change (SKIN_CIRC_IN .. 1) and the arm tubes' second cut
//     (`skinCutC`, vessels/shaders.ts) takes their ends away over the same, by one screen pattern: the body's skins are gone by 0.35 and the tubes whole between, so a junction is never two skins at once and nothing pops.
//   - BAKED at build time with the Anatomy's (scripts/bake-skins.mjs): the file `anatomy/circuit-skins.bin` carries these, so the page meshes nothing at load; a figure the file was not made for builds them live as before.
// Left out, named in tests/circuit-skins.test.ts (`circuitOldJoins`; no growing arm is dropped now): the liver's branch trees, the caudate lane and the custom shunts are tubes of the map's own (circuit/tubes.ts), no vessel of the network, and are not welded: their ends are sunk and flared as 2D draws them (circuit/map-ends.ts).
// Meshed from the surface where the hull of the seam rings refuses (sheet.ts, `SkinJunction.surface`); a growing arm whose full-size shape still folds is dropped and named (`dropped`, `why`): none is today.
import type { Group, Object3D } from 'three';
import { Matrix4 } from 'three';
import { NETWORK, NETWORK_BY_ID, cutEnd, type NetVessel } from '../vessels/network.ts';
import { REST, coursesOf, tubularOf } from '../vessels/shape.ts';
import { TUBE_RADIAL, buildTubes } from '../vessels/tubes.ts';
import { indexOf } from '../../engine/vessel-data.ts';
import { GROW_REACH, MAX_ARMS, MIN_ARMS, PHASE_2_NODES, SKIN_REACH, growerEndsByNode, permanentEndsByNode } from '../vessels/skin/inventory.ts';
import { armPresenceAt, hiWeightAt, lensUAt, type HiState } from '../vessels/skin/arm-twins.ts';
import { armWalk, planSkins, type ArmTube, type HullOk } from '../vessels/skin/cuts.ts';
import { PACES, buildSkinSteady, hullCovers } from '../vessels/skin/mesh.ts';
import { plainOf, weldOf } from '../vessels/skin/plain.ts';
import { skinsDigest, type BakedSkin, type BakedSkins, type PlainBake } from '../vessels/skin/baked.ts';
import { sdArm, skinKOf } from '../vessels/skin/sdf.ts';
import { weldThrough } from '../vessels/skin/through.ts';
import { SKIN_CUT_C_NONE, SKIN_GROWERS, SKIN_HIDDEN, SkinBuildError, type SkinArm, type SkinCut, type SkinJunction, type SkinMesh, type Vec3 } from '../vessels/skin/types.ts';
import { axisOf, capsuleOf, ringOf, type SkinDraw } from '../vessels/skin/skin-set.ts';
import { sewOnMap } from './map-sewn.ts';
import type { ArmAxis } from '../vessels/skin/skin-object.ts';
import type { VesselObject } from '../vessels/vessel-object.ts';
import { COURSES } from './course.ts';
import { decode } from './frame.ts';
import { attachRuns, slicesFor } from './geometry.ts';
import { CIRCUIT_D, CIRCUIT_TREES, CUSTOM_EDGES } from './data.copied.ts';
import { MAP_CENTRE, MAP_K } from './map.ts';
import { circuitWidthMap } from './width.ts';

/** How far (in radii of the widest arm) an arm's end may lie from J on the map: the body's own SKIN_REACH. Every end is ON its station except the two arterioles' (A_HR, A_HL end beside the bed's comb, 30 map units from its station: 7.5 radii of an 8 unit bed). The map does
 *  not draw them touching (the artery runs on beside the lanes), so they are not a junction there: SIN_R and SIN_L keep their lines, named in `circuitFallbacks` and pinned by tests/circuit-skins.test.ts. */
export const CIRC_SKIN_REACH = SKIN_REACH;
/** The nodes the Circuit welds: the body's own (skin/inventory.ts PHASE_2_NODES, the permanent junctions), as far as the map has all their arms. */
export const CIRCUIT_SKIN_NODES: ReadonlySet<string> = PHASE_2_NODES;

/** A vessel's radius on the map, scene units: half its width at boost 1 with no floor (the width its rings are built at; the live width is the shader's circSwellOf over this). */
export const circuitRadius = (v: Pick<NetVessel, 'widthKind' | 'baseD' | 'circFine'>): number => 0.5 * circuitWidthMap(v.widthKind, v.baseD, 1, v.circFine ?? 1) * MAP_K;

const endOf = (id: string, end: 0 | 1): Vec3 => { const p = COURSES.get(id)!.curveC.getPointAt(end); return [p.x, p.y, p.z]; };

/** A liver fork's child (`<host>~F:b`) has no tube on the map: the map draws the branch trees (circuit/tubes.ts) instead, so it is not an arm of a map junction. */
const noMapTube = (v: NetVessel): boolean => v.id.includes('~F') && !COURSES.has(v.id);

/** One candidate node of the map: its junction, and why it is not one when it is not. */
interface Candidate { node: string; junction: SkinJunction; far: string[]; why: string | null }

/**
 * Every node of the map the body's inventory would weld (skin/inventory.ts findSkinJunctions): 3 to 6 permanent tubes, or a run-on pair a collateral or shunt lands on (up to SKIN_GROWERS of them, the widest), none a through-branch's cut end; but read on the
 * map's own courses and widths (the arms widest first by their MAP radius, J the widest arm's end on the map: its station). A growing arm that ends farther than GROW_REACH radii from J is left out of the skin and named (`far`); a node whose PERMANENT arm lies
 * farther than CIRC_SKIN_REACH, or has no map course, is not a junction on the map (`why`).
 */
function candidates(network: readonly NetVessel[], nodes: ReadonlySet<string>): Candidate[] {
  const out: Candidate[] = [], growers = growerEndsByNode(network);
  for (const [node, all] of permanentEndsByNode(network)) {
    if (all.some((e) => cutEnd(e.v.id) === e.end)) continue;
    const ends = all.filter((e) => !noMapTube(e.v));
    const slots = Math.max(0, Math.min(SKIN_GROWERS, MAX_ARMS - ends.length));
    const grow = (growers.get(node) ?? []).filter((e) => COURSES.has(e.v.id)).slice(0, slots);
    if (!nodes.has(node) && !grow.length) continue;
    if (!(ends.length >= MIN_ARMS && ends.length <= MAX_ARMS) && !(ends.length === 2 && grow.length > 0)) continue;
    const mk = (e: { v: NetVessel; end: 0 | 1 }, g: boolean): SkinArm => ({ vesselId: e.v.id, end: e.end, courseIndex: 0, dataIndex: indexOf(e.v.lensId), lensIndex: indexOf(e.v.lensId), baseD: e.v.baseD, widthKind: e.v.widthKind, restR: circuitRadius(e.v), ...(g ? { grow: true } : {}) });
    if (ends.some((e) => !COURSES.has(e.v.id))) { out.push({ node, junction: { node, J: [0, 0, 0], arms: [] }, far: [], why: 'an arm has no map course' }); continue; }
    const sorted = ends.map((e, i) => ({ ...e, i, r: circuitRadius(e.v) })).sort((a, b) => b.r - a.r || a.i - b.i);
    const J = endOf(sorted[0]!.v.id, sorted[0]!.end);
    const j: SkinJunction = { node, J, arms: [...sorted.map((e) => mk(e, false)), ...grow.map((e) => mk(e, true))] };
    const reach = circuitReach(j), far = j.arms.filter((a, i) => a.grow && reach[i]! > GROW_REACH).map((a) => a.vesselId);
    const near: SkinJunction = far.length ? { ...j, arms: j.arms.filter((a) => !far.includes(a.vesselId)) } : j;
    const nr = circuitReach(near);
    if (Math.max(...near.arms.map((a, i) => (a.grow ? 0 : nr[i]!))) > CIRC_SKIN_REACH) { out.push({ node, junction: near, far, why: 'an arm ends too far from the station' }); continue; }
    out.push({ node, junction: near, far, why: null });
  }
  return out;
}

/** Every junction of the map that gets a skin (see `candidates`). */
export function findCircuitJunctions(network: readonly NetVessel[] = NETWORK, nodes: ReadonlySet<string> = CIRCUIT_SKIN_NODES): SkinJunction[] {
  return candidates(network, nodes).filter((c) => !c.why).map((c) => c.junction);
}

/** The growing arms the map's inventory leaves out of a skin because they end too far from its node (`node:vessel`; a test pins the list). */
export function circuitFarGrowers(network: readonly NetVessel[] = NETWORK): string[] {
  return candidates(network, CIRCUIT_SKIN_NODES).flatMap((c) => c.far.map((id) => `${c.node}:${id}`));
}

/** The nodes of the body's inventory the map does not weld, and why (a test pins the list: a new one fails until someone looks). */
export function circuitFallbacks(network: readonly NetVessel[] = NETWORK): { node: string; why: string }[] {
  return candidates(network, CIRCUIT_SKIN_NODES).filter((c) => c.why).map((c) => ({ node: c.node, why: c.why! }));
}

/**
 * What the map still draws the old way, as tubes that run into one another (named, so that a new one fails tests/circuit-skins.test.ts until someone looks): the map's OWN tubes (circuit/tubes.ts), which are not vessels of the network and so not arms of any skin yet:
 * the four liver trees' branches (`PRE_R#0`: the lane and the index of the branch), the caudate lane, and the custom shunts a learner opens (routed on the map when they open, never at build time).
 */
export function circuitOldJoins(): { trees: string[]; caudate: string[]; custom: string[]; why: Readonly<Record<'trees' | 'caudate' | 'custom', string>> } {
  return {
    why: {
      trees: 'map-only tubes (no network vessel, no ArmTube), not welded: each branch start is SUNK in the tube it leaves and FLARED as 2D draws it (circuit/map-ends.ts, tests/circuit-ends.test.ts), its width is the tree rule treeCircW, which the skin shader has no term for',
      caudate: 'a map-only tube between CV_R and IVCS, not welded: both ends are SUNK in their vein and FLARED as 2D draws them (circuit/map-ends.ts); IVCS and its run-on are one skin of six arms already, no seventh',
      custom: 'routed on the map when a learner opens one (circuit/tubes.ts routeOpen), after the baked skins are laid in, so not welded: both ends are SUNK and FLARED from numbers made at the route (circuit/map-ends.ts), no live skin build',
    },
    trees: Object.entries(CIRCUIT_TREES).flatMap(([lane, list]) => list.map((_, i) => `${lane}#${i}`)),
    caudate: CIRCUIT_D.CAUD ? ['CAUD'] : [],
    custom: CUSTOM_EDGES.map((c) => c[0]),
  };
}

/** How far each arm's end lies from J on the map, in radii of the widest arm. */
export function circuitReach(j: SkinJunction): number[] {
  return j.arms.map((a) => { const e = endOf(a.vesselId, a.end); return Math.hypot(e[0] - j.J[0], e[1] - j.J[1], e[2] - j.J[2]) / j.arms[0]!.restR; });
}

/**
 * The tube of vessel `id` as the Circuit draws it at circT = 1, from its body tube's own mesh (the same `buildTubes` and `attachRuns` the scene makes): for every ring vertex the vertex shader's rule, on the unturned map:
 *   centre = the map course's centre at the vertex's share (`cC`), offset = the vertex's place in the frame fixed by the map course's direction (`fr`, `tC`), length = the map's radius times the vertex's own radius share on the map (`rkc`).
 * Its `rk` is the map's radius share at the vertex (1 everywhere but a growing arm's sunk and flared end, circuit/map-sewn.ts; the radius is passed to ringOf), `tubular` is the body tube's, and a ring is the same ring of both: u = k / tubular is the share the tube's uv.x has.
 */
export function circuitTube(id: string): ArmTube & { radius: number } {
  const def = NETWORK_BY_ID.get(id)!, circ = COURSES.get(id)!;
  const b = buildTubes(coursesOf(def, REST), tubularOf(def, slicesFor(id)), def.radius);
  attachRuns(b.geometry, b.runs, circ, def.radius);
  sewOnMap(id, b.geometry, b.runs);   // (a growing arm's map end is sunk and flared whether or not a skin welds it: the tube is what grows, so its rings are the live tube's, seam included)
  const run = b.runs[0]!, g = b.geometry, W = TUBE_RADIAL + 1, n = (run.tubular + 1) * W;
  const cC = g.getAttribute('cC'), tC = g.getAttribute('tC'), fr = g.getAttribute('fr'), rkc = g.getAttribute('rkc');
  const R = circuitRadius(def);
  const position = new Float32Array(n * 3), normal = new Float32Array(n * 3), rk = new Float32Array(n).fill(1);
  for (let v = 0; v < n; v++) {
    const T: Vec3 = [tC.getX(v), tC.getY(v), tC.getZ(v)], len = Math.hypot(T[0], T[1], T[2]) || 1;
    const off = decode([fr.getX(v), fr.getY(v), fr.getZ(v)], [T[0] / len, T[1] / len, T[2] / len]);
    const ol = Math.hypot(off[0], off[1], off[2]) || 1, share = rkc ? rkc.getX(v) : 1, r = R * share;
    rk[v] = share;
    position[3 * v] = cC.getX(v) + off[0] * r; position[3 * v + 1] = cC.getY(v) + off[1] * r; position[3 * v + 2] = cC.getZ(v) + off[2] * r;
    normal[3 * v] = off[0] / ol; normal[3 * v + 1] = off[1] / ol; normal[3 * v + 2] = off[2] / ol;
  }
  const geometry = new (g.constructor as new () => typeof g)();
  geometry.setAttribute('position', new (cC.constructor as new (a: Float32Array, n: number) => typeof cC)(position, 3));
  geometry.setAttribute('normal', new (cC.constructor as new (a: Float32Array, n: number) => typeof cC)(normal, 3));
  geometry.setAttribute('rk', new (cC.constructor as new (a: Float32Array, n: number) => typeof cC)(rk, 1));
  g.dispose();
  return { geometry, tubular: run.tubular, radius: R };
}

/** One arm as the per-frame handover reads it. */
interface Link { obj: VesselObject; id: string; end: 0 | 1; u: number; /** a growing arm: its growth drives the weld (it is whole in the skin, which is static) */ grow: boolean; /** the arm's place in the plain trunk (-1: not in it) */ pi: number; /** the tube's cut end at this arm is dithered with the weld (a growing arm's, and every arm's when there is no plain trunk to stand in) */ weld: boolean; span: readonly [number, number]; last: number[]; cp: number[]; lenC: number }
/** The plain trunk of a skin with growing arms (vessels/skin/plain.ts): the arms that stay, as a static skin of their own. */
interface PlainBuilt { mesh: SkinMesh; draw: SkinDraw & { object: Object3D }; keep: number[]; bake: PlainBake }
interface Built { node: string; mesh: SkinMesh; draw: SkinDraw & { object: Object3D }; plain: PlainBuilt | null; /** the weld share last written (NaN: not yet) */ w: number; arms: Link[]; sources: readonly string[]; hidden: readonly string[]; bake: BakedSkin }

export interface CircuitSkinDeps {
  /** the drawn vessel of a network id */
  vessel(id: string): VesselObject | undefined;
  /** the object that draws one built skin (SkinObject with `circuit` set) */
  make(skin: SkinMesh, axes: readonly ArmAxis[], arms: readonly VesselObject[]): SkinDraw & { object: Object3D };
  add(o: Object3D): void;
  remove(o: Object3D): void;
  warn?(message: string): void;
  /** the skinned ends changed: the scene writes the vessels' map mates again (a skinned end has none) */
  endsChanged?(): void;
  /** the Circuit's skins baked at build time (baked.ts), if the page has them */
  baked?(): BakedSkins | null;
}

/** The turn's matrix: the map's quarter turn about the map's centre, with the cosine and the sine the vessel shader's circRot holds. */
export function turnMatrix(cos: number, sin: number, out: Matrix4 = new Matrix4()): Matrix4 {
  const c = MAP_CENTRE;
  return out.set(cos, -sin, 0, c.x - cos * c.x + sin * c.y, sin, cos, 0, c.y - sin * c.x - cos * c.y, 0, 0, 1, 0, 0, 0, 0, 1);
}

export class CircuitSkinSet {
  private built: Built[] = [];
  private readonly ends = new Map<string, [boolean, boolean]>();
  private readonly cuts = new Map<string, [number, number]>();
  private readonly paces = new Map<string, number>();
  /** the nodes meshed from the surface (skin/sheet.ts), because the hull of their seam rings could not be covered */
  private readonly surfaced = new Set<string>();
  private digest = '';
  /** Where the last build's meshes came from: the baked file (nothing meshed on the page) or the live planner (a stall of a second or more, the first Circuit change's cost on a device). */
  source: 'none' | 'baked' | 'live' = 'none';
  private readonly lostNodes: { node: string; message: string }[] = [];
  /** the nodes that fell back (their tubes keep running into one another, as before), named, once */
  readonly fellBack: string[] = [];
  /** the growing arms the map's skins could not take (`node:vessel`): they keep their plain lines, named so a new one fails tests/circuit-skins.test.ts until someone looks */
  readonly dropped: string[] = [];
  /** why each growing arm the retry ladder dropped was dropped (the failure that made it: a named SkinBuildError message), for the tests and the inspector */
  readonly why: Record<string, string> = {};
  private readonly warned = new Set<string>();
  private shown = false;
  private readonly deps: CircuitSkinDeps;
  constructor(deps: CircuitSkinDeps) { this.deps = deps; }

  /** The skinned ends of vessel `id` on the map: [start, end]. */
  endsOf(id: string): readonly [boolean, boolean] { return this.ends.get(id) ?? [false, false]; }
  get count(): number { return this.built.length; }
  get nodes(): readonly string[] { return this.built.map((b) => b.node); }
  /** The cut (u0, u1) each skinned tube has on the map. */
  cutOf(id: string): readonly [number, number] { return this.cuts.get(id) ?? SKIN_CUT_C_NONE; }
  skinOf(node: string): SkinMesh | undefined { return this.built.find((b) => b.node === node)?.mesh; }
  /** The plain trunk's mesh of a node (the arms that stay, drawn while a growing arm is not yet whole), or undefined. */
  plainOf(node: string): SkinMesh | undefined { return this.built.find((b) => b.node === node)?.plain?.mesh; }

  private tubesOf(js: readonly SkinJunction[]): Map<string, ArmTube & { radius: number }> {
    const m = new Map<string, ArmTube & { radius: number }>();
    for (const j of js) for (const a of j.arms) if (!m.has(a.vesselId)) m.set(a.vesselId, circuitTube(a.vesselId));
    return m;
  }

  private ringsFor(tubes: ReadonlyMap<string, ArmTube & { radius: number }>, cuts: SkinCut[]) {
    const r = cuts.map((c) => ringOf(tubes.get(c.vesselId)!.geometry, c.ring, tubes.get(c.vesselId)!.radius));
    return { pos: r.map((x) => x.pos), nor: r.map((x) => x.nor), rest: r.map((x) => x.rest) };
  }

  /** Rule 4.4.1 on the arms as the skin draws them (skin-set.ts clearOfAxes): every seam vertex is at least the blend width from every other arm's drawn capsule. The first arm whose seam stands too near another's, or -1. */
  private clearOfAxes(j: SkinJunction, tubes: ReadonlyMap<string, ArmTube & { radius: number }>, cuts: SkinCut[]): number {
    const caps = j.arms.map((a, i) => capsuleOf(axisOf(tubes.get(a.vesselId)!, a.restR, cuts[i]!, j.J)));
    const k = skinKOf(j.arms), { pos } = this.ringsFor(tubes, cuts);
    for (let i = 0; i < j.arms.length; i++) for (let o = 0; o < j.arms.length; o++) {
      if (o === i) continue;
      for (let v = 0; v < TUBE_RADIAL; v++) if (sdArm(caps[o]!, pos[i]![3 * v]!, pos[i]![3 * v + 1]!, pos[i]![3 * v + 2]!) < k) return i;
    }
    return -1;
  }

  /** Whether a junction (or the merge of nodes of which one is) is meshed from the surface itself: the hull of its seam rings is not asked for, the clearance alone places the seams (see `produce`). */
  private onSurface(j: SkinJunction): boolean { return !!j.surface || j.node.split('+').some((n) => this.surfaced.has(n)); }

  /** Plans (cuts.ts) the junctions on the map's rings: a set of cuts is good when the hull has every ring and every ring is clear of the other arms as the skin draws them. */
  private plan(js: readonly SkinJunction[], tubes: ReadonlyMap<string, ArmTube & { radius: number }>): ReturnType<typeof planSkins> {
    return planSkins(js, tubes, (j) => {
      let blamed = -1;
      const ok: HullOk = (cs) => { blamed = -1; if (!(this.onSurface(j) || hullCovers(this.ringsFor(tubes, cs).pos))) return false; blamed = this.clearOfAxes(j, tubes, cs); return blamed < 0; };
      ok.blame = () => (this.onSurface(j) ? blamed : -1);   // (the arm whose seam stands too near another arm moves out, not the seam nearest J)
      return ok;
    });
  }

  /**
   * Plans AND makes the skins, the way the body's set does (skin-set.ts produce, spec 10.6): a junction that cannot be planned or built with its growing arms loses its narrowest one and is tried again, down to none; the arms it loses keep their lines
   * (`dropped`); a junction that fails with none is lost (named, its tubes keep running into one another); a merged skin that fails hands both its nodes back to be planned apart.
   */
  private produce(js: readonly SkinJunction[], tubes: ReadonlyMap<string, ArmTube & { radius: number }>): { made: Built[]; lost: { node: string; message: string }[] } {
    const made: Built[] = [], lost: { node: string; message: string }[] = [];
    let todo: SkinJunction[] = [...js];
    const latest = new Map<string, SkinJunction>(js.map((j) => [j.node, j]));
    for (let round = 0; todo.length && round <= SKIN_GROWERS + 1; round++) {
      const { plans, failures } = this.plan(todo, tubes);
      const again = new Set<string>();
      const bad: { nodes: readonly string[]; message: string }[] = failures.map((f) => ({ nodes: f.node.split('+'), message: f.message }));
      for (const p of plans) {
        try { const b = this.makeBuilt(p, tubes); if (b) made.push(b); }
        catch (e) { bad.push({ nodes: p.merged ?? [p.junction.node], message: (e as Error).message }); }
      }
      const next: SkinJunction[] = [];
      for (const f of bad) {
        for (const n of f.nodes) {
          const j = todo.find((x) => x.node === n);
          if (!j || again.has(n)) continue;
          // the first remedy is the surface rung (sheet.ts), where the hull of the seam rings is the thing that refuses (a growing arm that leaves a short arm at a sharp angle, the map's REX and S_DSR): the same junction meshed from the surface, no arm lost
          if (!this.surfaced.has(n) && (f.nodes.length === 1 || j.arms.some((a) => a.grow))) { this.surfaced.add(n); again.add(n); next.push(j); continue; }
          const g = j.arms.filter((a) => a.grow);
          if (!g.length) {
            if (f.nodes.length > 1 && f.nodes.some((m) => m !== n && todo.find((x) => x.node === m)?.arms.some((a) => a.grow))) { again.add(n); next.push(j); continue; }
            lost.push({ node: f.nodes.join('+'), message: f.message }); continue;
          }
          const drop = g[g.length - 1]!, arms = j.arms.filter((a) => a !== drop);
          this.surfaced.delete(n);   // (without that arm the hull may cover the rings again: the junction is tried from the hull first, as before)
          this.dropped.push(`${n}:${drop.vesselId}`); this.why[`${n}:${drop.vesselId}`] = f.message;
          again.add(n);
          if (arms.length >= MIN_ARMS) next.push({ ...j, arms });
        }
      }
      for (const f of bad) for (const n of f.nodes) { const j = todo.find((x) => x.node === n); if (j && !again.has(n) && !lost.some((l) => l.node.split('+').includes(n)) && !next.some((x) => x.node === n)) next.push(j); }
      // a node planned again is planned WITH the skins already made on a vessel it shares: those are taken back and planned again with it
      for (const m of [...made]) {
        if (m.sources.some((n) => next.some((x) => x.node === n))) continue;
        const src = m.sources.map((n) => latest.get(n)).filter((x): x is SkinJunction => !!x);
        if (!src.length || !src.some((sj) => next.some((x) => x.arms.some((p) => sj.arms.some((q) => q.vesselId === p.vesselId))))) continue;
        made.splice(made.indexOf(m), 1); m.draw?.dispose(); m.plain?.draw.dispose();
        for (const sj of src) if (!next.some((x) => x.node === sj.node)) next.push(sj);
      }
      todo = next.filter((j) => !made.some((m) => m.sources.includes(j.node)));
      for (const j of todo) latest.set(j.node, j);
    }
    for (const j of todo) lost.push({ node: j.node, message: `skin: junction ${j.node}: no skin after ${SKIN_GROWERS + 1} rounds of dropping growing arms` });
    // a growing arm a merged skin did not carry (it takes the widest SKIN_GROWERS of both nodes') is named too, whatever left it out
    for (const j of js) for (const a of j.arms) {
      if (!a.grow || made.some((m) => m.mesh.junction.arms.some((x) => x.grow && x.vesselId === a.vesselId && x.end === a.end))) continue;
      const key = `${j.node}:${a.vesselId}`;
      if (!this.dropped.includes(key) && !lost.some((l) => l.node.split('+').includes(j.node))) this.dropped.push(key);
    }
    return { made, lost };
  }

  private makeBuilt(made: ReturnType<typeof planSkins>['plans'][number], tubes: ReadonlyMap<string, ArmTube & { radius: number }>, ready?: BakedSkin): Built | null {
    const plan = !ready && this.onSurface(made.junction) && !made.junction.surface ? { ...made, junction: { ...made.junction, surface: true } } : made;
    const j = plan.junction, objs = j.arms.map((a) => this.deps.vessel(a.vesselId));
    if (objs.some((o) => !o)) return null;
    const { pos, nor, rest } = this.ringsFor(tubes, plan.cuts);
    const axes = ready?.axes ?? weldThrough(j.arms.map((a, i) => { const tb = tubes.get(a.vesselId)!; return axisOf(tb, a.restR, plan.cuts[i]!, j.J, a.side ? armWalk(a, tb.tubular).from : undefined, false); }), j.arms.map((a) => !!a.grow));
    if (ready) this.paces.set(j.node, ready.pace);
    else if (j.surface) this.paces.set(j.node, PACES.length - 1);   // (meshed from the surface from the start: no hull to fold)
    // a junction with growing arms is built STILL (as the Anatomy's, skin-set.ts): they are whole arms of one static shape, the arms that stay get a static plain trunk of their own, and the tube's own sunk and flared end is what grows; the weld hands over at growth 0.9 to 1
    const growing = j.arms.some((a) => a.grow);
    const mesh = ready?.mesh ?? buildSkinSteady(j, plan.cuts, pos, nor, axes.map(capsuleOf), undefined, this.paces);
    if (!ready) mesh.seamVerts.forEach((ids, a) => ids.forEach((v, q) => { mesh.restR[v] = rest[a]![q]!; }));   // (the seam ring's rest radius is the tube's own, exactly)
    const pp = growing ? plainOf(plan) : null;
    let plain: PlainBuilt | null = null;
    if (pp && ready?.plain !== null) {
      // (a failed plain trunk is no skin: the welded skin then comes in over the tubes' cut ends alone; a baked skin says it failed with `plain: null`)
      try {
        const axesP = ready?.plain?.axes ?? pp.keep.map((i) => axes[i]!), key = pp.junction.node;
        if (ready?.plain) this.paces.set(key, ready.plain.pace); else this.paces.set(key, PACES.length - 1);   // (meshed from the surface from the start: their seam rings are the welded skin's, no hull covers them)
        const meshP = ready?.plain?.mesh ?? buildSkinSteady(pp.junction, pp.cuts, pp.keep.map((i) => pos[i]!), pp.keep.map((i) => nor[i]!), axesP.map(capsuleOf), undefined, this.paces);
        if (!ready?.plain) meshP.seamVerts.forEach((ids, a) => ids.forEach((v, q) => { meshP.restR[v] = rest[pp.keep[a]!]![q]!; }));
        plain = { mesh: meshP, draw: null as unknown as PlainBuilt['draw'], keep: pp.keep, bake: { axes: axesP, mesh: meshP, pace: this.paces.get(key) ?? 0 } };
      } catch { plain = null; }
    }
    // without a plain trunk the whole skin comes in over the tubes' cut ends, and a vessel a merged skin hides whole cannot be dithered back: such a skin takes no growing arm (the retry ladder drops it and names it)
    if (growing && !plain && plan.hidden.length) throw new SkinBuildError(j.node, 'a growing arm on a skin with a hidden vessel, and no plain trunk to weld from');
    if (plain) plain.draw = this.deps.make(plain.mesh, plain.bake.axes, pp!.keep.map((i) => objs[i]!) as VesselObject[]);
    const draw = this.deps.make(mesh, axes, objs as VesselObject[]);
    const arms: Link[] = j.arms.map((a, i) => ({ obj: objs[i]!, id: a.vesselId, end: a.end, u: plan.cuts[i]!.u, grow: !!a.grow, pi: plain ? plain.keep.indexOf(i) : -1, weld: growing && (!!a.grow || !plain), span: NETWORK_BY_ID.get(a.vesselId)!.lensSpan ?? [0, 1], last: [], cp: [NaN, NaN, NaN], lenC: COURSES.get(a.vesselId)!.lenC }));
    return { node: j.node, mesh, draw, plain, w: NaN, arms, sources: plan.merged ?? [j.node], hidden: plan.hidden, bake: { plan, axes, mesh, pace: this.paces.get(j.node) ?? 0, ...(growing && pp ? { plain: plain ? plain.bake : null } : {}) } };
  }

  /** Builds the Circuit's skins (or lays in the baked ones when they were made for exactly these junctions and tubes). Any skin built before is removed first. A node that cannot be built keeps its tubes as they were, is named in `fellBack` and warned once. */
  build(): void {
    this.clear(); this.surfaced.clear(); for (const k of Object.keys(this.why)) delete this.why[k];
    const js = findCircuitJunctions();
    if (!js.length) return;
    const tubes = this.tubesOf(js), warn = this.deps.warn ?? ((m: string) => console.warn(m));
    this.digest = `circuit/${skinsDigest(js, tubes)}`;
    const baked = this.deps.baked?.() ?? null, usable = baked && baked.digest === this.digest ? baked : null;
    const made: Built[] = [], lost: { node: string; message: string }[] = [];
    this.dropped.length = 0; this.dropped.push(...circuitFarGrowers());
    this.source = usable ? 'baked' : 'live';
    if (usable) { for (const s of usable.skins) { const b = this.makeBuilt(s.plan, tubes, s); if (b) made.push(b); } lost.push(...usable.lost); this.dropped.length = 0; this.dropped.push(...usable.dropped); }
    else { const r = this.produce(js, tubes); made.push(...r.made); lost.push(...r.lost); }
    this.lostNodes.length = 0; this.lostNodes.push(...lost);
    for (const f of lost) { if (!this.fellBack.includes(f.node)) this.fellBack.push(f.node); if (!this.warned.has(f.node)) { this.warned.add(f.node); warn(`circuit ${f.message} (keeping the map's tubes there)`); } }
    const touched = new Set<string>();
    for (const b of made) {
      this.deps.add(b.draw.object); if (b.plain) this.deps.add(b.plain.draw.object);
      this.built.push(b);
      for (const a of b.arms) {
        const c = this.cuts.get(a.id) ?? [SKIN_CUT_C_NONE[0], SKIN_CUT_C_NONE[1]];
        c[a.end] = a.u; this.cuts.set(a.id, c);
        const e = this.ends.get(a.id) ?? [false, false]; e[a.end] = true; this.ends.set(a.id, e);
        touched.add(a.id);
      }
      for (const id of b.hidden) { this.cuts.set(id, [SKIN_HIDDEN[0], SKIN_HIDDEN[1]]); this.ends.set(id, [true, true]); touched.add(id); }
    }
    for (const id of touched) { const c = this.cuts.get(id)!; this.deps.vessel(id)?.setSkinCutC(c[0], c[1]); }
    for (const t of tubes.values()) t.geometry.dispose();
    this.show(this.shown);
    this.deps.endsChanged?.();
    this.sync();
  }

  /** What the last `build` made, as the file the build bakes. */
  bake(): BakedSkins {
    return { digest: this.digest, skins: this.built.map((b) => b.bake), lost: [...this.lostNodes], dropped: [...this.dropped] };
  }

  /** Whether the skins are drawn at all: only over the end of the change (they have no alpha before it: nothing is drawn that is not seen). Written by the scene when the change moves. */
  show(on: boolean): void { this.shown = on; for (const b of this.built) { b.draw.object.visible = on; if (b.plain) b.plain.draw.object.visible = on; } }
  /** The map's turn (the vessel shader's circRot): the skins are built on the unturned map, and turn with it as one body. */
  setTurn(cos: number, sin: number): void {
    const m = turnMatrix(cos, sin);
    for (const b of this.built) for (const d of [b.draw, b.plain?.draw]) { const o = d?.object as Group | undefined; if (!o) continue; o.matrixAutoUpdate = false; o.matrix.copy(m); o.matrixWorldNeedsUpdate = true; }
  }

  clear(): void {
    for (const id of this.ends.keys()) { const o = this.deps.vessel(id); o?.setSkinCutC(SKIN_CUT_C_NONE[0], SKIN_CUT_C_NONE[1]); o?.setSkinWeldC(0, 1); o?.setSkinWeldC(1, 1); }
    const had = this.ends.size > 0;
    this.ends.clear(); this.cuts.clear();
    for (const b of this.built) { this.deps.remove(b.draw.object); b.draw.dispose(); if (b.plain) { this.deps.remove(b.plain.draw.object); b.plain.draw.dispose(); } }
    this.built = []; this.fellBack.length = 0;
    if (had) this.deps.endsChanged?.();
  }
  dispose(): void { this.clear(); }

  /** The live handover once a frame, when something moved: for each arm what its tube has at its seam on the map, written to the skin only when it changed. True when any skin's numbers changed. At the end of the change every fade mode is 1 (vessels/shaders.ts mixes it to 1 with circT), the stenosis waist is 0 at a seam. */
  sync(): boolean {
    let changed = false;
    for (const b of this.built) {
      let any = false, blend = false, weld = 1;   // (weld: the least share of any growing arm's hand-over, plain.ts weldOf)
      b.arms.forEach((a, i) => {
        const both = (fn: (d: SkinDraw, k: number) => void): void => { fn(b.draw, i); if (b.plain && a.pi >= 0) fn(b.plain.draw, a.pi); };
        const u = a.obj.toon.uniforms, v = (k: string) => u[k]!.value as { x: number; y: number; z: number; w: number };
        const hi: HiState = { on: u.hiOn!.value as number, dir: u.hiDir!.value as number, offset: u.hiOffset!.value as number, ahead: u.hiAhead!.value as number, behind: u.hiBehind!.value as number, ends: [v('hiEnds').x, v('hiEnds').y], fade: u.hiFade!.value as number, len: u.len!.value as number };
        const h = hiWeightAt(hi, a.u), l = lensUAt(a.span, a.u), col = u.color!.value as { r: number; g: number; b: number }, lu = (u.lensUse!.value as number) > 0.5 ? 1 : 0;
        if (a.last[0] !== h || a.last[1] !== l || a.last[2] !== col.r || a.last[3] !== col.g || a.last[4] !== col.b || a.last[5] !== lu) {
          a.last = [h, l, col.r, col.g, col.b, lu, a.last[6] ?? NaN, a.last[7] ?? NaN, a.last[8] ?? NaN, a.last[9] ?? NaN]; both((d, k) => d.setArm(k, 1, h, l, { r: col.r, g: col.g, b: col.b, a: lu }, 0)); any = true;
        }
        const pr = armPresenceAt(a.obj.group.visible, u.reveal!.value as number, u.fade!.value as number, a.u);
        // a GROWING arm: the skin does not morph with it (one static shape with the arm whole); the map tube grows with its own sunk and flared end and from growth 0.9 to 1 the welded skin comes in over it (the weld, below).
        // A dotted thread (a closed potential collateral) counts 0: its tube is not cut, and the trunk is the plain trunk. The arm's presence dithers the skin as any arm's does
        if (a.grow) weld = Math.min(weld, weldOf((u.dotted!.value as number) > 0.5 ? 0 : pr));
        if (a.last[6] !== pr) { a.last[6] = pr; both((d, k) => d.setPres(k, pr)); any = true; }
        // the flow marks ride on the arm's arc in the map's own units (the vessel shader's `len * vU` with vU = 1 / MAP_K, and the radius the tube hands the dust: its body radius in those units)
        const rd = u.radius!.value as number, fl = u.flowAmount!.value as number;
        if (a.last[7] !== rd || a.last[8] !== fl) {
          a.last[7] = rd; a.last[8] = fl;
          both((d, k) => d.setArc(k, a.u * a.lenC / MAP_K, a.end === 1 ? 1 : -1, a.lenC / MAP_K, rd / MAP_K, fl)); any = true;
        }
        const sh = a.obj.copyShares();
        if (a.cp[0] !== sh[0] || a.cp[1] !== sh[1] || a.cp[2] !== sh[2]) { a.cp = [sh[0], sh[1], sh[2]]; both((d, k) => d.setArmCopy(k, sh[0], sh[1], sh[2])); any = true; }
        if (a.obj.toon.transparent || a.obj.behindOrgans) blend = true;
      });
      if (b.arms.some((a) => a.grow) && b.w !== weld) {
        // the weld: the welded skin keeps the pixels whose screen pattern is under `weld`, the plain trunk the rest, and a tube's cut end the pixels neither draws (no pixel is two skins; at 1 the cut is whole, at 0 the skin is not drawn)
        b.w = weld; any = true;
        b.draw.setWeld?.(1, weld); b.plain?.draw.setWeld?.(-1, weld);
        for (const a of b.arms) if (a.weld) a.obj.setSkinWeldC(a.end, weld);
      }
      if (any) changed = true;
      b.draw.setTransparent(blend); b.plain?.draw.setTransparent(blend);
    }
    return changed;
  }
}

export { SkinBuildError };
