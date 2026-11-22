// The test-only CPU twin of the network vertex shader (src/scene/vessels/net/shaders.ts NET_VS), line for line: the live radius, the morph's share and frame, the fade, and the bone blend
//     p = sum w_i (centre_i + frame_i * offset_i * R_i)        n = normalize(sum w_i frame_i * normal_i)
// It is an ORACLE for the node checks of tests/net-deform.test.ts and is never shipped. THE GLSL IS NOT RUN HERE (no GPU, no headless browser: the owner's rule): glslang compiles and links the shader (tests/glsl-compile.test.ts) and this twin
// is held to the shader by reading, so a rule changed in one must be changed in the other. The things the shader takes from the old tube shader (swellOf, circWidthOf, stumpK, the fade, the highlight, the peel) are the old shader's own GLSL; their JS
// twins (live-width.ts widthSwell, width.ts circuitWidthMap, fade-alpha.ts, peel.ts) are what this file calls.
import type { Vec3 } from '../src/scene/anatomy/vessels.ts';
import type { NetMesh, Skeleton } from '../src/scene/vessels/net/types.ts';
import type { NodeReport } from '../src/scene/vessels/net/mesh.ts';
import type { Region } from '../src/scene/vessels/net/regions.ts';
import { SKIN_K, closestOnArm, sdUnion, sdUnionGrad, type Capsule } from '../src/scene/vessels/skin/sdf.ts';
import { SKIN_RING_W_FROM, SKIN_SHADE_K } from '../src/scene/vessels/skin/exact-normal.ts';
import { peelAt, peelRank, peelSlope, PEEL_SPAN } from '../src/scene/circuit/peel.ts';
import { MAP_K, sceneToMap } from '../src/scene/circuit/map.ts';

export type V3 = [number, number, number];
const add = (a: Vec3, b: Vec3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: Vec3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-9))); return t * t * (3 - 2 * t); };

/** What the edge-state row and the globals say about one edge, as the shader's `loadEdgeVS` reads it (already evaluated: the engine's diameter is behind `swell`). */
export interface LiveEdge {
  /** the engine's live width over the width the tube was built at (swellOf; 1 at rest) */
  swell: number;
  /** the vessel's width on the map in map units before the least width (circWidthOf or its fixed width) */
  wc: number;
  /** the least width on the screen, CSS px (circW.w) */
  leastCss: number;
  liveW: number;
  presence: number;
  /** a flat fade (fadeMode 0 with a constant alpha), what the junction blend is checked against */
  fade: number;
  noMap?: boolean;
  /** the vessel's nominal radius, scene units */
  radiusN: number;
}
export const restEdge = (radiusN: number): LiveEdge => ({ swell: 1, wc: 6, leastCss: 0, liveW: 1, presence: 1, fade: 1, radiusN });

export interface LiveState {
  circT: number;
  /** map units under one CSS pixel (big when zoomed out) */
  perPx: number;
  /** the outline's ink width in scene units (the figure's line, 1.5 CSS px, at the test's camera) and the ring polygon's sag (shaders.ts TUBE_SAG): both push along the normal; 0 leaves them out */
  ink?: number;
  sag?: number;
  edges: LiveEdge[];
}

export interface LiveBone {
  cen: V3; F: [V3, V3, V3];
  /** the lumen's half width, scene units, and the radius a vertex's unit offset is scaled by (here: the lumen's, ink and ring sag are not modelled) */
  lumen: number;
  /** the radius a vertex's unit offset is scaled by when the junction vertex STARTS (before the projection onto the live union): the course's own radius share, with no swell, width or presence, so a fillet vertex keeps its rest arrangement and the projection alone follows the live radii */
  lumenRest: number;
  /** what the surface is pushed out along its normal: the ink, the ring's sag, (the lift is 0 here) */
  pad: number;
  share: number; fade: number; presence: number; u: number; edge: number;
}

