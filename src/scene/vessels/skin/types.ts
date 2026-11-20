// Junction skins (docs: /mnt/project-files/rebuild-3d/junction-skin-spec.md, section 3). These interfaces are fixed: the inventory (WP1), the SDF and mesh
// builder (WP2), the shaders (WP3) and the scene wiring (WP5) all code against them, so change nothing here without telling the lead thread.
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
  J: Vec3;                   // the junction centre (section 4.2)
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

/** A junction the skin cannot be built for (the hull misses a seam ring, the mesh will not settle): the scene falls back to today's method for that node and warns once. */
export class SkinBuildError extends Error {
  readonly node: string;
  constructor(node: string, why: string) { super(`skin ${node}: ${why}`); this.name = 'SkinBuildError'; this.node = node; }
}
