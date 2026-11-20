// The junction skins of a scene (docs/junction-skin-spec.md WP5): which junctions are skinned, the cut each arm tube takes, and the per-frame handover of each arm's live fade, highlight and lens position to its skin.
// The scene builds one SkinSet when the page asks for skins (joins-mode.ts) and Smooth vessel joins is on, and throws it away when either goes. Nothing here draws: a `SkinDraw` (skin-object.ts) does.
//
// What a skin takes over from its arms, and what the arms stop doing:
//   - each arm tube is cut at its seam ring (VesselObject.setSkinCut): the skin starts on those same vertices;
//   - its `mate` at a skinned end is off (the skin's weights blend the arms' live widths; a mate easing on the tube beyond the seam would move the seam ring's radius), and so is the `bury` hold-back on the ink there
//     (the part of the tube it guarded is cut away): the scene's applyMates asks `endsOf`;
//   - the collaterals, shunts and feeders that grow from an arm keep today's fork method (`nbr`, `bury`): their ends land inside the skin, which covers the host's capsule.
// A node whose skin cannot be built (SkinBuildError: no seam ring that clears the blend, a ring the hull misses) keeps today's joins; it warns once and never crashes the scene.
//
// A skin whose arm changes shape (spec 10.3: a collateral coiling, a custom shunt dragged, the cavernoma) is REBUILT, never stretched: `markDirty(vesselId)` flags every skin that has that vessel as an arm, and `step()` (the scene's render phase, once a frame, before `sync`)
// rebuilds at most ONE flagged skin per frame, on the tubes as they are drawn now. The new skin and the arms' new cuts replace the old ones in that one call, so no frame shows a gap, a double or a seam on the old ring. Marks that arrive while the skin waits
// (a drag makes 60 a second) cost nothing: they set the same flag, and the rebuild reads the shape of the moment it runs. A skin whose rebuild took more than SKIN_BUILD_SLOW_MS is rebuilt on every other frame while marks keep coming, and once more after the last one.
// `skin-build` is the name the scene gives the clock for the frames this asks for (?perf lists it among the askers), and `stats` keeps the cost of the last and the worst rebuild.
import type { BufferGeometry, Object3D } from 'three';
import { NETWORK_BY_ID } from '../network.ts';
import { REST, coursesOf, tubularOf, type ShapeState } from '../shape.ts';
import { TUBE_RADIAL, buildTubes } from '../tubes.ts';
import { slicesFor } from '../../circuit/geometry.ts';
import { MIN_ARMS, dropFarGrowers, isLiverBranch, findSkinJunctions, nodesBeyondReach, skinNodesForPhase, withoutGrowers } from './inventory.ts';
import { armWalk, isThroughPair, planSkins, type ArmTube, type HullOk } from './cuts.ts';
import { PACES, buildSkinSteady, hullCovers } from './mesh.ts';
import { skinsDigest, type BakedSkin, type BakedSkins } from './baked.ts';
import { sdArm, skinKOf, type Capsule } from './sdf.ts';
import { SKIN_CUT_NONE, SKIN_GROWERS, SKIN_HIDDEN, SKIN_HOLE_NONE, SkinBuildError, type SkinCut, type SkinJunction, type SkinMesh, type Vec3 } from './types.ts';
import { armPresenceAt, hiWeightAt, lensUAt, liveFadeAt, type FadeState, type HiState } from './arm-twins.ts';
import type { VesselObject } from '../vessel-object.ts';
import type { ArmAxis, ArmColour } from './skin-object.ts';
import { SKIN_FIGURE_UNITS } from './shaders.ts';
import { weldThrough } from './through.ts';

/** What the skin's drawing object offers the set (skin-object.ts is the real one; a test hands in a plain recorder). */
export interface SkinDraw {
  readonly object: Object3D;
  /** the live handover for arm `i`: its tube's alpha at its seam, its highlight weight there, and its lens ramp's position there */
  setArm(i: number, fade: number, hi: number, lensU: number, colour: ArmColour, narrow: number): void;
  setArc(i: number, seamArc: number, dir: number, length: number, restR: number, flow: number): void;
  setPres(i: number, p: number): void;
  /** a growing arm's growth at its seam (0 gone, 1 whole): the skin's own shape eases with it (spec 10.2); an arm the skin does not morph ignores it */
  setGrow?(i: number, g: number): void;
  /** arm `i`'s shares of the three copies (front, solid, veil) as its tube has them: a skin copy shows where its arms' shares of it are, and nowhere else (spec 10.4) */
  setArmCopy(i: number, front: number, solid: number, veil: number): void;
  /** a skin blends only when one of its arms does (a fade zone): opaque otherwise, as the tubes are */
  setTransparent(on: boolean): void;
  dispose(): void;
}

export interface SkinSetDeps {
  /** the drawn vessel of a network id */
  vessel(id: string): VesselObject | undefined;
  /** the shape a vessel is drawn in now (undefined: at rest) */
  stateOf(id: string): ShapeState | undefined;
  /** the object that draws one built skin: its mesh, each arm's three axis points, the arms' drawn vessels (in arm order) */
  make(skin: SkinMesh, axes: readonly ArmAxis[], arms: readonly VesselObject[]): SkinDraw;
  /** where the skins' objects stand (the vessels' own parent, so they share its transform and layer) */
  add(o: Object3D): void;
  remove(o: Object3D): void;
  warn?(message: string): void;
  /** the skinned ends changed outside a full build (a rebuild failed and its node went back to today's joins, or came back): the scene runs applyMates again, which reads `endsOf` */
  endsChanged?(): void;
  /** milliseconds on the page's clock (a test hands in a fake to give a rebuild a cost) */
  now?(): number;
  /** the skins baked at build time (baked.ts), if the page has them: `build` lays them in when they were made for exactly these junctions and tubes, and plans and meshes nothing */
  baked?(): BakedSkins | null;
}

/** A rebuild that takes longer than this (ms) is done on every other frame while its arms keep changing (spec 10.3), and once more when they stop. */
export const SKIN_BUILD_SLOW_MS = 8;
/** The frames a slow skin waits between two rebuilds. */
export const SKIN_SLOW_GAP = 2;
/** The tag the scene gives the clock for the frames a pending rebuild asks for (?perf lists the askers of a slow frame). */
export const SKIN_BUILD_TAG = 'skin-build';
/** What ?perf and the tests read about the rebuilds. */
export interface SkinBuildStats { rebuilds: number; lastMs: number; worstMs: number; lastNode: string }

