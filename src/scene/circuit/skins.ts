// The Circuit's junction skins: the Anatomy's welded junctions (vessels/skin, docs/junction-skin-spec.md) on the map. Until now the map's tubes simply overlapped where they meet: the Circuit's lines ran into a node as separate tubes (a pinched
// teardrop at the lower portal node, wedges where the hepatic veins reach the cava, a seam at the right hepatic vein; rebuild-3d/circuit-compare/circ-differences.md, items 5 and 6), because the map has no junction code at all.
// This is the same pipeline, one frame over:
//   - INVENTORY (`findCircuitJunctions`): the nodes the body welds (3 to 6 permanent tubes), read on the map's own courses and the map's own widths (circuit/width.ts: 2D's widthAt at t = 1, boost 1). Every arm ends exactly on its station
//     (tests/circuit-skins.test.ts pins it), so there are no side-wall landings on the map; the two beds' arterioles stop 30 map units short of the bed's station (the 2D art's own gap), which the skin's bridge spans.
//   - RINGS (`circuitTube`): the tube a vessel is on the map, to the last vertex: the body tube's own mesh carried to the map by the vertex shader's rule at circT = 1 (circuit/shader.ts circuitMorph: the map course's centre, the vertex's offset in the
//     frame fixed by the course's direction, the map's radius), computed here on the CPU. Ring k of the vertex shader's tube is ring k of this one, so a cut at u = k / tubular is a cut on a ring the tube really has, and the skin starts on its vertices:
//     no crack. Built on the UNTURNED map; the map's quarter turn is the skin's object matrix (`setTurn`), as the shader turns the tubes.
//   - CUTS AND MESH: cuts.ts planSkins and mesh.ts buildSkinSteady, unchanged: the cut, the merge of two crowded nodes (CONF and PVT_L), the smooth-union fillet, the weights.
//   - DRAWING: skin-object.ts with `SKIN_CIRC` (skin/shaders.ts): the map's widths (the zoom's boost, the least width on the screen), its bolder line and inner line. It is in over the END of the change (SKIN_CIRC_IN .. 1) and the arm tubes' second cut
//     (`skinCutC`, vessels/shaders.ts) takes their ends away over the same, by one screen pattern: the body's skins are gone by 0.35 and the tubes whole between, so a junction is never two skins at once and nothing pops.
//   - BAKED at build time with the Anatomy's (scripts/bake-skins.mjs): the file `anatomy/circuit-skins.bin` carries these, so the page meshes nothing at load; a figure the file was not made for builds them live as before.
// Left out, named in tests/circuit-skins.test.ts: the liver's branch trees, the caudate lane, the custom shunts and the collaterals' mouths are tubes of the map's own (circuit/tubes.ts) or growing arms; they keep their lines as they are.
import type { Group, Object3D } from 'three';
import { Matrix4 } from 'three';
import { NETWORK, NETWORK_BY_ID, cutEnd, type NetVessel } from '../vessels/network.ts';
import { REST, coursesOf, tubularOf } from '../vessels/shape.ts';
import { TUBE_RADIAL, buildTubes } from '../vessels/tubes.ts';
import { indexOf } from '../../engine/vessel-data.ts';
import { MAX_ARMS, MIN_ARMS, PHASE_2_NODES, SKIN_REACH, permanentEndsByNode } from '../vessels/skin/inventory.ts';
import { armPresenceAt, hiWeightAt, lensUAt, type HiState } from '../vessels/skin/arm-twins.ts';
import { armWalk, planSkins, type ArmTube } from '../vessels/skin/cuts.ts';
import { buildSkinSteady, hullCovers } from '../vessels/skin/mesh.ts';
import { skinsDigest, type BakedSkin, type BakedSkins } from '../vessels/skin/baked.ts';
import { sdArm, skinKOf } from '../vessels/skin/sdf.ts';
import { weldThrough } from '../vessels/skin/through.ts';
import { SKIN_CUT_C_NONE, SKIN_HIDDEN, SkinBuildError, type SkinCut, type SkinJunction, type SkinMesh, type Vec3 } from '../vessels/skin/types.ts';
import { axisOf, capsuleOf, ringOf, type SkinDraw } from '../vessels/skin/skin-set.ts';
import type { ArmAxis } from '../vessels/skin/skin-object.ts';
import type { VesselObject } from '../vessels/vessel-object.ts';
import { COURSES } from './course.ts';
import { decode } from './frame.ts';
import { attachRuns, slicesFor } from './geometry.ts';
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

