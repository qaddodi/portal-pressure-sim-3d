// THE RAY-MARCHED JUNCTIONS (?geom=net&junc=sdf; Mohammad 22 Nov, memo /mnt/project-files/recs-22nov/vessel-sdf-options.md, option D; rollout recs-22nov/sdf-junctions-rollout.md J2). EVERY junction
// region of every network, at every Circuit t, is drawn by ray-marching the LIVE smooth union of its capsules in the fragment stage, instead of by its fillet meshes. The surface is the one the fillet's projection already aims at (the same capsules from the
// capsule pass, the same blend width SKIN_K x the narrowest arm, the same smooth minimum), so it cannot fold at any swell, presence or Circuit t: there is no mesh to fold.
//
// HOW IT FITS THE NETWORK FIGURE, WITHOUT CHANGING IT:
// - the region's fillet meshes are switched off by their fade ramps (texel 3 of their row in the region texture: share 0 at every t), so the arms' tubes and their extensions to the node are what the mesh draws there;
// - a proxy sphere round the region's capsules is drawn in the vessel pass; each pixel marches its ray through the union. THE CUT (junc-cut-glsl.ts): each arm's tube stops at a plane across its capsule's
//   outer end and the union is drawn only on the node side of the planes, so at the hand-over both are the same capsule surface: no tube end, dome or tube ink inside the junction, and its outline is the
//   union's silhouette alone (Mohammad's iPhone, 22 Nov: the tube ends showed as capped pieces with their own ink arcs, because the tubes ran on into the junction and their ink band stood outside the union);
// - the colour is the network's own fragment stage (NET_FS), run as a function: the varyings it reads are filled per pixel from the nearest capsule's bones (two small passes write each capsule
//   point's edge row, place, fade, morph share, stay, highlight, units and arc length: the same netBone the vertex stage runs), so the tones, the lens colours, the fade, the dust and the marks are
//   the tubes' rules, not copies. The outline: a ray that misses the union but passes within the line's width of it (CSS px, the tubes' inkPx rule) is ink.
// One proxy draw per network (an icosphere instanced per marched region); a region with a body-built and a map-built mesh is marched once (its first row: the capsules are the same).
// SEWN ENDS (J3, net/sewn.ts sewnRegions): a collateral, shunt, TIPS or DIPS end that is sewn onto its host is a region of its own (the arm's bare capsule, the host's capsule), so it grows out of the host with no collar; written only with this flag.
// LIMITS, said plainly: no crossing shadow; the organs-pass copy is not drawn (the portal confluence is in the vessel pass); the Circuit's inner rim and the flow marks run on
// the nearest arm's place, like the fillet's. NOT YET SEEN ON A DEVICE: cost per frame is what the trial is for (?perf on the iPhone, whole figure and a dive into the confluence).
import { BackSide, BufferAttribute, BufferGeometry, DataTexture, DoubleSide, FloatType, Group, IcosahedronGeometry, InstancedBufferAttribute, InstancedBufferGeometry, Matrix3, Matrix4, Mesh, NearestFilter, NoBlending, OrthographicCamera, Points, RGBAFormat, Scene, ShaderMaterial, Vector3, WebGLRenderTarget, type IUniform, type WebGLRenderer } from 'three';
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
import { REGION_CAPS, REGION_HEAD, REGION_PTS } from './regions.ts';
import { JUNC_CUT_TEXELS, JUNC_EDGE_REGIONS } from './junc-cut-glsl.ts';
import type { Skeleton } from './types.ts';
import type { Region } from './regions.ts';
import type { NetDraw } from './network-object.ts';
import { flagValue } from '../../../ui/debug/flags.ts';

/** Whether the address asks for the trial (only with ?geom=net). A test passes its own search string. */
export const juncSdf = (search?: string): boolean => flagValue('junc', search ?? undefined) === 'sdf';
/** The most steps a ray takes through the proxy, the share of a step it moves (the smooth minimum is not an exact distance: a full step can overshoot), and the hit tolerance in blend widths. */
/** The marks' gate: an arm's chevrons and streaks fade out over this many blend widths outside its capsule (inside the crotch both arms' run on and overlap). */
export const JUNC_MARK_GATE = 0.5;
/** A sewn region's march yields to the host's own tube where the union is within this share of the blend width of the host-only surface. */
export const JUNC_HOST_YIELD = 0.01;
export const JUNC_STEPS = 48, JUNC_STEP_K = 0.9, JUNC_EPS_K = 0.003;
/** A fade ramp that keeps a fillet at share 0 for every t (regions.ts regionFades: in over [2, 3] never starts inside [0, 1]). */
export const NO_FILLET: readonly [number, number, number, number] = [2, 3, 2, 3];

