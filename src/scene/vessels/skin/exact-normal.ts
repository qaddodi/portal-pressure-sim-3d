// THE SKIN'S SHADING NORMAL, EXACT PER PIXEL (Mohammad, 20 Nov: "ragged torn edge" where the hepatic veins meet the cava, a dark polygon with straight sides in the cel shade, the pale pinch at the PV fork). The cel shade is a HARD
// threshold of n.L and the lens lanes and the dust read the normal's across: all of them are contours of the normal. The skin handed the fragment stage its vertices' normals, INTERPOLATED over a triangle. A triangle spans
// the fillet where two arms meet, where the true normal turns 30 to 60 degrees in a few pixels, so the interpolated one is wrong by up to 56 degrees (p99 18 to 35 on every skin; tests/skin-exact-normal.test.ts measures it)
// and every contour of it is a polygon with corners at the triangles. ROOT CAUSE: a function with a crease in it (the smooth union's gradient) was sampled at the vertices and lerped. So the pixel takes the gradient of the
// smooth union itself, the very function the vertices' normals were sampled from (sdf.ts sdUnionGrad: the chain rule through the pairwise smooth-min), from the arms' four axis points and radii it already holds: on a seam ring
// one arm is all there is and it is that arm's own tube normal, in a crease it is the crease. Pure arithmetic on uniforms and the pixel's rest position: no derivative, no texture, no branch on a pixel's neighbour.
/** The blend width the SHADE reads the union at, in times the skin's own k. At a crotch the true gradient turns 50 to 140 degrees in a fillet a few pixels wide, and a hard two-tone band there is a dark line (the 2D figure hid it by easing the shade toward
 *  the neighbour): the mesh used to do that by easing a sharp vertex's normal toward its neighbours', which depends on how the triangles happen to lie. The same softening as a property of the SURFACE: the gradient of the union blended 1.5 times wider. Measured
 *  against those eased vertex normals over every skin: 8 degrees at p90, 16 at p99 (tests/skin-exact-normal.test.ts), from 3 degrees p50 at 2x and 7 at 3x. The outline and the weights keep k. */
// 1, the surface's own blend (it was 1.5 on the 2D figure) (Mohammad, 24 Nov, iPhone: the portal fork read as a blob, darker patches coming in from both sides of the crotch; the hepatic veins' mouths on the cava heavy with shade). ROOT CAUSE: the shade read the
// gradient of a union 1.5 times wider than the surface drawn, so across every fillet the normal was a rounder shape's than the pixel stood on: up to 27 degrees off the surface at IVCS and 12 at PVH, tilted into the crotch, and n.L up to 0.2
// darker than the surface itself has at 17 to 60 vertices of every placed skin (tests/skin-weld-shade.test.ts). The shade is now the drawn surface's, and the screen floor below still softens a ridge narrower than two pixels.
export const SKIN_SHADE_K = 1;
/** The SHADE's blend width never drops under this many CSS pixels. A ridge between two arms whose blend (k, a few thousandths of a scene unit) is narrower than a pixel is drawn as a one-pixel line of the crotch's own normal: the dark line the exact
 *  normal was made to end, back at a small scale (a phone's fit of the whole figure, where a scene unit is few pixels). The shade reads the union at this width or its 1.5 times k, whichever is wider: at a laptop's default zoom k is already wider and nothing changes.
 *  The outline and the weights keep k (the surface does not move). */
export const SKIN_SHADE_FLOOR_PX = 2;
/** The width the shade reads the union at: `k` softened SKIN_SHADE_K times, and no narrower than SKIN_SHADE_FLOOR_PX of the screen (`scenePerCssPx`: scene units in one CSS pixel at the pixel's depth, the shader's wpc). The shader does the same sum. */
export const skinShadeK = (k: number, scenePerCssPx: number): number => Math.max(k * SKIN_SHADE_K, SKIN_SHADE_FLOOR_PX * scenePerCssPx);
/** A seam ring's normal is the TUBE's (the cut tube and the skin meet on one shade), which on the side of a crotch differs from the union's gradient by up to 13 degrees. A vertex of the ring belongs wholly to its own arm (weight 1, mesh.ts weightsAt), so the
 *  pixel keeps the lerped vertex normal where its arm's weight is within this of 1 and takes the gradient below it: a ring pixel is the tube's pixel exactly, and the hand-over is a smoothstep over the first triangle. */
