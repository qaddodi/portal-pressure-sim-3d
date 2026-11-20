// Junction skins (docs: /mnt/project-files/rebuild-3d/junction-skin-spec.md, section 3): the types every part of the skin code shares. The interfaces here are the spec's own and are fixed:
// the inventory and the cuts (WP1), the SDF and the mesh (WP2), the shaders (WP3) and the scene wiring (WP5) are written against them by different hands, so a change here is a change to all.
export type Vec3 = readonly [number, number, number];

/** One tube that meets at a junction node. */
export interface SkinArm {
  /** NETWORK id, e.g. 'SMV_CONF' */
  vesselId: string;
  /** which end of the vessel is at the node (0: its start, 1: its end) */
  end: 0 | 1;
  /** arms are always the vessel's main course (index 0 of coursesOf) */
  courseIndex: 0;
  /** indexOf(def.lensId): the vdata texel (live diameter) */
  dataIndex: number;
  /** same as dataIndex today; kept separate on purpose */
  lensIndex: number;
  /** def.baseD */
  baseD: number;
  /** def.widthKind */
  widthKind: 0 | 1 | 2;
  /** def.radius (scene units) */
  restR: number;
}

/** One junction: a node where 3 or 4 permanent tubes meet. */
export interface SkinJunction {
  /** topology node id, e.g. 'CONF' */
  node: string;
  /** the junction centre (spec 4.2) */
  J: Vec3;
  /** 3 or 4, sorted widest first */
  arms: SkinArm[];
}

/** Where an arm's tube hands over to the skin. */
export interface SkinCut {
  vesselId: string; end: 0 | 1;
  /** tube ring index k (0..tubular) that is the seam */
  ring: number;
  /** uv.x of that ring = k / tubular */
  u: number;
}

/** The built skin of one junction, ready for a BufferGeometry. */
export interface SkinMesh {
  junction: SkinJunction;
  /** one per arm, same order as arms */
  cuts: SkinCut[];
  /** xyz, rest shape, scene units, NOT inflated by ink */
  position: Float32Array;
  /** xyz unit */
  normal: Float32Array;
  /** xyz: nearest point on the nearest arm's axis (for depth, like the tube's ring centre) */
  cen: Float32Array;
  /** 4 per vertex, sum 1, arm order; unused arms 0 */
  weight: Float32Array;
  /** 1 per vertex: the blended rest radius sum(w_i * R_i(at the nearest axis point)) */
  restR: Float32Array;
  /** triangles */
  index: Uint32Array;
  /** per arm: the skin vertex ids of its seam ring, in the tube's ring order j = 0..RADIAL */
  seamVerts: Uint32Array[];
}

/** The radii before a seam that chevrons, streaks and dust fade out over on an arm tube (spec 4.8): the skin draws none of them, the stream chain carries the heads on past the junction. */
export const MARK_FADE_R = 1.5;

/** Raised when a junction's skin cannot be built (no seam ring satisfies the rules within the tries, spec 4.4). The scene falls back to today's method for that node and warns once; it never crashes. */
export class SkinBuildError extends Error {
  readonly node: string;
  constructor(node: string, why: string) {
    super(`skin: junction ${node}: ${why}`);
    this.name = 'SkinBuildError';
    this.node = node;
  }
}