/** The smallest rotation that takes the frame's tangent to T, applied to the frame (the shader's frameTo). */
export function frameTo(F: readonly [V3, V3, V3], T: V3): [V3, V3, V3] {
  const t0 = F[0], c = dot(t0, T);
  if (c > 0.99999) return [T, F[1], F[2]];
  if (c < -0.9999) return [mul(F[0], -1), mul(F[1], -1), F[2]];
  const ax = cross(t0, T), k = 1 / (1 + c);
  const rot = (v: V3): V3 => add(add(mul(v, c), cross(ax, v)), mul(ax, dot(ax, v) * k));
  return [T, rot(F[1]), rot(F[2])];
}

/** Every bone's live state (the shader's netBone). */
export function liveBones(skel: Skeleton, live: LiveState): LiveBone[] {
  const out: LiveBone[] = [];
  skel.bones.forEach((B, bi) => {
    const E = live.edges[B.edge]!, [first, count] = skel.edges[B.edge]!.bones, k = bi - first, A = B.pos[0], M = B.pos[1];
    let w = 0, cen: V3 = [...A], F: [V3, V3, V3] = [B.frame[0], B.frame[1], B.frame[2]];
    if (live.circT > 0 && !E.noMap) {
      const rank = peelRank(sceneToMap(M[0], M[1])[0]);
      w = peelAt(live.circT, rank);
      cen = [0, 1, 2].map((d) => A[d]! + (M[d]! - A[d]!) * w) as V3;
      const p = skel.bones[first + Math.max(0, k - 1)]!, n = skel.bones[first + Math.min(count - 1, k + 1)]!;
      const du = Math.max(n.u - p.u, 1e-6);
      const dA = mul(sub(n.pos[0], p.pos[0]), 1 / du), dM = mul(sub(n.pos[1], p.pos[1]), 1 / du);
      const rs = rank > 0 && rank < 1 ? dM[0] / MAP_K / PEEL_SPAN : 0;
      const Tm = add(add(mul(dA, 1 - w), mul(dM, w)), mul(sub(M, A), peelSlope(live.circT, rank) * rs));
      F = frameTo(B.frame, dot(Tm, Tm) > 1e-9 ? norm(Tm) : B.frame[0]);
    }
    const share = w;
    const swell = E.swell + (Math.max(E.wc, E.leastCss * live.perPx) * 0.5 * MAP_K / Math.max(E.radiusN, 1e-6) - E.swell) * share;
    const rest = B.r[0] + (B.r[1] - B.r[0]) * share;
    const lumen = rest * swell * E.liveW * E.presence, ink = live.ink ?? 0;
    out.push({ cen, F, lumen, lumenRest: rest, pad: ink + (lumen + ink) * (live.sag ?? 0), share, fade: E.fade * E.presence, presence: E.presence, u: B.u, edge: B.edge });
  });
  return out;
}

