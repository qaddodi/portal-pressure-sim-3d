// The bone texture (?geom=net, WP1): the skeleton's bones as texels, so the network shader deforms one mesh by `p = sum w_i (P_bi + R_bi F_bi o_i)` without any per-vessel uniform.
//
// THREE RGBA32F TEXELS PER BONE (the review's budget: 4 bones x 3 texels per vertex):
//   texel 0  body position xyz, body radius
//   texel 1  map position xyz, map radius
//   texel 2  the frame as a unit quaternion's x, y, z (w >= 0 is rebuilt, `sqrt(1 - x^2 - y^2 - z^2)`), and `edge + u / 2` (the edge's index, its fraction in the fractional part: u is in 0..1, so floor gives the edge)
// The frame is the body pose's (t, n, b); the map's is derived by the shader from the map positions. A bone's index is its place in Skeleton.bones (NetMesh.bone holds it), and its texels are at
// x = (i % BONES_PER_ROW) * 3 + k, y = floor(i / BONES_PER_ROW): a row holds BONES_PER_ROW bones, so an edge of at most that many bones (the review's 64 samples) lies in one row or two.
import { DataTexture, FloatType, NearestFilter, RGBAFormat } from 'three';
import type { Vec3 } from '../../anatomy/vessels.ts';
import type { Bone } from './types.ts';

export const BONE_TEXELS = 3;
export const BONES_PER_ROW = 64;
export const BONE_ROW_TEXELS = BONES_PER_ROW * BONE_TEXELS;
/** The most bones one edge may have: 64, and more where a corner needs them (skeleton.ts boneCount: every corner arc spans 3 bones, 22 Nov ruling), up to this. */
export const MAX_BONES_PER_EDGE = 300;
/** The edge index lives in the fractional-part trick's integer part: it must stay exact in a float32 with u / 2 beside it. */
export const MAX_EDGES = 255;

/** The unit quaternion (x, y, z, w >= 0) of the rotation whose columns are t, n, b (a right-handed orthonormal frame). */
export function frameToQuat([t, n, b]: readonly [Vec3, Vec3, Vec3]): [number, number, number, number] {
  // (the matrix is [t n b] by columns: m00 = t.x, m10 = t.y, m20 = t.z, m01 = n.x, ...)
  const m00 = t[0], m10 = t[1], m20 = t[2], m01 = n[0], m11 = n[1], m21 = n[2], m02 = b[0], m12 = b[1], m22 = b[2];
  const tr = m00 + m11 + m22;
  let x: number, y: number, z: number, w: number;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = s / 4; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / s; x = s / 4; y = (m01 + m10) / s; z = (m02 + m20) / s; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / s; x = (m01 + m10) / s; y = s / 4; z = (m12 + m21) / s; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = s / 4; }
  const l = Math.hypot(x, y, z, w) || 1, sg = w < 0 ? -1 : 1;   // (q and -q are one rotation: keep w >= 0 so the shader can rebuild it)
  return [sg * x / l, sg * y / l, sg * z / l, sg * w / l];
}

/** The frame (t, n, b) of the quaternion (x, y, z, and w rebuilt from them, as the shader does). */
export function quatToFrame(x: number, y: number, z: number, w = Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z))): [Vec3, Vec3, Vec3] {
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)],
    [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)],
    [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)],
  ];
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Writes one bone's three texels into `out` at texel offset `o` (floats). */
export function packBone(out: Float32Array, o: number, bone: Bone): void {
  const [t, n, b] = bone.frame, tn = cross(t, n);
  if (Math.hypot(tn[0] - b[0], tn[1] - b[1], tn[2] - b[2]) > 1e-3 || Math.abs(Math.hypot(...t) - 1) > 1e-3 || Math.abs(Math.hypot(...n) - 1) > 1e-3) throw new Error(`bones: bone of edge ${bone.edge} at u ${bone.u} has a frame that is not right-handed orthonormal (b must be t x n)`);
  if (bone.edge < 0 || bone.edge > MAX_EDGES || !Number.isInteger(bone.edge)) throw new RangeError(`bones: edge ${bone.edge} does not fit the bone texture (0..${MAX_EDGES})`);
  if (!(bone.u >= 0 && bone.u <= 1)) throw new RangeError(`bones: u ${bone.u} is outside 0..1`);
  const q = frameToQuat(bone.frame);
  out.set(bone.pos[0], o); out[o + 3] = bone.r[0];
  out.set(bone.pos[1], o + 4); out[o + 7] = bone.r[1];
  out[o + 8] = q[0]; out[o + 9] = q[1]; out[o + 10] = q[2]; out[o + 11] = bone.edge + bone.u / 2;
}

