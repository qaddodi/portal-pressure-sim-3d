// THE JUNCTION SDF TRIAL (?geom=net&junc=sdf; Mohammad 22 Nov, memo /mnt/project-files/recs-22nov/vessel-sdf-options.md, option D). One junction region (the portal confluence first) is drawn
// by ray-marching the LIVE smooth union of its capsules in the fragment stage, instead of by its fillet mesh. The surface is the one the fillet's projection already aims at (the same capsules from the
// capsule pass, the same blend width SKIN_K x the narrowest arm, the same smooth minimum), so it cannot fold at any swell, presence or Circuit t: there is no mesh to fold.
//
// HOW IT FITS THE NETWORK FIGURE, WITHOUT CHANGING IT:
// - the region's fillet meshes are switched off by their fade ramps (texel 3 of their row in the region texture: share 0 at every t), so the arms' tubes and their extensions to the node are what the mesh draws there;
// - a proxy sphere round the region's capsules is drawn in the vessel pass; each pixel marches its ray through the union. The union contains every arm's capsule, so where a tube and the union are the
//   same surface the union wins by a small depth bias, and the tube shows only where it really lies outside (beyond the capsules' ends);
// - the colour is the network's own fragment stage (NET_FS), run as a function: the varyings it reads are filled per pixel from the nearest capsule's bones (two small passes write each capsule
//   point's edge row, place, fade, morph share, stay, highlight, units and arc length: the same netBone the vertex stage runs), so the tones, the lens colours, the fade, the dust and the marks are
//   the tubes' rules, not copies. The outline: a ray that misses the union but passes within the line's width of it (CSS px, the tubes' inkPx rule) is ink.
// LIMITS of the trial, said plainly: one region; no crossing shadow; the organs-pass copy is not drawn (the portal confluence is in the vessel pass); the Circuit's inner rim and the flow marks run on
// the nearest arm's place, like the fillet's. NOT YET SEEN ON A DEVICE: cost per frame is what the trial is for (?perf on the iPhone, whole figure and a dive into the confluence).
import { BackSide, BufferAttribute, BufferGeometry, DataTexture, DoubleSide, FloatType, IcosahedronGeometry, Matrix3, Matrix4, Mesh, NearestFilter, NoBlending, OrthographicCamera, Points, RGBAFormat, Scene, ShaderMaterial, Vector3, WebGLRenderTarget, type IUniform, type WebGLRenderer } from 'three';
import { markBlends, setBlendState } from '../../materials/warm.ts';
import { vdbgDefines } from '../debug-view.ts';
import { VESSEL_LAYER } from '../../layers.ts';
import { glslNum as F } from '../../cel-glsl.ts';
import { CEL_STYLE } from '../../cel-style.ts';
import { CIRC_INK_K } from '../cel-ink.ts';
import { inkPxGlsl } from '../glsl-shared.ts';
import { TUBE_DEPTH_SHARE } from '../shaders.ts';
import { SKIN_K } from './junction/sdf.ts';
import { SKIN_SHADE_K } from '../skin/exact-normal.ts';
import { NET_CAP_VS, NET_FS } from './shaders.ts';
import { REGION_CAPS, REGION_PTS } from './regions.ts';
import type { NetDraw } from './network-object.ts';
import { flagValue } from '../../../ui/debug/flags.ts';

/** Whether the address asks for the trial (only with ?geom=net). A test passes its own search string. */
export const juncSdf = (search?: string): boolean => flagValue('junc', search ?? undefined) === 'sdf';
/** The region the trial draws: the portal confluence (splenic + SMV into the portal vein). */
export const JUNC_NODE = 'CONF';
/** The most steps a ray takes through the proxy, the share of a step it moves (the smooth minimum is not an exact distance: a full step can overshoot), and the hit tolerance in blend widths. */
export const JUNC_STEPS = 48, JUNC_STEP_K = 0.9, JUNC_EPS_K = 0.003;
/** How far the union's depth is pulled toward the eye, in the arm's lumen: where an arm's tube is the same surface as the union, the union draws (the tube's ring corners stand TUBE_SAG outside). */
export const JUNC_DEPTH_BIAS = 0.15;
/** A fade ramp that keeps a fillet at share 0 for every t (regions.ts regionFades: in over [2, 3] never starts inside [0, 1]). */
export const NO_FILLET: readonly [number, number, number, number] = [2, 3, 2, 3];