/** Positions of the bound mesh in a live state (the shader's main: no ink, no ring sag). `normal` (4 x vec3, in each bone's frame) gives the blended normals as well. */
export function deformLive(mesh: NetMesh, skel: Skeleton, live: LiveState, normal: Float32Array | undefined = mesh.normal, restStart?: ArrayLike<number>): { position: Float32Array; normal: Float32Array; fade: Float32Array; blend: Float32Array; rowA: Int32Array; rowB: Int32Array } {
  const bones = liveBones(skel, live), V = mesh.position.length / 3;
  const position = new Float32Array(3 * V), nrm = new Float32Array(3 * V), fade = new Float32Array(V), blend = new Float32Array(V), rowA = new Int32Array(V), rowB = new Int32Array(V);
  for (let v = 0; v < V; v++) {
    const p: V3 = [0, 0, 0], n: V3 = [0, 0, 0], pB: V3 = [0, 0, 0], pM: V3 = [0, 0, 0];
    let S = 0, pad = 0, wA = -1, wB = -1, eA = 0, eB = 0, f = 0;
    for (let i = 0; i < 4; i++) {
      const wk = mesh.weight[4 * v + i]!;
      if (!(wk > 0)) continue;
      const b = bones[mesh.bone[4 * v + i]!]!, at = (set: Float32Array): V3 => [set[12 * v + 3 * i]!, set[12 * v + 3 * i + 1]!, set[12 * v + 3 * i + 2]!];
      const fr = (o: V3): V3 => add(add(mul(b.F[0], o[0]), mul(b.F[1], o[1])), mul(b.F[2], o[2])), off = fr(at(mesh.offset)), offM = fr(at(mesh.offsetMap ?? mesh.offset));
      S += wk * b.share;
      for (let d = 0; d < 3; d++) { p[d] += wk * b.cen[d]!; const sc = restStart && restStart[v]! >= 0 ? b.lumenRest : b.lumen; pB[d] += wk * sc * off[d]!; pM[d] += wk * sc * offM[d]!; }
      if (normal) { const q: V3 = [normal[12 * v + 3 * i]!, normal[12 * v + 3 * i + 1]!, normal[12 * v + 3 * i + 2]!]; const nn = add(add(mul(b.F[0], q[0]), mul(b.F[1], q[1])), mul(b.F[2], q[2])); for (let d = 0; d < 3; d++) n[d] += wk * nn[d]!; }
      pad += wk * b.pad;
      f += wk * b.fade;
      if (wk > wA) { wB = wA; eB = eA; wA = wk; eA = b.edge; } else if (wk > wB) { wB = wk; eB = b.edge; }
    }
    for (let d = 0; d < 3; d++) p[d] += pB[d]! + (pM[d]! - pB[d]!) * Math.min(1, Math.max(0, S));
    const nu = norm(n);
    position.set([p[0] + nu[0] * pad, p[1] + nu[1] * pad, p[2] + nu[2] * pad], 3 * v); nrm.set(nu, 3 * v); fade[v] = f; blend[v] = wB > 0 ? wB / (wA + wB) : 0; rowA[v] = eA; rowB[v] = wB > 0 ? eB : eA;
  }
  return { position, normal: nrm, fade, blend, rowA, rowB };
}

/** Area-weighted vertex normals of a triangle mesh (a finite-difference normal of the surface). */
export function meshNormals(position: ArrayLike<number>, index: ArrayLike<number>): Float32Array {
  const V = position.length / 3, acc = new Float64Array(3 * V);
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t]!, b = index[t + 1]!, c = index[t + 2]!;
    const e1: V3 = [position[3 * b]! - position[3 * a]!, position[3 * b + 1]! - position[3 * a + 1]!, position[3 * b + 2]! - position[3 * a + 2]!], e2: V3 = [position[3 * c]! - position[3 * a]!, position[3 * c + 1]! - position[3 * a + 1]!, position[3 * c + 2]! - position[3 * a + 2]!];
    const fn = cross(e1, e2);
    for (const v of [a, b, c]) for (let d = 0; d < 3; d++) acc[3 * v + d]! += fn[d]!;
  }
  const out = new Float32Array(3 * V);
  for (let v = 0; v < V; v++) out.set(norm([acc[3 * v]!, acc[3 * v + 1]!, acc[3 * v + 2]!]), 3 * v);
  return out;
}

/** The angle between two unit vectors, degrees. */
export const angleDeg = (a: ArrayLike<number>, ia: number, b: ArrayLike<number>, ib: number): number =>
  (Math.acos(Math.min(1, Math.max(-1, a[ia]! * b[ib]! + a[ia + 1]! * b[ib + 1]! + a[ia + 2]! * b[ib + 2]!))) * 180) / Math.PI;
export { smooth };

/** The live arms of a junction as capsules (their axis the live bone centres out from the junction, their radius the live lumen), the two halves of a run-on marked as mates: the smooth union the fillet is meant to follow.
 *  A merged region (short edges between junctions) has no node of its own: each arm's end is the one nearer the region's rest vertices. */
