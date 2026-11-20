// The junction skin's two shaders (rebuild-3d/junction-skin-spec.md sections 4.6 to 4.9). A skin is ONE closed mesh that fills the gap at a junction between the seam rings of the tubes that meet there (its ARMS).
// Every vertex carries four weights (how much it belongs to each arm). Nothing about an arm is baked into the mesh but its rest shape: the live width, the colour, the fade and the highlight of each arm are read
// on the GPU and blended by those weights, so a calibre eases, a colour runs through the junction as a gradient and nothing is rebuilt while the figure moves.
//
// The rules are the tube's own, spliced from vessels/glsl-shared.ts (swellOf, lensOfAt, the ink's colour and width, the pixel rule) and from the cel chunks, so on a seam ring, where one arm's weight is 1, the skin is the
// tube: same position (VERTEX), same colour, same line. The skin differs from the tube in exactly four ways:
//   1. It has no single centreline, so its ink is the OUTLINE OF THE SMOOTH UNION of its arms' live capsules in screen pixels (the 2D figure's own rule, fork-joins.copied.js), not a distance to one axis.
//   2. It draws no chevrons, streaks or dust (the tubes fade those out before the seam, the stream chain carries the heads on).
//   3. It has no Circuit morph: on the map the tubes become flat lines and the map draws its own joins, so the skin fades out with `circT` (section 4.9).
//   4. It does no run-on mate easing: the weights do the blending.
//
// THE UNIFORMS (the scene wiring, skin-object.ts, spreads the shared ones by reference and writes the per-arm ones; the table is the spec's section 3, plus the three marked +):
//   armData[4]   vec4   (dataIndex, baseD, widthKind, lensIndex) per arm, in arm order; an unused arm has dataIndex < 0 (and weight 0 everywhere)
//   armLensU[4]  float  the arm's lens ramp position at its seam (lensSpan already applied)
//   armFade[4]   float  the arm tube's alpha at its seam ring (the JS twin, fade-alpha.ts)
//   armHi[4]     float  the arm tube's highlight weight vHi at its seam
//   armNarrow[4] float  + (vertex stage only) the arm tube's stenosis waist at its seam: its live width there is swell x (1 - narrow), as the tube's is, so a seam inside a short piece's waist meets the tube with no step
//   armColor[4]  vec4 + the arm tube's own `color` uniform (rgb: an artery wears the look's artery red, a vein its portal or systemic tone) and, in a, its `lensUse` (an artery 0, a vein 1)
//   armAxis[12]  vec3   per arm three points of its axis, the junction side first, rest positions, model space
//   armAxisR[12] float  the rest radius at those points
//   skinK        float  the smooth-min blend width, scene units
//   lensUse + : 1 (the per-arm flag above is multiplied in), inkColor, inkColorCirc, tubeDark, fade, hiPx, inflate, res, dpr, projY, circT, vdata, vdataSize, useData, the two lens sets (lensGradA/B, lensLaneA/B,
//   lensModeA/B, laneColA/B, lensMix, lensTail, lensSmooth) are the tubes' (shared by reference).
//
// Lane lenses (the Blood origin and First pass lenses draw lanes side by side ACROSS a tube): a skin has no "across" and takes the lane's centre (across 0), so a junction shows its arms' middle lane; the lens ramps
// (pressure, oxygen...) are exact.
import { CEL_LIGHT_GLSL, CEL_TUBE_GLSL } from '../../cel-glsl.ts';
import { FADE_GLSL } from '../../materials/shaders.ts';
import { TUBE_DEPTH_SHARE, TUBE_SAG } from '../shaders.ts';
import { LENS_OF_AT_GLSL, SWELL_OF_GLSL, inkColourGlsl, inkPxGlsl, wpcGlsl } from '../glsl-shared.ts';
import { glslNum as F } from '../../cel-glsl.ts';

/** How many arms a skin blends (a junction of three or four tubes): the weights are one vec4. */
export const SKIN_ARMS = 4;
/** The figure's units in one scene unit on the body (the tube's vU at circShare 0, vessels/shaders.ts): the 2D figure's width and line rules are written in them. tests/skin-shaders.test.ts holds this to the vessel's own text. */
export const SKIN_FIGURE_UNITS = 300;
/** The Circuit crossfade (section 4.9): the skin is gone by this share of the morph, and the tubes' cut fades in over the same. */
export const SKIN_CIRCUIT_FADE = 0.35;

const ARMS4 = (name: string) => `vec4(${name}[0], ${name}[1], ${name}[2], ${name}[3])`;