const PTS = REGION_PTS, CAPS = REGION_CAPS, W = CAPS * PTS;

// ---- the info passes: NET_CAP_VS with the full netBone, writing what the fragment stage needs of each capsule point instead of its centre and lumen ----
const CAP_OUT = /NetBone nb = netBone\(([^;]*), true\);\s*vCapOut = vec4\(nb\.cen, nb\.lumen\);/;
/** The info pass of one kind: 0 writes (row + u / 2, fade, morph share, lumen before a waist), 1 writes (stay, highlight, units, arc length). */
export function juncInfoVs(kind: 0 | 1): string {
  if (!CAP_OUT.test(NET_CAP_VS)) throw new Error('junc-sdf: NET_CAP_VS no longer writes vec4(nb.cen, nb.lumen); the info pass must follow it');
  const out = kind === 0 ? 'vec4(float(nb.row) + 0.5 * nb.u, nb.fa, nb.share, nb.lumen0)' : 'vec4(nb.stay, nb.hi, nb.unit, nb.arc)';
  return NET_CAP_VS.replace(CAP_OUT, (_m, arg: string) => `NetBone nb = netBone(${arg}, false);\n  vCapOut = ${out};`);
}
export const JUNC_INFO_A_VS = juncInfoVs(0), JUNC_INFO_B_VS = juncInfoVs(1);
export const JUNC_INFO_FS = /* glsl */ `
varying vec4 vCapOut;
void main() { gl_FragColor = vCapOut; }`;

