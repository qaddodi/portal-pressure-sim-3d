// Junction skins (docs/junction-skin-spec.md section 3): the types every part of the skin shares. One junction is a node where 3 or 4 permanent tubes (its ARMS) meet; each arm tube is cut back to a seam ring and one
// closed mesh, the SKIN, fills the gap. These are the fixed interfaces the inventory (inventory.ts), the builder (mesh.ts), the shaders (shaders.ts) and the scene's wiring (skin-set.ts) all code against.

export type Vec3 = readonly [number, number, number];

/** One tube that meets at a junction node. */
export interface SkinArm {
  vesselId: string;          // NETWORK id, e.g. 'SMV_CONF'
  end: 0 | 1;                // which end of the vessel is at the node (0: its start, 1: its end)
  courseIndex: 0;            // arms are always the vessel's main course (index 0 of coursesOf)
  dataIndex: number;         // indexOf(def.lensId): the vdata texel (live diameter)
  lensIndex: number;         // same as dataIndex today; kept separate on purpose
  baseD: number;             // def.baseD
  widthKind: 0 | 1 | 2;      // def.widthKind
  restR: number;             // def.radius (scene units)
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
}

/** The built skin of one junction, ready for a BufferGeometry. */
export interface SkinMesh {
  junction: SkinJunction;
  cuts: SkinCut[];                    // one per arm, same order as arms
  position: Float32Array;             // xyz, rest shape, scene units, NOT inflated by ink
  normal: Float32Array;               // xyz unit
  cen: Float32Array;                  // xyz: nearest point on the nearest arm's axis (for depth, like the tube's ring centre)
  weight: Float32Array;               // 4 per vertex, sum 1, arm order; unused arms 0
  restR: Float32Array;                // 1 per vertex: the blended rest radius sum(w_i * R_i(at the nearest axis point))
  index: Uint32Array;                 // triangles
  seamVerts: Uint32Array[];           // per arm: the skin vertex ids of its seam ring, in the tube's ring order j = 0..RADIAL
}

/** A tube's flow marks (chevrons, streaks, dust) fade out over this many radii before the tube's seam, where the skin (which draws none) takes over (spec 4.8). */
export const MARK_FADE_R = 1.5;

/** The tube's `skinCut` uniform when nothing is cut: no u is below -1 or above 2, so every branch it guards is a no-op and the picture is today's (spec section 3, WP4). */
export const SKIN_CUT_NONE: readonly [number, number] = [-1, 2];

/** How far the Circuit's change must have gone (0..1 of circT) before a cut tube is whole again and the skin gone (spec 4.9). */
export const SKIN_CIRC_SPAN = 0.35;

/** The tube's cut is judged this far (in u) inside the seam, so the interpolated uv.x of the seam ring itself (which rounds to the ring's u within a few ulp) is never discarded: no hairline gap at the seam. */
export const SKIN_CUT_EPS = 2e-5;

/** A junction the skin cannot be built for (the hull misses a seam ring, the mesh will not settle): the scene falls back to today's method for that node and warns once. */
export class SkinBuildError extends Error {
  readonly node: string;
  constructor(node: string, why: string) { super(`skin ${node}: ${why}`); this.name = 'SkinBuildError'; this.node = node; }
}