/** The bone at index `i`, read back (what the shader sees; the quaternion's w is rebuilt, so the frame is exact to about 1e-3 at worst and 1e-6 in practice). */
export function unpackBone(data: Float32Array, i: number): Bone {
  const o = bonePos(i), key = data[o + 11]!, edge = Math.floor(key);
  return {
    edge, u: (key - edge) * 2,
    pos: [[data[o]!, data[o + 1]!, data[o + 2]!], [data[o + 4]!, data[o + 5]!, data[o + 6]!]],
    r: [data[o + 3]!, data[o + 7]!],
    frame: quatToFrame(data[o + 8]!, data[o + 9]!, data[o + 10]!),
  };
}

/** The float offset of bone `i`'s first texel in the texture's array. */
export function bonePos(i: number): number { return (Math.floor(i / BONES_PER_ROW) * BONE_ROW_TEXELS + (i % BONES_PER_ROW) * BONE_TEXELS) * 4; }

/** The table: every bone of the skeleton, written in place. A coil, a growth or a shunt moving rewrites only its own edge's bones (`writeEdge`), and `flush` uploads only the texture rows they lie in. */
export class BoneTable {
  readonly count: number;
  readonly rows: number;
  readonly data: Float32Array;
  /** bones the table has written since creation (a coil step moves it by one edge's bones, not the network's; the test pins it) */
  writes = 0;
  private lo = Infinity; private hi = -1;   // (bone indices)
  private tex: DataTexture | null = null;

  constructor(bones: readonly Bone[], edges?: readonly { bones: readonly [number, number] }[]) {
    if (edges) for (const e of edges) if (e.bones[1] > MAX_BONES_PER_EDGE) throw new RangeError(`bones: an edge has ${e.bones[1]} bones, the texture holds ${MAX_BONES_PER_EDGE}`);
    this.count = bones.length;
    this.rows = Math.max(1, Math.ceil(bones.length / BONES_PER_ROW));
    this.data = new Float32Array(this.rows * BONE_ROW_TEXELS * 4);
    bones.forEach((b, i) => packBone(this.data, bonePos(i), b));
    // (the first upload is whole: nothing is dirty)
  }

  bone(i: number): Bone { return unpackBone(this.data, i); }

  /** Rewrites the bones `first` .. `first + bones.length - 1` (one edge's: SkelEdge.bones is [first, count]) and marks them for upload. */
  writeEdge(first: number, bones: readonly Bone[]): void {
    if (first < 0 || first + bones.length > this.count) throw new RangeError(`bones: bones ${first}..${first + bones.length - 1} are outside the ${this.count} the table holds`);
    bones.forEach((b, k) => packBone(this.data, bonePos(first + k), b));
    this.writes += bones.length;
    this.lo = Math.min(this.lo, first); this.hi = Math.max(this.hi, first + bones.length - 1);
  }

  /** The bones written since the last flush, first and last (null: none). */
  dirtyBones(): readonly [number, number] | null { return this.hi < 0 ? null : [this.lo, this.hi]; }
  /** The texture rows those bones lie in, first and last (null: none). */
  dirtyRows(): readonly [number, number] | null { return this.hi < 0 ? null : [Math.floor(this.lo / BONES_PER_ROW), Math.floor(this.hi / BONES_PER_ROW)]; }

  texture(): DataTexture {
    if (!this.tex) {
      const t = new DataTexture(this.data, BONE_ROW_TEXELS, this.rows, RGBAFormat, FloatType);
      t.minFilter = t.magFilter = NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
      this.tex = t;
      this.lo = Infinity; this.hi = -1;
    }
    return this.tex;
  }

  /** Hands the rows the written bones lie in to the GPU, then forgets them. A no-op when nothing was written. */
  flush(): void {
    const r = this.dirtyRows(), t = this.tex;
    if (!r || !t) return;
    const stride = BONE_ROW_TEXELS * 4;
    t.addUpdateRange(r[0] * stride, (r[1] - r[0] + 1) * stride);
    t.needsUpdate = true;
    this.lo = Infinity; this.hi = -1;
  }
}