/** One arm as the per-frame handover reads it: its tube, the seam's place along it and in the figure. */
interface ArmLink { /** the arm is a growing one (a collateral or a shunt): it hands over its growth, not its presence */ grow: boolean; /** the seam ring's first vertex in the tube's geometry (`narrow` is read there) */ vi: number; obj: VesselObject; id: string; end: 0 | 1; u: number; x: number; y: number; span: readonly [number, number]; last: number[]; /** the copy shares last written (front, solid, veil), NaN before the first */ cp: number[] }
/** One skin of the set. `draw` is null for a node that fell back at a rebuild (today's joins there): it stays listed so a later change of an arm tries it again. */
interface Built {
  node: string; mesh: SkinMesh | null; draw: SkinDraw | null; arms: ArmLink[];
  /** the nodes (one, or two for a merged skin) and every vessel the skin stands on, hidden ones included: what a mark is matched against, and what a rebuild plans again */
  sources: readonly string[]; vessels: ReadonlySet<string>; hidden: readonly string[];
  /** an arm changed since the last rebuild; `slow`: that rebuild took over SKIN_BUILD_SLOW_MS; `at`: the step it ran in */
  dirty: boolean; slow: boolean; at: number;
  /** the holes this skin leaves in a host (a vessel with side-wall arms on both sides of its junction): the vessel and the u range the skin draws instead of the tube */
  holes: { id: string; lo: number; hi: number }[];
  /** what this skin was made from, for `bake()` (null on a node that fell back) */
  bake: BakedSkin | null;
}

/** The seam ring's vertices and normals of one arm, read from the tube `buildTubes` made (spec 4.4: not recomputed): `RADIAL` of them, in the tube's ring order. */
export function ringOf(g: BufferGeometry, ring: number, radius: number): { pos: Float32Array; nor: Float32Array; rest: Float32Array } {
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), rk = g.getAttribute('rk');
  const pos = new Float32Array(TUBE_RADIAL * 3), nor = new Float32Array(TUBE_RADIAL * 3), rest = new Float32Array(TUBE_RADIAL);
  for (let j = 0; j < TUBE_RADIAL; j++) {
    const i = ring * (TUBE_RADIAL + 1) + j;
    pos[j * 3] = p.getX(i); pos[j * 3 + 1] = p.getY(i); pos[j * 3 + 2] = p.getZ(i);
    nor[j * 3] = n.getX(i); nor[j * 3 + 1] = n.getY(i); nor[j * 3 + 2] = n.getZ(i);
    rest[j] = radius * rk.getX(i);   // the tube's own rest radius here: the vertex stage's `radius * rk`
  }
  return { pos, nor, rest };
}

/** The centre of a tube's ring and its mean radius. */
function ringCentre(g: BufferGeometry, ring: number): { c: Vec3; r: number } {
  const p = g.getAttribute('position');
  let x = 0, y = 0, z = 0;
  for (let j = 0; j < TUBE_RADIAL; j++) { const i = ring * (TUBE_RADIAL + 1) + j; x += p.getX(i); y += p.getY(i); z += p.getZ(i); }
  x /= TUBE_RADIAL; y /= TUBE_RADIAL; z /= TUBE_RADIAL;
  let r = 0;
  for (let j = 0; j < TUBE_RADIAL; j++) { const i = ring * (TUBE_RADIAL + 1) + j; r += Math.hypot(p.getX(i) - x, p.getY(i) - y, p.getZ(i) - z); }
  return { c: [x, y, z], r: r / TUBE_RADIAL };
}
/** The unit normal of a tube ring's plane (the sum of the cross products of its radial vectors), or null when the ring is degenerate. */
function ringPlaneNormal(g: BufferGeometry, ring: number): Vec3 | null {
  const { c } = ringCentre(g, ring), p = g.getAttribute('position');
  let nx = 0, ny = 0, nz = 0;
  for (let j = 0; j < TUBE_RADIAL; j++) {
    const a = ring * (TUBE_RADIAL + 1) + j, b = ring * (TUBE_RADIAL + 1) + ((j + 1) % TUBE_RADIAL);
    const ax = p.getX(a) - c[0], ay = p.getY(a) - c[1], az = p.getZ(a) - c[2], bx = p.getX(b) - c[0], by = p.getY(b) - c[1], bz = p.getZ(b) - c[2];
    nx += ay * bz - az * by; ny += az * bx - ax * bz; nz += ax * by - ay * bx;
  }
  const l = Math.hypot(nx, ny, nz);
  return l > 1e-12 ? [nx / l, ny / l, nz / l] : null;
}
/** The three points of an arm's axis its skin's ink and fillet are made from (spec 4.3, 4.7), junction side first. The seam point is the tube's own seam ring centre and radius (so the outline is exact there); the other two lie on the line through it along the tube's heading at the seam
 *  (the difference of the neighbouring ring centres), the first as far back toward the node as the arm's end ring is, the last `AXIS_REACH_R` radii from that end: a straight capsule through the seam never kinks against the tube's smooth curve at it, which a polyline of the
 *  tube's own, coarse, ring centres does (HA's left branch turns 45 degrees between two rings, a half pixel of ink off at the seam). Their radii are the end ring's and the tube's radius where the far point's ring is. */
