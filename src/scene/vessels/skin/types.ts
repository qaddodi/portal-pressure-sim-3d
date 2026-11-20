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
  /** A SIDE-WALL arm (spec 10.1): the stretch of this vessel on one side of the point `u` along it (`dir` -1 the part below `u`, +1 the part above), where the junction lies on the vessel's side and not at a node. `end` is then 1 for dir -1 and 0 for dir +1
   *  (the rings run away from the junction the way an end's do), and the arm's walk starts at the ring nearest `u` instead of the tube's own end. Two side arms of one vessel (a virtual node mid-host) leave a HOLE in it (VesselObject.setSkinHole). */
  side?: { u: number; dir: -1 | 1 };
  /** A GROWING arm (spec 10.2): a collateral or a shunt, which comes and goes. Its seam is chosen at full radius and never moves; the skin carries a second shape (`GrowMorph`) with this arm at radius 0, and the live growth eases between the two. */
  grow?: boolean;
}

/** One junction: a node where 3 or 4 permanent tubes meet. */
export interface SkinJunction {
  node: string;              // topology node id, e.g. 'CONF'
  J: Vec3;                   // the junction centre (spec section 4.2)
  arms: SkinArm[];           // 3 or 4, sorted widest first
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
  /** one per growing arm, at most SKIN_GROWERS (spec 10.2): the difference between the skin with that arm at full radius (this mesh) and with it at radius 0 */
  grow: GrowMorph[];
}

/** The most growing arms one skin morphs (spec 10.2: "at most 2 per skin; with more, the 2 widest are morphed and the rest keep today's fork method"). */
export const SKIN_GROWERS = 2;

/**
 * The second shape of a skin for one growing arm (spec 10.2). `SkinMesh` is shape P1, every arm at full radius. P0 is the same topology with this arm's capsule at radius 0: the seam ring of the arm at its centre, the arm's own stretch a thread on its axis, every other vertex
 * projected onto the union without the arm's width. The mesh stores `delta = P1 - P0` for what the vertex stage needs, and the live growth `g` (0 gone, 1 whole) gives `value = P1 - (1 - g) * delta`: on the seam ring that is the tube's own ring at share g, and at g = 0 the trunk is a plain trunk.
 */
export interface GrowMorph {
  /** the arm (index into `junction.arms`) that grows */
  arm: number;
  dPos: Float32Array;     // 3 per vertex: P1 - P0
  dNor: Float32Array;     // 3 per vertex: N1 - N0
  dRest: Float32Array;    // 1 per vertex: restR1 - restR0
  dWeight: Float32Array;  // 4 per vertex: weight1 - weight0 (arms 0 to 3)
  dWeight2: Float32Array; // 2 per vertex: arms 4 and 5
}

/** The tube's `skinCut` uniform when nothing is cut: no u is below -1 or above 2, so every branch it guards is a no-op and the picture is today's (spec section 3, WP4). */
export const SKIN_CUT_NONE: readonly [number, number] = [-1, 2];

/** The tube's `skinHole` uniform when it has no hole (spec 10.1): the range is empty, so `inSkinHole` is false for every u. */
export const SKIN_HOLE_NONE: readonly [number, number] = [2, -1];

/** How far the Circuit's change must have gone (0..1 of circT) before a cut tube is whole again and the skin gone (spec 4.9). */
export const SKIN_CIRC_SPAN = 0.35;

/** The Circuit's skins (circuit/skins.ts) come in over the END of the change: the share of circT at which the map's own skins start to show, and at which the arm tubes' second cut (`skinCutC`) starts to take its ends away. The body's skins are gone by SKIN_CIRC_SPAN (0.35) and the tubes whole between the two, so no junction is ever two skins at once. */
export const SKIN_CIRC_IN = 0.65;

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