const PTS = REGION_PTS, CAPS = REGION_CAPS, W = CAPS * PTS, JUNC_CUT_TEXELS_N = JUNC_CUT_TEXELS;

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

// ---- the cut: one point per texel of the cut texture (junc-cut-glsl.ts), from the live capsules and the edge rows of their ends ----
export const JUNC_GEOM_VS = /* glsl */ `
uniform sampler2D regionTex;
uniform sampler2D capTex;
uniform sampler2D juncInfoA;
uniform float capRows;   // the region texture's rows (the cut texture's height)
attribute float geomId;   // region row * JUNC_CUT_TEXELS + texel
varying vec4 vCapOut;
vec4 capAt(int c, int q, int rr) { return texelFetch(capTex, ivec2(c * ${PTS} + q, rr), 0); }
void main() {
  int gid = int(geomId + 0.5), rr = gid / ${JUNC_CUT_TEXELS_N}, id = gid - rr * ${JUNC_CUT_TEXELS_N};
  int nc = int(texelFetch(regionTex, ivec2(0, rr), 0).x + 0.5);
  vec3 lo = vec3(1.0e20), hi = vec3(-1.0e20);
  float rmax = 0.0;
  for (int c = 0; c < ${CAPS}; c++) {
    if (c >= nc) break;
    for (int q = 0; q < ${PTS}; q++) { vec4 P = capAt(c, q, rr); lo = min(lo, P.xyz - P.w); hi = max(hi, P.xyz + P.w); rmax = max(rmax, P.w); }
  }
  vec3 cen = 0.5 * (lo + hi);
  vec4 o = vec4(0.0);
  // the bound: the capsules' box and three widest lumens (the blend's bulge and the ink band of the arms near the node; the proxy adds the line's width on screen)
  // OFF while its narrowest arm has no radius to speak of (under 2% of the widest capsule: a sewn collateral that is not there has presence 0, and the blend width, which is a share of the arm's radius, would be 0): the tubes draw the region, uncut
  float rArm = 1.0e20;
  int na = int(texelFetch(regionTex, ivec2(0, rr), 0).y + 0.5);
  for (int c = 0; c < ${CAPS}; c++) { if (c >= nc || c >= na) break; rArm = min(rArm, capAt(c, 0, rr).w); }
  if (id == 0) o = rArm < 0.02 * rmax ? vec4(0.0) : vec4(cen, 0.5 * length(hi - lo) + 3.0 * rmax);
  else {
    int k = id - 1, side = k / ${CAPS}, c = k - side * ${CAPS};
    if (c < nc) {
      vec4 mt = texelFetch(regionTex, ivec2(1 + c / 4, rr), 0);
      int mc = c - (c / 4) * 4, mate = int(floor((mc == 0 ? mt.x : (mc == 1 ? mt.y : (mc == 2 ? mt.z : mt.w))) + 0.5));
      if (side == 2) o = vec4(floor(texelFetch(juncInfoA, ivec2(c * ${PTS}, rr), 0).x), floor(texelFetch(juncInfoA, ivec2(c * ${PTS} + ${PTS - 1}, rr), 0).x), 1.0, 0.0);
      else {
        // AN END'S PLANE, only at an OUTER end: one that lies outside every other capsule of the region but its mate (its own course). The arms' inner ends sit inside the capsule they join (at the node, or on
        // the side of a through vessel), so an arm has one plane, a link between two merged nodes none, and a through vessel with arms on its side (the IVC at the hepatic confluence) two. Never judged by the
        // bound's centre: in the Circuit a Y with long arms has its centre far up them, and 13 of 81 capsules then had their plane at the NODE end, the tube cut where the march drew nothing (junc-sdf.test.ts).
        int q0 = side == 0 ? 0 : ${PTS - 1}, st = side == 0 ? 1 : -1;
        vec4 E = capAt(c, q0, rr);
        bool inner = false;
        for (int oc = 0; oc < ${CAPS}; oc++) {
          if (oc >= nc) break;
          if (oc == c || oc == mate) continue;
          vec4 om = texelFetch(regionTex, ivec2(1 + oc / 4, rr), 0);
          int omc = oc - (oc / 4) * 4;
          if (int(floor((omc == 0 ? om.x : (omc == 1 ? om.y : (omc == 2 ? om.z : om.w))) + 0.5)) == c) continue;
          for (int s = 0; s < ${PTS - 1}; s++) {
            vec4 A = capAt(oc, s, rr), B = capAt(oc, s + 1, rr);
            vec3 ab = B.xyz - A.xyz, pa = E.xyz - A.xyz;
            float bb = dot(ab, ab), t = bb > 1.0e-12 ? clamp(dot(pa, ab) / bb, 0.0, 1.0) : 0.0;
            if (length(pa - t * ab) < mix(A.w, B.w, t)) inner = true;
          }
        }
        vec3 n = vec3(0.0);
        for (int j = 1; j < ${PTS}; j++) { vec3 d = E.xyz - capAt(c, q0 + st * j, rr).xyz; if (dot(d, d) > 1.0e-12) { n = d; break; } }
        if (dot(n, n) <= 1.0e-12) n = E.xyz - cen;
        n = normalize(n);
        o = inner ? vec4(0.0, 0.0, 0.0, 1.0) : vec4(n, dot(n, E.xyz));   // (an inner end: a plane nothing is beyond)
      }
    }
  }
  vCapOut = o;
  gl_PointSize = 1.0;
  gl_Position = vec4((float(id) + 0.5) / ${F(JUNC_CUT_TEXELS)} * 2.0 - 1.0, (float(rr) + 0.5) / capRows * 2.0 - 1.0, 0.0, 1.0);
}`;

