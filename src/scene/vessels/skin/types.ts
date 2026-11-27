// Junction skins (docs/junction-skin-spec.md section 3): the types every part of the skin shares. One junction is a node where 3 or 4 permanent tubes (its ARMS) meet; each arm tube is cut back to a seam ring and one
// closed mesh, the SKIN, fills the gap. These are the fixed interfaces the inventory (inventory.ts), the builder (mesh.ts), the shaders (shaders.ts) and the scene's wiring (skin-set.ts) all code against.

export type Vec3 = readonly [number, number, number];

/** One tube that meets at a junction node. */
export interface SkinArm {
  vesselId: string;          // NETWORK id, e.g. 'SMV_CONF'
  end: 0 | 1;                // which end of the vessel is at the node (0: its start, 1: its end)
  courseIndex: number;       // which course of the vessel (index into coursesOf): 0 for every arm today; a feeder strand or a coil's strand is another (spec 10.1)
  runStart?: number;         // the tube geometry's first vertex of that course (TubeRun.tubeStart), 0 for the main course
  dataIndex: number;         // indexOf(def.lensId): the vdata texel (live diameter)
  lensIndex: number;         // same as dataIndex today; kept separate on purpose
  baseD: number;             // def.baseD
  widthKind: 0 | 1 | 2;      // def.widthKind
  restR: number;             // def.radius (scene units)
  /** the tube's radius where the arm meets the junction (its end at the node, or at `side.u` on a host's wall), scene units, tapers and buried ends counted: `restR` is the vessel's NOMINAL radius, and a branch that thins toward its tip or a vein that tapers is far narrower than that at J. The blend width and the seam's clearance are sized from it (`armR`), so a thin joint never gets the fillet of a fat one (the bulb at the right hepatic vein's branch, 21 Nov). Absent: `restR`. */
  jointR?: number;
  /** where this arm's axis starts when it is not the junction's J: a growing arm that lands on the host's wall inside this skin's reach (cuts.ts planSkins) starts at its own landing, so its capsule lies along its tube and not along a chord from J */
  at?: Vec3;
  /** A SIDE-WALL arm (spec 10.1): the stretch of this vessel on one side of the point `u` along it (`dir` -1 the part below `u`, +1 the part above), where the junction lies on the vessel's side and not at a node. `end` is then 1 for dir -1 and 0 for dir +1
   *  (the rings run away from the junction the way an end's do), and the arm's walk starts at the ring nearest `u` instead of the tube's own end. Two side arms of one vessel (a virtual node mid-host) leave a HOLE in it (VesselObject.setSkinHole). */
  side?: { u: number; dir: -1 | 1 };
  /** A GROWING arm (spec 10.2): a collateral or a shunt, which comes and goes. Its seam is chosen at full radius and never moves; the skin is one static shape with the arm whole and the weld (plain.ts) hands the tube over to it at growth 0.9 to 1. */
  grow?: boolean;
  /** The DIVIDED vein's start (divide.ts DIVIDED: the splenic vein under a Warren shunt, the portal trunk under an end-to-side portocaval): the id of the shunt that divides it, a growing arm of this same junction. While that shunt is in AND the vein is divided
   *  its start is a tied-off stump with its own round end, never an arm of the skin: the skin of that state is built without this arm (plain.ts partOf `leave`, skin-set.ts), so no capsule of the divided stretch is drawn (at alpha 0, the bulge and the fade cut). */
  leaves?: string;
}

/** The radius an arm really has at the junction (types.ts `jointR`), else its nominal one: what the blend width is a share of. */
export const armR = (a: Pick<SkinArm, 'restR' | 'jointR'>): number => a.jointR ?? a.restR;

/** One junction: a node where 3 or 4 permanent tubes meet. */
export interface SkinJunction {
  node: string;              // topology node id, e.g. 'CONF'
  J: Vec3;                   // the junction centre (spec section 4.2)
  arms: SkinArm[];           // 3 or 4, sorted widest first
  /** meshed from the surface itself (sheet.ts, the last rung), its seams chosen with no hull of the rings: a junction whose seam rings the hull cannot cover (the Circuit's, circuit/skins.ts) */
  surface?: boolean;
}

/** Where an arm's tube hands over to the skin. */
export interface SkinCut {
  vesselId: string; end: 0 | 1;
  ring: number;              // tube ring index k (0..tubular) that is the seam
  u: number;                 // uv.x of that ring = k / tubular
  /** the arm is a side-wall arm of its vessel (types.ts SkinArm.side): its dir. Two of one vessel are a HOLE, not two cuts. */
  side?: -1 | 1;
}