export const AXIS_REACH_R = 6;
/** An arm whose end ring lies more than this many of its radii from J gets J put in front of its capsule (spec 10.5). */
export const BRIDGE_MIN_R = 0.1;
/** How far (radians) a seam ring may lean off the heading the neighbouring rings give before the ring's own plane normal is the heading. */
const TILT_MAX = 0.04;
export function axisOf(tube: ArmTube, restR: number, cut: SkinCut, J?: Vec3, startRing?: number, planeHeading = false): ArmAxis {
  const out = cut.end ? -1 : 1, last = tube.tubular;
  const end = startRing ?? (cut.end ? last : 0), a = ringCentre(tube.geometry, end), s = ringCentre(tube.geometry, cut.ring);
  const lo = Math.min(last, Math.max(0, cut.ring - out)), hi = Math.min(last, Math.max(0, cut.ring + out));   // (the ring nearer the node, the ring farther from it)
  const cl = ringCentre(tube.geometry, lo).c, ch = ringCentre(tube.geometry, hi).c;
  // with `planeHeading` the heading is the seam ring's own plane normal (the way the tube's flow marks and ink are laid across it), turned to run away from the node; the neighbouring ring centres give the sense and, for a degenerate ring, the heading itself
  let tx = ch[0] - cl[0], ty = ch[1] - cl[1], tz = ch[2] - cl[2];
  const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
  // (an arm whose rings lean off the neighbouring rings' chord by more than TILT_MAX takes the plane normal too: the skin's arc at the seam is then the tube's to the pixel, tests/skin-marks.test.ts)
  let rn = ringPlaneNormal(tube.geometry, cut.ring);
  if (rn && !planeHeading && Math.abs(rn[0] * tx + rn[1] * ty + rn[2] * tz) > Math.cos(TILT_MAX)) rn = null;
  if (rn) { const sgn = rn[0] * tx + rn[1] * ty + rn[2] * tz < 0 ? -1 : 1; tx = rn[0] * sgn; ty = rn[1] * sgn; tz = rn[2] * sgn; }
  const d0 = Math.hypot(s.c[0] - a.c[0], s.c[1] - a.c[1], s.c[2] - a.c[2]), d2 = Math.max(AXIS_REACH_R * restR - d0, restR);
  let far = cut.ring, at = s.c;
  for (let k = cut.ring; k >= 0 && k <= last; k += out) { far = k; at = ringCentre(tube.geometry, k).c; if (Math.hypot(at[0] - a.c[0], at[1] - a.c[1], at[2] - a.c[2]) >= AXIS_REACH_R * restR) break; }
  const f = ringCentre(tube.geometry, far);
  const p1: Vec3 = [s.c[0] - tx * d0, s.c[1] - ty * d0, s.c[2] - tz * d0];
  // THE BRIDGE (spec 10.5): every capsule starts AT J. Where the art leaves a gap (the arm's end more than a tenth of a radius from J) J is put in front, with the end ring's radius, so the union bridges the gap with the arm's own width and the hull (the rings alone) is unchanged
  const bridged = J && Math.hypot(J[0] - a.c[0], J[1] - a.c[1], J[2] - a.c[2]) > BRIDGE_MIN_R * restR;   // (judged on the tube's own end ring: a tube that reaches J but bends on the way is not a gap)
  return { pts: [bridged ? J! : p1, p1, s.c, [s.c[0] + tx * d2, s.c[1] + ty * d2, s.c[2] + tz * d2]], radii: [a.r, a.r, s.r, f.r] };
}

/** An arm's arc numbers for the skin's flow marks (the tube's `vUv.x * len * vU` at the seam, 300 figure units to the scene unit on the body): the arc at the seam, which way it grows toward the node, the vessel's length and its rest radius, all in figure units. */
export function armArcOf(end: 0 | 1, u: number, len: number, radius: number): { seamArc: number; dir: number; length: number; restR: number } {
  return { seamArc: u * len * SKIN_FIGURE_UNITS, dir: end === 1 ? 1 : -1, length: len * SKIN_FIGURE_UNITS, restR: radius * SKIN_FIGURE_UNITS };
}

/** An axis as the mesh builder's capsule (sdf.ts): the same three points and radii. */
export const capsuleOf = (a: ArmAxis): Capsule => ({ n: a.pts.length, pts: Float64Array.from(a.pts.flat()), r: Float64Array.from(a.radii), mate: a.mate });

/** Whether a junction has a liver vein's second branch among its arms (inventory.ts `isLiverBranch`). */
const hasLiverBranch = (j: SkinJunction): boolean => j.arms.some((a) => { const v = NETWORK_BY_ID.get(a.vesselId); return !!v && isLiverBranch(v); });

/** The holes a skin's cuts leave (spec 10.1): a vessel with a side-wall arm on each side of the junction is not drawn between their seams; with an arm on one side only its cut is an ordinary one (the rest of the tube is inside the skin's reach). */
export function holesOf(cuts: readonly SkinCut[]): { id: string; lo: number; hi: number }[] {
  const out: { id: string; lo: number; hi: number }[] = [];
  for (const c of cuts) {
    if (c.side !== -1) continue;
    const up = cuts.find((o) => o.vesselId === c.vesselId && o.side === 1);
    if (up) out.push({ id: c.vesselId, lo: c.u, hi: up.u });
  }
  return out;
}

export class SkinSet {
  private built: Built[] = [];
  /** the ends that are skinned, by vessel id: [start, end] */
  private readonly ends = new Map<string, [boolean, boolean]>();
  /** the cut each skinned tube takes now, by vessel id (both ends of a vessel two skins share in one entry; a vessel a merged skin replaces whole is hidden) */
  private readonly cuts = new Map<string, [number, number]>();
  /** the holes each skinned tube has now, by vessel id (at most two: `skinHole`, `skinHole2`) */
  private readonly holes = new Map<string, { node: string; lo: number; hi: number }[]>();
  private readonly warned = new Set<string>();
  /** the rung of the pace ladder (mesh.ts PACES) each node's skin closed at: its next build starts there */
  private readonly paces = new Map<string, number>();
  /** what the last `build` was made from and gave (`bake()`) */
  private digest = '';
  private readonly lostNodes: { node: string; message: string }[] = [];
  private readonly madeDropped: string[] = [];
  /** the nodes that fell back to today's method (named, once) */
  readonly fellBack: string[] = [];
  /** the growing arms a skin could not take (`node:vessel`): they keep today's fork method (spec 10.6), named so a new one fails tests/skin-grow.test.ts until someone looks */
  readonly dropped: string[] = [];
  /** the junctions of the phase built, as the inventory found them (a rebuild plans from these again) */
  private sources: SkinJunction[] = [];
  private step_ = 0;
  private readonly cost: SkinBuildStats = { rebuilds: 0, lastMs: 0, worstMs: 0, lastNode: '' };

  private readonly deps: SkinSetDeps;
  constructor(deps: SkinSetDeps) { this.deps = deps; }