export const SKIN_RING_W_FROM = 0.97;

/** The polynomial smooth-min's gradient and the arm distances, as GLSL. `kept(arm)` is the GLSL of 1.0 for an arm that is there and 0.0 for one that is not (a collapsed growing arm): it leaves the union as an arm of no width does (the shade must follow the outline's union, shaders.ts skinSdPx, or the pixels of its stub are shaded as a stub). Needs: armAxisP, armData, armCopy and swAt() declared above it; `absent(sw)` is the GLSL of SKIN_ARM_ABSENT's smoothstep (the outline's own rule). Returns the unit gradient of the union at the point `p`. */
export const skinNormalGlsl = (arms: number, SKIN_AXIS_PTS: number, absent: (sw: string) => string, kept: (arm: string) => string = () => '1.0'): string => /* glsl */ `
// one arm's signed distance to its live capsule (the radius at the closest point of its four-point axis, times the arm's live width) and the distance's gradient: sdf.ts sdArmGrad
float skinArmSd3(vec3 p, int arm, float sw, out vec3 g, out float rad) {
  float best = 1.0e20, bt = 0.0;
  int bi = 0;
  for (int s = 0; s < ${SKIN_AXIS_PTS - 1}; s++) {
    vec3 a = armAxisP[arm * ${SKIN_AXIS_PTS} + s].xyz, b = armAxisP[arm * ${SKIN_AXIS_PTS} + s + 1].xyz - a, q = p - a;
    float bb = dot(b, b), t = bb > 0.0 ? clamp(dot(q, b) / bb, 0.0, 1.0) : 0.0;
    vec3 dv = q - t * b;
    float d2 = dot(dv, dv);
    if (d2 < best) { best = d2; bt = t; bi = s; }
  }
  vec3 a0 = armAxisP[arm * ${SKIN_AXIS_PTS} + bi].xyz, bv = armAxisP[arm * ${SKIN_AXIS_PTS} + bi + 1].xyz - a0;
  float r0 = armAxisP[arm * ${SKIN_AXIS_PTS} + bi].w, r1 = armAxisP[arm * ${SKIN_AXIS_PTS} + bi + 1].w;
  float d = sqrt(best), inv = d > 1.0e-12 ? 1.0 / d : 0.0;
  g = (p - (a0 + bv * bt)) * inv;
  float bb = dot(bv, bv);
  if (bt > 0.0 && bt < 1.0 && bb > 0.0) g -= (r1 - r0) * sw / bb * bv;
  rad = mix(r0, r1, bt) * sw;
  return d - rad;
}
// the unit gradient of the smooth union of the live arms at p (sdf.ts sdUnionGrad), arm order, the two halves of a run through the node taken as the plain minimum first; fallback if there is none
vec3 skinNormalExact(vec3 p, float k, vec3 fallback) {
  float acc = 0.0;
  vec3 g = vec3(0.0);
  bool first = true;
  for (int i = 0; i < ${arms}; i++) {
    if (armData[i].x < 0.0) continue;
    float m = armCopy[i].w;
    if (m > -0.5 && m < float(i) - 0.5) continue;
    vec3 ug;
    float swi = swAt(i), rdi;
    float b = skinArmSd3(p, i, swi, ug, rdi) + 2.0 * k * (1.0 - ${absent('swi')} * ${kept('i')});
    if (m > float(i) + 0.5) {
      int mi = int(m + 0.5);
      vec3 mg;
      float swm = swAt(mi), rdm;
      float o = skinArmSd3(p, mi, swm, mg, rdm) + 2.0 * k * (1.0 - ${absent('swm')} * ${kept('mi')});
      if (o < b) { b = o; ug = mg; }
    }
    if (first) { acc = b; g = ug; first = false; continue; }
    float a = acc, raw = 0.5 + 0.5 * (b - a) / max(k, 1.0e-6), h = clamp(raw, 0.0, 1.0);
    bool inside = raw > 0.0 && raw < 1.0;
    float dfdh = a - b - k + 2.0 * k * h, dha = inside ? -0.5 / max(k, 1.0e-6) : 0.0, dhb = inside ? 0.5 / max(k, 1.0e-6) : 0.0;
    g = (h + dfdh * dha) * g + (1.0 - h + dfdh * dhb) * ug;
    acc = b + (a - b) * h - k * h * (1.0 - h);
  }
  float gl = length(g);
  return gl > 1.0e-4 ? g / gl : fallback;
}`;

