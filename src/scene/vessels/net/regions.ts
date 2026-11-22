// The junction regions' data for the vertex shader's implicit-skinning projection (review doc, "Rulings on WP3", 22 Nov): a junction vertex starts at the bone blend of its two baked offset sets and is then projected onto the LIVE smooth union of the region's
// capsules, whose axes are bones (their live centres and live lumen radii, presence and swell included). So the shader needs, per region, which bones carry each capsule and which capsules are the two halves of a run-on (the mate minimum), nothing else:
// the blend width k is `SKIN_K` times the narrowest ARM's live radius at the junction, found from the same rows.
// The mesher (net/mesh.ts) reports the capsules it built the fillet on (`NodeReport.caps`: axis points, radii, mates); here each is resampled to REGION_PTS even steps along its axis and every sample takes the NEAREST BONE (body pose) of the skeleton (a tie at a node going to the bone of the capsule's own radius). Nothing is looked up at run time but the row.
import type { NodeReport } from './mesh.ts';
import type { Skeleton } from './types.ts';

/** The most capsules of a region (the ruling says 6 arms; the short edges of a merged region and a run capsule come on top) and the bones along each. */
export const REGION_CAPS = 8, REGION_PTS = 8;
/** A region's row in the region texture: texel 0 (capsule count, arm count, variant), two of mates, texel 3 the fade ramps (in0, in1, out0, out1), texel 4 the keys (count, header slot; 0 for none), then from REGION_HEAD the bone indices four to a texel. */
export const REGION_HEAD = 5;
export const REGION_TEXELS = REGION_HEAD + Math.ceil((REGION_CAPS * REGION_PTS) / 4);
/** A region is drawn as plain tubes plus a FILLET mesh that dissolves in and out (plan owner, 22 Nov): the arms' tubes run through their seams to the node, so with no fillet the junction is still whole. A region's fillet is built at the body layout (variant 0),
 *  at the map layout (variant 1) and, where those share no t, at the middle of the Circuit (variant 2); each is drawn by the screen dither with a share of the pixels: the body fillet dissolves over [a - 0.1, a], the map fillet comes in over [b, b + 0.05],
 *  a mid fillet does both (in over [b, b + 0.05] of its first window, out over [a - 0.1, a] of its second), and between them the plain tubes show. `a` and `b` are the bake's (`NodeReport.switchT`: [b, a]). A mesh alone has window [2, 2] (body: always
 *  there) or [-1, -1] (map). The share is smoothstep(in) * (1 - smoothstep(out)); where it is 0 the mesh collapses to a point in the vertex stage (no work, no fragments). */
export const FADE_OUT_T = 0.1, FADE_IN_T = 0.05;
export const BODY_ONLY: readonly [number, number] = [2, 2], MAP_ONLY: readonly [number, number] = [-1, -1];
const ALWAYS: readonly [number, number] = [-2, -1], NEVER: readonly [number, number] = [2, 3];
/** A region's share ramps, [in0, in1, out0, out1], from its variant and windows. */
export function regionFades(rg: Pick<Region, 'variant' | 'window' | 'window2'>): [number, number, number, number] {
  const inR = rg.variant === 0 ? ALWAYS : [rg.window[0], rg.window[0] + FADE_IN_T] as const;
  const aOut = rg.variant === 2 ? (rg.window2 ?? rg.window)[1] : rg.window[1];
  const outR = rg.variant === 1 ? NEVER : [aOut - FADE_OUT_T, aOut] as const;
  return [inR[0], inR[1], outR[0], outR[1]];
}
const smooth = (a: number, b: number, t: number): number => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
/** The share of the pixels a region's fillet mesh keeps at t (the vertex stage's `vDraw`). */
export function regionShare(rg: Pick<Region, 'variant' | 'window' | 'window2'>, t: number): number { const [i0, i1, o0, o1] = regionFades(rg); return smooth(i0, i1, t) * (1 - smooth(o0, o1, t)); }