/**
 * Every junction of the map that gets a skin, as the body's inventory finds them (3 to 6 permanent tubes at a node, none a through-branch's cut end) but on the map: the arms are widest first by their MAP radius (the vein's width by its diameter, an artery 3,
 * a bed 8), J is the widest arm's end on the map (its station), `restR` the radius the rings are built at. A node with an arm that has no map course, or that lies farther than CIRC_SKIN_REACH radii from J, is not here (named by `circuitFallbacks`).
 */
export function findCircuitJunctions(network: readonly NetVessel[] = NETWORK, nodes: ReadonlySet<string> = CIRCUIT_SKIN_NODES): SkinJunction[] {
  const out: SkinJunction[] = [];
  for (const [node, ends] of permanentEndsByNode(network)) {
    if (!nodes.has(node) || ends.some((e) => cutEnd(e.v.id) === e.end)) continue;
    if (ends.length < MIN_ARMS || ends.length > MAX_ARMS || ends.some((e) => !COURSES.has(e.v.id))) continue;
    const sorted = ends.map((e, i) => ({ ...e, i, r: circuitRadius(e.v) })).sort((a, b) => b.r - a.r || a.i - b.i);
    const J = endOf(sorted[0]!.v.id, sorted[0]!.end);
    const j: SkinJunction = {
      node, J,
      arms: sorted.map((e) => ({ vesselId: e.v.id, end: e.end, courseIndex: 0, dataIndex: indexOf(e.v.lensId), lensIndex: indexOf(e.v.lensId), baseD: e.v.baseD, widthKind: e.v.widthKind, restR: e.r })),
    };
    if (Math.max(...circuitReach(j)) > CIRC_SKIN_REACH) continue;
    out.push(j);
  }
  return out;
}

/** The nodes of the body's inventory the map does not weld, and why (a test pins the list: a new one fails until someone looks). */
export function circuitFallbacks(network: readonly NetVessel[] = NETWORK): { node: string; why: string }[] {
  const have = new Set(findCircuitJunctions(network).map((j) => j.node)), out: { node: string; why: string }[] = [];
  for (const [node, ends] of permanentEndsByNode(network)) {
    if (!CIRCUIT_SKIN_NODES.has(node) || have.has(node) || ends.some((e) => cutEnd(e.v.id) === e.end) || ends.length < MIN_ARMS || ends.length > MAX_ARMS) continue;
    out.push({ node, why: ends.some((e) => !COURSES.has(e.v.id)) ? 'an arm has no map course' : 'an arm ends too far from the station' });
  }
  return out;
}

/** How far each arm's end lies from J on the map, in radii of the widest arm. */
export function circuitReach(j: SkinJunction): number[] {
  return j.arms.map((a) => { const e = endOf(a.vesselId, a.end); return Math.hypot(e[0] - j.J[0], e[1] - j.J[1], e[2] - j.J[2]) / j.arms[0]!.restR; });
}

/**
 * The tube of vessel `id` as the Circuit draws it at circT = 1, from its body tube's own mesh (the same `buildTubes` and `attachRuns` the scene makes): for every ring vertex the vertex shader's rule, on the unturned map:
 *   centre = the map course's centre at the vertex's share (`cC`), offset = the vertex's place in the frame fixed by the map course's direction (`fr`, `tC`), length = the map's radius times the vertex's own radius share on the map (`rkc`).
 * Its `rk` is 1 everywhere (the radius is passed to ringOf), `tubular` is the body tube's, and a ring is the same ring of both: u = k / tubular is the share the tube's uv.x has.
 */