// ---- the JS twin (tests/skin-exact-normal.test.ts reads it against sdf.ts) ---------------------------------------------------------------------------------------------------------------------------------------
export interface TwinArm { pts: ArrayLike<number>; r: ArrayLike<number>; mate?: number; /** the arm's live width (1 at rest) */ sw?: number; /** absent from the skin */ off?: boolean }
const absentOf = (sw: number, from: number): number => { const t = Math.min(1, Math.max(0, sw / from)); return t * t * (3 - 2 * t); };
/** The twin of skinArmSd3: the distance and its gradient (into g). */
function armSd3(a: TwinArm, x: number, y: number, z: number, sw: number, g: number[]): number {
  const P = a.pts, R = a.r, n = 4;
  let best = Infinity, bt = 0, bi = 0;
  for (let s = 0; s < n - 1; s++) {
    const ax = P[3 * s]!, ay = P[3 * s + 1]!, az = P[3 * s + 2]!, bx = P[3 * s + 3]! - ax, by = P[3 * s + 4]! - ay, bz = P[3 * s + 5]! - az;
    const qx = x - ax, qy = y - ay, qz = z - az, bb = bx * bx + by * by + bz * bz;
    const t = bb > 0 ? Math.min(1, Math.max(0, (qx * bx + qy * by + qz * bz) / bb)) : 0;
    const dx = qx - t * bx, dy = qy - t * by, dz = qz - t * bz, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < best) { best = d2; bt = t; bi = s; }
  }
  const ax = P[3 * bi]!, ay = P[3 * bi + 1]!, az = P[3 * bi + 2]!, bx = P[3 * bi + 3]! - ax, by = P[3 * bi + 4]! - ay, bz = P[3 * bi + 5]! - az;
  const d = Math.sqrt(best), inv = d > 1e-12 ? 1 / d : 0;
  g[0] = (x - (ax + bx * bt)) * inv; g[1] = (y - (ay + by * bt)) * inv; g[2] = (z - (az + bz * bt)) * inv;
  const bb = bx * bx + by * by + bz * bz;
  if (bt > 0 && bt < 1 && bb > 0) { const dr = ((R[bi + 1]! - R[bi]!) * sw) / bb; g[0] = g[0]! - dr * bx; g[1] = g[1]! - dr * by; g[2] = g[2]! - dr * bz; }
  return d - (R[bi]! + (R[bi + 1]! - R[bi]!) * bt) * sw;
}
/** The twin of skinNormalExact: the UNIT gradient of the live union at (x, y, z), or `fallback` when there is none. `absentFrom` is SKIN_ARM_ABSENT. */
export function skinNormalTwin(arms: readonly TwinArm[], k: number, x: number, y: number, z: number, absentFrom: number, fallback: [number, number, number] = [0, 0, 1], distOut?: number[]): [number, number, number] {
  let acc = 0, first = true;
  const g = [0, 0, 0], ug = [0, 0, 0], mg = [0, 0, 0];
  for (let i = 0; i < arms.length; i++) {
    const A = arms[i]!;
    if (A.off) continue;
    const m = A.mate ?? -1;
    if (m >= 0 && m < i) continue;
    const swi = A.sw ?? 1;
    let b = armSd3(A, x, y, z, swi, ug) + 2 * k * (1 - absentOf(swi, absentFrom));
    if (m > i) {
      const M = arms[m]!, swm = M.sw ?? 1, o = armSd3(M, x, y, z, swm, mg) + 2 * k * (1 - absentOf(swm, absentFrom));
      if (o < b) { b = o; ug[0] = mg[0]!; ug[1] = mg[1]!; ug[2] = mg[2]!; }
    }
    if (first) { acc = b; g[0] = ug[0]!; g[1] = ug[1]!; g[2] = ug[2]!; first = false; continue; }
    const a = acc, raw = 0.5 + (0.5 * (b - a)) / Math.max(k, 1e-6), h = Math.min(1, Math.max(0, raw)), inside = raw > 0 && raw < 1;
    const dfdh = a - b - k + 2 * k * h, dha = inside ? -0.5 / Math.max(k, 1e-6) : 0, dhb = inside ? 0.5 / Math.max(k, 1e-6) : 0;
    const fa = h + dfdh * dha, fb = 1 - h + dfdh * dhb;
    g[0] = fa * g[0]! + fb * ug[0]!; g[1] = fa * g[1]! + fb * ug[1]!; g[2] = fa * g[2]! + fb * ug[2]!;
    acc = b + (a - b) * h - k * h * (1 - h);
  }
  if (distOut) distOut[0] = acc;
  const gl = Math.hypot(g[0]!, g[1]!, g[2]!);
  return gl > 1e-4 ? [g[0]! / gl, g[1]! / gl, g[2]! / gl] : fallback;
}

