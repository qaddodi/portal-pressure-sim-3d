// The junction regions' data for the vertex shader's implicit-skinning projection (review doc, "Rulings on WP3", 22 Nov): a junction vertex starts at the bone blend of its two baked offset sets and is then projected onto the LIVE smooth union of the region's
// capsules, whose axes are bones (their live centres and live lumen radii, presence and swell included). So the shader needs, per region, which bones carry each capsule and which capsules are the two halves of a run-on (the mate minimum), nothing else:
// the blend width k is `SKIN_K` times the narrowest ARM's live radius at the junction, found from the same rows.
// The mesher (net/mesh.ts) reports the capsules it built the fillet on (`NodeReport.caps`: axis points, radii, mates); here each is resampled to REGION_PTS even steps along its axis and every sample takes the NEAREST BONE (body pose) of the skeleton (a tie at a node going to the bone of the capsule's own radius). Nothing is looked up at run time but the row.
import type { NodeReport } from './mesh.ts';
import type { Skeleton } from './types.ts';

/** The most capsules of a region (the ruling says 6 arms; the short edges of a merged region and a run capsule come on top) and the bones along each. */
export const REGION_CAPS = 8, REGION_PTS = 8;
/** A region's row in the region texture: texel 0 (capsule count, arm count, variant), two of mates, texel 3 the switch window (b, a), then from REGION_HEAD the bone indices four to a texel. */
export const REGION_HEAD = 4;
export const REGION_TEXELS = REGION_HEAD + Math.ceil((REGION_CAPS * REGION_PTS) / 4);
/** A region has two meshes (plan owner, 22 Nov): one built at the body layout (variant 0) and one at the map layout (variant 1), both projected onto the same live union. The body mesh is drawn for t <= b, the map mesh for t >= a, and between them the screen
 *  dither hands over (the body mesh keeps the pixels whose pattern value is below its share 1 - smoothstep(b, a, t), the map mesh the rest); the one not drawn collapses to a point in the vertex stage. A body mesh alone is window [2, 2] (always drawn), a map mesh alone [-1, -1]. */
export const BODY_ONLY: readonly [number, number] = [2, 2], MAP_ONLY: readonly [number, number] = [-1, -1];
/** The body mesh's share of the pixels at t (the vertex stage's `wb`): 1 before the window, 0 after it, smooth inside; a window with a <= b is a hard switch at a. */
export const bodyShare = (win: readonly [number, number], t: number): number => { const [b, a] = win; if (a > b) { const x = Math.min(1, Math.max(0, (t - b) / (a - b))); return 1 - x * x * (3 - 2 * x); } return t < a ? 1 : 0; };

export interface Region { node: string; vertStart: number; vertCount: number; arms: number; caps: { bones: number[]; mate: number }[]; /** 0: the body-built mesh, 1: the map-built (the mesher reports it, `NodeReport.variant`; absent = body) */ variant: 0 | 1 | 2; /** the t window over which this region's two meshes hand over, `[b, a]` (`NodeReport.switchT`; absent = this mesh alone) */ window: readonly [number, number]; /** variant 2 only (a mid mesh, `NodeReport.switchT2`): the window it hands over to the map mesh in (`window` is the one from the body mesh) */ window2?: readonly [number, number] }

export function regionsOf(skel: Skeleton, nodes: readonly NodeReport[]): Region[] {
  const out: Region[] = [];
  for (const n of nodes) {
    if (n.kind !== 'junction' || !n.caps) continue;
    if (n.caps.length > REGION_CAPS) throw new Error(`net regions: ${n.node} has ${n.caps.length} capsules, the row holds ${REGION_CAPS}`);
    const caps = n.caps.map((c, ci) => {
      const np = c.pts.length / 3, cum = [0];
      for (let i = 1; i < np; i++) cum.push(cum[i - 1]! + Math.hypot(c.pts[3 * i]! - c.pts[3 * i - 3]!, c.pts[3 * i + 1]! - c.pts[3 * i - 2]!, c.pts[3 * i + 2]! - c.pts[3 * i - 1]!));
      const bones: number[] = [];
      for (let q = 0; q < REGION_PTS; q++) {
        const d = (cum[np - 1]! * q) / (REGION_PTS - 1);
        let sg = 0;
        while (sg < np - 2 && cum[sg + 1]! < d) sg++;
        const sl = cum[sg + 1]! - cum[sg]!, t = sl > 0 ? (d - cum[sg]!) / sl : 0;
        const p = [0, 1, 2].map((k) => c.pts[3 * sg + k]! + (c.pts[3 * sg + 3 + k]! - c.pts[3 * sg + k]!) * t), rc = c.r[sg]! + (c.r[sg + 1]! - c.r[sg]!) * t;
        // the nearest bone of the whole skeleton (body pose); at a node every edge's end bone is equally near, so an exact tie goes to the bone whose radius is the capsule's there
        let best = Infinity, bb = 0;
        skel.bones.forEach((b, bi) => { const a = b.pos[0], dd = (a[0] - p[0]!) ** 2 + (a[1] - p[1]!) ** 2 + (a[2] - p[2]!) ** 2 + 1e-9 * (b.r[0] - rc) ** 2; if (dd < best) { best = dd; bb = bi; } });
        bones.push(bb);
      }
      return { bones, mate: c.mate };
    });
    const variant = n.variant ?? 0;
    out.push({ node: n.node, vertStart: n.vertStart, vertCount: n.vertCount, arms: n.arms.length, caps, variant, window: n.switchT ?? (variant === 0 ? BODY_ONLY : MAP_ONLY), ...(n.switchT2 ? { window2: n.switchT2 } : {}) });
  }
  return out;
}

/** The region texture (RGBA32F, REGION_TEXELS wide, one row per region) and the region index of each mesh vertex (-1: a tube vertex, bones only), as the vertex attribute the shader reads. */
export function regionTexture(regions: readonly Region[], vertexCount: number): { data: Float32Array; width: number; height: number; vertexRegion: Float32Array } {
  const height = Math.max(1, regions.length), data = new Float32Array(4 * REGION_TEXELS * height), vertexRegion = new Float32Array(vertexCount).fill(-1);
  regions.forEach((rg, ri) => {
    const o = 4 * REGION_TEXELS * ri;
    data[o] = rg.caps.length; data[o + 1] = rg.arms; data[o + 2] = rg.variant; data[o + 4 * 3] = rg.window[0]; data[o + 4 * 3 + 1] = rg.window[1];
    rg.caps.forEach((c, ci) => {
      data[o + 4 * 1 + ci] = c.mate;   // texels 1 and 2: the mates
      for (let q = 0; q < REGION_PTS; q++) data[o + 4 * REGION_HEAD + ci * REGION_PTS + q] = c.bones[q]!;
    });
    for (let v = rg.vertStart; v < rg.vertStart + rg.vertCount; v++) vertexRegion[v] = ri;
  });
  return { data, width: REGION_TEXELS, height, vertexRegion };
}
