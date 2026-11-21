// The ascites hull's program (21 Nov 2026, organic ascites package B; plan: docs in /mnt/project-files/rebuild-3d/ascites-organic-design.md sections 2 to 4). The water is ONE closed inflated hull, not a box:
// every vertex is a 2D point of the pool (position.xy, z = HULL_MID) with the pool's own attributes (aD depth under the surface, aW distance to the wall) plus aG (the unit 2D direction away from the wall,
// scene axes), aK (-1 back sheet, +1 front sheet; on the lid -1..1 from back to front) and aLid (1 on the lid).
//   - Thickness is elliptic from the wall: prof = sqrt(w (2 - w)), w = aW / uR, so the sheets meet on the wall line with a vertical tangent and there is no plateau and no flat face: zF = MID + uTf prof, zB = MID - uTb prof.
//   - REST-RAY SLIDE: every vertex is slid along the ray from the rest eye (uRestEye, the shot's own camera with no turn and no tilt) through its 2D point, so head-on it projects exactly onto 2D's pool whatever its
//     thickness (the lid collapses to the surface line). Turned or tilted, the true rounded body shows.
//   - The lid's two edges curl up like a meniscus by today's wall climb, scaled by uOff (0 head-on, 1 at the turn limit), and the front sheet's top row climbs with them so the two stay joined.
//   - Shading is the pool's own (POOL_BASE_GLSL, 2D's fluidAt) split between the two layers a ray crosses, plus ONE soft glossy highlight from the app's one world light (uLight = shared.light) on the front sheet and the
//     lid, and a grazing-depth tint that exists only when turned. No bands, no rim, no new outline: the flank line stays the one ink line.
// One mesh, two materials from these two programs: BackSide (define HULL_BACK: the back sheet, drawn before the organs) and FrontSide (the front sheet and the lid, after them).
// The constants of the hull's layout (HULL_MID, HULL_TF_MAX, HULL_TB_MAX) are written here too because the program needs them; the layout module (ascites-hull.ts) must agree (its test pins it).
import { CLIMB_FALL_PX, CLIMB_PX, FEATHER_PX, POOL_BASE_GLSL, POOL_COMMON_GLSL, RICH_SAT, RIPPLE_AMP2D, RIPPLE_DEPTH, RIPPLE_PX, f, poolLift } from './ascites.ts';
import { LIVER_CUT_VS_DECL, LIVER_CUT_VS_MAIN } from './liver-edge.ts';

/** The hull's middle plane (the gut's middle) and how far its front and back reach from it at a full belly (scene units). */
export const HULL_MID = -0.09, HULL_TF_MAX = 0.16, HULL_TB_MAX = 0.17;
/** The face highlight: the share of it kept head-on (the one deliberate head-on change; 0 keeps head-on pure 2D), its strength, its tightness, and the share of the alpha it adds. */
export const HEADON_FORM = 0.35, HI_MIX = 0.45, HI_ALPHA = 0.10, HI_POWER = 24;
/** The grazing tint (only when turned): how far toward the rich amber, how much more alpha, and the most alpha as a share of the ink's. */
export const GRAZE_TINT = 0.5, GRAZE_ALPHA = 0.35, GRAZE_CAP = 1.4;