/** How many rows of vertices from a seam ring (graph steps over the mesh's edges) the shade keeps the mesh's own normal for, easing from it to the union's gradient: the rows over which the mesh blends from the tube's normal to the gradient
 *  (mesh.ts NORMAL_BLEND_ROWS, tests/skin-weld-shade.test.ts holds them equal). */
export const SKIN_TUBE_ROWS = 2;
/** THE WELD'S SHADE (Mohammad, 24 Nov, iPhone: the portal fork read as a blob, darker patches coming in from both sides of the crotch). The shade took the tube's normal only where an arm's weight was within 3 % of 1, a sliver of the first triangle,
 *  and the union's gradient after it: but at the seam that gradient is not the tube's (the shade's union is blended 1.5 times wider than the surface's and still reaches the seam ring, and the arm's capsule is a cone where the tube flares: 9 to 21
 *  degrees at the placed PVH, RPV_T, SV, SMV), so the tone stepped in one triangle on every arm. ROOT CAUSE: the hand-over from the tube's normal to the gradient was a step at the seam, not a blend over the rows the mesh itself blends over. Each vertex's
 *  share of the mesh normal: 1 on a seam ring, falling by 1 / SKIN_TUBE_ROWS a row, 0 from SKIN_TUBE_ROWS rows in; the fragment stage mixes the gradient toward the lerped mesh normal by it. */
export function tubeShareOf(index: ArrayLike<number>, seamVerts: readonly ArrayLike<number>[], vertexCount: number): Float32Array {
  const row = new Int32Array(vertexCount).fill(-1), nbr: number[][] = Array.from({ length: vertexCount }, () => []);
  for (let t = 0; t < index.length; t += 3) for (let e = 0; e < 3; e++) { const a = index[t + e]!, b = index[t + ((e + 1) % 3)]!; nbr[a]!.push(b); nbr[b]!.push(a); }
  const queue: number[] = [];
  for (const ids of seamVerts) for (let i = 0; i < ids.length; i++) { const v = ids[i]!; if (row[v] !== 0) { row[v] = 0; queue.push(v); } }
  for (let h = 0; h < queue.length; h++) { const v = queue[h]!; if (row[v]! >= SKIN_TUBE_ROWS) continue; for (const u of nbr[v]!) if (row[u]! < 0) { row[u] = row[v]! + 1; queue.push(u); } }
  const out = new Float32Array(vertexCount);
  for (let v = 0; v < vertexCount; v++) out[v] = row[v]! < 0 ? 0 : Math.max(0, 1 - row[v]! / SKIN_TUBE_ROWS);
  return out;
}

/** How much of the mesh's own (lerped) normal the shade keeps at a pixel, from its `tubeShare` (interpolated) and the top weight of the arms that are there. Today: the tube's normal where an arm's weight is within SKIN_RING_W_FROM of 1. Placed: all of
 *  the mesh's normal over the rows where the mesh itself blends the tube's into the union's (tubeShare from 1 down to a half: the seam ring and the row after it), handed to the gradient over the next row, where the mesh's normal IS the gradient
 *  (so the hand-over has nothing to step over); gated off on an absent arm's stub, whose kept weight is low. The same sum in JS (skinTubeKeep) and GLSL. */
export const SKIN_TUBE_KEEP_W: readonly [number, number] = [0.2, 0.6];
const ss01 = (a: number, b: number, x: number): number => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const skinTubeKeep = (tube: number, wTop: number): number => ss01(0, 1, tube) * ss01(SKIN_TUBE_KEEP_W[0], SKIN_TUBE_KEEP_W[1], wTop);
const Fg = (x: number): string => (Number.isInteger(x) ? `${x}.0` : `${x}`);
export const skinTubeKeepGlsl = (tube: string, wTop: string): string => `(smoothstep(0.0, 1.0, ${tube}) * smoothstep(${Fg(SKIN_TUBE_KEEP_W[0])}, ${Fg(SKIN_TUBE_KEEP_W[1])}, ${wTop}))`;