export function junctionCapsules(skel: Skeleton, rep: NodeReport, bones: readonly LiveBone[], mesh: NetMesh): { caps: Capsule[]; k: number } {
  const c: V3 = [0, 0, 0];
  for (let v = rep.vertStart; v < rep.vertStart + rep.vertCount; v++) for (let d = 0; d < 3; d++) c[d] += mesh.position[3 * v + d]! / rep.vertCount;
  const caps: Capsule[] = [], ends: (0 | 1)[] = [];
  rep.arms.forEach((edge, i) => {
    const [first, count] = skel.edges[edge]!.bones, K = Math.min(count - 1, rep.seams[i]! + 3);
    const d0 = Math.hypot(...sub(skel.bones[first]!.pos[0], c)), d1 = Math.hypot(...sub(skel.bones[first + count - 1]!.pos[0], c)), end: 0 | 1 = d0 <= d1 ? 0 : 1;
    ends.push(end);
    const idx: number[] = [];
    for (let m = 0; m <= K; m++) idx.push(first + (end === 0 ? m : count - 1 - m));
    const pts = new Float64Array(3 * idx.length), r = new Float64Array(idx.length);
    idx.forEach((bi, j) => { pts.set(bones[bi]!.cen, 3 * j); r[j] = bones[bi]!.lumen; });
    caps.push({ n: idx.length, pts, r });
  });
  const node = skel.nodes.find((n) => n.id === rep.node);
  if (node?.runOn) {
    const a = rep.arms.indexOf(node.edges[node.runOn[0]]!.edge), b = rep.arms.indexOf(node.edges[node.runOn[1]]!.edge);
    if (a >= 0 && b >= 0) { const lo = Math.min(a, b), hi = Math.max(a, b); caps[lo] = { ...caps[lo]!, mate: hi }; caps[hi] = { ...caps[hi]!, mate: lo }; }
  }
  return { caps, k: SKIN_K * Math.min(...caps.map((q) => q.r[0]!)) };
}

/** The SHADE normal at a point of the deformed mesh, by the mesher's own recipe (net/mesh.ts, rest normal): the unit gradient of the live smooth union at the soft width (SKIN_SHADE_K times the fillet's k), eased to the dominant arm's radial
 *  direction where one arm is nearly all there is (`wmax`, the largest weight, smoothstep 0.6 .. SKIN_RING_W_FROM). */
export function shadeNormalAt(caps: readonly Capsule[], k: number, x: number, y: number, z: number, wmax: number): V3 {
  const g = [0, 0, 0], cp = new Float64Array(7);
  sdUnionGrad(caps, SKIN_SHADE_K * k, x, y, z, g);
  const gn = norm(g as V3);
  let best = Infinity, top = 0;
  caps.forEach((q, i) => { closestOnArm(q, x, y, z, cp); const sd = cp[4]! - cp[3]!; if (sd < best) { best = sd; top = i; } });
  closestOnArm(caps[top]!, x, y, z, cp);
  const rad = norm([x - cp[0]!, y - cp[1]!, z - cp[2]!]), t = smooth(0.6, SKIN_RING_W_FROM, wmax);
  return norm([gn[0] + t * (rad[0] - gn[0]), gn[1] + t * (rad[1] - gn[1]), gn[2] + t * (rad[2] - gn[2])]);
}
export { sdUnion };

/** The named live states the deformation tests run in: rest, map, the Circuit's t = .25 / .5 / .75, a differential swell, presence .3 and zoom-out. */
export function liveStates(skel: Skeleton): [string, LiveState][] {
  const mk = (circT: number, perPx = 1, f?: (e: ReturnType<typeof restEdge>, i: number) => void): LiveState => ({ circT, perPx, edges: skel.edges.map((ed, i) => { const r = skel.bones[ed.bones[0]]!.r[0]; const x = restEdge(r); x.wc = (2 * r * 0.85) / MAP_K; f?.(x, i); return x; }) });
  return [['rest', mk(0)], ['map t=1', mk(1)], ['t=.25', mk(0.25)], ['t=.5', mk(0.5)], ['t=.75', mk(0.75)],
    ['swell 1.2/.85', mk(0, 1, (e, i) => { e.swell = i % 2 ? 0.85 : 1.2; })],
    ['swell .5/2', mk(0, 1, (e, i) => { e.swell = i % 2 ? 0.5 : 2; })],
    ['presence .3', mk(0.5, 1, (e, i) => { if (i === 1) e.presence = 0.3; })],
    ['zoom-out', mk(1, 2.5, (e) => { e.leastCss = 4; })]];
}


