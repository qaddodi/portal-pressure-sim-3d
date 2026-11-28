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
import type { BufferGeometry, Color, Object3D } from 'three';
import { NETWORK, NETWORK_BY_ID } from '../network.ts';
import { REST, seamState, type ShapeState } from '../shape.ts';
import { PIN_MARGIN, type Pin } from '../coil.ts';
import { TUBE_RADIAL, buildTubes } from '../tubes.ts';
import { attachNear, nearLandings, wallJunctions, wallLandings } from './wall.ts';
import { MIN_ARMS, declaredRuns, dropFarGrowers, growerEndsByNode, isLiverBranch, findSkinJunctions, nodesBeyondReach, skinNodesForPhase, withoutGrowers } from './inventory.ts';
import { armWalk, isThroughPair, planSkins, type ArmTube, type HullOk } from './cuts.ts';
import { BULGE_AIM, BULGE_MAX, PACES, buildSkinSteady, creased, hullCovers, onWall, searchBulge } from './mesh.ts';
import { skinsDigest, type BakedSkin, type BakedSkins, type PlainBake } from './baked.ts';
import { sdArm, skinKOf, type Capsule } from './sdf.ts';
import { SKIN_CUT_NONE, armR, SKIN_GROWERS, SKIN_HIDDEN, SKIN_HOLE_NONE, SkinBuildError, type SkinCut, type SkinJunction, type SkinMesh, type Vec3 } from './types.ts';
import { partKey, partOf, partSpecs, plainOf, weldOf } from './plain.ts';
import { armPresenceAt, hiWeightAt, lensUAt, liveFadeAt, uFadeOf, wedgeSeamD, type FadeState, type HiState } from './arm-twins.ts';
import type { VesselObject } from '../vessel-object.ts';
import type { ArmAxis, ArmColour } from './skin-object.ts';
import { SKIN_FIGURE_UNITS, SKIN_HOLD_TO_K } from './shaders.ts';
import { weldThrough } from './through.ts';
import { armTube, strandCutU } from './braid-arm.ts';