export const SKIN_VS = /* glsl */ `
const float SKIN_U = ${F(SKIN_FIGURE_UNITS)};
attribute vec3 cen;      // the nearest point on the nearest arm's axis: the depth and the lumen's centre, as a tube's ring centre is
attribute vec4 weight;   // how much of this vertex belongs to each arm (sum 1, arm order)
attribute float restR;   // the blended rest radius here (scene units)
uniform float inflate;
uniform sampler2D vdata;
uniform vec2 vdataSize;
uniform float useData;
uniform vec2 res;
uniform float hiPx;
uniform vec4 armData[${SKIN_ARMS}];
uniform float armHi[${SKIN_ARMS}];
uniform float armNarrow[${SKIN_ARMS}];   // each arm tube's stenosis waist at its seam (the narrow attribute there): 0 at rest and at a vessel's ends, a little more where a cut lies inside a short piece's waist
varying vec3 vN;
varying vec3 vV;
varying float vW;        // the surface's clip depth
varying float vCenW;     // the axis's clip depth: the one the ink band is built from (the tube's vCen.z)
varying vec4 vWeight;
varying float vRest;
varying vec4 vSwell;     // the arms' live widths against their built ones, read once here so the fragment stage does not fetch them again
${SWELL_OF_GLSL}
void main() {
  // each arm's live width (the engine's diameter by the 2D figure's rule), then the blend: on a seam ring the weight is 1 on its own arm, so this IS the tube's swell and the ring lands where the tube's ring lands
  vec4 sw = vec4(1.0);
  // (an arm's waist at its seam is part of its width there, as the tube's own narrowK is: the same share kept, 1 - narrow clamped as the tube clamps it)
  for (int i = 0; i < ${SKIN_ARMS}; i++) if (armData[i].x >= 0.0) sw[i] = swellOf(armData[i].x, armData[i].y, armData[i].z) * (1.0 - clamp(armNarrow[i], 0.0, 0.97));
  float swell = dot(weight, sw);
  vec4 cc = projectionMatrix * (modelViewMatrix * vec4(cen, 1.0));
  float wpcV = ${wpcGlsl('cc.w', 'projectionMatrix[1][1]', 'SKIN_U')};   // the figure's units under one CSS px here
  float lumenW = restR * swell;
  float rCssV = lumenW * SKIN_U / max(wpcV, 1e-6);   // the lumen's radius in CSS px
  float hi = dot(weight, ${ARMS4('armHi')});
  // the tube's own ink width (no stenosis waist at a seam, narrowK 1) plus the picked vein's extra line, blended
  float inkPx = ${inkPxGlsl('rCssV', 'rCssV')};
  float inkW = (inkPx + hiPx * hi) * wpcV / SKIN_U;   // scene units
  // the tube's vertex rule (vessels/shaders.ts) with its radius * rk replaced by this vertex's own rest radius and its swell by the blend; the ring is a polygon, so its corners stand TUBE_SAG farther out
  vec3 p = position + normal * (inflate + restR * (swell - 1.0) + inkW + (lumenW + inkW) * ${F(TUBE_SAG)});
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  vec4 c = projectionMatrix * mv;
  c.z = mix(cc.z / cc.w, c.z / c.w, ${F(TUBE_DEPTH_SHARE)}) * c.w;   // depth by the axis, as the tube's: a fat skin never bulges over a thinner vessel above it
  vW = c.w;
  vCenW = cc.w;
  vWeight = weight;
  vRest = restR;
  vSwell = sw;
  gl_Position = c;
}`;