// ---- the proxy: a sphere round every capsule point of the region (plus the blend's bulge and the line), drawn back faces so a camera inside it still marches ----
export const JUNC_VS = /* glsl */ `
uniform sampler2D juncGeom;
uniform vec2 res;
attribute float juncRegion;   // the instance's region row
varying vec3 vJuncP;
flat varying vec4 vJuncBound;
flat varying float vJuncRow;
void main() {
  vJuncRow = juncRegion;
  vec4 S = texelFetch(juncGeom, ivec2(0, int(juncRegion + 0.5)), 0);
  vec3 cen = S.xyz;
  vec4 cc = projectionMatrix * (modelViewMatrix * vec4(cen, 1.0));
  // the cut's bound and the line (LINE_MAX CSS px at the centre's depth, doubled for depth spread)
  float R = S.w + 2.0 * ${F(CEL_STYLE.LINE_MAX)} * cc.w * 2.0 / (res.y * projectionMatrix[1][1]);
  float nc = S.w > 0.0 ? 1.0 : 0.0;
  vJuncBound = vec4(cen, R);
  vec3 p = cen + position * R * 1.08;   // (the polyhedron's faces lie inside its sphere: grown so they cover it)
  vJuncP = p;
  gl_Position = projectionMatrix * (modelViewMatrix * vec4(p, 1.0));
  if (nc <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
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
  step(/juncCut\(vMp, vEdge\.x\)/, 'false', 'cut test (juncCut)');
  // THE SECOND ARM'S MARKS: the dust's and the heads' own calls, copied from the lines above and read in the second arm's frame (its edge row, place, tangent, radial normal, lumen, units), each
  // gated by how far the pixel lies outside that arm's capsule, laid over the first's. So each arm's chevrons and streaks run on along its own flow into the crotch, with no line where the nearest arm switches.
  const line = (re: RegExp, what: string): string => { const m = s.match(re); if (!m) throw new Error(`junc-sdf: NET_FS has no ${what}`); return m[0]; };
  const inB = (src: string): string => src.replace(/\bacross\b/g, 'acrossB').replace(/\bside\b/g, 'sideB').replace(/\bvT\b/g, 'jTB').replace(/\bsD\b/g, 'sDB').replace(/\blenH\b/g, 'lenHB').replace(/\bvR\b/g, 'jRB').replace(/\bvU\b/g, 'jUnitB').replace(/\barcS\b/g, 'arcSB').replace(/\bfd\b/g, 'fdB').replace(/\bhd\b/g, 'hdB');
  const sD = line(/^ *float sD = [^;]*;$/m, 'dust arc (sD)'), fdCall = line(/^ *vec4 fd = flowDust\(.*\);$/m, 'dust call (flowDust)'), hdCall = line(/^ *vec4 hd = flowHeads\(.*\);$/m, 'heads call (flowHeads)');
  const armB = (body: string): string => `  if (jHasB) {
    loadEdgeFS(int(jRowB + 0.5));
    float arcSB = jUB * len + arcHost.x, lenHB = arcHost.y > 0.0 ? arcHost.y : len;
    vec3 sideB = cross(jTB, normalize(vV));
    sideB = length(sideB) > 1e-4 ? normalize(sideB) : vec3(1.0, 0.0, 0.0);
    float acrossB = dot(jNB, sideB);
${body}
    loadEdgeFS(int(vEdge.x + 0.5));
  }