import { clock } from '../../../clock/frame.ts';
import { samePrint } from '../../fingerprint.ts';
/** What the skin's drawing object offers the set (skin-object.ts is the real one; a test hands in a plain recorder). */
export interface SkinDraw {
  readonly object: Object3D;
  /** the live handover for arm `i`: its tube's alpha at its seam, its highlight weight there, and its lens ramp's position there */
  setArm(i: number, fade: number, hi: number, lensU: number, colour: ArmColour, narrow: number): void;
  /** the arm tube's fade by its length share, or null: the alpha at the seam alone (the body's skins; the Circuit's have none) */
  setFade?(i: number, p: readonly [number, number, number, number] | null): void;
  setArc(i: number, seamArc: number, dir: number, length: number, restR: number, flow: number): void;
  setPres(i: number, p: number): void;
  /** arm `i`'s tube's clot (clotA, clotP): the skin paints it by the arm's weight */
  setClot?(i: number, a: { x: number; y: number; z: number; w: number }, p: { x: number; y: number }): void;
  /** the weights are shared among the arms that are there (shaders.ts armKeep): a growing arm that is not hands its weight to the arms that stay */
  setKeep?(i: number, on: boolean): void;
  /** arm `i`'s tube's route distance from the balloon's distal edge at its seam, and the column (the tint is ONE field through the join: wedge-glsl.ts) */
  setWedge?(i: number, d: number, col?: { amount: number; behind: number; front: number; frontSoft: number; color: Color }): void;
  /** this skin is one of a growing arm's pair (a welded skin, mode +1, or the plain trunk, mode -1): how far the weld is, 0 the flared tubes alone, 1 the welded skin; the pair draw complementary pixels (skin-object.ts) */
  setWeld?(mode: 1 | -1, w: number): void;
  /** the weld mode and share a skin was last given (a test reads them) */
  weldOf?(): readonly [number, number];
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
  /** whether the vein a shunt divides is divided NOW (divide.ts stumpOf's share above 0: the shunt is drawn and not a side-to-side portocaval): the skin without that vein's start is the one drawn then (plain.ts `leave`). Absent: never. */
  divided?(shunt: string): boolean;
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

/** An arm's seam ring where its tube hands over to the skin (the axis's third point and radius, `axisOf`): the ring's centre, the unit heading from it away from the node into the tube, and its mean rest radius (scene units). */
export interface SeamRing { c: Vec3; h: Vec3; r: number }
/** The seam ring of an arm from its axis: the ring's centre and radius are the axis's third point and radius, its heading the way the axis runs on past the ring (away from the node). */
export function seamRingOf(ax: ArmAxis): SeamRing {
  const c = ax.pts[2], d = ax.pts[3], x = d[0] - c[0], y = d[1] - c[1], z = d[2] - c[2], l = Math.hypot(x, y, z) || 1;
  return { c, h: [x / l, y / l, z / l], r: ax.radii[2] };
}
/** An arm of a drawn skin as the suture reads it (vessels/suture.ts): which end of which vessel, the seam ring, and what its tube shows at the seam now: its fade there, how much of it is there (presence), and how much of the welded skin has taken the cut end over. */
export interface ArmSeam { vesselId: string; end: 0 | 1; node: string; ring: SeamRing; /** the tube's alpha at the seam (arm-twins.ts liveFadeAt), 1 before the first handover */ fade: number; /** how much of the tube is there at the seam (armPresenceAt) */ presence: number; /** the share of the cut end the welded skin has (1: the tube's cut end is wholly gone); a growing arm's is the node's weld, any other arm's 1 */ weld: number; obj: VesselObject; /** the seam ring's first vertex in the tube's geometry (the waist is read there) */ vi: number }

/** One arm as the per-frame handover reads it: its tube, the seam's place along it and in the figure. */
interface ArmLink { /** the shunt that divides this arm's vein (types.ts `leaves`), when this is the divided vein's start */ leaves?: string; /** the weights are shared among the arms that are there: a growing arm that is not holds none (skin-object.ts setKeep); last written */ keep?: boolean; /** the u-fade last written (arm-twins.ts uFadeOf; NaN before the first, -1 for none) */ fk: number[]; /** a growing arm is there now (not dotted, presence above 0): only such an arm holds the node's weld */ here?: boolean; /** the arm is a growing one (a collateral or a shunt): its growth drives the weld (it is whole in the skin, which is static) */ grow: boolean; /** the arm's place in the plain trunk (-1: not in it) */ pi: number; /** the tube's cut end at this arm is dithered with the weld (a growing arm's, a divided vein's start, and every arm's when there is no plain trunk to stand in) */ weld: boolean; /** the seam ring's first vertex in the tube's geometry (`narrow` is read there) */ vi: number; obj: VesselObject; id: string; end: 0 | 1; u: number; x: number; y: number; span: readonly [number, number]; last: number[]; /** the wedge field last written (distance, amount, behind, front, frontSoft; NaN before the first) */ wedge: number[]; /** the copy shares last written (front, solid, veil), NaN before the first */ cp: number[]; /** the clot's uniforms last written, as a key */ clot?: string; /** the seam ring as the skin's axis has it (seamOf): its centre, the unit heading away from the node into the tube, and the ring's mean rest radius */ seam: SeamRing }
/** One skin of the set. `draw` is null for a node that fell back at a rebuild (today's joins there): it stays listed so a later change of an arm tries it again. */
/** The plain trunk of a skin with growing arms (plain.ts): the arms that stay, as a static skin of their own. */
interface PlainBuilt { mesh: SkinMesh; draw: SkinDraw; keep: number[]; bake: PlainBake }
interface Built {
  node: string; mesh: SkinMesh | null; draw: SkinDraw | null; arms: ArmLink[];
  /** the skin of the arms that stay, drawn while a growing arm is not yet whole (null: none, or the skin has no growing arm) */
  plain: PlainBuilt | null;
  /** a skin with more than one growing arm: the skin of the permanent arms and each proper set of the growers (plain.ts partOf), by partKey; the welded skin is every grower, the plain trunk none. Drawn when exactly that set of growers is there (Plan 16) */
  parts: Map<string, PlainBuilt>;
  /** the weld share last written (NaN: not yet), and which skins stand in for the pair then (`in` the one with the growers there, `out` the one without the grower that is coming or going; '' none) */
  w: number; sel: string;
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
/** How far back from its seam (in the seam ring's radii) the heading line of a liver fork's branch arm is trusted (axisOf `backR`). */
export const BACK_SIDE_R = 1.5;
const isLiverBranchId = (id: string): boolean => { const v = NETWORK_BY_ID.get(id); return !!v && isLiverBranch(v); };
/** An arm whose end ring lies more than this many of its radii from J gets J put in front of its capsule (spec 10.5). */
export const BRIDGE_MIN_R = 0.1;
/** How far (radians) a seam ring may lean off the heading the neighbouring rings give before the ring's own plane normal is the heading. */
const TILT_MAX = 0.04;
// `whole` (a fraction, for a growing arm on a side-wall skin): the skin draws the arm as a static full-size shape (the weld), but the built tube is tapered into its host, so its END ring is far narrower than the arm (C9 on the cava's wall: 0.0099 against 0.0227 at the seam),
// and the capsule necked down at J inside a fillet sized from the full arm (one vertex of 587 stood 0.51 radii out of the union, tests/skin-joint-bulge.test.ts). The capsule's radius at J is WHOLE_AT_J of the way from the end ring's radius to the seam ring's. The full seam radius
// makes the sampled surface split into 5 seam loops for 4 arms and the skin drops both growers; closing 0.4 to 0.6 of the neck builds with every arm (0.5: the wall skin's worst vertex 0.38). The cuts are planned from the tubes' own rings (clearOfAxes) and stay as they were.
// Skins without a side-wall arm keep their axes: widening theirs moves other fillets unpredictably (LRV_S creases at any fraction, IMV and RPV_T bulge at 0.5 and 0.2 to 0.35).
/** The shares of the way from a growing arm's end ring to its seam ring its capsule may be widened at J (axisOf `whole`), tried in this order: 0 is the tube as built. */
export const NECK_FRACTIONS = [0, 0.25, 0.4, 0.5, 0.6, 0.35, 0.7] as const;
/** The junction a skin is built and blended with: a growing arm's blend radius (types.ts `jointR`) is the neck its capsule really has, the built tube's ring at the node (`axes[i].radii[0]`), when that is narrower than its nominal radius. The blend width
 *  (sdf.ts skinKOf, the same in the mesh and the shader, which reads the mesh's junction) was a share of the nominal radius while the capsule is the tube's narrowed neck: the left gastric vein lands on the splenic vein's divide (placed, SVD) with a
 *  neck of 0.0088 against its nominal 0.0157, the fillet was sized for an arm nearly twice as wide, and the three caps' blend stood 0.0041 out of its 0.0088 neck (0.46 of its radius, BULGE_MAX) in the part where the splenic vein's own run is not there. A part (plain.ts partOf) that no widening brings inside BULGE_MAX is tried with it (built with it, every part's blend narrows and the SMV's
 *  part with the Rex shunt only shades a ridge thinner than a pixel, 56 degrees, tests/skin-exact-normal.test.ts); the welded skins keep the nominal blend, which their seams' cuts were laid on (built with the neck's, two of the wall skins no
 *  longer build and their growers lose the weld). */
export const neckJunction = (j: SkinJunction, axes: readonly ArmAxis[]): SkinJunction => ({ ...j, arms: j.arms.map((a, i) => (a.grow && axes[i] ? { ...a, jointR: Math.min(armR(a), axes[i]!.radii[0]!) } : a)) });
export function axisOf(tube: ArmTube, restR: number, cut: SkinCut, J?: Vec3, startRing?: number, planeHeading = false, backR?: number, whole = 0, rootAtJ = false): ArmAxis {
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
  // (a side-wall skin's arm: its end ring lies deep inside the host and the tube BENDS on the way out, so the heading line from the seam, run back all the way to where the end ring is, misses the tube's own course by a radius or more (the right hepatic vein's fork:
  //  1.4 radii, the bridge from J then detoured behind the host and its capsule stood out of the wall as a knob). The line is only trusted for a radius back, as a run's halves are in through.ts; the bridge from J to it is straight)
  const back = backR !== undefined ? Math.min(d0, backR * s.r) : d0;
  const p1: Vec3 = [s.c[0] - tx * back, s.c[1] - ty * back, s.c[2] - tz * back];
  // THE BRIDGE (spec 10.5): every capsule starts AT J. Where the art leaves a gap (the arm's end more than a tenth of a radius from J) J is put in front, with the end ring's radius, so the union bridges the gap with the arm's own width and the hull (the rings alone) is unchanged
  const bridged = J && Math.hypot(J[0] - a.c[0], J[1] - a.c[1], J[2] - a.c[2]) > BRIDGE_MIN_R * restR;   // (judged on the tube's own end ring: a tube that reaches J but bends on the way is not a gap)
  const jr = a.r + whole * Math.max(0, s.r - a.r);
  // A growing arm's capsule starts AT J whether or not the tube's end ring is there (`rootAtJ`): the line back from the seam is only trusted for `backR` radii (drawnAxes), then
  // straight to J. Run back all the way, the line missed J by a radius and more wherever the tube bends between the node and the seam (the spontaneous splenorenal shunt, 1.1 of
  // its radii off the splenic vein's axis: its root stood out of the wall as a step and a notch, Mohammad, 28 Nov)
  return { pts: [bridged || (rootAtJ && J) ? J! : p1, p1, s.c, [s.c[0] + tx * d2, s.c[1] + ty * d2, s.c[2] + tz * d2]], radii: [jr, jr, s.r, f.r] };
}

/** An arm's arc numbers for the skin's flow marks (the tube's `vUv.x * len * vU` at the seam, 300 figure units to the scene unit on the body): the arc at the seam, which way it grows toward the node, the vessel's length and its rest radius, all in figure units. */
export function armArcOf(end: 0 | 1, u: number, len: number, radius: number): { seamArc: number; dir: number; length: number; restR: number } {
  return { seamArc: u * len * SKIN_FIGURE_UNITS, dir: end === 1 ? 1 : -1, length: len * SKIN_FIGURE_UNITS, restR: radius * SKIN_FIGURE_UNITS };
}

/**
 * The arms' axes of a junction for a set of cuts, as the mesh and the ink draw them (the one place that decides it): a side-wall arm walks from its own ring,
 * a skin with a side-wall arm takes the seam rings' plane normals as headings, a liver branch trusts its heading line a short way back,
 * and a growing arm is widened at J by `whole` (axisOf). The cut planner's clearance (SkinSet.clearOfAxes) reads these too.
 */
export function drawnAxes(j: SkinJunction, tubes: ReadonlyMap<string, ArmTube>, cuts: readonly SkinCut[], whole = 0): ArmAxis[] {
  const sided = j.arms.some((a) => !!a.side);
  return j.arms.map((a, i) => {
    const tb = tubes.get(a.vesselId)!, from = a.side ? armWalk(a, tb.tubular).from : undefined;
    return axisOf(tb, a.restR, cuts[i]!, a.at ?? j.J, from, sided, a.grow || isLiverBranchId(a.vesselId) ? BACK_SIDE_R : undefined, a.grow ? whole : 0, !!a.grow);
  });
}

/** An axis as the mesh builder's capsule (sdf.ts): the same three points and radii. */
export const capsuleOf = (a: ArmAxis): Capsule => ({ n: a.pts.length, pts: Float64Array.from(a.pts.flat()), r: Float64Array.from(a.radii), mate: a.mate });

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

/** Whether a junction has a liver vein's second branch among its arms (inventory.ts `isLiverBranch`), or lands on a host's wall (wall.ts): meshed from the surface, no hull of the rings. */
const hasLiverBranch = (j: SkinJunction): boolean => onWall(j) || !!j.surface || j.arms.some((a) => { const v = NETWORK_BY_ID.get(a.vesselId); return !!v && isLiverBranch(v); });

export class SkinSet {
  private built: Built[] = [];
  /** the ends that are skinned, by vessel id: [start, end] */
  private readonly ends = new Map<string, [boolean, boolean]>();
  /** the cut each skinned tube takes now, by vessel id (both ends of a vessel two skins share in one entry; a vessel a merged skin replaces whole is hidden) */
  private readonly cuts = new Map<string, [number, number]>();
  /** the holes each skinned tube has now, by vessel id (at most two: `skinHole`, `skinHole2`) */
  private readonly holes = new Map<string, { node: string; lo: number; hi: number }[]>();
  private readonly warned = new Set<string>();
  /** The nodes `buildOnly` builds (null: all). */
  private only: ReadonlySet<string> | null = null;
  /** the rung of the pace ladder (mesh.ts PACES) each node's skin closed at: its next build starts there */
  private readonly paces = new Map<string, number>();
  /** what the last `build` was made from and gave (`bake()`) */
  private digest = '';
  private readonly lostNodes: { node: string; message: string }[] = [];
  private readonly madeDropped: string[] = [];
  /** the planner's bounded loops that ran out of rounds (cuts.ts `SkinPlans.unsettled`), named, since this set was made: the bake lists them, tests/skin-bake-report.test.ts fails on any */
  readonly unsettled: string[] = [];
  /** the nodes that fell back to today's method (named, once) */
  readonly fellBack: string[] = [];
  /** the growing arms a skin could not take (`node:vessel`): they keep today's fork method (spec 10.6), named so a new one fails tests/skin-grow.test.ts until someone looks */
  readonly dropped: string[] = [];
  /** why each growing arm the retry ladder dropped was dropped (the failure that made it: a named SkinBuildError message), for the tests and the inspector */
  readonly why: Record<string, string> = {};
  /** the junctions of the phase built, as the inventory found them (a rebuild plans from these again) */
  private sources: SkinJunction[] = [];
  private step_ = 0;
  private readonly cost: SkinBuildStats = { rebuilds: 0, lastMs: 0, worstMs: 0, lastNode: '' };

