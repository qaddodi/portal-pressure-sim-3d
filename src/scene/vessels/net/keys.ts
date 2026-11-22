// THE KEYED START of a wide junction (plan owner, 22 Nov, "Rulings on the bake radius"): a region whose arms swell over more than 2:1 carries up to four KEYS, each the fillet fitted to one real state of its arms' radii. The shader starts a vertex
// at the normalised blend of the keys (weights by inverse log-radius distance, WP3), then projects it onto the live union as always, so a blend of fold-free keys cannot fold.
// A key is baked by CONTINUATION, not by one projection: the arms' radii ramp from the baked shape to the key in STEPS small steps and each step's free vertices are projected with 3 Newton steps (a direct projection folds a few triangles at a wide ratio;
// the ramp gives none). Each key is stored in the bones' frames at BOTH poses (the body's, and the map's, which ramps from the map fit), in units of the bone radius AT THE KEY'S STATE (so at that state the shader's start is the key exactly, and at another it is the key scaled by the live radii, the way `offset` is).
// Which states: the vector of every arm's swell (widthSwell of the engine's diameter) over the real states (every preset), clustered by farthest point in log space into at most MAX_KEYS keys, the largest state first.
import { fitCaps, fitK, boundPositions, offsetsAt, project, type FitDone, type FitMesh } from './fit.ts';
import { sdUnionGrad } from './junction/sdf.ts';
import { relax } from './relax.ts';
import { runKeyJobs } from './keys-pool.ts';
import type { Skeleton } from './types.ts';

export const MAX_KEYS = 4, MAX_KEYS_FOLDING = 6, KEY_STEPS = 24, NEWTON = 3, WIDE_RATIO = 2;
/** The keys of one junction region: its free vertices [vertStart, vertStart + vertCount), the edges of its arms, and per key the arms' swell and the fitted offsets (12 floats a vertex) at the body pose and at the map pose. */
export interface RegionKeys { node: string; /** the pose its mesh was built at (0 body, 1 map): a region has one entry per mesh */ variant: 0 | 1; vertStart: number; vertCount: number; arms: number[]; keys: { /** index into the states it was baked from */ state: number; /** triangles of the region that fold (face into the key's union) as baked, at the body pose and at the map pose: the fold a wide junction is reported with */ folds: [number, number]; swell: number[]; offset: Float32Array; offsetMap: Float32Array }[] }

/** Which of the states (each a vector of arm swells) are the keys: the one with the largest radii first, then each time the state farthest, in log space, from those chosen. Duplicates (within `eps` in log space) count once. */
export function pickKeys(states: readonly (readonly number[])[], max = MAX_KEYS, eps = 0.02): number[] {
  const logs = states.map((v) => v.map((x) => Math.log(Math.max(x, 1e-6))));
  const dist = (a: number[], b: number[]): number => Math.hypot(...a.map((x, i) => x - b[i]!));
  const chosen: number[] = [];
  let first = 0;
  logs.forEach((l, i) => { if (l.reduce((a, b) => a + b, 0) > logs[first]!.reduce((a, b) => a + b, 0)) first = i; });
  if (!logs.length) return chosen;
  chosen.push(first);
  while (chosen.length < max) {
    let best = -1, far = eps;
    logs.forEach((l, i) => { const d = Math.min(...chosen.map((c) => dist(l, logs[c]!))); if (d > far) { far = d; best = i; } });
    if (best < 0) break;
    chosen.push(best);
  }
  return chosen;
}

/** The triangles of a region (local vertex positions `pos`, 3 per `rg.verts`) that face into the union of the capsules `caps` blended at `k`. */
export function foldCount(rg: { verts: number[]; tris: number[] }, pos: Float64Array, caps: Parameters<typeof sdUnionGrad>[0], k: number): number {
  const loc = new Map(rg.verts.map((v, q) => [v, q])), g = new Float64Array(3);
  let n = 0;
  for (let t = 0; t < rg.tris.length; t += 3) {
    const a = loc.get(rg.tris[t]!)!, b = loc.get(rg.tris[t + 1]!)!, c = loc.get(rg.tris[t + 2]!)!, e1 = [0, 1, 2].map((q) => pos[3 * b + q]! - pos[3 * a + q]!), e2 = [0, 1, 2].map((q) => pos[3 * c + q]! - pos[3 * a + q]!);
    const nx = e1[1]! * e2[2]! - e1[2]! * e2[1]!, ny = e1[2]! * e2[0]! - e1[0]! * e2[2]!, nz = e1[0]! * e2[1]! - e1[1]! * e2[0]!, cx = [0, 1, 2].map((q) => (pos[3 * a + q]! + pos[3 * b + q]! + pos[3 * c + q]!) / 3);
    sdUnionGrad(caps, k, cx[0]!, cx[1]!, cx[2]!, g);
    if (nx * g[0]! + ny * g[1]! + nz * g[2]! < 0) n++;
  }
  return n;
}

/** A region is wide when any arm's swell spans more than WIDE_RATIO over the states. */
export function isWide(states: readonly (readonly number[])[], arms: number): boolean {
  for (let a = 0; a < arms; a++) { let lo = Infinity, hi = 0; for (const s of states) { lo = Math.min(lo, s[a]!); hi = Math.max(hi, s[a]!); } if (hi > WIDE_RATIO * lo) return true; }
  return false;
}

