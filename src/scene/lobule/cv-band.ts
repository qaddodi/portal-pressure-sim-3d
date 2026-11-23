// The central vein's collagen in SOS, Budd-Chiari and cirrhosis, drawn by ONE function of the radius and never painted (Mohammad, 23 Nov 2026, the iPad photo of the SOS slide: "Jesus fucking ugly").
// Root cause of the two rings, the crinkle and the jagged lumen: the same collagen was drawn twice. Inside the wall an opaque scar mesh read the plate at its pre-scale place, outside it the marks plate showed
// 2D's see-through fibre painter (an 0.4 fill of 18 overlapping bands), so a pale disc ringed a solid one 14 % apart; every fibre's flank then took the relief (|s| = 1) and the inner edge had lobes of 9 %.
// Here the band is a round lumen, a dense core to the wall and a smooth fade outward, from the live wall radius and the eased growth of the vein's channel, in lobule radii. The marks plate draws it past the wall,
// the scar mesh inside it, both through the same function of the same r, so they are equal at the wall and there is no seam. The JS twin below and the GLSL are written from the same numbers
// (tests/cv-band.test.ts judges the colours and the relief without a GPU).
import { glslNum as F } from '../cel-glsl.ts';
import { RELIEF_G, reliefS } from './relief.ts';

/** 2D's CV_FILL: the share of the lumen the scar takes at most. */
export const CV_FILL = 0.55;
/** The scar mesh reaches this share of the wall's radius (the wall's own line is drawn outside it). */
export const CV_WALL = 0.995;
/** The scar's inner edge never comes nearer the centre than this share of the wall's radius (the mesh's own inner circle: the lumen's edge is the shader's). */
export const CV_MESH_IN = 0.4;
/** The band's alpha in its core: the septa's dense core (the painter's coverage 0.89). */
export const CV_A = 0.89;
/** The relief's steepest |s| (before the light's own projection): the flank of the one crescent reaches this and never saturates. */
export const CV_S_MAX = 0.6;
/** The growth over which the whole band eases in from nothing. */
export const CV_EASE_P = 0.02;
/** The collar's reach past the wall, in the vein's own ring radius (rcv0) at growth 0 and its extra per growth. */
export const CV_COLLAR0 = 0.1, CV_COLLAR_K = 0.85;

const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
const smooth = (e0: number, e1: number, x: number): number => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const smoother = (t0: number): number => { const t = clamp(t0, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };

/** The band's three radii and its ease, in lobule radii: the lumen's edge, the wall, the collar's outer edge, and the eased share of the band that is there. */
export interface CvGeom { rL: number; rw: number; rC: number; k: number }
/** rw the live wall radius (view.ts cvRadiusNow), rcv0 the vein's cuff scale (net.rcv0), pZ the eased growth of the vein's channel (growth.ts). */
export function cvGeom(rw: number, rcv0: number, pZ: number): CvGeom {
  const p = clamp(pZ, 0, 1);
  return { rL: rw * (1 - CV_FILL * p), rw, rC: rw + rcv0 * (CV_COLLAR0 + CV_COLLAR_K * p) * smooth(0, 0.05, p), k: smooth(0, CV_EASE_P, p) };
}

/** The lumen's edge, anti-aliased over `aa` (one device pixel in lobule radii): 0 inside the lumen, 1 in the core. */
export const cvEdge = (r: number, g: CvGeom, aa = 0): number => (aa > 0 ? smooth(g.rL - 0.5 * aa, g.rL + 0.5 * aa, r) : r >= g.rL ? 1 : 0);
/** 1 to the wall, then a smooth (C2) fade to 0 at the collar's edge. */
export const cvWall = (r: number, g: CvGeom): number => 1 - smoother((r - g.rw) / Math.max(g.rC - g.rw, 1e-5));
/** The band's alpha at radius r: no angle, the same function for the marks plate and the scar mesh. */
export const cvAlpha = (r: number, g: CvGeom, aa = 0): number => CV_A * cvEdge(r, g, aa) * cvWall(r, g) * g.k;
/** The height's slope along the radius, in the relief's own units (alpha per plate px, so that RELIEF_G times it is the steepest |s| = CV_S_MAX): a sin-squared hump from the lumen's edge to the collar's. */
export function cvSlope(r: number, g: CvGeom): number {
  const u = (r - g.rL) / Math.max(g.rC - g.rL, 1e-5);
  return u < 0 || u > 1 ? 0 : (CV_S_MAX / RELIEF_G) * Math.sin(2 * Math.PI * u);
}
/** The band's relief at radius r for the unit radial direction `dir` and the world light `L` (both in the plate's x right, y up): one lit flank, one shade flank, flat in the core's middle. */
export const cvRelief = (r: number, g: CvGeom, dir: readonly [number, number], L: readonly [number, number]): number => {
  const m = cvSlope(r, g);
  return reliefS(m * dir[0], m * dir[1], L[0], L[1]);
};

/** The GLSL twin. `span` is the plate's side in lobule radii (2 x PLATE_BOX): r = |uv - 0.5| x span x uScarK (the scar mesh is scaled by the vein's own scale, which its uv does not know). Needs RELIEF_GLSL and `varying vec2 vL`. */
export const cvBandGlsl = (span: number): string => /* glsl */ `
uniform vec4 uCv;      // the vein's collagen now, in lobule radii: x the lumen's edge, y the wall, z the collar's outer edge, w how much of the band is there (0 to 1)
uniform vec3 uCvCol;   // its colour (the septa's, --lz-septum)
uniform float uScarK;  // 1 on the marks plate; the vein's scale on the scar mesh
const float CV_A = ${F(CV_A)};
const float CV_S_MAX = ${F(CV_S_MAX)};
const float CV_SPAN = ${F(span)};
float cvEdge(float r, float aa) { return smoothstep(uCv.x - 0.5 * aa, uCv.x + 0.5 * aa, r); }
float cvWall(float r) { float t = clamp((r - uCv.y) / max(uCv.z - uCv.y, 1e-5), 0.0, 1.0); return 1.0 - t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
float cvRelief(float r, vec2 dir) {
  float u = (r - uCv.x) / max(uCv.z - uCv.x, 1e-5);
  float m = (u < 0.0 || u > 1.0) ? 0.0 : (CV_S_MAX / RELIEF_G) * sin(6.2831853 * u);
  return reliefS(m * dir, vL);
}
`;