export function circuitTube(id: string): ArmTube & { radius: number } {
  const def = NETWORK_BY_ID.get(id)!, circ = COURSES.get(id)!;
  const b = buildTubes(coursesOf(def, REST), tubularOf(def, slicesFor(id)), def.radius);
  attachRuns(b.geometry, b.runs, circ, def.radius);
  const run = b.runs[0]!, g = b.geometry, W = TUBE_RADIAL + 1, n = (run.tubular + 1) * W;
  const cC = g.getAttribute('cC'), tC = g.getAttribute('tC'), fr = g.getAttribute('fr'), rkc = g.getAttribute('rkc');
  const R = circuitRadius(def);
  const position = new Float32Array(n * 3), normal = new Float32Array(n * 3), rk = new Float32Array(n).fill(1);
  for (let v = 0; v < n; v++) {
    const T: Vec3 = [tC.getX(v), tC.getY(v), tC.getZ(v)], len = Math.hypot(T[0], T[1], T[2]) || 1;
    const off = decode([fr.getX(v), fr.getY(v), fr.getZ(v)], [T[0] / len, T[1] / len, T[2] / len]);
    const ol = Math.hypot(off[0], off[1], off[2]) || 1, r = R * (rkc ? rkc.getX(v) : 1);
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
interface Link { obj: VesselObject; id: string; end: 0 | 1; u: number; span: readonly [number, number]; last: number[]; cp: number[]; lenC: number }
interface Built { node: string; mesh: SkinMesh; draw: SkinDraw & { object: Object3D }; arms: Link[]; sources: readonly string[]; hidden: readonly string[]; bake: BakedSkin }

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
  private digest = '';
  private readonly lostNodes: { node: string; message: string }[] = [];
  /** the nodes that fell back (their tubes keep running into one another, as before), named, once */
  readonly fellBack: string[] = [];
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

  private tubesOf(js: readonly SkinJunction[]): Map<string, ArmTube & { radius: number }> {
    const m = new Map<string, ArmTube & { radius: number }>();
    for (const j of js) for (const a of j.arms) if (!m.has(a.vesselId)) m.set(a.vesselId, circuitTube(a.vesselId));
    return m;
  }

  private ringsFor(tubes: ReadonlyMap<string, ArmTube & { radius: number }>, cuts: SkinCut[]) {
    const r = cuts.map((c) => ringOf(tubes.get(c.vesselId)!.geometry, c.ring, tubes.get(c.vesselId)!.radius));
    return { pos: r.map((x) => x.pos), nor: r.map((x) => x.nor), rest: r.map((x) => x.rest) };
  }

  /** Rule 4.4.1 on the arms as the skin draws them (skin-set.ts clearOfAxes): every seam vertex is at least the blend width from every other arm's drawn capsule. */
  private clearOfAxes(j: SkinJunction, tubes: ReadonlyMap<string, ArmTube & { radius: number }>, cuts: SkinCut[]): boolean {
    const caps = j.arms.map((a, i) => capsuleOf(axisOf(tubes.get(a.vesselId)!, a.restR, cuts[i]!, j.J)));
    const k = skinKOf(j.arms), { pos } = this.ringsFor(tubes, cuts);
    for (let i = 0; i < j.arms.length; i++) for (let o = 0; o < j.arms.length; o++) {
      if (o === i) continue;
      for (let v = 0; v < TUBE_RADIAL; v++) if (sdArm(caps[o]!, pos[i]![3 * v]!, pos[i]![3 * v + 1]!, pos[i]![3 * v + 2]!) < k) return false;
    }
    return true;
  }

  private makeBuilt(plan: ReturnType<typeof planSkins>['plans'][number], tubes: ReadonlyMap<string, ArmTube & { radius: number }>, ready?: BakedSkin): Built | null {
    const j = plan.junction, objs = j.arms.map((a) => this.deps.vessel(a.vesselId));
    if (objs.some((o) => !o)) return null;
    const { pos, nor, rest } = this.ringsFor(tubes, plan.cuts);
    const axes = ready?.axes ?? weldThrough(j.arms.map((a, i) => { const tb = tubes.get(a.vesselId)!; return axisOf(tb, a.restR, plan.cuts[i]!, j.J, a.side ? armWalk(a, tb.tubular).from : undefined, false); }), j.arms.map(() => false));
    if (ready) this.paces.set(j.node, ready.pace);
    const mesh = ready?.mesh ?? buildSkinSteady(j, plan.cuts, pos, nor, axes.map(capsuleOf), undefined, this.paces);
    if (!ready) mesh.seamVerts.forEach((ids, a) => ids.forEach((v, q) => { mesh.restR[v] = rest[a]![q]!; }));   // (the seam ring's rest radius is the tube's own, exactly)
    const draw = this.deps.make(mesh, axes, objs as VesselObject[]);
    const arms: Link[] = j.arms.map((a, i) => ({ obj: objs[i]!, id: a.vesselId, end: a.end, u: plan.cuts[i]!.u, span: NETWORK_BY_ID.get(a.vesselId)!.lensSpan ?? [0, 1], last: [], cp: [NaN, NaN, NaN], lenC: COURSES.get(a.vesselId)!.lenC }));
    return { node: j.node, mesh, draw, arms, sources: plan.merged ?? [j.node], hidden: plan.hidden, bake: { plan, axes, mesh, pace: this.paces.get(j.node) ?? 0 } };
  }

  /** Builds the Circuit's skins (or lays in the baked ones when they were made for exactly these junctions and tubes). Any skin built before is removed first. A node that cannot be built keeps its tubes as they were, is named in `fellBack` and warned once. */
  build(): void {
    this.clear();
    const js = findCircuitJunctions();
    if (!js.length) return;
    const tubes = this.tubesOf(js), warn = this.deps.warn ?? ((m: string) => console.warn(m));
    this.digest = `circuit/${skinsDigest(js, tubes)}`;
    const baked = this.deps.baked?.() ?? null, usable = baked && baked.digest === this.digest ? baked : null;
    const made: Built[] = [], lost: { node: string; message: string }[] = [];
    if (usable) { for (const s of usable.skins) { const b = this.makeBuilt(s.plan, tubes, s); if (b) made.push(b); } lost.push(...usable.lost); }
    else {
      const { plans, failures } = planSkins(js, tubes, (j) => (cs) => hullCovers(this.ringsFor(tubes, cs).pos) && this.clearOfAxes(j, tubes, cs));
      for (const f of failures) lost.push({ node: f.node, message: f.message });
      for (const p of plans) {
        try { const b = this.makeBuilt(p, tubes); if (b) made.push(b); }
        catch (e) { lost.push({ node: p.merged?.join('+') ?? p.junction.node, message: (e as Error).message }); }
      }
    }
    this.lostNodes.length = 0; this.lostNodes.push(...lost);
    for (const f of lost) { if (!this.fellBack.includes(f.node)) this.fellBack.push(f.node); if (!this.warned.has(f.node)) { this.warned.add(f.node); warn(`circuit ${f.message} (keeping the map's tubes there)`); } }
    const touched = new Set<string>();
    for (const b of made) {
      this.deps.add(b.draw.object);
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
    return { digest: this.digest, skins: this.built.map((b) => b.bake), lost: [...this.lostNodes], dropped: [] };
  }

  /** Whether the skins are drawn at all: only over the end of the change (they have no alpha before it: nothing is drawn that is not seen). Written by the scene when the change moves. */
  show(on: boolean): void { this.shown = on; for (const b of this.built) b.draw.object.visible = on; }
  /** The map's turn (the vessel shader's circRot): the skins are built on the unturned map, and turn with it as one body. */
  setTurn(cos: number, sin: number): void {
    const m = turnMatrix(cos, sin);
    for (const b of this.built) { const o = b.draw.object as Group; o.matrixAutoUpdate = false; o.matrix.copy(m); o.matrixWorldNeedsUpdate = true; }
  }

  clear(): void {
    for (const id of this.ends.keys()) this.deps.vessel(id)?.setSkinCutC(SKIN_CUT_C_NONE[0], SKIN_CUT_C_NONE[1]);
    const had = this.ends.size > 0;
    this.ends.clear(); this.cuts.clear();
    for (const b of this.built) { this.deps.remove(b.draw.object); b.draw.dispose(); }
    this.built = []; this.fellBack.length = 0;
    if (had) this.deps.endsChanged?.();
  }
  dispose(): void { this.clear(); }

  /** The live handover once a frame, when something moved: for each arm what its tube has at its seam on the map, written to the skin only when it changed. True when any skin's numbers changed. At the end of the change every fade mode is 1 (vessels/shaders.ts mixes it to 1 with circT), the stenosis waist is 0 at a seam. */
  sync(): boolean {
    let changed = false;
    for (const b of this.built) {
      let any = false, blend = false;
      b.arms.forEach((a, i) => {
        const u = a.obj.toon.uniforms, v = (k: string) => u[k]!.value as { x: number; y: number; z: number; w: number };
        const hi: HiState = { on: u.hiOn!.value as number, dir: u.hiDir!.value as number, offset: u.hiOffset!.value as number, ahead: u.hiAhead!.value as number, behind: u.hiBehind!.value as number, ends: [v('hiEnds').x, v('hiEnds').y], fade: u.hiFade!.value as number, len: u.len!.value as number };
        const h = hiWeightAt(hi, a.u), l = lensUAt(a.span, a.u), col = u.color!.value as { r: number; g: number; b: number }, lu = (u.lensUse!.value as number) > 0.5 ? 1 : 0;
        if (a.last[0] !== h || a.last[1] !== l || a.last[2] !== col.r || a.last[3] !== col.g || a.last[4] !== col.b || a.last[5] !== lu) {
          a.last = [h, l, col.r, col.g, col.b, lu, a.last[6] ?? NaN, a.last[7] ?? NaN, a.last[8] ?? NaN]; b.draw.setArm(i, 1, h, l, { r: col.r, g: col.g, b: col.b, a: lu }, 0); any = true;
        }
        const pr = armPresenceAt(a.obj.group.visible, u.reveal!.value as number, u.fade!.value as number, a.u);
        if (a.last[6] !== pr) { a.last[6] = pr; b.draw.setPres(i, pr); any = true; }
        // the flow marks ride on the arm's arc in the map's own units (the vessel shader's `len * vU` with vU = 1 / MAP_K, and the radius the tube hands the dust: its body radius in those units)
        const rd = u.radius!.value as number, fl = u.flowAmount!.value as number;
        if (a.last[7] !== rd || a.last[8] !== fl) {
          a.last[7] = rd; a.last[8] = fl;
          b.draw.setArc(i, a.u * a.lenC / MAP_K, a.end === 1 ? 1 : -1, a.lenC / MAP_K, rd / MAP_K, fl); any = true;
        }
        const sh = a.obj.copyShares();
        if (a.cp[0] !== sh[0] || a.cp[1] !== sh[1] || a.cp[2] !== sh[2]) { a.cp = [sh[0], sh[1], sh[2]]; b.draw.setArmCopy(i, sh[0], sh[1], sh[2]); any = true; }
        if (a.obj.toon.transparent || a.obj.behindOrgans) blend = true;
      });
      if (any) changed = true;
      b.draw.setTransparent(blend);
    }
    return changed;
  }
}

export { SkinBuildError };