  private now(): number { return this.deps.now ? this.deps.now() : performance.now(); }
  /** The skinned ends of vessel `id` (both false: its joins are today's). */
  endsOf(id: string): readonly [boolean, boolean] { return this.ends.get(id) ?? [false, false]; }
  /** The skins now drawn (a node that fell back at a rebuild is not counted). */
  get count(): number { return this.drawn.length; }
  /** The junction nodes that are skinned. */
  get nodes(): readonly string[] { return this.drawn.map((b) => b.node); }
  /** The vessel ids of a built skin's arms, in arm order (the draw returned by `make`). */
  armIdsOf(draw: SkinDraw): readonly string[] { return this.built.find((b) => b.draw === draw)?.arms.map((a) => a.id) ?? []; }
  /** The drawing objects of the skins as they stand (the ones a retried plan took back are not among them). */
  liveDraws(): readonly SkinDraw[] { return this.drawn.map((b) => b.draw!).filter(Boolean); }
  /** The drawn skins' objects, each with the vessel ids of its arms (the inspector hides a skin when none of its arms is shown). */
  drawnArms(): { object: Object3D; node: string; arms: readonly string[] }[] { return this.drawn.map((b) => ({ object: b.draw.object, node: b.node, arms: b.arms.map((a) => a.id) })); }
  /** The built skin of a node, or undefined. */
  skinOf(node: string): SkinMesh | undefined { return this.drawn.find((b) => b.node === node)?.mesh ?? undefined; }
  /** How many rebuilds ran, what the last and the worst cost (ms), and which node was the last. */
  get stats(): Readonly<SkinBuildStats> { return this.cost; }
  /** Whether a skin waits for its rebuild (the scene asks the clock for another frame while true). */
  get pending(): boolean { return this.built.some((b) => b.dirty); }
  private get drawn(): (Built & { draw: SkinDraw; mesh: SkinMesh })[] { return this.built.filter((b): b is Built & { draw: SkinDraw; mesh: SkinMesh } => !!b.draw && !!b.mesh); }

  /** The tubes of the junctions' arms exactly as the scene draws them now: the vessel's own course first, `buildTubes`' vertex layout. */
  private tubesOf(js: readonly SkinJunction[]): Map<string, ArmTube> {
    const m = new Map<string, ArmTube>();
    for (const j of js) for (const a of j.arms) {
      if (m.has(a.vesselId)) continue;
      const def = NETWORK_BY_ID.get(a.vesselId)!;
      const b = buildTubes(coursesOf(def, this.deps.stateOf(a.vesselId) ?? REST), tubularOf(def, slicesFor(a.vesselId)), def.radius);
      m.set(a.vesselId, { geometry: b.geometry, tubular: b.runs[0]!.tubular });
    }
    return m;
  }

  /** The seam rings of a set of cuts, read from the tubes. */
  private ringsFor(tubes: ReadonlyMap<string, ArmTube>, cuts: SkinCut[]): { pos: Float32Array[]; nor: Float32Array[]; rest: Float32Array[] } {
    const r = cuts.map((c) => ringOf(tubes.get(c.vesselId)!.geometry, c.ring, NETWORK_BY_ID.get(c.vesselId)!.radius));
    return { pos: r.map((x) => x.pos), nor: r.map((x) => x.nor), rest: r.map((x) => x.rest) };
  }

  /** Plans (cuts.ts) the junctions on the given tubes: one plan per skin, a named failure for a node that cannot be built. */
  private plan(js: readonly SkinJunction[], tubes: ReadonlyMap<string, ArmTube>): ReturnType<typeof planSkins> {
    // A set of cuts is good when the hull has every ring (spec 4.4.3) AND every ring is clear of the other arms as the skin DRAWS them (`clearOfAxes`)
    // (a junction with a liver branch is meshed from the surface itself, skin/sheet.ts, which needs no hull of the rings: its seams are as near as the clearance allows, not pushed out until a hull covers them, which on a fork at 30 degrees means
    //  seams 8 radii out and a skin that crowds its neighbours)
    return planSkins(js, tubes, (j) => {
      let blamed = -1;
      const ok: HullOk = (cs) => { blamed = -1; if (!(hasLiverBranch(j) || hullCovers(this.ringsFor(tubes, cs).pos))) return false; blamed = this.clearOfAxes(j, tubes, cs); return blamed < 0; };
      ok.blame = () => (hasLiverBranch(j) ? blamed : -1);   // (the arm whose seam stands too near another arm moves out, not the seam nearest J)
      return ok;
    });
  }

  /**
   * Rule 4.4.1 on the arms the mesh and the ink are made from. cuts.ts judges the clearance on each arm's own ring centres, but the skin's fillet and its outline (skin/shaders.ts) use `axisOf`: the straight line through the seam's heading. They agree where an arm runs
   * straight to its node and part where it bends on the way (a shunt that curves in), and then a seam ring stands inside the BLEND of another arm's drawn capsule, so the outline is a fraction of a pixel inside the tube's own where they meet: a kink at the seam
   * (tests/skin-agreement.test.ts, the seam's ink). So the clearance is also judged on the drawn capsules: every vertex of a seam ring is at least the blend width `k` from every other arm's drawn capsule.
   */
  private clearOfAxes(j: SkinJunction, tubes: ReadonlyMap<string, ArmTube>, cuts: SkinCut[]): number {
    const caps = j.arms.map((a, i) => capsuleOf(axisOf(tubes.get(a.vesselId)!, a.restR, cuts[i]!, j.J)));
    const k = skinKOf(j.arms), { pos } = this.ringsFor(tubes, cuts);
    for (let i = 0; i < j.arms.length; i++) for (let o = 0; o < j.arms.length; o++) {
      if (o === i || isThroughPair(j.arms[i]!, j.arms[o]!)) continue;
      for (let v = 0; v < TUBE_RADIAL; v++) if (sdArm(caps[o]!, pos[i]![3 * v]!, pos[i]![3 * v + 1]!, pos[i]![3 * v + 2]!) < k) return i;
    }
    return -1;
  }