/** THE JUNCTION PROJECTION (review doc, WP3 ruling, implicit skinning): the CPU twin of the vertex stage's. Each fillet vertex starts at the bone blend (`d`, from `deformLive`) and is moved onto the live smooth union of its region's capsules
 *  (axes through the live bone centres, radii the live lumen, presence and swell included; k = SKIN_K x the narrowest arm's live radius at the junction) by `steps` Newton steps `p -= f grad f / |grad f|^2`; its normal is the SHADE normal of that union
 *  (the soft gradient, eased to the nearest arm's radial direction where one arm is nearly all there is, as the mesher's rest normal is). Tube vertices are untouched. */
export function projectRegions(mesh: NetMesh, skel: Skeleton, regions: readonly Region[], live: LiveState, d: { position: Float32Array; normal: Float32Array }, steps = 3): { position: Float32Array; normal: Float32Array; /** the unit gradient of the union at the sharp width k, the direction the ink hull, the ring's sag and the lift push along (the SURFACE's normal, not the soft shade one) */ push: Float32Array; moved: Float32Array; regionOf: Int32Array; k: number[] } {
  const bones = liveBones(skel, live), push = new Float32Array(d.normal), position = Float32Array.from(d.position), normal = Float32Array.from(d.normal), V = position.length / 3, moved = new Float32Array(V), regionOf = new Int32Array(V).fill(-1), ks: number[] = [];
  regions.forEach((rg, ri) => {
    const caps: Capsule[] = rg.caps.map((c) => { const pts = new Float64Array(3 * c.bones.length), r = new Float64Array(c.bones.length); c.bones.forEach((bi, j) => { pts.set(bones[bi]!.cen, 3 * j); r[j] = bones[bi]!.lumen; }); return { n: c.bones.length, pts, r, mate: c.mate >= 0 ? c.mate : undefined }; });
    const k = SKIN_K * Math.min(...rg.caps.slice(0, rg.arms).map((c) => bones[c.bones[0]!]!.lumen));
    ks.push(k);
    const g = [0, 0, 0];
    for (let v = rg.vertStart; v < rg.vertStart + rg.vertCount; v++) {
      regionOf[v] = ri;
      const x = [position[3 * v]!, position[3 * v + 1]!, position[3 * v + 2]!], x0 = [...x];
      for (let s = 0; s < steps; s++) {
        const f = sdUnionGrad(caps, k, x[0]!, x[1]!, x[2]!, g), l2 = g[0]! ** 2 + g[1]! ** 2 + g[2]! ** 2;
        if (l2 > 1e-12) for (let q = 0; q < 3; q++) x[q]! -= (f * g[q]!) / l2;
      }
      { const gl = Math.hypot(g[0]!, g[1]!, g[2]!) || 1; push.set([g[0]! / gl, g[1]! / gl, g[2]! / gl], 3 * v); }
      position.set(x, 3 * v);
      moved[v] = Math.hypot(x[0]! - x0[0]!, x[1]! - x0[1]!, x[2]! - x0[2]!);
      const ws = new Map<number, number>();
      for (let i = 0; i < 4; i++) { const e = skel.bones[mesh.bone[4 * v + i]!]!.edge; ws.set(e, (ws.get(e) ?? 0) + mesh.weight[4 * v + i]!); }
      normal.set(shadeNormalAt(caps, k, x[0]!, x[1]!, x[2]!, Math.max(...ws.values())), 3 * v);
    }
  });
  return { position, normal, push, moved, regionOf, k: ks };
}

/** The whole junction pose as the vertex stage computes it: the bone blend of the two offset sets with the junction vertices STARTED at the rest arrangement (`lumenRest`), then the projection and the shade normal. */
export function junctionPose(mesh: NetMesh, skel: Skeleton, regions: readonly Region[], live: LiveState): ReturnType<typeof projectRegions> & { start: ReturnType<typeof deformLive> } {
  const V = mesh.position.length / 3, regionOf = new Int32Array(V).fill(-1);
  for (const [ri, rg] of regions.entries()) for (let v = rg.vertStart; v < rg.vertStart + rg.vertCount; v++) regionOf[v] = ri;
  const start = deformLive(mesh, skel, live, mesh.normal, regionOf);
  return { ...projectRegions(mesh, skel, regions, live, start), start };
}