/** The built skin of one junction, ready for a BufferGeometry. */
export interface SkinMesh {
  junction: SkinJunction;
  cuts: SkinCut[];                    // one per arm, same order as arms
  position: Float32Array;             // xyz, rest shape, scene units, NOT inflated by ink
  normal: Float32Array;               // xyz unit
  cen: Float32Array;                  // xyz: nearest point on the nearest arm's axis (for depth, like the tube's ring centre)
  weight: Float32Array;               // 4 per vertex (arms 0 to 3), sum of all six 1, arm order; unused arms 0
  weight2: Float32Array;              // 2 per vertex (arms 4 and 5)
  restR: Float32Array;                // 1 per vertex: the blended rest radius sum(w_i * R_i(at the nearest axis point))
  index: Uint32Array;                 // triangles
  seamVerts: Uint32Array[];           // per arm: the skin vertex ids of its seam ring, in the tube's ring order j = 0..RADIAL
}

/** The most growing arms one skin takes whole (spec 10.2; with more, the widest are welded and the rest keep their sunk and flared ends, each named in SkinSet.dropped). Nothing limits it but the six arms of a skin and its parts: since 21 Nov
 *  nothing morphs (one static full-size shape, the weld of plain.ts hands it over) and no shader has a slot per grower; a skin with g growers bakes its 2^g - 2 parts (plain.ts partSets). 3 since 25 Nov: the splenic vein's SVD
 *  takes the distal splenorenal shunt, the short gastric veins and the spontaneous splenorenal shunt, which at 2 was sent on 12.7 radii down the vein to SV (anatomy/placed-network.ts SIBLINGS APART). */
export const SKIN_GROWERS = 3;

/** The tube's `skinCut` uniform when nothing is cut: no u is below -1 or above 2, so every branch it guards is a no-op and the picture is today's (spec section 3, WP4). */
export const SKIN_CUT_NONE: readonly [number, number] = [-1, 2];

/** The tube's `skinHole` uniform when it has no hole (spec 10.1): the range is empty, so `inSkinHole` is false for every u. */
export const SKIN_HOLE_NONE: readonly [number, number] = [2, -1];

/** How far a point's OWN share of the Circuit's change (peel.ts peelAt on its flow rank, not the whole change's circT)
 *  must have gone before the cut tube there is whole again and the body's skin gone (spec 4.9).
 *  The tubes peel by rank, so the gut's and the spleen's are well on their way while the whole change has barely begun:
 *  a skin that waited for circT stood at its final place
 *  with its tubes still flying ("a segment in the splenic vein just appears in place", Mohammad, 27 Nov). Small, so the skin and the tube trade places while the tube is a hair from home. */
export const SKIN_CIRC_SPAN = 0.05;

/** The Circuit's skins (circuit/skins.ts) come in over the END of the change: the share of a point's own peel (peel.ts peelAt on its rank) at which the map's own skins start to show, and at which the arm tubes' second cut (`skinCutC`) starts to take its ends away. The body's skins are gone by SKIN_CIRC_SPAN (0.35) and the tubes whole between the two, so no junction is ever two skins at once.
 *  A skin cannot travel: it is built on the map and stands there while its tubes fly. So it may show only while its tube is within a hair of the map place, never a share of the journey: the journeys are up to 5 scene units on an upright map (the iliac and heart-row ends cross the whole figure), and 0.65 left a skin up to a third of that (1.6 units, 90 px on a phone) behind its tube, the pieces
 *  that "flew off upwards" at the top of the Circuit on the way back to the Anatomy (Mohammad, 21 Nov, iPhone, twice). tests/circuit-skin-reach.test.ts holds the gap under a tenth of a unit for every vessel end, wide and upright. */
export const SKIN_CIRC_IN = 0.98;

/** The tube's `skinCutC` uniform when the Circuit has no cut on it: as SKIN_CUT_NONE. */
export const SKIN_CUT_C_NONE: readonly [number, number] = [-1, 2];

/** The tube's cut is judged this far (in u) inside the seam, so the interpolated uv.x of the seam ring itself (which rounds to the ring's u within a few ulp) is never discarded: no hairline gap at the seam. */
export const SKIN_CUT_EPS = 2e-5;

/** Raised when a junction's skin cannot be built (no seam ring satisfies the rules within the tries, spec 4.4; WP2's mesh builder throws it too). The scene falls back to today's method for that node and warns once; it never crashes the scene. */
export class SkinBuildError extends Error {
  readonly node: string;
  constructor(node: string, why: string) {
    super(`skin: junction ${node}: ${why}`);
    this.name = 'SkinBuildError';
    this.node = node;
  }
}

/** The tube's `skinCut` when a merged skin replaces the vessel whole (rule 1c: PV_TRUNK_1 between CONF and PVT_L): every u is below 2, so none of it is drawn. */
export const SKIN_HIDDEN: readonly [number, number] = [2, -1];