// ---- the proxy: a sphere round every capsule point of the region (plus the blend's bulge and the line), drawn back faces so a camera inside it still marches ----
export const JUNC_VS = /* glsl */ `
uniform sampler2D regionTex;
uniform sampler2D capTex;
uniform float juncRow;
uniform vec2 res;
varying vec3 vJuncP;
flat varying vec4 vJuncBound;
void main() {
  int rr = int(juncRow + 0.5);
  int nc = int(texelFetch(regionTex, ivec2(0, rr), 0).x + 0.5);
  vec3 lo = vec3(1.0e20), hi = vec3(-1.0e20);
  float rmax = 0.0;
  for (int c = 0; c < ${CAPS}; c++) {
    if (c >= nc) break;
    for (int q = 0; q < ${PTS}; q++) { vec4 P = texelFetch(capTex, ivec2(c * ${PTS} + q, rr), 0); lo = min(lo, P.xyz - P.w); hi = max(hi, P.xyz + P.w); rmax = max(rmax, P.w); }
  }
  vec3 cen = 0.5 * (lo + hi);
  vec4 cc = projectionMatrix * (modelViewMatrix * vec4(cen, 1.0));
  // the bound: the capsules' box, the blend's bulge (under one widest lumen) and the line (LINE_MAX CSS px at the centre's depth, doubled for depth spread)
  float R = 0.5 * length(hi - lo) + rmax + 2.0 * ${F(CEL_STYLE.LINE_MAX)} * cc.w * 2.0 / (res.y * projectionMatrix[1][1]);
  vJuncBound = vec4(cen, R);
  vec3 p = cen + position * R * 1.08;   // (the polyhedron's faces lie inside its sphere: grown so they cover it)
  vJuncP = p;
  gl_Position = projectionMatrix * (modelViewMatrix * vec4(p, 1.0));
  if (nc <= 0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

// ---- the fragment stage: NET_FS as a function, its varyings plain globals the march fills ----
/** NET_FS turned into `void netShade()`: varyings to globals, the lateral distance to the march's own, front-facing always (the proxy is drawn by its back faces). Throws when NET_FS changed under it. */
export function netShadeOf(fs: string): string {
  let s = fs;
  const step = (re: RegExp, to: string, what: string): void => { if (!re.test(s)) throw new Error(`junc-sdf: NET_FS has no ${what}`); s = s.replace(re, to); };
  step(/^(flat )?varying /gm, '', 'varyings');
  step(/void main\(\) \{/, 'void netShade() {', 'main');
  step(/float dLat = [^;]*;/, 'float dLat = rmLat;', 'lateral distance (dLat)');
  step(/gl_FrontFacing/g, 'true', 'front-facing test');
  return s;
}

export const JUNC_FS = /* glsl */ `
float rmLat;   // the march's lateral distance from the arm's axis, device px (netShade's dLat): the outline's place
${netShadeOf(NET_FS)}
uniform sampler2D regionTex;
uniform sampler2D capTex;
uniform sampler2D juncInfoA;
uniform sampler2D juncInfoB;
uniform float juncRow;
uniform mat4 juncMV;
uniform mat4 juncP;
uniform mat3 juncN;
uniform vec3 juncEye;
varying vec3 vJuncP;
flat varying vec4 vJuncBound;
vec4 jP[${W}];
float jMate[${CAPS}];
int jNc = 0;
float jKMin = 1.0;
void juncLoad(int rr) {
  vec4 hd = texelFetch(regionTex, ivec2(0, rr), 0);
  jNc = int(hd.x + 0.5);
  int na = int(hd.y + 0.5);
  jKMin = 1.0e9;
  for (int c = 0; c < ${CAPS}; c++) {
    if (c >= jNc) break;
    vec4 mt = texelFetch(regionTex, ivec2(1 + c / 4, rr), 0);
    int mc = c - (c / 4) * 4;
    jMate[c] = mc == 0 ? mt.x : (mc == 1 ? mt.y : (mc == 2 ? mt.z : mt.w));
    for (int q = 0; q < ${PTS}; q++) {
      vec4 P = texelFetch(capTex, ivec2(c * ${PTS} + q, rr), 0);
      jP[c * ${PTS} + q] = P;
      if (q == 0 && c < na) jKMin = min(jKMin, P.w);
    }
  }
}
// one capsule's signed distance (the vertex stage's netArmSd, without its gradient): the nearest segment of its polyline, the lumen interpolated along it
float juncArm(int c, vec3 p, out int seg, out float st) {
  float best = 1.0e20, bt = 0.0;
  int bi = 0;
  for (int s = 0; s < ${PTS - 1}; s++) {
    vec3 a = jP[c * ${PTS} + s].xyz, b = jP[c * ${PTS} + s + 1].xyz - a, q = p - a;
    float bb = dot(b, b), t = bb > 1.0e-12 ? clamp(dot(q, b) / bb, 0.0, 1.0) : 0.0;
    vec3 dv = q - t * b;
    float d2 = dot(dv, dv);
    if (d2 < best) { best = d2; bt = t; bi = s; }
  }
  seg = bi; st = bt;
  return sqrt(best) - mix(jP[c * ${PTS} + bi].w, jP[c * ${PTS} + bi + 1].w, bt);
}
// the live smooth union (the vertex stage's netUnion, value only): the two halves of a run-on by a plain minimum, the rest by the polynomial smooth minimum of width k
float juncUnion(vec3 p, float k) {
  float acc = 1.0e20;
  bool first = true;
  int sg; float st;
  for (int i = 0; i < ${CAPS}; i++) {
    if (i >= jNc) break;
    int m = int(floor(jMate[i] + 0.5));
    if (m >= 0 && m < i) continue;
    float b = juncArm(i, p, sg, st);
    if (m > i) b = min(b, juncArm(m, p, sg, st));
    if (first) { acc = b; first = false; continue; }
    float h = clamp(0.5 + 0.5 * (b - acc) / max(k, 1.0e-6), 0.0, 1.0);
    acc = b + (acc - b) * h - k * h * (1.0 - h);
  }
  return acc;
}
vec3 juncGrad(vec3 p, float k, float e) {
  const vec2 g = vec2(1.0, -1.0);
  return g.xyy * juncUnion(p + g.xyy * e, k) + g.yyx * juncUnion(p + g.yyx * e, k) + g.yxy * juncUnion(p + g.yxy * e, k) + g.xxx * juncUnion(p + g.xxx * e, k);
}
float juncNdc(vec3 p) { vec4 c = juncP * (juncMV * vec4(p, 1.0)); return c.z / c.w; }
void main() {
  int rr = int(juncRow + 0.5);
  juncLoad(rr);
  float kU = ${F(SKIN_K)} * jKMin;
  vec3 ro = juncEye, rd = normalize(vJuncP - juncEye);
  vec3 oc = ro - vJuncBound.xyz;
  float b = dot(oc, rd), disc = b * b - (dot(oc, oc) - vJuncBound.w * vJuncBound.w);
  if (disc <= 0.0 || jNc <= 0) discard;
  float sq = sqrt(disc), t = max(-b - sq, 0.0), t1 = -b + sq;
  // THE MARCH: sphere tracing through the union; the closest approach in CSS px is kept for the outline
  bool hit = false;
  float minPx = 1.0e20, tMin = t;
  for (int i = 0; i < ${JUNC_STEPS}; i++) {
    vec3 p = ro + rd * t;
    float d = juncUnion(p, kU);
    float w = max(-(juncMV * vec4(p, 1.0)).z, 1.0e-6);
    float px = d / (w * 2.0 / (res.y * projY));
    if (px < minPx) { minPx = px; tMin = t; }
    if (d < ${F(JUNC_EPS_K)} * kU) { hit = true; tMin = t; break; }
    t += max(d * ${F(JUNC_STEP_K)}, ${F(JUNC_EPS_K)} * kU);
    if (t > t1) break;
  }
  vec3 q = ro + rd * tMin;
  // THE NEAREST ARMS at the point: the first gives the edge state, the second the blend (the fillet's vBlend: up to a half where the two are equally near)
  int cA = 0, cB = -1, sA = 0, sB = 0;
  float dA = 1.0e20, dB = 1.0e20, tA = 0.0, tB = 0.0;
  for (int c = 0; c < ${CAPS}; c++) {
    if (c >= jNc) break;
    int sg; float st;
    float d = juncArm(c, q, sg, st);
    if (d < dA) { dB = dA; cB = cA; sB = sA; tB = tA; dA = d; cA = c; sA = sg; tA = st; }
    else if (d < dB) { dB = d; cB = c; sB = sg; tB = st; }
  }
  if (cB < 0) { cB = cA; sB = sA; tB = tA; }
  int iA = cA * ${PTS} + sA, iB = cB * ${PTS} + sB;
  vec4 a0 = texelFetch(juncInfoA, ivec2(iA, rr), 0), a1 = texelFetch(juncInfoA, ivec2(iA + 1, rr), 0);
  vec4 b0 = texelFetch(juncInfoA, ivec2(iB, rr), 0), b1 = texelFetch(juncInfoA, ivec2(iB + 1, rr), 0);
  vec4 x0 = texelFetch(juncInfoB, ivec2(iA, rr), 0), x1 = texelFetch(juncInfoB, ivec2(iA + 1, rr), 0);
  float rowA0 = floor(a0.x), rowA1 = floor(a1.x), rowB0 = floor(b0.x), rowB1 = floor(b1.x);
  float rowA = tA < 0.5 ? rowA0 : rowA1, rowB = tB < 0.5 ? rowB0 : rowB1;
  float uA = rowA0 == rowA1 ? mix(a0.x - rowA0, a1.x - rowA1, tA) * 2.0 : (tA < 0.5 ? a0.x - rowA0 : a1.x - rowA1) * 2.0;
  float uB = rowB0 == rowB1 ? mix(b0.x - rowB0, b1.x - rowB1, tB) * 2.0 : (tB < 0.5 ? b0.x - rowB0 : b1.x - rowB1) * 2.0;
  float blend = rowB != rowA ? 0.5 * (1.0 - smoothstep(0.0, kU, dB - dA)) : 0.0;
  vec4 ia = mix(a0, a1, tA), ib = mix(b0, b1, tB), xa = mix(x0, x1, tA);
  vec4 P0 = jP[iA], P1 = jP[iA + 1];
  vec3 axis = mix(P0.xyz, P1.xyz, tA);
  float lumen = mix(P0.w, P1.w, tA), unit = xa.z;
  // the edge's state for the line's width (netShade loads it again: the same row)
  loadEdgeFS(int(rowA + 0.5));
  vec4 cAx = juncP * (juncMV * vec4(axis, 1.0));
  float vRm = lumen * unit;
  float wpcAx = cAx.w * 2.0 / (res.y * projY) * unit;
  float rCss = vRm / max(wpcAx, 1.0e-6);
  float inkCss = ${inkPxGlsl('rCss', 'rCss', '1.0 - lensUse')} * mix(1.0, ${F(CIRC_INK_K)}, circT) * inkOn;
  if (!hit && minPx > inkCss) discard;
  // the varyings netShade reads, as the vertex stage would have made them here
  vec3 n = juncGrad(q, ${F(SKIN_SHADE_K)} * kU, 0.01 * jKMin);
  n = dot(n, n) > 1.0e-20 ? normalize(n) : normalize(q - axis);
  vec4 mvq = juncMV * vec4(q, 1.0);
  vec4 cq = juncP * mvq;
  vCen = vec3(cAx.x, cAx.y, cAx.w);
  vN = normalize(juncN * n);
  vec3 dir = P1.xyz - P0.xyz;
  vT = normalize(juncN * (dot(dir, dir) > 1.0e-12 ? dir : vec3(1.0, 0.0, 0.0)));
  vZf = normalize(juncN * vec3(0.0, 0.0, 1.0));
  vV = normalize(-mvq.xyz);
  vPackA = vec4(cq.w, vRm, unit, xa.w);
  vPackB = vec4(mix(ia.y, ib.y, blend), ia.z, xa.x, xa.y);
  vPackC = vec4(uA, 0.0, uB, blend);
  vPackD = vec2(ia.w * unit, 0.0);
  vDraw = 1.0;
  vEdge = vec2(rowA, rowB);
  // the outline: a hit lies |sin| of the way from the axis to the silhouette (a tube seen side on); a near miss lies beyond the lumen, in the line
  float rDevAx = vRm / max(cAx.w * 2.0 / (res.y * projY) * unit, 1.0e-6) * dpr;
  float nv = dot(vN, vV);
  rmLat = hit ? rDevAx * sqrt(max(0.0, 1.0 - nv * nv)) : rDevAx + 1.0 + minPx * dpr;
  // the depth: the tubes' rule (between the axis's depth and the surface's, TUBE_DEPTH_SHARE), both pulled toward the eye by the bias so the union draws where a tube is the same surface
  vec3 toEye = normalize(juncEye - q) * ${F(JUNC_DEPTH_BIAS)} * lumen;
  gl_FragDepth = clamp(0.5 * mix(juncNdc(axis + toEye), juncNdc(q + toEye), ${F(TUBE_DEPTH_SHARE)}) + 0.5, 0.0, 1.0);
  netShade();
}`;

/** The programs for the compile test and the ?gl page. */
export const GL_PROGRAMS = [
  { name: 'junction SDF trial', vs: JUNC_VS, fs: JUNC_FS, defines: { VEIL: 1 } },
  { name: 'junction SDF info A', vs: JUNC_INFO_A_VS, fs: JUNC_INFO_FS },
  { name: 'junction SDF info B', vs: JUNC_INFO_B_VS, fs: JUNC_INFO_FS },
] as const;

const floatTarget = (w: number, h: number): WebGLRenderTarget => new WebGLRenderTarget(w, Math.max(1, h), { type: FloatType, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false, generateMipmaps: false });

/** The rows of `node`'s regions in a draw (a region can have a body-built and a map-built mesh: one row each); the first is the one the march reads (the capsules are the same). */
export const rowsOf = (draw: Pick<NetDraw, 'regions'>, node: string): number[] => draw.regions.flatMap((r, i) => (r.node === node ? [i] : []));

/** Writes NO_FILLET into the fade ramps (texel 3) of `rows` in a region texture's data; returns the old ramps so they can be put back. */
export function silenceFillets(data: Float32Array, texelsPerRow: number, rows: readonly number[]): Float32Array {
  const old = new Float32Array(4 * rows.length);
  rows.forEach((r, i) => { const o = 4 * (texelsPerRow * r + 3); old.set(data.subarray(o, o + 4), 4 * i); data.set(NO_FILLET, o); });
  return old;
}

/** The trial's objects for one network draw: the info passes and the proxy. */
export class JuncSdf {
  readonly mesh: Mesh;
  private readonly targets: WebGLRenderTarget[];
  private readonly passes: Points[];
  private readonly passScene = new Scene();
  private readonly passCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly disposables: { dispose(): void }[] = [];
  private readonly mv = new Matrix4();
  private readonly inv = new Matrix4();
  private readonly nm = new Matrix3();
  private readonly eye = new Vector3();
  private readonly restore: () => void;

  /** null when no draw has the node (the badge then says so through `why`). */
  static build(draws: readonly NetDraw[], node = JUNC_NODE): JuncSdf | { why: string } {
    for (const d of draws) {
      const rows = rowsOf(d, node);
      const veil = d.meshes.find((m) => m.layers.mask === 1 << VESSEL_LAYER) ?? d.meshes[d.meshes.length - 1];
      if (rows.length && veil) return new JuncSdf(d, rows, (veil.material as ShaderMaterial).uniforms);
    }
    return { why: `no junction region named ${node}` };
  }

  private constructor(draw: NetDraw, rows: number[], own: Record<string, IUniform>) {
    const regionTex = own.regionTex!.value as DataTexture, data = regionTex.image.data as Float32Array, perRow = regionTex.image.width;
    const old = silenceFillets(data, perRow, rows); regionTex.needsUpdate = true;
    this.restore = () => { rows.forEach((r, i) => data.set(old.subarray(4 * i, 4 * i + 4), 4 * (perRow * r + 3))); regionTex.needsUpdate = true; };
    const regions = draw.regions.length, row = rows[0]!;
    // the info passes: this region's W points into two float targets the size of the capsule texture
    this.targets = [floatTarget(W, regions), floatTarget(W, regions)];
    const ids = Float32Array.from({ length: W }, (_, j) => row * W + j);
    this.passes = [JUNC_INFO_A_VS, JUNC_INFO_B_VS].map((vs, k) => {
      const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(3 * W), 3)); g.setAttribute('capId', new BufferAttribute(ids, 1));
      const m = new ShaderMaterial({ name: `junc-info-${k}`, vertexShader: vs, fragmentShader: JUNC_INFO_FS, precision: 'highp', depthTest: false, depthWrite: false, blending: NoBlending, side: DoubleSide, uniforms: { ...own }, defines: vdbgDefines() });
      this.disposables.push(g, m);
      const p = new Points(g, m); p.frustumCulled = false; return p;
    });
    const u: Record<string, IUniform> = {
      ...own, juncRow: { value: row }, juncInfoA: { value: this.targets[0]!.texture }, juncInfoB: { value: this.targets[1]!.texture },
      juncMV: { value: new Matrix4() }, juncP: { value: new Matrix4() }, juncN: { value: new Matrix3() }, juncEye: { value: new Vector3() },
    };
    const mat = markBlends(new ShaderMaterial({ name: 'junc-sdf', vertexShader: JUNC_VS, fragmentShader: JUNC_FS, precision: 'highp', side: BackSide, uniforms: u, defines: { VEIL: 1, ...vdbgDefines() } }));
    setBlendState(mat, true);
    const geo = new IcosahedronGeometry(1, 2);
    this.disposables.push(mat, geo);
    this.mesh = new Mesh(geo, mat);
    this.mesh.name = `net:junc-sdf:${draw.regions[row]!.node}`;
    this.mesh.renderOrder = 1; this.mesh.frustumCulled = false; this.mesh.layers.set(VESSEL_LAYER);
    this.mesh.raycast = () => {};
    this.mesh.onBeforeRender = (_r, _s, cam) => {
      this.mv.multiplyMatrices(cam.matrixWorldInverse, this.mesh.matrixWorld);
      (u.juncMV!.value as Matrix4).copy(this.mv);
      (u.juncP!.value as Matrix4).copy(cam.projectionMatrix);
      (u.juncN!.value as Matrix3).getNormalMatrix(this.mv);
      this.inv.copy(this.mesh.matrixWorld).invert();
      (u.juncEye!.value as Vector3).setFromMatrixPosition(cam.matrixWorld).applyMatrix4(this.inv);
    };
  }

  /** The info passes, once per drawn frame, after the network's own (the capsule texture is the frame's). */
  prepass(gl: WebGLRenderer): void {
    if (!this.mesh.visible) return;
    const prev = gl.getRenderTarget(), ac = gl.autoClear;
    gl.autoClear = false;
    this.passes.forEach((p, k) => { this.passScene.clear(); this.passScene.add(p); gl.setRenderTarget(this.targets[k]!); gl.render(this.passScene, this.passCam); });
    this.passScene.clear();
    gl.setRenderTarget(prev); gl.autoClear = ac;
  }

  dispose(): void {
    this.restore();
    this.mesh.removeFromParent();
    for (const d of this.disposables) d.dispose();
    for (const t of this.targets) t.dispose();
  }
}