  private readonly deps: SkinSetDeps;
  constructor(deps: SkinSetDeps) { this.deps = deps; }

  private now(): number { return this.deps.now ? this.deps.now() : clock.now(); }
  /** The skinned ends of vessel `id` (both false: its joins are today's). */
  endsOf(id: string): readonly [boolean, boolean] { return this.ends.get(id) ?? [false, false]; }
  /** The skins now drawn (a node that fell back at a rebuild is not counted). */
  get count(): number { return this.drawn.length; }
  /** The junction nodes that are skinned. */
  get nodes(): readonly string[] { return this.drawn.map((b) => b.node); }
  /** The vessel ids of a built skin's arms, in arm order (the draw returned by `make`). */
  armIdsOf(draw: SkinDraw): readonly string[] {
    const b = this.built.find((x) => x.draw === draw || x.plain?.draw === draw || [...x.parts.values()].some((p) => p.draw === draw));
    if (!b) return [];
    if (b.draw === draw) return b.arms.map((a) => a.id);
    const q = b.plain?.draw === draw ? b.plain : [...b.parts.values()].find((p) => p.draw === draw)!;
    return q.keep.map((i) => b.arms[i]!.id);
  }
  /** The drawing objects of the skins as they stand (the ones a retried plan took back are not among them). */
  liveDraws(): readonly SkinDraw[] { return this.drawn.map((b) => b.draw!).filter(Boolean); }
  /** The drawn skins' objects, each with the vessel ids of its arms (the inspector hides a skin when none of its arms is shown). */
  drawnArms(): { object: Object3D; node: string; arms: readonly string[] }[] {
    return this.drawn.flatMap((b) => [{ object: b.draw.object, node: b.node, arms: b.arms.map((a) => a.id) }, ...(b.plain ? [{ object: b.plain.draw.object, node: `${b.node}~plain`, arms: b.plain.keep.map((i) => b.arms[i]!.id) }] : []), ...[...b.parts].map(([k, p]) => ({ object: p.draw.object, node: `${b.node}~with${k}`, arms: p.keep.map((i) => b.arms[i]!.id) }))]);
  }
  /** The plain trunks standing beside the welded skins (a node with a growing arm and three or more arms that stay). */
  plainDraws(): readonly SkinDraw[] { return this.drawn.flatMap((b) => (b.plain ? [b.plain.draw] : [])); }
  /** The parts of a node's skin (one per proper set of its growing arms, by plain.ts partKey): mesh and draw, for the tests. */
  partsOf(node: string): ReadonlyMap<string, { mesh: SkinMesh; draw: SkinDraw; keep: readonly number[] }> { return this.drawn.find((b) => b.node === node)?.parts ?? new Map(); }
  /** The parts that failed to build (`node:key: why`): they fall back to the welded skin, named so a test fails on one. */
  readonly partFailed: string[] = [];
  /** The plain trunk's drawing object of a node, or undefined. */
  plainDrawOf(node: string): SkinDraw | undefined { return this.drawn.find((b) => b.node === node)?.plain?.draw; }
  /** The plain trunk's mesh of a node, or undefined. */
  plainOf(node: string): SkinMesh | undefined { return this.drawn.find((b) => b.node === node)?.plain?.mesh; }
  /** The vessels a node's skin replaces whole (a merged skin's shared run: its tube is not drawn at all, the skin is all there is of it). */
  hiddenOf(node: string): readonly string[] { return this.drawn.find((b) => b.node === node)?.hidden ?? []; }
  /** The arms of the drawn skins that are one of `ids`, each with its seam ring and what its tube shows at the seam now: the ends whose tube has been cut for a skin (a welded shunt end), for the suture drawn there (vessels/suture.ts). */
  seamsOf(ids: ReadonlySet<string>): ArmSeam[] {
    const out: ArmSeam[] = [];
    for (const b of this.drawn) for (const a of b.arms) {
      if (!ids.has(a.id) || b.holes.some((h) => h.id === a.id)) continue;
      const f = a.last[0], p = a.last[10];   // (undefined or NaN until the first handover: the arm is whole)
      out.push({ vesselId: a.id, end: a.end, node: b.node, ring: a.seam, fade: f === undefined || Number.isNaN(f) ? 1 : f, presence: p === undefined || Number.isNaN(p) ? 1 : p, weld: a.grow ? (Number.isNaN(b.w) ? 0 : b.w) : 1, obj: a.obj, vi: a.vi });
    }
    return out;
  }
  /** The weld a node's skin shows now (1 whole, 0 the flared tubes alone), NaN for a skin without a growing arm. */
  weldOf(node: string): number { const b = this.drawn.find((x) => x.node === node); return b && b.arms.some((a) => a.grow) ? (Number.isNaN(b.w) ? 0 : b.w) : NaN; }
  /** Where the skin's seam stands on a vessel's end (uv.x of the tube, 0..1: `end` 1 is its far end), or null when no skin has the end. The one place the clot (disease/clots.ts seamShare) learns where a vein's plain tube ends and the junction skin begins. */
  seamU(id: string, end: 0 | 1 = 1): number | null { const u = this.cuts.get(id)?.[end]; return u != null && u >= 0 && u <= 1 ? u : null; }
  /** The built skin of a node, or undefined. */
  skinOf(node: string): SkinMesh | undefined { return this.drawn.find((b) => b.node === node)?.mesh ?? undefined; }
  /** The stretch of each arm vessel's course (share of its length, from its start and from its end) the seam of a skin stands on, with a margin: what ShapeTracks holds at rest, so the growth of a collateral never moves a seam (coil.ts `pinCourse`). */
  pins(): Map<string, Pin> {
    const m = new Map<string, [number, number]>();
    for (const b of this.drawn) for (const c of b.mesh.cuts) {
      if (c.side) continue;   // (a hole in a vessel's side wall, not a seam at its end)
      const p = m.get(c.vesselId) ?? [0, 0], at = Math.min(1, (c.end === 0 ? c.u : 1 - c.u) + PIN_MARGIN);
      p[c.end] = Math.max(p[c.end]!, at); m.set(c.vesselId, p);
    }
    return m;
  }
  /** The skins none of NECK_FRACTIONS brought inside BULGE_MAX (kept at their least bulging build): empty when every skin is inside it; tests/skin-joint-bulge.test.ts fails on any. */
  readonly bulgeOver: { node: string; bulge: number }[] = [];
  /** How many rebuilds ran, what the last and the worst cost (ms), and which node was the last. */
  get stats(): Readonly<SkinBuildStats> { return this.cost; }
  /** Whether a skin waits for its rebuild (the scene asks the clock for another frame while true). */
  get pending(): boolean { return this.built.some((b) => b.dirty); }
  private get drawn(): (Built & { draw: SkinDraw; mesh: SkinMesh })[] { return this.built.filter((b): b is Built & { draw: SkinDraw; mesh: SkinMesh } => !!b.draw && !!b.mesh); }