`;
  const fdAt = /^ *fd = clamp\(fd, 0\.0, 1\.0\) \* dHold\(fadeHere\) \* markK;\n/m, hdAt = /^ *hd = clamp\(hd, 0\.0, 1\.0\) \* markK;\n/m;
  step(fdAt, `${line(fdAt, 'dust clamp')}${armB(`  ${inB(sD).trim()}\n    ${inB(fdCall).trim()}\n    fd += clamp(fdB, 0.0, 1.0) * dHold(fadeHere) * jGateB * (1.0 - fd.a);`)}`, 'dust clamp');
  step(hdAt, `${line(hdAt, 'heads clamp')}${armB(`    ${inB(hdCall).trim()}\n    hd += clamp(hdB, 0.0, 1.0) * jGateB * (1.0 - hd.a);`)}`, 'heads clamp');
  return s;
}

export const JUNC_FS = /* glsl */ `
// the second arm at the pixel (the marks run in its own frame too): there, its edge row, place, tangent and radial normal (view space), lumen (figure units), units, and its gate
bool jHasB = false;
float jRowB = 0.0, jUB = 0.0, jRB = 0.0, jUnitB = 1.0, jGateB = 0.0;
vec3 jTB = vec3(1.0, 0.0, 0.0), jNB = vec3(0.0, 0.0, 1.0);
float rmLat;   // the march's lateral distance from the arm's axis, device px (netShade's dLat): the outline's place
${netShadeOf(NET_FS)}
uniform sampler2D regionTex;
uniform sampler2D juncInfoA;
uniform sampler2D juncInfoB;
uniform mat4 juncMV;
uniform mat4 juncP;
uniform mat3 juncN;
uniform vec3 juncEye;
varying vec3 vJuncP;
flat varying vec4 vJuncBound;
flat varying float vJuncRow;
vec4 jP[${W}];
float jMate[${CAPS}];
int jNc = 0, jNa = 0;
bool jSewn = false;   // a sewn end's region (J3, net/sewn.ts): the caps from jNa on are the HOST's, whose tube is drawn by its own draw
float jKMin = 1.0;
void juncLoad(int rr) {
  vec4 hd = texelFetch(regionTex, ivec2(0, rr), 0);
  jNc = int(hd.x + 0.5);
  int na = int(hd.y + 0.5);
  jNa = na;
  jSewn = texelFetch(regionTex, ivec2(${REGION_HEAD - 1}, rr), 0).w > 0.5;
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
vec4 jPl[${2 * CAPS}];   // each capsule's planes at its first and last end (an inner end's: nothing beyond it)
int jArms = 0;
void juncPlanes(int rr) {
  jArms = 0;
  for (int c = 0; c < ${CAPS}; c++) {
    if (texelFetch(juncGeom, ivec2(1 + ${2 * CAPS} + c, rr), 0).z < 0.5) break;
    jPl[2 * c] = texelFetch(juncGeom, ivec2(1 + c, rr), 0); jPl[2 * c + 1] = texelFetch(juncGeom, ivec2(1 + ${CAPS} + c, rr), 0); jArms = c + 1;
  }
}
bool juncPast(int c, vec3 p) { return dot(jPl[2 * c].xyz, p) - jPl[2 * c].w > 0.0 || dot(jPl[2 * c + 1].xyz, p) - jPl[2 * c + 1].w > 0.0; }
// beyond the cut, the tube draws, not the march: past a plane of the capsule NEAREST the point (the very tube the cut kept there). Past another arm's plane is not enough: in a region of merged nodes
// the arms at one node lie past the plane of an arm at the other, and the march would leave them as holes.
bool juncBeyond(vec3 p) {
  bool any = false;
  for (int c = 0; c < ${CAPS}; c++) { if (c >= jArms) break; if (juncPast(c, p)) { any = true; break; } }
  if (!any) return false;
  float best = 1.0e20; int cn = 0, sg; float st;
  for (int c = 0; c < ${CAPS}; c++) { if (c >= jArms) break; float d = juncArm(c, p, sg, st); if (d < best) { best = d; cn = c; } }
  return juncPast(cn, p);
}
float juncNdc(vec3 p) { vec4 c = juncP * (juncMV * vec4(p, 1.0)); return c.z / c.w; }
void main() {
  int rr = int(vJuncRow + 0.5);
  juncLoad(rr);
  juncPlanes(rr);
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
    bool beyond = juncBeyond(p);
    if (!beyond && px < minPx) { minPx = px; tMin = t; }   // (the outline counts only the union inside the cut: beyond it the tube's own line is drawn)
    if (d < ${F(JUNC_EPS_K)} * kU) { if (beyond) discard; hit = true; tMin = t; break; }
    t += max(d * ${F(JUNC_STEP_K)}, ${F(JUNC_EPS_K)} * kU);
    if (t > t1) break;
  }
  vec3 q = ro + rd * tMin;
  // A SEWN END'S HOST: its tube is drawn by its own draw (another draw's cut cannot hold this region, and a capsule in the middle of the host has no single plane), so the march yields where the union is the host's own surface (hit, or the
  // closest approach of an outline): there the host tube draws the very same surface and ink, and the two never z-fight. Only the arm and the blend's skirt are the march's.
  if (jSewn) {
    int sgH; float stH, dHost = 1.0e20;
    for (int c = 0; c < ${CAPS}; c++) { if (c >= jNc) break; if (c >= jNa) dHost = min(dHost, juncArm(c, q, sgH, stH)); }
    if (dHost - juncUnion(q, kU) < ${F(JUNC_HOST_YIELD)} * kU) discard;
  }
  // THE NEAREST ARMS at the point: the first gives the edge state, the second the blend (the fillet's vBlend: up to a half where the two are equally near)
  // (the second is the nearest arm that is not the first nor its mate: the two halves of a run-on are one course)
  int cA = 0, cB = -1, sA = 0, sB = 0;
  float dA = 1.0e20, dB = 1.0e20, tA = 0.0, tB = 0.0;
  for (int c = 0; c < ${CAPS}; c++) {
    if (c >= jNc) break;
    int sg; float st;
    float d = juncArm(c, q, sg, st);
    if (d < dA) { dA = d; cA = c; sA = sg; tA = st; }
  }
  int mateA = int(floor(jMate[cA] + 0.5));
  for (int c = 0; c < ${CAPS}; c++) {
    if (c >= jNc) break;
    if (c == cA || c == mateA || int(floor(jMate[c] + 0.5)) == cA) continue;
    int sg; float st;
    float d = juncArm(c, q, sg, st);
    if (d < dB) { dB = d; cB = c; sB = sg; tB = st; }
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
  vec4 xb = mix(texelFetch(juncInfoB, ivec2(iB, rr), 0), texelFetch(juncInfoB, ivec2(iB + 1, rr), 0), tB);
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
  // THE MARKS of each arm, gated by how far the pixel lies outside its capsule (0 on its own surface, faded out over half a blend width): the first arm's through vMarkE (netShade's markK),
  // the second's in its own frame (netShadeOf); the two halves of a run-on are one course, so a mate is not a second arm
  float gate = ${F(JUNC_MARK_GATE)} * kU;
  vMarkE = vec2(1.0 - smoothstep(0.0, gate, dA), rowA);
  jHasB = cB != cA;
  if (jHasB) {
    vec4 Q0 = jP[iB], Q1 = jP[iB + 1];
    vec3 axisB = mix(Q0.xyz, Q1.xyz, tB), dirB = Q1.xyz - Q0.xyz;
    jRowB = rowB; jUB = uB; jUnitB = xb.z; jRB = mix(Q0.w, Q1.w, tB) * jUnitB;
    jTB = normalize(juncN * (dot(dirB, dirB) > 1.0e-12 ? dirB : vec3(1.0, 0.0, 0.0)));
    jNB = normalize(juncN * (q - axisB));
    jGateB = 1.0 - smoothstep(0.0, gate, dB);
  }
  // the outline: a hit lies |sin| of the way from the axis to the silhouette (a tube seen side on); a near miss lies beyond the lumen, in the line
  float rDevAx = vRm / max(cAx.w * 2.0 / (res.y * projY) * unit, 1.0e-6) * dpr;
  float nv = dot(vN, vV);
  rmLat = hit ? rDevAx * sqrt(max(0.0, 1.0 - nv * nv)) : rDevAx + 1.0 + minPx * dpr;
  // the depth: the tubes' rule (between the axis's depth and the surface's, TUBE_DEPTH_SHARE, none on the Circuit's plate)
  gl_FragDepth = clamp(0.5 * mix(juncNdc(axis), juncNdc(q), ${F(TUBE_DEPTH_SHARE)} * (1.0 - circT)) + 0.5, 0.0, 1.0);
  netShade();
}`;

/** The programs for the compile test and the ?gl page. */
export const GL_PROGRAMS = [
  { name: 'junction SDF', vs: JUNC_VS, fs: JUNC_FS, defines: { VEIL: 1 } },
  { name: 'junction SDF info A', vs: JUNC_INFO_A_VS, fs: JUNC_INFO_FS },
  { name: 'junction SDF info B', vs: JUNC_INFO_B_VS, fs: JUNC_INFO_FS },
  { name: 'junction SDF cut', vs: JUNC_GEOM_VS, fs: JUNC_INFO_FS },
] as const;

const floatTarget = (w: number, h: number): WebGLRenderTarget => new WebGLRenderTarget(w, Math.max(1, h), { type: FloatType, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false, generateMipmaps: false });

/** The rows a draw marches: one per junction node (a region with a body-built and a map-built mesh has a row each: the first, the body's when there is one, is marched; the capsules are the same). */
export function marchRows(regions: readonly Pick<Region, 'node' | 'variant'>[]): number[] {
  const best = new Map<string, number>();
  regions.forEach((r, i) => { const b = best.get(r.node); if (b === undefined || (regions[b]!.variant !== 0 && r.variant === 0)) best.set(r.node, i); });
  return [...best.values()].sort((x, y) => x - y);
}

/** JUNC_GEOM_VS's rule, for the tests: the planes of capsule `c` at its first and last end, null at an INNER end (one inside another capsule of the region but its mate). A capsule is points (x, y, z, lumen). */
export type Plane = readonly [number, number, number, number] | null;
export function capPlanes(caps: readonly (readonly (readonly number[])[])[], mates: readonly number[], c: number): [Plane, Plane] {
  const me = caps[c]!;
  const inside = (e: readonly number[]): boolean => caps.some((o, j) => j !== c && j !== mates[c] && mates[j] !== c && o.some((A, s) => {
    const B = o[s + 1]; if (!B) return false;
    const ab = [0, 1, 2].map((i) => B[i]! - A[i]!), pa = [0, 1, 2].map((i) => e[i]! - A[i]!), bb = ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2;
    const t = bb > 1e-12 ? Math.min(1, Math.max(0, (pa[0]! * ab[0]! + pa[1]! * ab[1]! + pa[2]! * ab[2]!) / bb)) : 0;
    return Math.hypot(pa[0]! - t * ab[0]!, pa[1]! - t * ab[1]!, pa[2]! - t * ab[2]!) < A[3]! + (B[3]! - A[3]!) * t;
  }));
  const plane = (q0: number, st: number): Plane => {
    const E = me[q0]!;
    if (inside(E)) return null;
    for (let j = 1; j < me.length; j++) { const P = me[q0 + st * j]!, n = [0, 1, 2].map((i) => E[i]! - P[i]!), l = Math.hypot(n[0]!, n[1]!, n[2]!); if (l > 1e-6) { const u = n.map((x) => x / l); return [u[0]!, u[1]!, u[2]!, u[0]! * E[0]! + u[1]! * E[1]! + u[2]! * E[2]!]; } }
    return null;
  };
  return [plane(0, 1), plane(me.length - 1, -1)];
}

/** Which marched regions each edge is an arm of (juncEdge: up to JUNC_EDGE_REGIONS rows per edge, -1 for none): the edges of the bones that carry a region's capsules. */
export function edgeRegions(skel: Pick<Skeleton, 'bones' | 'edges'>, regions: readonly Pick<Region, 'caps' | 'hostFrom'>[], rows: readonly number[]): Float32Array {
  const out = new Float32Array(4 * skel.edges.length).fill(-1), n = new Uint8Array(skel.edges.length);
  for (const r of rows) {
    const edges = new Set<number>();
    regions[r]!.caps.forEach((c, ci) => { if (ci < (regions[r]!.hostFrom ?? Infinity)) for (const b of c.bones) edges.add(skel.bones[b]!.edge); });   // (a sewn region's HOST capsules are no arm: the host's tube is in another draw, and a host with many sewn ends is no limit)
    for (const e of edges) { if (n[e]! >= JUNC_EDGE_REGIONS) throw new Error(`junc-sdf: edge ${e} is an arm of more than ${JUNC_EDGE_REGIONS} marched regions`); out[4 * e + n[e]!] = r; n[e]!++; }
  }
  return out;
}

/** Writes NO_FILLET into the fade ramps (texel 3) of `rows` in a region texture's data; returns the old ramps so they can be put back. */
export function silenceFillets(data: Float32Array, texelsPerRow: number, rows: readonly number[]): Float32Array {
  const old = new Float32Array(4 * rows.length);
  rows.forEach((r, i) => { const o = 4 * (texelsPerRow * r + 3); old.set(data.subarray(o, o + 4), 4 * i); data.set(NO_FILLET, o); });
  return old;
}

/** One network draw's marched junctions: the info passes, the cut and the proxy (an icosphere instanced per marched region). */
class JuncNet {
  readonly mesh: Mesh;
  readonly targets: WebGLRenderTarget[];
  readonly passes: Points[];
  private readonly disposables: { dispose(): void }[] = [];
  private readonly mv = new Matrix4();
  private readonly inv = new Matrix4();
  private readonly restore: () => void;
  private readonly unCut: () => void;

  constructor(skel: Skeleton, draw: NetDraw, own: Record<string, IUniform>) {
    const regionTex = own.regionTex!.value as DataTexture, data = regionTex.image.data as Float32Array, perRow = regionTex.image.width;
    const all = draw.regions.map((_, i) => i), rows = marchRows(draw.regions), regions = draw.regions.length;
    const old = silenceFillets(data, perRow, all); regionTex.needsUpdate = true;   // (every fillet of a marched node, body and map built)
    this.restore = () => { all.forEach((r, i) => data.set(old.subarray(4 * i, 4 * i + 4), 4 * (perRow * r + 3))); regionTex.needsUpdate = true; };
    // the info passes: the marched rows' capsule points into two float targets the size of the capsule texture
    this.targets = [floatTarget(W, regions), floatTarget(W, regions)];
    const ids = Float32Array.from(rows.flatMap((r) => Array.from({ length: W }, (_, j) => r * W + j)));
    const points = (name: string, vs: string, idName: string, idv: Float32Array, uniforms: Record<string, IUniform>): Points => {
      const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(new Float32Array(3 * idv.length), 3)); g.setAttribute(idName, new BufferAttribute(idv, 1));
      const m = new ShaderMaterial({ name, vertexShader: vs, fragmentShader: JUNC_INFO_FS, precision: 'highp', depthTest: false, depthWrite: false, blending: NoBlending, side: DoubleSide, uniforms, defines: vdbgDefines() });
      this.disposables.push(g, m);
      const p = new Points(g, m); p.frustumCulled = false; return p;
    };
    this.passes = [points('junc-info-0', JUNC_INFO_A_VS, 'capId', ids, { ...own }), points('junc-info-1', JUNC_INFO_B_VS, 'capId', ids, { ...own })];
    // the cut (junc-cut-glsl.ts): written after the info passes (it reads the arms' edge rows from the first), read by this network's tubes and by the march
    const geom = floatTarget(JUNC_CUT_TEXELS, regions); this.targets.push(geom);
    const gids = Float32Array.from(rows.flatMap((r) => Array.from({ length: JUNC_CUT_TEXELS }, (_, j) => r * JUNC_CUT_TEXELS + j)));
    this.passes.push(points('junc-cut', JUNC_GEOM_VS, 'geomId', gids, { ...own, juncInfoA: { value: this.targets[0]!.texture } }));
    const er = edgeRegions(skel, draw.regions, rows);
    const edgeTex = new DataTexture(er, skel.edges.length, 1, RGBAFormat, FloatType); edgeTex.minFilter = edgeTex.magFilter = NearestFilter; edgeTex.generateMipmaps = false; edgeTex.needsUpdate = true;
    this.disposables.push(edgeTex);
    const blankG = own.juncGeom!.value, blankE = own.juncEdge!.value;
    this.unCut = () => { own.juncOn!.value = 0; own.juncGeom!.value = blankG; own.juncEdge!.value = blankE; };
    own.juncGeom!.value = geom.texture; own.juncEdge!.value = edgeTex; own.juncOn!.value = 1;   // (the network's own uniforms, shared by its programs and declared with their defaults in network-object.ts: its tubes cut from now on)
    const u: Record<string, IUniform> = {
      ...own, juncInfoA: { value: this.targets[0]!.texture }, juncInfoB: { value: this.targets[1]!.texture },
      juncMV: { value: new Matrix4() }, juncP: { value: new Matrix4() }, juncN: { value: new Matrix3() }, juncEye: { value: new Vector3() },
    };
    const mat = markBlends(new ShaderMaterial({ name: 'junc-sdf', vertexShader: JUNC_VS, fragmentShader: JUNC_FS, precision: 'highp', side: BackSide, uniforms: u, defines: { VEIL: 1, ...vdbgDefines() } }));
    setBlendState(mat, true);
    const ico = new IcosahedronGeometry(1, 2), geo = new InstancedBufferGeometry();
    geo.index = ico.index; geo.setAttribute('position', ico.getAttribute('position')); geo.setAttribute('juncRegion', new InstancedBufferAttribute(Float32Array.from(rows), 1)); geo.instanceCount = rows.length;
    this.disposables.push(mat, geo, ico);
    this.mesh = new Mesh(geo, mat);
    this.mesh.name = `net:junc-sdf:${draw.name}`;
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

  dispose(): void {
    this.restore();
    this.unCut();
    this.mesh.removeFromParent();
    for (const d of this.disposables) d.dispose();
    for (const t of this.targets) t.dispose();
  }
}

/** Every network draw's marched junctions, as one group in the figure. */
export class JuncSdf {
  readonly group = new Group();
  private readonly nets: JuncNet[] = [];
  private readonly passScene = new Scene();
  private readonly passCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

  /** The figure's draws with junction regions; `why` when none has one. */
  static build(skel: Skeleton, draws: readonly NetDraw[]): JuncSdf | { why: string } {
    const withRegions = draws.filter((d) => d.regions.length);
    if (!withRegions.length) return { why: 'no network has a junction region' };
    const j = new JuncSdf();
    for (const d of withRegions) {
      const veil = d.meshes.find((m) => m.layers.mask === 1 << VESSEL_LAYER) ?? d.meshes[d.meshes.length - 1];
      if (!veil) continue;
      const n = new JuncNet(skel, d, (veil.material as ShaderMaterial).uniforms);
      j.nets.push(n); j.group.add(n.mesh);
    }
    j.group.name = 'net:junc-sdf';
    return j;
  }

  /** The info and cut passes, once per drawn frame, after the network's own (the capsule texture is the frame's). */
  prepass(gl: WebGLRenderer): void {
    if (!this.group.visible || !this.nets.length) return;
    const prev = gl.getRenderTarget(), ac = gl.autoClear;
    gl.autoClear = false;
    for (const n of this.nets) n.passes.forEach((p, k) => { this.passScene.clear(); this.passScene.add(p); gl.setRenderTarget(n.targets[k]!); gl.render(this.passScene, this.passCam); });
    this.passScene.clear();
    gl.setRenderTarget(prev); gl.autoClear = ac;
  }

  dispose(): void {
    for (const n of this.nets) n.dispose();
    this.group.removeFromParent();
  }
}