export interface Region { node: string; vertStart: number; vertCount: number; arms: number; caps: { bones: number[]; mate: number }[]; /** 0: the body-built mesh, 1: the map-built (the mesher reports it, `NodeReport.variant`; absent = body) */ variant: 0 | 1 | 2; /** the t window over which this region's two meshes hand over, `[b, a]` (`NodeReport.switchT`; absent = this mesh alone) */ window: readonly [number, number]; /** variant 2 only (a mid mesh, `NodeReport.switchT2`): the window it hands over to the map mesh in (`window` is the one from the body mesh) */ window2?: readonly [number, number] }

export function regionsOf(skel: Skeleton, nodes: readonly NodeReport[]): Region[] {
  const out: Region[] = [];
  for (const n of nodes) {
    if (n.kind !== 'junction' || !n.caps) continue;
    if (n.caps.length > REGION_CAPS) throw new Error(`net regions: ${n.node} has ${n.caps.length} capsules, the row holds ${REGION_CAPS}`);
    const caps = n.caps.map((c, ci) => {
      // the mesher chose the bones that carry the capsule (net/shader-caps.ts: the arms' tubes stay inside the live union); the evenly spaced nearest-bone resample is the fallback for a report without them
      const chosen = n.regionBones?.[ci];
      if (chosen) { const bones = chosen.slice(0, REGION_PTS); while (bones.length < REGION_PTS) bones.push(bones[bones.length - 1]!); return { bones, mate: c.mate }; }
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
    out.push({ node: n.node, vertStart: n.vertStart, vertCount: n.vertCount, arms: n.arms.length, caps, variant, window: n.switchT ?? (variant === 0 ? BODY_ONLY : MAP_ONLY) });
  }
  return out;
}

/** The region texture (RGBA32F, REGION_TEXELS wide, one row per region) and the region index of each mesh vertex (-1: a tube vertex, bones only), as the vertex attribute the shader reads. */
export function regionTexture(regions: readonly Region[], vertexCount: number, keys?: KeyPlan, ext?: Int32Array): { data: Float32Array; width: number; height: number; vertexRegion: Float32Array } {
  const height = Math.max(1, regions.length), data = new Float32Array(4 * REGION_TEXELS * height), vertexRegion = new Float32Array(vertexCount).fill(-1);
  regions.forEach((rg, ri) => {
    const o = 4 * REGION_TEXELS * ri;
    data[o] = rg.caps.length; data[o + 1] = rg.arms; data[o + 2] = rg.variant; data.set(regionFades(rg), o + 4 * 3);
    rg.caps.forEach((c, ci) => {
      data[o + 4 * 1 + ci] = c.mate;   // texels 1 and 2: the mates
      for (let q = 0; q < REGION_PTS; q++) data[o + 4 * REGION_HEAD + ci * REGION_PTS + q] = c.bones[q]!;
    });
    const partner = regions.findIndex((o, oi) => oi !== ri && o.node === rg.node);
    data[o + 4 * 4 + 2] = partner + 1;   // texel 4.z: the node's other fillet mesh (body/map), +1; the extensions' share is the sum of the two
    const kr = keys?.region[ri];
    if (kr) { data[o + 4 * 4] = kr.nk; data[o + 4 * 4 + 1] = kr.header; }
    // a vertex with keys carries its key slot above the region's 6 bits (the shader reads `region` as row + 64 * slot)
    for (let v = rg.vertStart; v < rg.vertStart + rg.vertCount; v++) vertexRegion[v] = ri + (kr ? KEY_RIDX * (kr.first + v - rg.vertStart) : 0);
  });
  // an extension vertex (an arm's tube from its seam to the node) carries -2 - the row of its node's first region: its fillet's share hides or insets it
  if (ext) for (let v = 0; v < ext.length && v < vertexCount; v++) if (ext[v]! >= 0 && vertexRegion[v]! < -0.5) vertexRegion[v] = -2 - ext[v]!;
  return { data, width: REGION_TEXELS, height, vertexRegion };
}

/** The region row of each EXTENSION vertex (-1: not one): a vertex whose every bone lies on one arm of a junction, strictly between the node and the arm's seam (the arms run on past their seam rings to the node, net/mesh.ts). Rows are those of `regionsOf(skel, nodes)`. */
export function extensionRows(skel: Skeleton, mesh: { bone: ArrayLike<number>; weight: ArrayLike<number> }, nodes: readonly NodeReport[]): Int32Array {
  const V = mesh.bone.length / 4, out = new Int32Array(V).fill(-1);
  // per (edge, row): the end the node is at and the seam's distance from it
  const arms: { edge: number; first: number; count: number; end: 0 | 1; seam: number; row: number }[] = [];
  let row = 0;
  for (const n of nodes) {
    if (n.kind !== 'junction' || !n.caps) continue;
    const myRow = row++;
    if (n.variant === 1 && nodes.some((o) => o !== n && o.node === n.node && o.kind === 'junction' && o.caps && (o.variant ?? 0) !== 1)) continue;   // (one set of arms per node: the body's, else the first)
    n.arms.forEach((edge, i) => {
      const e = skel.edges[edge]!, [first, count] = e.bones, p0 = n.caps![i]!.pts, d0 = Math.hypot(skel.bones[first]!.pos[0][0] - p0[0]!, skel.bones[first]!.pos[0][1] - p0[1]!, skel.bones[first]!.pos[0][2] - p0[2]!), b1 = skel.bones[first + count - 1]!, d1 = Math.hypot(b1.pos[0][0] - p0[0]!, b1.pos[0][1] - p0[1]!, b1.pos[0][2] - p0[2]!);
      arms.push({ edge, first, count, end: d0 <= d1 ? 0 : 1, seam: n.seams[i]!, row: myRow });
    });
  }
  const byEdge = new Map<number, typeof arms>();
  for (const a of arms) (byEdge.get(a.edge) ?? byEdge.set(a.edge, []).get(a.edge)!).push(a);
  const fillet = new Uint8Array(V);   // (a fillet's own vertices, of any region, are never extensions)
  for (const n of nodes) if (n.kind === 'junction' && n.caps) for (let v = n.vertStart; v < n.vertStart + n.vertCount && v < V; v++) fillet[v] = 1;
  for (let v = 0; v < V; v++) {
    if (fillet[v]) continue;
    let cand: typeof arms | undefined, ok = true, any = false;
    for (let j = 0; j < 4 && ok; j++) {
      if (!(mesh.weight[4 * v + j]! > 0)) continue;
      any = true;
      const b = skel.bones[mesh.bone[4 * v + j]!]!;
      const as = byEdge.get(b.edge);
      if (!as) { ok = false; break; }
      cand = (cand ?? as).filter((a) => { const d = a.end === 0 ? mesh.bone[4 * v + j]! - a.first : a.first + a.count - 1 - mesh.bone[4 * v + j]!; return d < a.seam; });
      if (!cand.length) ok = false;
    }
    if (ok && any && cand && cand.length) out[v] = cand[0]!.row;
  }
  return out;
}


// ---- THE KEYED START of a wide junction (plan owner, 22 Nov; net/keys.ts bakes the keys): the fillet vertex starts from the NORMALISED BLEND OF THE KEYS' offsets (weights 1 / (distance + 0.001)^2, the distance in log space between the arms' live lumens and each key's), then the projection as always.
// A key's offsets are in the bones' frames over the radius the key was baked at, so each is multiplied by its arm's swell over the bake scale (the key's radius over the mesh's) per bone: the blend is then one more offset set, and the vertex stage's start is unchanged.
// keyTex (RGBA32F, KEY_W wide): one SLOT per row quarter (KEY_COLS slots across), a slot is KEY_MAX keys x KEY_TEX texels (the body offsets over 3 texels, the map's over 3). A region's header slot holds the ln lumen of each (key, arm) four to a texel (1e9: the arm is not one of the key's).
export const KEY_MAX = 6, KEY_TEX = 6, KEY_COLS = 4, KEY_W = KEY_MAX * KEY_TEX * KEY_COLS, KEY_RIDX = 64, KEY_NONE = 1e9;
/** The keys of one region as the bake stores them (net/keys.ts RegionKeys, the part read here). */
export interface RegionKeysIn { node: string; variant: 0 | 1; vertStart: number; vertCount: number; arms: readonly number[]; keys: readonly { swell: readonly number[]; offset: Float32Array; offsetMap: Float32Array }[] }
export interface KeyPlan { data: Float32Array; width: number; height: number; /** per region: the key count, the header slot and the slot of its first vertex (null: no keys) */ region: ({ nk: number; header: number; first: number } | null)[] }
/** keyTex (the plan's data), from the skeleton (its own radii: a key's lumen is the bone's radius times the key's swell), the regions, the bake's keys and the mesh's bone blend and bake scale. */
export function keyPlan(skel: { bones: readonly { edge: number; r: readonly number[] }[] }, regions: readonly Region[], keys: readonly RegionKeysIn[] | undefined, mesh: { bone: ArrayLike<number>; weight: ArrayLike<number> }, bakeScale: ArrayLike<number>): KeyPlan {
  const region: KeyPlan['region'] = regions.map(() => null), rows: { slot: number; fill: (d: Float32Array, x0: number, y: number) => void }[] = [];
  let slot = 1;   // (slot 0 means no keys: the vertex attribute carries slot >= 1)
  regions.forEach((rg, ri) => {
    const rk = keys?.find((k) => k.node === rg.node && k.variant === rg.variant && k.vertStart === rg.vertStart && k.vertCount === rg.vertCount);
    if (!rk || !rk.keys.length) return;
    const nk = Math.min(KEY_MAX, rk.keys.length), header = slot++, first = slot;
    slot += rg.vertCount;
    region[ri] = { nk, header, first };
    // the ln lumen of (key, arm): the arm's first bone's radius times the key's swell (= the baked radius times the swell over the bake scale)
    const lnKey = new Float32Array(KEY_MAX * 8).fill(KEY_NONE);
    for (let k = 0; k < nk; k++) for (let a = 0; a < Math.min(rg.arms, 8); a++) {
      const b = rg.caps[a]!.bones[0]!, e = skel.bones[b]!.edge, ai = rk.arms.indexOf(e);
      if (ai >= 0) lnKey[k * 8 + a] = Math.log(skel.bones[b]!.r[0]! * rk.keys[k]!.swell[ai]!);
    }
    rows.push({ slot: header, fill: (d, x0, y) => { for (let i = 0; i < KEY_MAX * 8; i++) d[4 * ((y) * KEY_W + x0 + (i >> 2)) + (i & 3)] = lnKey[i]!; } });
    for (let v = 0; v < rg.vertCount; v++) rows.push({ slot: first + v, fill: (d, x0, y) => {
      const gv = rg.vertStart + v;
      for (let k = 0; k < nk; k++) for (const [src, tex0] of [[rk.keys[k]!.offset, 0], [rk.keys[k]!.offsetMap, 3]] as const) for (let j = 0; j < 4; j++) {
        const wb = mesh.weight[4 * gv + j]!, e = skel.bones[mesh.bone[4 * gv + j]!]!.edge, ai = rk.arms.indexOf(e);
        const f = wb > 0 && ai >= 0 ? rk.keys[k]!.swell[ai]! / (bakeScale[e] ?? 1) : 1;
        for (let q = 0; q < 3; q++) { const idx = 3 * j + q; d[4 * (y * KEY_W + x0 + k * KEY_TEX + tex0 + (idx >> 2)) + (idx & 3)] = f * src[12 * v + idx]!; }
      }
    } });
  });
  const height = Math.max(1, Math.ceil(slot / KEY_COLS)), data = new Float32Array(4 * KEY_W * height);
  for (const r of rows) r.fill(data, (r.slot % KEY_COLS) * KEY_MAX * KEY_TEX, Math.floor(r.slot / KEY_COLS));
  return { data, width: KEY_W, height, region };
}
/** The weights of the keys at the arms' live ln lumens (what the vertex stage computes): 1 / (distance + 0.001)^2 over the arms the key has, normalised. */
export function keyWeights(lnLive: ArrayLike<number>, lnKey: ArrayLike<number>, nk: number, arms: number): number[] {
  const w: number[] = [];
  for (let k = 0; k < nk; k++) { let d2 = 0; for (let a = 0; a < arms; a++) { const lk = lnKey[k * 8 + a]!; if (lk < 1e8) d2 += (lnLive[a]! - lk) ** 2; } w.push(1 / (Math.sqrt(d2) + 0.001) ** 2); }
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / s);
}