  /** The tubes of the junctions' arms exactly as the scene draws them now: the vessel's own course first, `buildTubes`' vertex layout. */
  private tubesOf(js: readonly SkinJunction[]): Map<string, ArmTube> {
    const m = new Map<string, ArmTube>();
    for (const _ of this.tubesSteps(js, m)) { /* every tube */ }
    return m;
  }
  /** The same, a step (one arm's tube) per `yield`, into `m` (the boot builds the skins a step per task: scene.ts). */
  private *tubesSteps(js: readonly SkinJunction[], m: Map<string, ArmTube>): Generator<void, void, unknown> {
    for (const j of js) for (const a of j.arms) {
      if (m.has(a.vesselId)) continue;
      const def = NETWORK_BY_ID.get(a.vesselId)!;
      const at = armTube(def, seamState(this.deps.stateOf(a.vesselId))), b = buildTubes(at.courses, at.tubular, def.radius);   // (a braid's arm tube is its widest strand: braid-arm.ts)
      m.set(a.vesselId, { geometry: b.geometry, tubular: b.runs[0]!.tubular, input: at.courses });
      yield;
    }
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
      ok.blame = () => blamed;   // (the arm whose seam stands too near another arm moves out, not the seam nearest J)
      return ok;
    });
  }

  /**
   * Rule 4.4.1 on the arms the mesh and the ink are made from. cuts.ts judges the clearance on each arm's own ring centres, but the skin's fillet and its outline (skin/shaders.ts) use `axisOf`: the straight line through the seam's heading. They agree where an arm runs
   * straight to its node and part where it bends on the way (a shunt that curves in), and then a seam ring stands inside the BLEND of another arm's drawn capsule, so the outline is a fraction of a pixel inside the tube's own where they meet: a kink at the seam
   * (tests/skin-agreement.test.ts, the seam's ink). So the clearance is also judged on the drawn capsules: every vertex of a seam ring is at least the blend width `k` from every other arm's drawn capsule.
   */
  private clearOfAxes(j: SkinJunction, tubes: ReadonlyMap<string, ArmTube>, cuts: SkinCut[]): number {
    // (the capsules as the mesh and the ink DRAW them, side arms' walks and plane headings included: a clearance judged on other capsules passes a seam the ink then pulls in)
    const caps = drawnAxes(j, tubes, cuts, 0).map(capsuleOf);
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
    const mergedOut = new Map<string, string>();   // (node:vessel -> why: the growing arms a merged skin could not carry)
    for (let round = 0; todo.length && round <= SKIN_GROWERS + 2; round++) {
      const { plans, failures, dropped, unsettled } = this.plan(todo, tubes);
      for (const u of unsettled) if (!this.unsettled.includes(u)) this.unsettled.push(u);
      for (const d of dropped) mergedOut.set(`${d.node}:${d.id}`, d.why);
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
          // a skin whose full-size shape does not build from the hull of its rings is tried once more meshed from the surface itself (sheet.ts, no hull: the rung the liver's forks use) before it loses a growing arm, or, with none
          // to lose, before the node keeps today's joins (the cava's IVCS since round 18: the right hepatic vein opens on the cava's wall 3 radii below the common trunk, and no hull of the five rings has them all)
          if (!j.surface && (g.length || f.nodes.length === 1)) { again.set(n, f.message); next.push({ ...j, surface: true }); continue; }
          if (!g.length) {
            // a merged skin that failed: this node has nothing to drop, but its partner's growing arm goes (with fewer than three arms the partner is no junction), so the merge goes too and this node is planned again alone: the cava's IVCS and the run-on RHV_T the TIPS lands on
            if (f.nodes.length > 1 && f.nodes.some((m) => m !== n && todo.find((x) => x.node === m)?.arms.some((a) => a.grow))) { again.set(n, f.message); next.push(j); continue; }
            lost.push({ node: f.nodes.join('+'), message: f.message }); continue;
          }
          // (a skin made of several nodes that fails loses ONE growing arm of the whole, the narrowest, not one of every node: the cava's four nodes, each with its collateral, are one skin)
          const narrowest = f.nodes.length > 1 ? f.nodes.flatMap((m) => todo.find((x) => x.node === m)?.arms.filter((a) => a.grow) ?? []).sort((x, y) => x.restR - y.restR)[0] : undefined;
          if (narrowest && !g.includes(narrowest)) { again.set(n, f.message); next.push(j); continue; }
          const drop = narrowest ?? g[g.length - 1]!, arms = j.arms.filter((a) => a !== drop);
          this.dropped.push(`${n}:${drop.vesselId}`); this.why[`${n}:${drop.vesselId}`] = f.message;
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
        made.splice(made.indexOf(m), 1); this.release(m, false);
        for (const sj of src) if (!next.some((x) => x.node === sj.node)) next.push(sj);
      }
      // a node of this round whose skin was made is not planned again
      todo = next.filter((j) => !made.some((m) => m.sources.includes(j.node)));
      for (const j of todo) latest.set(j.node, j);
    }
    for (const j of todo) lost.push({ node: j.node, message: `skin: junction ${j.node}: no skin after ${SKIN_GROWERS + 2} rounds of dropping growing arms` });
    // a growing arm no skin made carries (a merged skin takes the widest SKIN_GROWERS of its two nodes': cuts.ts planSkins `dropped`) is named too, never silently left out: it keeps the tube's own flared end
    for (const j of js) for (const a of j.arms) {
      if (!a.grow || made.some((m) => m.mesh?.junction.arms.some((x) => x.grow && x.vesselId === a.vesselId && x.end === a.end))) continue;
      const k = `${j.node}:${a.vesselId}`;
      if (this.dropped.includes(k) || lost.some((l) => l.node.split('+').includes(j.node))) continue;
      this.dropped.push(k); this.why[k] = mergedOut.get(k) ?? 'no skin made carries it';
    }
    return { made, lost };
  }

  /** The skin of one plan, made but not yet in the scene: its mesh, its drawing object and the handover links. Throws a SkinBuildError (or any error) the caller turns into a fallback. Null: an arm's vessel is not in this scene. */
  private makeBuilt(plan: ReturnType<typeof planSkins>['plans'][number], tubes: ReadonlyMap<string, ArmTube>, ready?: BakedSkin): Built | null {
    // a wall skin's FILLET is sized from the radius its arms really have where they meet the host: the BUILT tube's ring there (a collateral narrows into the host: C9's neck is 0.0099 against its nominal 0.0227, and a fillet sized from the nominal width
    // bulged 0.51 radii around it, wall:IVC_IS_1:S_PC1,C90; the centreline's radius, inventory.ts withJointR, does not see the taper the tube is built with). Only the blend width changes: the cuts were chosen on the nominal one, which is the wider, so
    // every seam keeps its clearance, and the plan carries the narrower `blendR` (the layout rules keep reading `armR`), so the shader's blend (skinKOf of the mesh's junction) and a baked file agree with the mesh.
    const j = plan.junction;
    const objs = j.arms.map((a) => this.deps.vessel(a.vesselId));
    if (objs.some((o) => !o)) return null;   // (a vessel not in this scene: no skin; the tubes are untouched)
    const { pos, nor, rest } = this.ringsFor(tubes, plan.cuts);
    // the arms' axes: the tubes' own ring centres and radii, the SAME three-point polylines the skin's fragment stage draws its ink from, so the mesh's fillet and its outline are one shape
    // (a baked skin brings its axes and its mesh: the page plans nothing and remeshes nothing)
    const sided = j.arms.some((a) => !!a.side);   // (a skin with a side-wall arm: its arms' headings are the seam rings' own plane normals; every other skin keeps the neighbouring-ring heading it always had)
    // A growing arm is drawn full-size in the skin (the weld), but the tube is tapered into its host, so its END ring is far narrower than the arm (C9 0.0099 against 0.0227, C6 0.0084 against 0.0239): the capsule then necks down at J inside a fillet sized
    // from the whole arm, and a vertex of the fillet stands out of the union (wall:IVC_IS_1:S_PC1,C90 0.51, SVD 0.45+ radii; BULGE_MAX). How far to widen the neck is not one number for every skin (the fillets are chaotic in it: 0.7 and the wall skin
    // fails to build, 0.55 makes IMV bulge): each skin with growing arms is built at the least widening in NECK_FRACTIONS whose mesh builds and stays inside BULGE_MAX; one that none satisfies keeps the least bulging that built. A skin that is within the limit
    // at no widening (every one but those two today) is built once, as before.
    const rawAt = (f: number): ArmAxis[] => drawnAxes(j, tubes, plan.cuts, f);
    const axesAt = (f: number): ArmAxis[] => weldThrough(rawAt(f), j.arms.map((a) => !!a.grow), declaredRuns(j.arms));   // (a trunk that runs through the node is one vessel to the union: through.ts)
    // A part without a divided vein's start (plain.ts `leave`): the shunt that stands for the rest of the vein IS the run's other half, so it is no branch here and the run goes through it (through.ts `skip` false for it), one straight capsule from the vein's seam to the shunt's.
    const leaveAxesAt = (keep: readonly number[], f: number): ArmAxis[] => { const raw = rawAt(f); return weldThrough(keep.map((i) => raw[i]!), keep.map((i) => !!j.arms[i]!.grow && !j.arms.some((x) => x.leaves === j.arms[i]!.vesselId)), declaredRuns(keep.map((i) => j.arms[i]!))); };
    if (ready) this.paces.set(j.node, ready.pace);
    if (!ready && hasLiverBranch(j)) this.paces.set(j.node, Math.max(this.paces.get(j.node) ?? 0, PACES.length - 1));   // (meshed from the surface from the start)
    // a junction with growing arms is built STILL: they are whole arms of one static shape (the welded skin), and the arms that stay get a static skin of their own (the plain trunk); the tube's own flared end is what grows, and the weld hands over at growth 0.9 to 1
    const growing = j.arms.some((a) => a.grow);
    let axes: ArmAxis[], mesh: SkinMesh;
    if (ready) { axes = ready.axes; mesh = ready.mesh; }
    else {
      axes = axesAt(0); mesh = buildSkinSteady(j, plan.cuts, pos, nor, axes.map(capsuleOf), undefined, this.paces);
      if (growing) {
        let best = searchBulge(mesh, axes, j.arms.map((a) => !!a.grow));
        for (let q = 1; q < NECK_FRACTIONS.length && best > BULGE_AIM; q++) {
          const ax = axesAt(NECK_FRACTIONS[q]!);
          let m: SkinMesh;
          try { m = buildSkinSteady(j, plan.cuts, pos, nor, ax.map(capsuleOf), undefined, this.paces); } catch (e) { if (e instanceof SkinBuildError) continue; throw e; }
          const b = searchBulge(m, ax, j.arms.map((a) => !!a.grow));
          if (b < best && !creased(m)) { best = b; axes = ax; mesh = m; }
        }
        // (none inside: the same ladder with the blend sized from the growers' necks, neckJunction, as a part's is:
        //  a thin neck in a crotch of fat trunks reads as a bulb against the neck's own radius; SVD's welded skin, C2's neck 0.0086 of 0.0157)
        for (let q = 0; q < NECK_FRACTIONS.length && best > BULGE_AIM; q++) {
          const ax = axesAt(NECK_FRACTIONS[q]!);
          let m: SkinMesh;
          try { m = buildSkinSteady(neckJunction(j, ax), plan.cuts, pos, nor, ax.map(capsuleOf), undefined, this.paces); } catch (e) { if (e instanceof SkinBuildError) continue; throw e; }
          const b = searchBulge(m, ax, j.arms.map((a) => !!a.grow));
          if (b < best && !creased(m)) { best = b; axes = ax; mesh = m; }
        }
        if (best > BULGE_MAX) this.bulgeOver.push({ node: j.node, bulge: best });   // (no widening satisfies it: kept as built, and named here so a test fails on it)
      }
    }
    // on a seam ring the skin's rest radius is the tube's own, exactly (the mesh builder measures the ring's mean radius, a few parts in 10^4 off the tube's `radius * rk`): the live move of a seam vertex is then the tube's to the last bit (spec 4.6)
    if (!ready) mesh.seamVerts.forEach((ids, a) => ids.forEach((v, q) => { mesh.restR[v] = rest[a]![q]!; }));   // (a baked mesh has had it done)
    const pp = growing ? plainOf(plan) : null;
    let plain: PlainBuilt | null = null;
    if (pp && ready?.plain !== null) {
      // (a failed plain trunk is no skin: the welded skin then comes in over the tubes' own cut ends alone, below; a baked skin says it failed with `plain: null`)
      try {
        const axesP = ready?.plain?.axes ?? pp.keep.map((i) => axes[i]!), key = pp.junction.node;
        if (ready?.plain) this.paces.set(key, ready.plain.pace);
        const meshP = ready?.plain?.mesh ?? buildSkinSteady(pp.junction, pp.cuts, pp.keep.map((i) => pos[i]!), pp.keep.map((i) => nor[i]!), axesP.map(capsuleOf), undefined, this.paces);
        if (!ready?.plain) meshP.seamVerts.forEach((ids, a) => ids.forEach((v, q) => { meshP.restR[v] = rest[pp.keep[a]!]![q]!; }));
        plain = { mesh: meshP, draw: null as unknown as SkinDraw, keep: pp.keep, bake: { axes: axesP, mesh: meshP, pace: this.paces.get(key) ?? 0 } };
      } catch { plain = null; }
    }
    // a skin with more than one growing arm is also built for each set of them that is THERE (Plan 16): with one open and the other collapsed the welded skin carries the absent one's whole stub beside the open one, and no per-pixel rule moves the surface
    // a pixel lies on. Each part has the same seam rings and cuts and the arms' axes as the welded skin chose them; a part whose grower's neck bulges is tried at the other widenings, as the welded skin is.
    const parts = new Map<string, PlainBuilt>(), partBake: Record<string, PlainBake | null> = {};
    for (const spec of growing ? partSpecs(plan) : []) {
      const pq = partOf(plan, spec.there, spec.leave);
      if (!pq) continue;
      const key = spec.key, node = pq.junction.node, baked = ready?.parts?.[key];
      if (baked === null) { partBake[key] = null; continue; }
      try {
        const sub = (ax: readonly ArmAxis[]): ArmAxis[] => pq.keep.map((i) => { const a = ax[i]!, m = a.mate === undefined ? -1 : pq.keep.indexOf(a.mate); return m >= 0 ? { ...a, mate: m } : { pts: a.pts, radii: a.radii }; });
        const axesFor = (f: number): ArmAxis[] => (spec.leave ? leaveAxesAt(pq.keep, f) : sub(f === 0 ? axes : axesAt(f)));
        const make = (ax: ArmAxis[], neck = false): SkinMesh => {
          const m = buildSkinSteady(neck ? neckJunction(pq.junction, ax) : pq.junction, pq.cuts, pq.keep.map((i) => pos[i]!), pq.keep.map((i) => nor[i]!), ax.map(capsuleOf), undefined, this.paces);
          m.seamVerts.forEach((ids, a) => ids.forEach((v, q) => { m.restR[v] = rest[pq.keep[a]!]![q]!; }));
          return m;
        };
        // (a part is judged as the welded skin is: at rest and with its permanent arms swollen, mesh.ts searchBulge)
        const partGrows = pq.keep.map((i) => !!j.arms[i]!.grow);
        let axesQ: ArmAxis[], meshQ: SkinMesh;
        if (baked) { axesQ = baked.axes; meshQ = baked.mesh; this.paces.set(node, baked.pace); }
        else {
          axesQ = axesFor(0); meshQ = make(axesQ);
          let best = searchBulge(meshQ, axesQ, partGrows);
          for (let q = 1; q < NECK_FRACTIONS.length && best > BULGE_AIM; q++) {
            const ax = axesFor(NECK_FRACTIONS[q]!);
            let m: SkinMesh;
            try { m = make(ax); } catch (e) { if (e instanceof SkinBuildError) continue; throw e; }
            const b = searchBulge(m, ax, partGrows);
            if (b < best && !creased(m)) { best = b; axesQ = ax; meshQ = m; }
          }
          // (none inside: the same ladder with the blend sized from the growers' necks, neckJunction; only such a part takes it, every other keeps the nominal blend its neighbours' normals were judged with)
          for (let q = 0; q < NECK_FRACTIONS.length && best > BULGE_AIM; q++) {
            const ax = axesFor(NECK_FRACTIONS[q]!);
            let m: SkinMesh;
            try { m = make(ax, true); } catch (e) { if (e instanceof SkinBuildError) continue; throw e; }
            const b = searchBulge(m, ax, partGrows);
            if (b < best && !creased(m)) { best = b; axesQ = ax; meshQ = m; }
          }
          if (best > BULGE_MAX) this.bulgeOver.push({ node, bulge: best });
        }
        const bake: PlainBake = { axes: axesQ, mesh: meshQ, pace: this.paces.get(node) ?? 0 };
        partBake[key] = bake;
        parts.set(key, { mesh: meshQ, draw: this.deps.make(meshQ, axesQ, pq.keep.map((i) => objs[i]!) as VesselObject[]), keep: pq.keep, bake });
      } catch (e) { partBake[key] = null; this.partFailed.push(`${j.node}:${key}: ${(e as Error).message}`); }
    }
    // without a plain trunk the whole skin comes in over the tubes' cut ends, and a hole or a hidden vessel cannot be dithered back: such a skin takes no growing arm (the retry ladder drops it and names it)
    if (growing && !plain && plan.hidden.length) throw new SkinBuildError(j.node, 'a growing arm on a skin that hides a vessel whole, and no plain trunk to weld from');
    if (plain) plain.draw = this.deps.make(plain.mesh, plain.bake.axes, pp!.keep.map((i) => objs[i]!) as VesselObject[]);
    const draw = this.deps.make(mesh, axes, objs as VesselObject[]);
    // (a wall skin's host is cut by a HOLE, the stretch between its two seams: the host's own ends belong to the skins at them, so this skin never writes their weld; takeCuts leaves them alone for the same reason)
    const holes = holesOf(plan.cuts);
    const arms: ArmLink[] = j.arms.map((a, i) => {
      const cut = plan.cuts[i]!, ring = pos[i]!;
      let x = 0, y = 0;
      for (let v = 0; v < TUBE_RADIAL; v++) { x += ring[v * 3]!; y += ring[v * 3 + 1]!; }
      return { fk: [NaN, NaN, NaN, NaN], seam: seamRingOf(axes[i]!), ...(a.leaves ? { leaves: a.leaves } : {}), grow: !!a.grow, pi: plain ? plain.keep.indexOf(i) : -1, weld: growing && (!!a.grow || !plain || !!a.leaves) && !holes.some((h) => h.id === a.vesselId), vi: cut.ring * (TUBE_RADIAL + 1), obj: objs[i]!, id: a.vesselId, end: a.end, u: cut.u, x: x / TUBE_RADIAL, y: y / TUBE_RADIAL, span: NETWORK_BY_ID.get(a.vesselId)!.lensSpan ?? [0, 1], last: [], wedge: [NaN, NaN, NaN, NaN, NaN], cp: [NaN, NaN, NaN] };
    });
    const sources = plan.merged ?? [j.node];
    const vessels = new Set<string>(this.sources.filter((s) => sources.includes(s.node)).flatMap((s) => s.arms.map((a) => a.vesselId)));
    for (const a of j.arms) vessels.add(a.vesselId);
    return { node: j.node, mesh, draw, arms, plain, parts, w: NaN, sel: '', sources, vessels, hidden: plan.hidden, dirty: false, slow: false, at: -Infinity, holes, bake: { plan, axes, mesh, pace: this.paces.get(j.node) ?? 0, ...(growing && pp ? { plain: plain ? plain.bake : null } : {}), ...(parts.size || Object.keys(partBake).length ? { parts: partBake } : {}) } };
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
      const def = NETWORK_BY_ID.get(a.id), cu = def ? strandCutU(def, seamState(this.deps.stateOf(a.id)), a.end, a.u) : a.u;   // (a braid's strands are cut at the seam's distance on the longest of them)
      if (a.end === 0) c[0] = cu; else c[1] = cu;
      this.cuts.set(a.id, c);
      const e = this.ends.get(a.id) ?? [false, false]; e[a.end] = true; this.ends.set(a.id, e);
      touched.push(a.id);
    }
    for (const id of b.hidden) { this.cuts.set(id, [SKIN_HIDDEN[0], SKIN_HIDDEN[1]]); this.ends.set(id, [true, true]); touched.push(id); }
    return touched;
  }

  /** Forgets a skin's cuts and skinned ends (only the ends it owns: a vessel two skins share keeps the other's), and puts the tubes' cuts as they are now. */
  private dropCuts(b: Built): void {
    this.unweld(b);
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
  build(phase: 1 | 2): void { for (const _ of this.buildSteps(phase)) { /* every step */ } }
  /** `build` for just these nodes' skins, for a test that perturbs one node's courses and must not pay for the other twenty. The page never calls it: `build` and `buildSteps` take the phase alone. */
  buildOnly(phase: 1 | 2, only: ReadonlySet<string>): void { this.only = only; try { this.build(phase); } finally { this.only = null; } }
  /** `build` in steps (one `yield` ends a step: an arm's tube, a baked skin laid in): the boot runs one per task so the skins are not one task of 150 ms on a laptop (scene.ts refreshSkinsSteps). */
  *buildSteps(phase: 1 | 2): Generator<void, void, unknown> {
    this.clear();
    // (`only`: set by `buildOnly` alone, for a test)
    const only = this.only;
    const nodes = skinNodesForPhase(phase);
    // phase 2 also builds every node a collateral or a shunt lands on (spec 10.2); phase 1 (the confluence alone) has none of them
    const all: SkinJunction[] = findSkinJunctions().filter((j) => !only || only.has(j.node)).filter((j) => nodes.has(j.node) || (phase === 2 && (j.arms.some((a) => a.grow || isLiverBranch(NETWORK_BY_ID.get(a.vesselId)!))))).map((j) => (phase === 1 ? withoutGrowers(j) : j)).filter((j): j is SkinJunction => !!j);
    // (a growing end at a node whose skin had no room for it (more than SKIN_GROWERS, or six arms in all: inventory.ts findSkinJunctions) is named too, never silently left out)
    if (phase === 2) { const at = growerEndsByNode(NETWORK, true); for (const j of all) for (const g of at.get(j.node) ?? []) if (!j.arms.some((a) => a.grow && a.vesselId === g.v.id && a.end === g.end)) this.dropped.push(`${j.node}:${g.v.id}`); }
    // a collateral or shunt whose end lies farther from J than SKIN_REACH is on a host's side, not at the node: it is left out of the skin (named in `dropped`), and never takes the node's skin with it
    const farGone: { node: string; id: string }[] = [];
    const near = all.map((j) => { const d = dropFarGrowers(j); for (const id of d.far) farGone.push({ node: j.node, id }); return d.junction; }).filter((j) => j.arms.length >= MIN_ARMS);
    // ...and every growing vessel's end that is not an arm of a node's skin lands on a host's WALL (spec 10.1, wall.ts): each makes a virtual node on the host, built STILL like any other (its growing arm whole, the weld hands over at growth 0.9 to 1)
    const welded = new Set(near.flatMap((j) => j.arms.filter((a) => a.grow).map((a) => `${a.vesselId}:${a.end}`)));
    // (an end that lands at another node's skin, off its own node (a braid's root, or a growing end at a host's end), is an arm of that skin; only a side-wall landing makes a wall skin)
    const onWalls = phase === 2 ? wallLandings(welded) : [], wallKeys = new Set(onWalls.map((l) => `${l.v.id}:${l.end}`));
    const lands = phase === 2 ? attachNear(near, [...onWalls, ...nearLandings(welded).filter((l) => !wallKeys.has(`${l.v.id}:${l.end}`))]) : { junctions: near, left: [] };
    const walls = wallJunctions(lands.left.filter((l) => wallKeys.has(`${l.v.id}:${l.end}`)));
    near.length = 0; near.push(...lands.junctions, ...walls.junctions.filter((j) => !only || only.has(j.node)));
    for (const l of walls.skipped) this.dropped.push(`wall:${l.host.id}:${l.v.id}`);
    for (const f of farGone) this.dropped.push(`${f.node}:${f.id}`);   // (named whether or not a wall skin takes the end up: the node's own skin goes without it)
    all.length = 0; all.push(...near);
    const far = new Set(nodesBeyondReach(all));   // (the art's own spacing, not a junction: the old join stays, named in `fellBack` and not warned)
    for (const n of far) if (!this.fellBack.includes(n)) this.fellBack.push(n);
    const js = all.filter((j) => !far.has(j.node));
    this.sources = js;
    if (!js.length) return;
    const tubes = new Map<string, ArmTube>();
    yield* this.tubesSteps(js, tubes);
    const warn = this.deps.warn ?? ((m: string) => console.warn(m));
    // the skins baked at build time, when they were made for exactly these junctions and tubes (the digest): laid in as they are, nothing planned or meshed here
    this.digest = skinsDigest(js, tubes);
    const baked = this.deps.baked?.() ?? null, usable = baked && samePrint(baked.digest, this.digest) ? baked : null;
    const d0 = this.dropped.length;
    let made: Built[], lost: { node: string; message: string }[];
    if (usable) {
      made = [];
      for (const sk of usable.skins) { const b = this.makeBuilt(sk.plan, tubes, sk); if (b) made.push(b); yield; }
      lost = usable.lost; this.dropped.push(...usable.dropped);
    } else ({ made, lost } = this.produce(js, tubes));
    this.lostNodes.length = 0; this.lostNodes.push(...lost);
    this.madeDropped.length = 0; this.madeDropped.push(...this.dropped.slice(d0));
    for (const f of lost) { this.fail(f.node, f.message, warn); this.built.push(this.lost(f.node)); }
    const touched = new Set<string>();
    for (const b of made) {
      yield;
      this.place(b);
      this.built.push(b);
      // the tubes: cut at their seams, both ends of a vessel that two skins share in ONE cut (the second never overwrites the first); a vessel a merged skin replaces whole is hidden (2, -1)
      for (const id of this.takeCuts(b)) touched.add(id);
    }
    for (const id of touched) { const c = this.cuts.get(id) ?? SKIN_CUT_NONE; this.deps.vessel(id)?.setSkinCut(c[0], c[1]); this.putHoles(id); }
    for (const t of tubes.values()) t.geometry.dispose();
    yield;
    this.sync();   // (the skins start from what their arms have NOW, from the first frame: a hidden or still drawing arm gives its skin nothing, never a stray one)
  }

  /** What the last `build` made, as the file the build bakes (scripts/bake-skins.mjs): every skin with the plan, axes and mesh it was made from, the nodes that fell back, the growing arms it dropped, and the digest of the junctions and tubes it was made for. */
  bake(): BakedSkins {
    const skins = this.built.filter((b): b is Built & { bake: BakedSkin } => !!b.bake).map((b) => b.bake);
    return { digest: this.digest, skins, lost: [...this.lostNodes], dropped: [...this.madeDropped], unsettled: [...this.unsettled] };
  }

  /** A node that has no skin (it fell back): kept in the list, undrawn, so a change of one of its arms plans it again. */
  private lost(node: string): Built {
    const sources = node.split('+');
    const vessels = new Set<string>(this.sources.filter((s) => sources.includes(s.node)).flatMap((s) => s.arms.map((a) => a.vesselId)));
    return { node, mesh: null, draw: null, arms: [], plain: null, parts: new Map(), w: NaN, sel: '', sources, vessels, hidden: [], dirty: false, slow: false, at: -Infinity, holes: [], bake: null };
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
      for (const m of made) if (m !== nb) this.release(m, false);   // (a skin the rebuild made for a node it was not asked about is not used)
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
      this.place(nb);
      this.built[i] = nb;
      for (const id of this.takeCuts(nb)) gone.add(id);
      for (const id of gone) { const c = this.cuts.get(id) ?? SKIN_CUT_NONE; this.deps.vessel(id)?.setSkinCut(c[0], c[1]); this.putHoles(id); }
      if (old) { this.release(b, true); }
      const fi = this.fellBack.indexOf(b.node); if (fi >= 0) this.fellBack.splice(fi, 1);
      if (!was) this.deps.endsChanged?.();
    } else if (was) {
      // the node cannot be built on this shape: today's joins until an arm changes again
      this.unweld(b); this.release(b, true);
      this.dropCuts(b);
      b.draw = null; b.plain = null; b.parts = new Map(); b.mesh = null; b.arms = [];
      this.deps.endsChanged?.();
    }
    const ms = this.now() - t0;
    this.cost.rebuilds++; this.cost.lastMs = ms; this.cost.lastNode = b.node; this.cost.worstMs = Math.max(this.cost.worstMs, ms);
    (nb ?? b).slow = ms > SKIN_BUILD_SLOW_MS; (nb ?? b).at = this.step_;
    if (nb) nb.dirty = false;
  }

  /** Forgets a skin's recorded cuts and ends before another skin takes them (the caller sets the tubes' cuts right after, so nothing is drawn between). */
  private dropCutsQuiet(b: Built): void {
    this.unweld(b);
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
    for (const b of this.built) { this.unweld(b); this.release(b, true); }
    this.built = [];
    this.fellBack.length = 0;
    this.dropped.length = 0;
    this.partFailed.length = 0;
  }

  dispose(): void { this.clear(); }

  /** A built skin's objects into the scene (the plain trunk beside the welded skin). */
  private place(b: Built): void { this.deps.add(b.draw!.object); if (b.plain) this.deps.add(b.plain.draw.object); for (const p of b.parts.values()) this.deps.add(p.draw.object); }
  /** A built skin's objects disposed, and out of the scene when they were in it. */
  private release(b: Built, inScene: boolean): void {
    for (const d of [b.draw, b.plain?.draw, ...[...b.parts.values()].map((p) => p.draw)]) if (d) { if (inScene) this.deps.remove(d.object); d.dispose(); }
  }
  /** The tubes' cut ends a skin was dithering come back whole (the weld uniform's rest value 1). */
  private unweld(b: Built): void {
    for (const a of b.arms) if (a.weld) this.deps.vessel(a.id)?.setSkinWeld(a.end, 1);
    for (const h of b.holes) this.deps.vessel(h.id)?.setSkinWeld(2, 1);
  }

  /** The live handover, once a frame after the vessels have moved: for each arm what its tube has at its seam, copied to the skin only when it changed. True when any skin's numbers changed (the scene draws a frame). */
  sync(): boolean {
    let changed = false;
    for (const b of this.drawn) {
      let any = false, blend = false, weld = 1, heldBy = 0, coming = -1;   // (weld: the least share of any PRESENT growing arm's hand-over, plain.ts weldOf; a growing arm that is not there (a closed shunt) holds nothing back, weldHeld below)
      b.arms.forEach((a, i) => {
        const both = (fn: (d: SkinDraw, k: number) => void): void => { fn(b.draw, i); if (b.plain && a.pi >= 0) fn(b.plain.draw, a.pi); for (const p of b.parts.values()) { const k = p.keep.indexOf(i); if (k >= 0) fn(p.draw, k); } };
        const u = a.obj.toon.uniforms, v = (k: string) => u[k]!.value as { x: number; y: number; z: number; w: number };
        const fade: FadeState = { mode: u.fadeMode!.value as number, a: [v('fadeA').x, v('fadeA').y, v('fadeA').z, v('fadeA').w], line: [v('fadeLine').x, v('fadeLine').y, v('fadeLine').z, v('fadeLine').w], cavaEnd: [v('cavaEnd').x, v('cavaEnd').y], stumpCut: v('stump').x, len: u.len!.value as number, units: 300 };
        const hi: HiState = { on: u.hiOn!.value as number, dir: u.hiDir!.value as number, offset: u.hiOffset!.value as number, ahead: u.hiAhead!.value as number, behind: u.hiBehind!.value as number, ends: [v('hiEnds').x, v('hiEnds').y], fade: u.hiFade!.value as number, len: u.len!.value as number };
        const f = liveFadeAt(fade, a.u, a.x, a.y), h = hiWeightAt(hi, a.u), l = lensUAt(a.span, a.u);
        const col = u.color!.value as { r: number; g: number; b: number }, lu = (u.lensUse!.value as number) > 0.5 ? 1 : 0;
        const nar = a.obj.toonMesh.geometry.getAttribute('narrow')?.getX(a.vi) ?? 0;   // (the stenosis waist the tube has at its seam; disease/clamps.ts writes it, only for a vessel that is stenosed)
        if (a.last[0] !== f || a.last[1] !== h || a.last[2] !== l || a.last[3] !== col.r || a.last[4] !== col.g || a.last[5] !== col.b || a.last[6] !== lu || a.last[7] !== nar) {
          a.last = [f, h, l, col.r, col.g, col.b, lu, nar, a.last[8] ?? NaN, a.last[9] ?? NaN, a.last[10] ?? NaN]; both((d, k) => d.setArm(k, f, h, l, { r: col.r, g: col.g, b: col.b, a: lu }, nar)); any = true;
        }
        // the tube's fade by its length share, for an arm whose seam stands in a fade (the skin's alpha at each vertex is the tube's there, not its value at the seam)
        { const pf = uFadeOf(fade, f), k = pf ?? [-1, -1, -1, -1];
          if (a.fk[0] !== k[0] || a.fk[1] !== k[1] || a.fk[2] !== k[2] || a.fk[3] !== k[3]) { a.fk = [k[0]!, k[1]!, k[2]!, k[3]!]; both((d, kk) => d.setFade?.(kk, pf)); any = true; } }
        // the arm's presence: the skin is there as much as its tube is (visible, drawn on, dissolved)
        const pr = armPresenceAt(a.obj.group.visible, u.reveal!.value as number, u.fade!.value as number, a.u);
        if (a.grow) {
          // a GROWING arm: the skin does not morph with it (it is one static shape with the arm whole); the arm's tube grows with its own flared end and from growth 0.9 to 1 the welded skin comes in over it (the weld, below).
          // Its presence dithers the skin as any arm's does (at most the weld's own share there, so it is never a second hole). A dotted thread (a closed potential collateral) counts 0: its tube is not cut, and the trunk is the plain trunk
          // (a growing arm that is not THERE at all (a closed shunt, its thread dotted) never holds the weld of the one beside it: S_PC closed kept C9's skin at weld 0 on the lower IVC in Budd-Chiari, the flat-capped tube with no join)
          const here = (u.dotted!.value as number) < 0.5 && pr > 0;
          a.here = here;
          if (here) { const wd = weldOf(pr); if (wd < weld || coming < 0) coming = i; weld = Math.min(weld, wd); heldBy++; }
          if (a.keep !== here) { a.keep = here; both((d, k) => d.setKeep?.(k, here)); any = true; }   // (an absent growing arm hands its weight to the arms that stay)
        }
        { const ca = u.clotA!.value as { x: number; y: number; z: number; w: number }, cp = u.clotP!.value as { x: number; y: number }, ck = `${ca.x}|${ca.y}|${ca.z}|${ca.w}|${cp.x}|${cp.y}`;
          if (a.clot !== ck) { a.clot = ck; both((d, k) => d.setClot?.(k, ca, cp)); any = true; } }
        if (a.last[10] !== pr) { a.last[10] = pr; both((d, k) => d.setPres(k, pr)); any = true; }
        // the wedge's one field at the seam (the tube's own distance line there), with the column's numbers: the amber runs on through the skin at the same front
        const wv = u.wedge!.value as { x: number; y: number; z: number; w: number }, wd = u.wedgeD!.value as { x: number; y: number; z: number; w: number };
        const wsd = wedgeSeamD(wv, wd, a.u);
        if (a.wedge[0] !== wsd || a.wedge[1] !== wv.x || a.wedge[2] !== wv.y || a.wedge[3] !== wd.z || a.wedge[4] !== wd.w) {
          a.wedge = [wsd, wv.x, wv.y, wd.z, wd.w];
          const col = wv.x > 0.001 ? { amount: wv.x, behind: wv.y, front: wd.z, frontSoft: wd.w, color: u.wedgeCol!.value as Color } : undefined;
          both((d, k) => d.setWedge?.(k, wsd, col)); any = true;
        }
        // the arm's flow marks ride on its arc (armArcOf: the tube's own u x len x figure units) and its tube's flowAmount
        const ln = u.len!.value as number, rd = u.radius!.value as number, fl = u.flowAmount!.value as number;
        if (a.last[8] !== ln || a.last[9] !== fl) {
          a.last[8] = ln; a.last[9] = fl;
          const arc = armArcOf(a.end, a.u, ln, rd); both((d, k) => d.setArc(k, arc.seamArc, arc.dir, arc.length, arc.restR, fl)); any = true;
        }
        // the arm's three copies (spec 10.4): its tube's own shares of its front, solid and veil copies (a plain vessel (1, 0, 0)); how much of the tube is THERE at the seam is `armPres` above
        const sh = a.obj.copyShares();
        if (a.cp[0] !== sh[0] || a.cp[1] !== sh[1] || a.cp[2] !== sh[2]) { a.cp = [sh[0], sh[1], sh[2]]; both((d, k) => d.setArmCopy(k, sh[0], sh[1], sh[2])); any = true; }
        if (a.obj.toon.transparent || a.obj.behindOrgans) blend = true;   // (a skin copy is fractional wherever an arm's share of it is: it blends)
      });
      if (b.arms.some((a) => a.grow) && !heldBy) weld = 0;   // (no growing arm is there: the plain trunk alone, as before)
      // the pair that stands for the weld (Plan 16): `in` is the skin of the growers that are THERE (the welded skin when every one is, a part when some are, none when none are), `out` the skin without the one whose weld is lowest (the one coming or going: the plain trunk
      // when it is the only one there, as before). Every other skin of the node is not drawn. A part that could not be built falls back to the welded skin (with its keep flags) for `in` and to the plain trunk for `out`, today's behaviour.
      const gi = b.arms.map((a, i) => (a.grow ? i : -1)).filter((i) => i >= 0), there = gi.filter((i) => b.arms[i]!.here);
      // a shunt that divides its vein (a growing arm some arm `leaves` for) is the vein's continuation when it is drawn: with it there and the vein divided now, the skin is the part WITHOUT the vein's start (plain.ts `leave`, key + 'L'),
      // never the one that carries it at alpha 0 (the lump in the splenic vein and the fade cut over the shunt, 23 Nov). A part that failed to build falls back to the welded skin, named in `partFailed`.
      const divides = (i: number): boolean => b.arms.some((x) => x.leaves === b.arms[i]!.id) && !!this.deps.divided?.(b.arms[i]!.id);
      const skinOf = (set: readonly number[]): SkinDraw | null => {
        const lp = set.some(divides) ? b.parts.get(`${partKey(set)}L`) : undefined;
        return lp ? lp.draw : set.length === gi.length ? b.draw : set.length === 0 ? b.plain?.draw ?? null : b.parts.get(partKey(set))?.draw ?? null;
      };
      const inD = there.length ? skinOf(there) ?? b.draw : null, outD = there.length ? skinOf(there.filter((i) => i !== coming)) ?? b.plain?.draw ?? null : b.plain?.draw ?? null;
      const lvIn = there.some(divides) && b.parts.has(`${partKey(there)}L`);   // (the skin drawn for the growers that are there is the one without the divided vein's start)
      const sel = `${weld}|${there.join('.')}|${coming}|${lvIn ? 1 : 0}${gi.filter(divides).join('.')}`;
      if (gi.length && (b.w !== weld || b.sel !== sel)) {
        // the weld: the skin `in` keeps the pixels whose screen pattern is under `weld`, the skin `out` the rest, and a tube's cut end the pixels neither of them draws (no pixel is two skins; at 1 the cut is whole, at 0 the skin is not drawn)
        b.w = weld; b.sel = sel; any = true;
        for (const d of [b.draw, ...[...b.parts.values()].map((p) => p.draw)]) if (d !== inD && d !== outD) d.setWeld?.(1, 0);   // (not drawn: the welded form before its weld begins)
        if (b.plain && b.plain.draw !== outD) b.plain.draw.setWeld?.(-1, 1);   // (the plain trunk once the weld is whole)
        inD?.setWeld?.(1, weld); outD?.setWeld?.(-1, weld);
        // (an absent growing arm's own thread keeps its end; so does a divided vein's start while its shunt's skin is the one without it: the stump's round end is the tube's own)
        for (const a of b.arms) if (a.weld) a.obj.setSkinWeld(a.end, a.grow && !a.here ? 0 : lvIn && a.leaves !== undefined && there.some((g) => b.arms[g]!.id === a.leaves) ? 0 : b.plain && !a.grow ? 1 : weld);
        if (!b.plain) for (const h of b.holes) this.deps.vessel(h.id)?.setSkinWeld(2, weld);   // (a host's hole is dithered back with the weld when no plain trunk stands in for it)
      }
      if (any) changed = true;
      b.draw.setTransparent(blend); b.plain?.draw.setTransparent(blend); for (const p of b.parts.values()) p.draw.setTransparent(blend);
    }
    return changed;
  }
}