export const SKIN_FS = /* glsl */ `
${FADE_GLSL}
uniform float tubeDark;
${CEL_TUBE_GLSL}
${CEL_LIGHT_GLSL}
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
const float SKIN_U = ${F(SKIN_FIGURE_UNITS)};
uniform vec3 inkColor;
uniform vec3 inkColorCirc;
uniform float circT;
uniform vec2 res;
uniform float dpr;
uniform float projY;
uniform float hiPx;
uniform float lensUse;
uniform float lensMix;
uniform float lensTail;
uniform float lensSmooth;
uniform sampler2D lensGradA;
uniform sampler2D lensLaneA;
uniform sampler2D lensGradB;
uniform sampler2D lensLaneB;
uniform float lensModeA;
uniform float lensModeB;
uniform vec3 laneColA[5];
uniform vec3 laneColB[5];
uniform vec4 armData[${SKIN_ARMS}];
uniform float armLensU[${SKIN_ARMS}];
uniform float armFade[${SKIN_ARMS}];
uniform float armHi[${SKIN_ARMS}];
uniform vec4 armColor[${SKIN_ARMS}];
uniform vec3 armAxis[${SKIN_ARMS * 3}];
uniform float armAxisR[${SKIN_ARMS * 3}];
uniform float skinK;
varying vec3 vN;
varying vec3 vV;
varying float vW;
varying float vCenW;
varying vec4 vWeight;
varying float vRest;
varying vec4 vSwell;
${LENS_OF_AT_GLSL}
// the polynomial smooth-min of the 2D figure's own join (fork-joins.copied.js; spec 4.3): a blend k wide, and never lower than the smaller of the two
float skinSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / max(k, 1e-4), 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
// the point's place in device pixels (x, y) and the radius a rest radius R has there in device pixels (z)
vec3 skinPx(vec3 p, float R, float swell) {
  vec4 q = projectionMatrix * (modelViewMatrix * vec4(p, 1.0));
  return vec3((q.xy / q.w * 0.5 + 0.5) * res * dpr, R * swell / max(${wpcGlsl('q.w', 'projY', '1.0')}, 1e-9) * dpr);
}
// signed distance, in device px, from this pixel to the live capsule of one arm: the least over its two segments of (the distance to the segment, less the radius interpolated at the closest point)
float skinArmPx(vec2 frag, int arm, float swell) {
  vec3 a = skinPx(armAxis[arm * 3], armAxisR[arm * 3], swell);
  vec3 b = skinPx(armAxis[arm * 3 + 1], armAxisR[arm * 3 + 1], swell);
  vec3 c = skinPx(armAxis[arm * 3 + 2], armAxisR[arm * 3 + 2], swell);
  vec2 ab = b.xy - a.xy, bc = c.xy - b.xy;
  float t1 = clamp(dot(frag - a.xy, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  float t2 = clamp(dot(frag - b.xy, bc) / max(dot(bc, bc), 1e-6), 0.0, 1.0);
  float d1 = length(frag - a.xy - ab * t1) - mix(a.z, b.z, t1);
  float d2 = length(frag - b.xy - bc * t2) - mix(b.z, c.z, t2);
  return min(d1, d2);
}
// the outline of the smooth union of the live arms, in device px: negative inside the lumen, 0 on the wall (pairwise in arm order, as the mesh's own SDF)
float skinSdPx(float kPx) {
  float d = 0.0;
  bool first = true;
  for (int i = 0; i < ${SKIN_ARMS}; i++) {
    if (armData[i].x < 0.0) continue;
    float di = skinArmPx(gl_FragCoord.xy, i, vSwell[i]);
    d = first ? di : skinSmin(d, di, kPx);
    first = false;
  }
  return d;
}
void main() {
  vec3 n = normalize(vN);
  float sT = dot(n, celLightView());   // n.L against the WORLD light, as the tube (a camera that moves changes no shade)
  float swT = fwidth(sT);              // (a derivative: taken outside any branch)
  if (!gl_FrontFacing) discard;
  if (fadedOut()) discard;
  // the arms' alphas, blended by weight: the junction fade rule already holds on the tubes, so their seam alphas agree and the skin runs through them. On the Circuit's map the tubes become flat lines and the map draws its own
  // joins, so the skin fades out over the first SKIN_CIRCUIT_FADE of the morph (the arm tubes' cut fades back in over the same)
  float alpha = dot(vWeight, ${ARMS4('armFade')}) * (1.0 - smoothstep(0.0, ${F(SKIN_CIRCUIT_FADE)}, circT));
  if (alpha < 0.004) discard;
  // the live lumen's radius at the axis' depth, and the line the vertex stage built the mesh ink wider by (the tube's own rule: a share of the radius held between two CSS widths, thinned with a hairline)
  float swellB = dot(vWeight, vSwell);
  float wpcAx = ${wpcGlsl('vCenW', 'projY', 'SKIN_U')};
  float vR = vRest * swellB * SKIN_U;
  float rCssAx = vR / max(wpcAx, 1e-6);
  float hi = dot(vWeight, ${ARMS4('armHi')});
  float inkDev = (${inkPxGlsl('rCssAx', 'rCssAx')} + hiPx * hi) * dpr;
  float kPx = skinK / max(wpcAx / SKIN_U, 1e-9) * dpr;
  float sdPx = skinSdPx(kPx);
  if (sdPx > inkDev + 0.5) discard;   // (past the band: the mesh is a little wider than the union's line where the arms spread)
  // THE BODY COLOUR: each arm's lens colour at its seam's ramp position (the tube's own rule, the two lens sets crossfaded by lensMix), then the arms blended by weight: a gradient through the junction, the tube's colour on a seam
  vec3 base = vec3(0.0);
  for (int i = 0; i < ${SKIN_ARMS}; i++) {
    if (armData[i].x < 0.0) continue;
    vec4 la = lensOfAt(armData[i].w, armLensU[i], lensGradA, lensLaneA, lensModeA, laneColA, 0.0);
    vec4 lb = lensOfAt(armData[i].w, armLensU[i], lensGradB, lensLaneB, lensModeB, laneColB, 0.0);
    la.a *= armColor[i].a;
    lb.a *= armColor[i].a;
    base += vWeight[i] * mix(mix(armColor[i].rgb, la.rgb, la.a), mix(armColor[i].rgb, lb.rgb, lb.a), lensMix);
  }
  float rDev = vR / max(${wpcGlsl('vW', 'projY', 'SKIN_U')}, 1e-6) * dpr;
  vec3 c = celTubeTone(base, sT, swT, rDev);   // two flat tones, matte and opaque: the tube's own
  float inkT = smoothstep(-0.5, 0.5, sdPx);   // the outline: ink outside the live lumen, antialiased half a pixel each side
  c = mix(c, mix(${inkColourGlsl('base')}, inkColorCirc, circT), inkT);
  gl_FragColor = vec4(c, alpha);
}`;
