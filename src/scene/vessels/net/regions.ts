// The junction regions' data for the vertex shader's implicit-skinning projection (review doc, "Rulings on WP3", 22 Nov): a junction vertex starts at the bone blend of its two baked offset sets and is then projected onto the LIVE smooth union of the region's
// capsules, whose axes are bones (their live centres and live lumen radii, presence and swell included). So the shader needs, per region, which bones carry each capsule and which capsules are the two halves of a run-on (the mate minimum), nothing else:
// the blend width k is `SKIN_K` times the narrowest ARM's live radius at the junction, found from the same rows.
// The mesher (net/mesh.ts) reports the capsules it built the fillet on (`NodeReport.caps`: axis points, radii, mates); here each is resampled to REGION_PTS even steps along its axis and every sample takes the NEAREST BONE (body pose) of the skeleton (a tie at a node going to the bone of the capsule's own radius). Nothing is looked up at run time but the row.
import type { NodeReport } from './mesh.ts';
import type { Skeleton } from './types.ts';

/** The most capsules of a region (the ruling says 6 arms; the short edges of a merged region and a run capsule come on top) and the bones along each. */
export const REGION_CAPS = 8, REGION_PTS = 8;
/** A region's row in the region texture: one head texel (capsule count, arm count, k scale), two of mates, then the bone indices four to a texel. */
export const REGION_TEXELS = 3 + (REGION_CAPS * REGION_PTS) / 4;

export interface Region { node: string; vertStart: number; vertCount: number; arms: number; caps: { bones: number[]; mate: number }[] }

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
    out.push({ node: n.node, vertStart: n.vertStart, vertCount: n.vertCount, arms: n.arms.length, caps });
  }
  return out;
}

/** The region texture (RGBA32F, REGION_TEXELS wide, one row per region) and the region index of each mesh vertex (-1: a tube vertex, bones only), as the vertex attribute the shader reads. */
export function regionTexture(regions: readonly Region[], vertexCount: number): { data: Float32Array; width: number; height: number; vertexRegion: Float32Array } {
  const height = Math.max(1, regions.length), data = new Float32Array(4 * REGION_TEXELS * height), vertexRegion = new Float32Array(vertexCount).fill(-1);
  regions.forEach((rg, ri) => {
    const o = 4 * REGION_TEXELS * ri;
    data[o] = rg.caps.length; data[o + 1] = rg.arms;
    rg.caps.forEach((c, ci) => {
      data[o + 4 * 1 + ci] = c.mate;   // texels 1 and 2: the mates
      for (let q = 0; q < REGION_PTS; q++) data[o + 4 * 3 + ci * REGION_PTS + q] = c.bones[q]!;
    });
    for (let v = rg.vertStart; v < rg.vertStart + rg.vertCount; v++) vertexRegion[v] = ri;
  });
  return { data, width: REGION_TEXELS, height, vertexRegion };
}