/** One key at one pose by continuation: the radii factor per edge ramps from 1 (the baked shape) to `fKey`; the seam rings follow the bones, the free vertices are projected onto each step's union. Returns the region's vertex positions (3 per `rg.verts`). */
export function continueTo(skel: Skeleton, m: FitMesh, d: FitDone, pose: 0 | 1, fKey: Float64Array, steps = KEY_STEPS): Float64Array {
  const { rg } = d, V = rg.verts.length, free = rg.verts.map((v) => v >= rg.free[0] && v < rg.free[0] + rg.free[1]);
  const pos = Float64Array.from(d.at[pose]), fs = new Float64Array(fKey.length), ring = pose === 1 ? m.offset : m.offset;
  const local = new Map(rg.verts.map((v, q) => [v, q])), tris = rg.tris.map((v) => local.get(v)!), fixed = Uint8Array.from(free, (f) => (f ? 0 : 1));
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    for (let e = 0; e < fs.length; e++) fs[e] = 1 + (fKey[e]! - 1) * t;
    const caps = fitCaps(skel, rg, pose, -1, fs), kk = fitK(skel, rg, pose, -1, fs), tube = boundPositions(skel, m, rg, pose, ring, fs);
    for (let q = 0; q < V; q++) {
      if (!free[q]) { pos[3 * q] = tube[3 * q]!; pos[3 * q + 1] = tube[3 * q + 1]!; pos[3 * q + 2] = tube[3 * q + 2]!; } else project(caps, kk, pos, 3 * q, NEWTON);
    }
    // the ramp keeps the fillet on the step's surface but bunches its triangles where an arm swells: a round of the fit's own relaxation (fold guard on, seam rings fixed) after each step, ten at the key
    relax({ pos, tris, fixed, caps, k: kk }, { rounds: k === steps ? 10 : 1, pull: 0.5, soft: 0 });
  }
  return pos;
}

/**
 * The keys of every wide junction region. `states[p][e]` is edge e's swell in real state p (live width over the width it was built at), `bakeScale[e]` the factor the mesh was baked at (ranges.ts): a key's radii relative to the baked bones are swell / bakeScale.
 * Every region gets keys (a region with one real state gets one).
 */
export function regionKeys(skel: Skeleton, m: FitMesh, done: readonly FitDone[], states: readonly (readonly number[])[], bakeScale: ArrayLike<number>, armEdges: (node: string) => number[], workers = 0): RegionKeys[] {
  const arms = done.map((d) => armEdges(d.node));
  // (the regions are independent of one another: a bake spreads them over worker threads, the same keys in the same order; keys-pool.ts)
  const spread = workers > 1 && done.length > 1 ? runKeyJobs({ skel, m, done, arms, states, bakeScale: Array.from(bakeScale) }, workers) : null;
  return spread ?? done.map((d, i) => regionKeysOf(skel, m, d, arms[i]!, states, bakeScale));
}

/** The keys of one junction region (`arms`: the edges of its arms). */
export function regionKeysOf(skel: Skeleton, m: FitMesh, d: FitDone, arms: number[], states: readonly (readonly number[])[], bakeScale: ArrayLike<number>): RegionKeys {
  const vec = states.map((s) => arms.map((e) => s[e]!));
  const wide = isWide(vec, arms.length);   // (every region is keyed from its own real states; a wide one may carry up to MAX_KEYS_FOLDING, plan owner 22 Nov)
  // up to MAX_KEYS keys; a region whose keys still fold gets up to MAX_KEYS_FOLDING (plan owner, 22 Nov), and any fold left is recorded on its key
  const baked = new Map<number, RegionKeys['keys'][number]>();   // (a second, longer pick starts with the first one's states: each state is continued once)
  const bake = (picked: number[]): RegionKeys['keys'] => picked.map((p) => {
    const have = baked.get(p);
    if (have) return have;
    const s = states[p]!, fKey = new Float64Array(skel.edges.length).map((_, e) => (s[e] ?? 1) / bakeScale[e]!), folds: [number, number] = [0, 0];
    const key = (pose: 0 | 1): Float32Array => {
      const pos = continueTo(skel, m, d, pose, fKey), off = offsetsAt(skel, m, d.rg, pose, pos, fKey), n = d.rg.free[1], res = new Float32Array(12 * n);
      folds[pose] = foldCount(d.rg, pos, fitCaps(skel, d.rg, pose, -1, fKey), fitK(skel, d.rg, pose, -1, fKey));
      d.rg.verts.forEach((v, q) => { if (v >= d.rg.free[0] && v < d.rg.free[0] + n) res.set(off.subarray(12 * q, 12 * q + 12), 12 * (v - d.rg.free[0])); });
      return res;
    };
    const made = { state: p, folds, swell: arms.map((e) => s[e]!), offset: key(0), offsetMap: key(1) };
    baked.set(p, made);
    return made;
  });
  let keys = bake(pickKeys(vec, wide ? MAX_KEYS_FOLDING : MAX_KEYS));
  const own = d.variant === 1 ? 1 : 0, foldsOf = (ks: RegionKeys['keys']): number => ks.reduce((a, k) => a + k.folds[own], 0);   // (a mesh is judged at the layout it was built at)
  if (foldsOf(keys) > 0 && !wide) { const more = bake(pickKeys(vec, MAX_KEYS_FOLDING)); if (foldsOf(more) < foldsOf(keys) || more.length > keys.length) keys = more; }
  return { node: d.node, variant: d.variant, vertStart: d.rg.free[0], vertCount: d.rg.free[1], arms, keys };
}