  /**
   * Plans AND makes the skins of the junctions, the way a junction with growing arms has to be (spec 10.6: what falls back is named, and a skin that was there before the collaterals landed on it must not be lost to them): a junction that cannot be planned or built with
   * its growing arms loses its narrowest one and is tried again, down to none. The arms it loses keep today's fork method and are named in `droppedGrowers`; a junction that fails with none is `lost` (named, the node keeps today's joins). A merged skin that fails
   * hands both its nodes back to be planned apart. Nothing is added to the scene here: the caller does that, so a rebuild can swap.
   */
  private produce(js: readonly SkinJunction[], tubes: ReadonlyMap<string, ArmTube>): { made: Built[]; lost: { node: string; message: string }[] } {
    const made: Built[] = [], lost: { node: string; message: string }[] = [];
    let todo: SkinJunction[] = [...js];
    const latest = new Map<string, SkinJunction>(js.map((j) => [j.node, j]));   // (the junction of each node as it was last planned: growing arms dropped included)
    for (let round = 0; todo.length && round <= SKIN_GROWERS + 1; round++) {
      const { plans, failures } = this.plan(todo, tubes);
      const again = new Map<string, string>();   // (node -> why: the junctions to try again with one growing arm fewer)
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
          const g = j.arms.filter((a) => a.grow);
          if (!g.length) {
            // a merged skin that failed: this node has nothing to drop, but its partner's growing arm goes (with fewer than three arms the partner is no junction), so the merge goes too and this node is planned again alone: the cava's IVCS and the run-on RHV_T the TIPS lands on
            if (f.nodes.length > 1 && f.nodes.some((m) => m !== n && todo.find((x) => x.node === m)?.arms.some((a) => a.grow))) { again.set(n, f.message); next.push(j); continue; }
            lost.push({ node: f.nodes.join('+'), message: f.message }); continue;
          }
          const drop = g[g.length - 1]!, arms = j.arms.filter((a) => a !== drop);
          this.dropped.push(`${n}:${drop.vesselId}`);
          again.set(n, f.message);
          if (arms.length >= MIN_ARMS) next.push({ ...j, arms });   // (a run-on pair with its collateral gone is no junction: it never had a skin, so it is not a fall back, only a dropped arm)
        }
      }
      // (a merged skin that failed hands both its nodes back: the one without growers is planned again too, as it was)
      for (const f of bad) for (const n of f.nodes) { const j = todo.find((x) => x.node === n); if (j && !again.has(n) && !lost.some((l) => l.node.split('+').includes(n)) && !next.some((x) => x.node === n)) next.push(j); }
      // a node planned again is planned WITH the skins already made on a vessel it shares (a junction retried without its growing arm may now lie against a neighbour's seams, which only a planned-together pair merges: the left portal vein's skin and the portal fork's,
      // PVH_L between them): those are taken back and planned again with it
      for (const m of [...made]) {
        if (m.sources.some((n) => next.some((x) => x.node === n))) continue;
        const src = m.sources.map((n) => latest.get(n)).filter((x): x is SkinJunction => !!x);
        if (!src.length || !src.some((sj) => next.some((x) => x.arms.some((p) => sj.arms.some((q) => q.vesselId === p.vesselId))))) continue;
        made.splice(made.indexOf(m), 1); m.draw?.dispose();
        for (const sj of src) if (!next.some((x) => x.node === sj.node)) next.push(sj);
      }
      // a node of this round whose skin was made is not planned again
      todo = next.filter((j) => !made.some((m) => m.sources.includes(j.node)));
      for (const j of todo) latest.set(j.node, j);
    }
    for (const j of todo) lost.push({ node: j.node, message: `skin: junction ${j.node}: no skin after ${SKIN_GROWERS + 1} rounds of dropping growing arms` });
    return { made, lost };
  }

  /** The skin of one plan, made but not yet in the scene: its mesh, its drawing object and the handover links. Throws a SkinBuildError (or any error) the caller turns into a fallback. Null: an arm's vessel is not in this scene. */
  private makeBuilt(plan: ReturnType<typeof planSkins>['plans'][number], tubes: ReadonlyMap<string, ArmTube>, ready?: BakedSkin): Built | null {
    const j = plan.junction;
    const objs = j.arms.map((a) => this.deps.vessel(a.vesselId));
    if (objs.some((o) => !o)) return null;   // (a vessel not in this scene: no skin; the tubes are untouched)
    const { pos, nor, rest } = this.ringsFor(tubes, plan.cuts);
    // the arms' axes: the tubes' own ring centres and radii, the SAME three-point polylines the skin's fragment stage draws its ink from, so the mesh's fillet and its outline are one shape
    // (a baked skin brings its axes and its mesh: the page plans nothing and remeshes nothing)
    const sided = j.arms.some((a) => !!a.side);   // (a skin with a side-wall arm: its arms' headings are the seam rings' own plane normals; every other skin keeps the neighbouring-ring heading it always had)
    const axes = ready?.axes ?? weldThrough(j.arms.map((a, i) => { const tb = tubes.get(a.vesselId)!; return axisOf(tb, a.restR, plan.cuts[i]!, j.J, a.side ? armWalk(a, tb.tubular).from : undefined, sided); }), j.arms.map((a) => !!a.grow));   // (a trunk that runs through the node is one vessel to the union: through.ts)
    if (ready) this.paces.set(j.node, ready.pace);
    if (!ready && hasLiverBranch(j)) this.paces.set(j.node, Math.max(this.paces.get(j.node) ?? 0, PACES.length - 1));   // (meshed from the surface from the start)
    const mesh = ready?.mesh ?? buildSkinSteady(j, plan.cuts, pos, nor, axes.map(capsuleOf), undefined, this.paces);
    // on a seam ring the skin's rest radius is the tube's own, exactly (the mesh builder measures the ring's mean radius, a few parts in 10^4 off the tube's `radius * rk`): the live move of a seam vertex is then the tube's to the last bit (spec 4.6)
    if (!ready) mesh.seamVerts.forEach((ids, a) => ids.forEach((v, q) => { mesh.restR[v] = rest[a]![q]!; }));   // (a baked mesh has had it done)
    const draw = this.deps.make(mesh, axes, objs as VesselObject[]);
    const arms: ArmLink[] = j.arms.map((a, i) => {
      const cut = plan.cuts[i]!, ring = pos[i]!;
      let x = 0, y = 0;
      for (let v = 0; v < TUBE_RADIAL; v++) { x += ring[v * 3]!; y += ring[v * 3 + 1]!; }
      return { grow: !!a.grow && mesh.grow.some((m) => m.arm === i), vi: cut.ring * (TUBE_RADIAL + 1), obj: objs[i]!, id: a.vesselId, end: a.end, u: cut.u, x: x / TUBE_RADIAL, y: y / TUBE_RADIAL, span: NETWORK_BY_ID.get(a.vesselId)!.lensSpan ?? [0, 1], last: [], cp: [NaN, NaN, NaN] };
    });
    const sources = plan.merged ?? [j.node];
    const vessels = new Set<string>(this.sources.filter((s) => sources.includes(s.node)).flatMap((s) => s.arms.map((a) => a.vesselId)));
    for (const a of j.arms) vessels.add(a.vesselId);
    return { node: j.node, mesh, draw, arms, sources, vessels, hidden: plan.hidden, dirty: false, slow: false, at: -Infinity, holes: holesOf(plan.cuts), bake: { plan, axes, mesh, pace: this.paces.get(j.node) ?? 0 } };
  }

  /** Records a skin's cuts and skinned ends (its arms' ends, and every vessel it replaces whole), without touching the tubes. */
  private takeCuts(b: Built): string[] {
    const touched: string[] = [];
    for (const h of b.holes) {
      const hs = this.holes.get(h.id) ?? [];
      if (hs.length >= 2) throw new SkinBuildError(b.node, `${h.id} would have more than two holes`);   // (spec 10.1: a vessel has `skinHole` and `skinHole2`)
      hs.push({ node: b.node, lo: h.lo, hi: h.hi }); this.holes.set(h.id, hs); touched.push(h.id);
    }
    for (const a of b.arms) {
      if (b.holes.some((h) => h.id === a.id)) continue;   // (both sides of this host are arms of the skin: a hole, the host's own ends stay as they are)
      const c = this.cuts.get(a.id) ?? [SKIN_CUT_NONE[0], SKIN_CUT_NONE[1]];
      if (a.end === 0) c[0] = a.u; else c[1] = a.u;
      this.cuts.set(a.id, c);
      const e = this.ends.get(a.id) ?? [false, false]; e[a.end] = true; this.ends.set(a.id, e);
      touched.push(a.id);
    }
    for (const id of b.hidden) { this.cuts.set(id, [SKIN_HIDDEN[0], SKIN_HIDDEN[1]]); this.ends.set(id, [true, true]); touched.push(id); }
    return touched;
  }

  /** Forgets a skin's cuts and skinned ends (only the ends it owns: a vessel two skins share keeps the other's), and puts the tubes' cuts as they are now. */
  private dropCuts(b: Built): void {
    const touched = new Set<string>();
    this.dropHoles(b, touched);
    for (const a of b.arms) {
      if (b.holes.some((h) => h.id === a.id)) continue;
      const c = this.cuts.get(a.id), e = this.ends.get(a.id);
      if (c) { c[a.end] = SKIN_CUT_NONE[a.end]; }
      if (e) e[a.end] = false;
      touched.add(a.id);
    }
    for (const id of b.hidden) { this.cuts.delete(id); this.ends.delete(id); touched.add(id); }
    for (const id of touched) {
      const c = this.cuts.get(id), e = this.ends.get(id);
      if (c && e && !e[0] && !e[1]) { this.cuts.delete(id); this.ends.delete(id); }
      this.deps.vessel(id)?.setSkinCut(...(this.cuts.get(id) ?? SKIN_CUT_NONE) as [number, number]);
      this.putHoles(id);
    }
  }

  /** Forgets a skin's holes (the vessels it touched are added to `touched`). */
  private dropHoles(b: Built, touched: Set<string>): void {
    for (const h of b.holes) {
      const hs = (this.holes.get(h.id) ?? []).filter((x) => x.node !== b.node);
      if (hs.length) this.holes.set(h.id, hs); else this.holes.delete(h.id);
      touched.add(h.id);
    }
  }

  /** Writes a tube's holes (the two slots; an empty one is `SKIN_HOLE_NONE`). */
  private putHoles(id: string): void {
    const o = this.deps.vessel(id), hs = this.holes.get(id) ?? [];
    if (!o) return;
    for (const slot of [0, 1] as const) { const h = hs[slot]; o.setSkinHole(slot, h ? h.lo : SKIN_HOLE_NONE[0], h ? h.hi : SKIN_HOLE_NONE[1]); }
  }
  /** The holes a vessel has now (a test reads them). */
  holesOn(id: string): readonly { node: string; lo: number; hi: number }[] { return this.holes.get(id) ?? []; }

  /** Builds the skins of `phase` (spec 4.1) with the joins as they stand now (Smooth vessel joins on). Any skin built before is removed first. Planned together (cuts.ts planSkins: two skins on one vessel merge when they would crowd); a node that cannot be
   *  built keeps today's joins, is named in `fellBack` and warned once. */
  build(phase: 1 | 2): void {
    this.clear();
    const nodes = skinNodesForPhase(phase);
    // phase 2 also builds every node a collateral or a shunt lands on (spec 10.2); phase 1 (the confluence alone) has none of them
    const all: SkinJunction[] = findSkinJunctions().filter((j) => nodes.has(j.node) || (phase === 2 && (j.arms.some((a) => a.grow || isLiverBranch(NETWORK_BY_ID.get(a.vesselId)!))))).map((j) => (phase === 1 ? withoutGrowers(j) : j)).filter((j): j is SkinJunction => !!j);
    // a collateral or shunt whose end lies farther from J than SKIN_REACH is on a host's side, not at the node: it is left out of the skin (named in `dropped`), and never takes the node's skin with it
    const near = all.map((j) => { const d = dropFarGrowers(j); for (const id of d.far) this.dropped.push(`${j.node}:${id}`); return d.junction; }).filter((j) => j.arms.length >= MIN_ARMS);
    all.length = 0; all.push(...near);
    const far = new Set(nodesBeyondReach(all));   // (the art's own spacing, not a junction: the old join stays, named in `fellBack` and not warned)
    for (const n of far) if (!this.fellBack.includes(n)) this.fellBack.push(n);
    const js = all.filter((j) => !far.has(j.node));
    this.sources = js;
    if (!js.length) return;
    const tubes = this.tubesOf(js);
    const warn = this.deps.warn ?? ((m: string) => console.warn(m));
    // the skins baked at build time, when they were made for exactly these junctions and tubes (the digest): laid in as they are, nothing planned or meshed here
    this.digest = skinsDigest(js, tubes);
    const baked = this.deps.baked?.() ?? null, usable = baked && baked.digest === this.digest ? baked : null;
    const d0 = this.dropped.length;
    let made: Built[], lost: { node: string; message: string }[];
    if (usable) {
      made = usable.skins.map((s) => this.makeBuilt(s.plan, tubes, s)).filter((b): b is Built => !!b);
      lost = usable.lost; this.dropped.push(...usable.dropped);
    } else ({ made, lost } = this.produce(js, tubes));
    this.lostNodes.length = 0; this.lostNodes.push(...lost);
    this.madeDropped.length = 0; this.madeDropped.push(...this.dropped.slice(d0));
    for (const f of lost) { this.fail(f.node, f.message, warn); this.built.push(this.lost(f.node)); }
    const touched = new Set<string>();
    for (const b of made) {
      this.deps.add(b.draw!.object);
      this.built.push(b);
      // the tubes: cut at their seams, both ends of a vessel that two skins share in ONE cut (the second never overwrites the first); a vessel a merged skin replaces whole is hidden (2, -1)
      for (const id of this.takeCuts(b)) touched.add(id);
    }
    for (const id of touched) { const c = this.cuts.get(id) ?? SKIN_CUT_NONE; this.deps.vessel(id)?.setSkinCut(c[0], c[1]); this.putHoles(id); }
    for (const t of tubes.values()) t.geometry.dispose();
    this.sync();   // (the skins start from what their arms have NOW, from the first frame: a hidden or still drawing arm gives its skin nothing, never a stray one)
  }

  /** What the last `build` made, as the file the build bakes (scripts/bake-skins.mjs): every skin with the plan, axes and mesh it was made from, the nodes that fell back, the growing arms it dropped, and the digest of the junctions and tubes it was made for. */
  bake(): BakedSkins {
    return { digest: this.digest, skins: this.built.filter((b): b is Built & { bake: BakedSkin } => !!b.bake).map((b) => b.bake), lost: [...this.lostNodes], dropped: [...this.madeDropped] };
  }

  /** A node that has no skin (it fell back): kept in the list, undrawn, so a change of one of its arms plans it again. */
  private lost(node: string): Built {
    const sources = node.split('+');
    const vessels = new Set<string>(this.sources.filter((s) => sources.includes(s.node)).flatMap((s) => s.arms.map((a) => a.vesselId)));
    return { node, mesh: null, draw: null, arms: [], sources, vessels, hidden: [], dirty: false, slow: false, at: -Infinity, holes: [], bake: null };
  }

  private fail(node: string, message: string, warn: (m: string) => void): void {
    if (!this.fellBack.includes(node)) this.fellBack.push(node);
    if (!this.warned.has(node)) { this.warned.add(node); warn(`${message} (keeping today's joins there)`); }
  }

  /** An arm of the skin at `vesselId` changed its course (a collateral coiling, a shunt dragged, a width the shape moves): every skin that stands on it is rebuilt by the next `step()`. Cheap and idempotent: call it as often as the shape moves. */
  markDirty(vesselId: string): void {
    for (const b of this.built) if (b.vessels.has(vesselId)) b.dirty = true;
  }

  /** The rebuilds, ONCE a frame in the scene's render phase, before `sync` (spec 10.3): at most one skin is rebuilt, the oldest one flagged and not waiting out its slow gap. Its mesh and its arms' cuts are swapped in the same call, so the tubes and the skin are never drawn
   *  apart. A skin whose last rebuild took over SKIN_BUILD_SLOW_MS waits SKIN_SLOW_GAP steps before the next, and is rebuilt once more after its arms stop changing (it stays flagged until then). True while any skin is still waiting (the scene asks for another frame, tagged `skin-build`). */
  step(): boolean {
    this.step_++;
    for (const b of this.built) {
      if (!b.dirty) continue;
      if (b.slow && this.step_ - b.at < SKIN_SLOW_GAP) continue;
      this.rebuild(b);
      break;
    }
    return this.pending;
  }

  /** One skin again on the tubes as they are now. A failure takes the node back to today's joins until one of its arms changes again. */
  private rebuild(b: Built): void {
    const t0 = this.now();
    b.dirty = false; b.at = this.step_;
    const js = this.sources.filter((s) => b.sources.includes(s.node));
    const tubes = this.tubesOf(js);
    const warn = this.deps.warn ?? ((m: string) => console.warn(m));
    let nb: Built | null = null;
    try {
      const { made, lost } = this.produce(js, tubes);
      if (lost.length) throw new Error(lost[0]!.message);
      nb = made.find((m) => m.node === b.node) ?? null;
      for (const m of made) if (m !== nb) { m.draw?.dispose(); }   // (a skin the rebuild made for a node it was not asked about is not used)
      if (!nb) throw new Error(`skin ${b.node}: the rebuild made ${made.map((m) => m.node).join(', ') || 'nothing'}`);
    } catch (e) { this.fail(b.node, (e as Error).message, warn); }
    for (const t of tubes.values()) t.geometry.dispose();
    const was = !!b.draw;
    if (nb) {
      // the swap: the new skin in, the old one out, the arms' new cuts on the tubes, all in this one call
      const old = b.draw, i = this.built.indexOf(b);
      const gone = new Set<string>([...b.arms.map((a) => a.id), ...b.hidden]);
      if (old) this.dropCutsQuiet(b);
      for (const h of b.holes) gone.add(h.id);
      this.deps.add(nb.draw!.object);
      this.built[i] = nb;
      for (const id of this.takeCuts(nb)) gone.add(id);
      for (const id of gone) { const c = this.cuts.get(id) ?? SKIN_CUT_NONE; this.deps.vessel(id)?.setSkinCut(c[0], c[1]); this.putHoles(id); }
      if (old) { this.deps.remove(old.object); old.dispose(); }
      const fi = this.fellBack.indexOf(b.node); if (fi >= 0) this.fellBack.splice(fi, 1);
      if (!was) this.deps.endsChanged?.();
    } else if (was) {
      // the node cannot be built on this shape: today's joins until an arm changes again
      this.deps.remove(b.draw!.object); b.draw!.dispose();
      this.dropCuts(b);
      b.draw = null; b.mesh = null; b.arms = [];
      this.deps.endsChanged?.();
    }
    const ms = this.now() - t0;
    this.cost.rebuilds++; this.cost.lastMs = ms; this.cost.lastNode = b.node; this.cost.worstMs = Math.max(this.cost.worstMs, ms);
    (nb ?? b).slow = ms > SKIN_BUILD_SLOW_MS; (nb ?? b).at = this.step_;
    if (nb) nb.dirty = false;
  }

  /** Forgets a skin's recorded cuts and ends before another skin takes them (the caller sets the tubes' cuts right after, so nothing is drawn between). */
  private dropCutsQuiet(b: Built): void {
    this.dropHoles(b, new Set());
    for (const a of b.arms) {
      if (b.holes.some((h) => h.id === a.id)) continue; const c = this.cuts.get(a.id), e = this.ends.get(a.id); if (c) c[a.end] = SKIN_CUT_NONE[a.end]; if (e) e[a.end] = false; }
    for (const id of b.hidden) { this.cuts.delete(id); this.ends.delete(id); }
  }

  /** Every cut, skin and flag back to today's joins (the caller runs applyMates afterwards, which reads `endsOf` again). */
  clear(): void {
    for (const id of this.ends.keys()) this.deps.vessel(id)?.setSkinCut(SKIN_CUT_NONE[0], SKIN_CUT_NONE[1]);
    const held = [...this.holes.keys()];
    this.holes.clear();
    for (const id of held) this.putHoles(id);
    this.ends.clear();
    this.cuts.clear();
    for (const b of this.built) if (b.draw) { this.deps.remove(b.draw.object); b.draw.dispose(); }
    this.built = [];
    this.fellBack.length = 0;
    this.dropped.length = 0;
  }

  dispose(): void { this.clear(); }

  /** The live handover, once a frame after the vessels have moved: for each arm what its tube has at its seam, copied to the skin only when it changed. True when any skin's numbers changed (the scene draws a frame). */
  sync(): boolean {
    let changed = false;
    for (const b of this.drawn) {
      let any = false, blend = false;
      b.arms.forEach((a, i) => {
        const u = a.obj.toon.uniforms, v = (k: string) => u[k]!.value as { x: number; y: number; z: number; w: number };
        const fade: FadeState = { mode: u.fadeMode!.value as number, a: [v('fadeA').x, v('fadeA').y, v('fadeA').z, v('fadeA').w], line: [v('fadeLine').x, v('fadeLine').y, v('fadeLine').z, v('fadeLine').w], cavaEnd: [v('cavaEnd').x, v('cavaEnd').y], stumpCut: v('stump').x, len: u.len!.value as number, units: 300 };
        const hi: HiState = { on: u.hiOn!.value as number, dir: u.hiDir!.value as number, offset: u.hiOffset!.value as number, ahead: u.hiAhead!.value as number, behind: u.hiBehind!.value as number, ends: [v('hiEnds').x, v('hiEnds').y], fade: u.hiFade!.value as number, len: u.len!.value as number };
        const f = liveFadeAt(fade, a.u, a.x, a.y), h = hiWeightAt(hi, a.u), l = lensUAt(a.span, a.u);
        const col = u.color!.value as { r: number; g: number; b: number }, lu = (u.lensUse!.value as number) > 0.5 ? 1 : 0;
        const nar = a.obj.toonMesh.geometry.getAttribute('narrow')?.getX(a.vi) ?? 0;   // (the stenosis waist the tube has at its seam; disease/clamps.ts writes it, only for a vessel that is stenosed)
        if (a.last[0] !== f || a.last[1] !== h || a.last[2] !== l || a.last[3] !== col.r || a.last[4] !== col.g || a.last[5] !== col.b || a.last[6] !== lu || a.last[7] !== nar) {
          a.last = [f, h, l, col.r, col.g, col.b, lu, nar, a.last[8] ?? NaN, a.last[9] ?? NaN, a.last[10] ?? NaN]; b.draw.setArm(i, f, h, l, { r: col.r, g: col.g, b: col.b, a: lu }, nar); any = true;
        }
        // the arm's presence: the skin is there as much as its tube is (visible, drawn on, dissolved)
        const pr = armPresenceAt(a.obj.group.visible, u.reveal!.value as number, u.fade!.value as number, a.u);
        if (a.grow) {
          // a GROWING arm is not dithered away (that would punch holes in the trunk where its mouth was): its draw-on is the skin's own shape, eased between the closed and the open one (spec 10.2). A dotted thread (a closed potential collateral) counts as 0:
          // its tube is not cut, and the trunk is a plain trunk
          const gv = (u.dotted!.value as number) > 0.5 ? 0 : pr;
          if (a.last[11] !== gv) { a.last[11] = gv; b.draw.setGrow?.(i, gv); any = true; }
        } else if (a.last[10] !== pr) { a.last[10] = pr; b.draw.setPres(i, pr); any = true; }
        // the arm's flow marks ride on its arc (armArcOf: the tube's own u x len x figure units) and its tube's flowAmount
        const ln = u.len!.value as number, rd = u.radius!.value as number, fl = u.flowAmount!.value as number;
        if (a.last[8] !== ln || a.last[9] !== fl) {
          a.last[8] = ln; a.last[9] = fl;
          const arc = armArcOf(a.end, a.u, ln, rd); b.draw.setArc(i, arc.seamArc, arc.dir, arc.length, arc.restR, fl); any = true;
        }
        // the arm's three copies (spec 10.4): its tube's own shares of its front, solid and veil copies (a plain vessel (1, 0, 0)); how much of the tube is THERE at the seam is `armPres` above
        const sh = a.obj.copyShares();
        if (a.cp[0] !== sh[0] || a.cp[1] !== sh[1] || a.cp[2] !== sh[2]) { a.cp = [sh[0], sh[1], sh[2]]; b.draw.setArmCopy(i, sh[0], sh[1], sh[2]); any = true; }
        if (a.obj.toon.transparent || a.obj.behindOrgans) blend = true;   // (a skin copy is fractional wherever an arm's share of it is: it blends)
      });
      if (any) changed = true;
      b.draw.setTransparent(blend);
    }
    return changed;
  }
}