export const HULL_VS = /* glsl */ `
attribute float aD;
attribute float aW;
attribute vec2 aG;
attribute float aK;
attribute float aLid;
uniform float uR;
uniform float uTf;
uniform float uTb;
uniform float uOff;
uniform vec3 uRestEye;
${POOL_COMMON_GLSL}
varying float vD;
varying float vE;
varying float vW;
varying float vPxu;
varying float vK;
varying float vLid;
varying vec3 vN;
varying vec3 vV;
${LIVER_CUT_VS_DECL}
void main() {
  float pxu = poolPxu(position);
  float wx = position.x * 300.0 + 700.0;
  bool lid = aLid > 0.5;
  float R = max(uR, 1e-3);
  float w = clamp(aW / R, 0.0, 1.0);
  float prof = sqrt(w * (2.0 - w));
  float zF = ${f(HULL_MID)} + uTf * prof;
  float zB = ${f(HULL_MID)} - uTb * prof;
  float z = lid ? mix(zB, zF, (aK + 1.0) * 0.5) : (aK > 0.0 ? zF : zB);
  // the lid's distance to its nearer edge in 2D units (the sheets' edge IS the surface: 0)
  float dEdge = lid ? min(zF - z, z - zB) * 300.0 : 0.0;
  vec3 p0 = vec3(position.xy, ${f(HULL_MID)});
  p0.y += poolLift(wx, aW, aD, pxu) / 300.0;
  // the meniscus curl: the lid's edges and the sheets' top rows climb by the wall climb, only off rest (uOff), so 2D's surface line does not move head-on
  p0.y += uOff * uLiving * ${f(CLIMB_PX)} / pxu * exp(-dEdge * pxu / ${f(CLIMB_FALL_PX)}) * (1.0 - smoothstep(0.0, ${f(RIPPLE_DEPTH)}, aD)) / 300.0;
  // the rest-ray slide: along the ray from the rest eye through the 2D point to the hull's depth
  float s = (uRestEye.z - z) / (uRestEye.z - ${f(HULL_MID)});
  vec3 p = vec3(uRestEye.xy + (p0.xy - uRestEye.xy) * s, z);
  // the normal (scene axes): the profile's slope along the direction away from the wall; the lid takes the ripple's slope
  float dprof = min((1.0 - w) / max(prof, 1e-3), 8.0);
  vec2 slope = (aK > 0.0 ? uTf : uTb) * dprof / R * 300.0 * aG;
  float boost = mix(1.0, clamp(${f(RIPPLE_PX)} / (${f(RIPPLE_AMP2D)} * max(pxu, 1e-3)), 1.0, 5.0), uLiving);
  float rs = (cos(wx / 38.0 + uPhase) * 0.7 / 38.0 + cos(wx / 23.0 - uPhase * 1.3) * 0.3 / 23.0) * uAmp * boost;
  vec3 n = lid ? normalize(vec3(-rs, 1.0, 0.0)) : normalize(vec3(-slope, aK > 0.0 ? 1.0 : -1.0));
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vN = normalize(mat3(modelMatrix) * n);
  vV = normalize(cameraPosition - wp.xyz);
  vD = lid ? 0.0 : aD;
  vE = lid ? dEdge : aD;
  vW = aW;
  vPxu = pxu;
  vK = aK;
  vLid = aLid;
  ${LIVER_CUT_VS_MAIN}
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const HULL_FS = /* glsl */ `
precision highp float;
${POOL_BASE_GLSL}
uniform float uOff;
uniform vec3 uLight;
varying float vE;
varying float vK;
varying float vLid;
varying vec3 vN;
varying vec3 vV;
void main() {
  bool lid = vLid > 0.5;
  bool frontSheet = !lid && vK > 0.0;
  // the pool's colour: the lid's sheen and line fall off from its own edges (the front one in full, the back one half, seen through the water); the sheets' from the surface, as the pool's
  poolBase(max(vD, 0.0), max(vE, 0.0), lid ? mix(0.5, 1.0, (vK + 1.0) * 0.5) : 1.0);
  vec3 c = gl_FragColor.rgb;
  float a0 = gl_FragColor.a;
  // each of the two layers a ray crosses takes the half of the alpha that stacks to 2D's one
  float halfA = 1.0 - sqrt(max(1.0 - a0, 0.0));
#ifdef HULL_BACK
  float a = lid ? 0.0 : halfA * uLiving;
#else
  float a = frontSheet ? mix(a0, halfA, uLiving) : halfA * uLiving;
#endif
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
#ifndef HULL_BACK
  // one soft glossy highlight from the world light: a faint sheen head-on, sliding across the swell as it turns
  float sp = pow(max(dot(N, normalize(uLight + V)), 0.0), ${f(HI_POWER)});
  float form = mix(${f(HEADON_FORM)}, 1.0, uOff);
  float hk = sp * form * uOpacity * uLiving * mix(1.0, smoothstep(0.0, ${f(FEATHER_PX)}, vW * vPxu), uLiving) * liverKeep(vW2d, 1.0 / max(vPxu, 1e-3));
  c = mix(c, vec3(1.0), ${f(HI_MIX)} * hk);
  a += ${f(HI_ALPHA)} * hk * (1.0 - a);
#endif
  // grazing depth, only when turned: along the curved side the water reads deeper amber
  if (!lid) {
    float g = pow(1.0 - abs(dot(N, V)), 2.0);
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    vec3 rich = clamp(vec3(lum) + (c - vec3(lum)) * ${f(RICH_SAT)}, 0.0, 1.0);
    c = mix(c, rich, ${f(GRAZE_TINT)} * g * uOff);
    a = min(a * (1.0 + ${f(GRAZE_ALPHA)} * g * uOff), max(a, ${f(GRAZE_CAP)} * uInkA * uOpacity));
  }
  gl_FragColor = vec4(c, a);
}`;
/** One program, two materials (the GLSL compile test builds both): the BackSide one is built with `HULL_BACK` defined. */
export const GL_PROGRAMS = [
  { name: 'ascites hull (front)', vs: HULL_VS, fs: HULL_FS },
  { name: 'ascites hull (back)', vs: HULL_VS, fs: HULL_FS, defines: { HULL_BACK: '' } },
];

// ---- the JS twin (the tests' view of the vertex program, from the same constants) ----
export interface HullVertexIn { x: number; y: number; aW: number; aD: number; aK: number; aLid: number }
export interface HullUniforms { R: number; Tf: number; Tb: number; off: number; restEye: readonly [number, number, number]; living: number; phase: number; amp: number; slosh: number; pxu: number }
/** The vertex program's position (scene units): the 2D point (x, y scene) lifted by the pool's lift and the curl, put at the hull's depth, and slid along the rest eye's ray. */
export function hullVertex(v: HullVertexIn, u: HullUniforms): [number, number, number] {
  const R = Math.max(u.R, 1e-3), w = Math.min(1, Math.max(0, v.aW / R)), prof = Math.sqrt(w * (2 - w));
  const zF = HULL_MID + u.Tf * prof, zB = HULL_MID - u.Tb * prof, lid = v.aLid > 0.5;
  const z = lid ? zB + (zF - zB) * ((v.aK + 1) / 2) : v.aK > 0 ? zF : zB;
  const dEdge = lid ? Math.min(zF - z, z - zB) * 300 : 0;
  const wx = v.x * 300 + 700, ss = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let y = v.y + poolLift({ wx, aW: v.aW, aD: v.aD, phase: u.phase, amp: u.amp, slosh: u.slosh, living: u.living, pxu: u.pxu }) / 300;
  y += u.off * u.living * CLIMB_PX / u.pxu * Math.exp(-dEdge * u.pxu / CLIMB_FALL_PX) * (1 - ss(0, RIPPLE_DEPTH, v.aD)) / 300;
  const [ex, ey, ez] = u.restEye, s = (ez - z) / (ez - HULL_MID);
  return [ex + (v.x - ex) * s, ey + (y - ey) * s, z];
}
/** The fragment program's alpha (the part the tests judge): `a2d` is the pool's one alpha, `kind` the piece, `pass` the material; `hk` the highlight's strength 0..1 (before its form share), `form` its share (HEADON_FORM at rest). */
export function hullAlpha(a2d: number, kind: 'front' | 'back' | 'lid', pass: 'front' | 'back', living: number, hk = 0, form = HEADON_FORM): number {
  const half = 1 - Math.sqrt(Math.max(0, 1 - a2d));
  let a = pass === 'back' ? (kind === 'lid' ? 0 : half * living) : kind === 'front' ? a2d + (half - a2d) * living : half * living;
  if (pass === 'front') a += HI_ALPHA * hk * form * living * (1 - a);
  return a;
}
