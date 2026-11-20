// The junction skin's two shaders (rebuild-3d/junction-skin-spec.md sections 4.6 to 4.9). A skin is ONE closed mesh that fills the gap at a junction between the seam rings of the tubes that meet there (its ARMS).
// Every vertex carries four weights (how much it belongs to each arm). Nothing about an arm is baked into the mesh but its rest shape: the live width, the colour, the fade and the highlight of each arm are read
// on the GPU and blended by those weights, so a calibre eases, a colour runs through the junction as a gradient and nothing is rebuilt while the figure moves.
//
// The rules are the tube's own, spliced from vessels/glsl-shared.ts (swellOf, lensOfAt, the ink's colour and width, the pixel rule) and from the cel chunks, so on a seam ring, where one arm's weight is 1, the skin is the
// tube: same position (VERTEX), same colour, same line. The skin differs from the tube in exactly four ways:
//   1. It has no single centreline, so its ink is the OUTLINE OF THE SMOOTH UNION of its arms' live capsules in screen pixels (the 2D figure's own rule, fork-joins.copied.js), not a distance to one axis.
//   2. Its flow marks (chevrons, streaks, dust) are the tubes' own, drawn once per arm on that arm's arc and blended by the arm weights (Mohammad, 20 Nov: they cross a junction, they do not break at the seam): see THE FLOW MARKS below.
//   3. It has no Circuit morph: on the map the tubes become flat lines and the map draws its own joins, so the skin fades out with `circT` (section 4.9).
//   4. It does no run-on mate easing: the weights do the blending.
//
// THE UNIFORMS (the scene wiring, skin-object.ts, spreads the shared ones by reference and writes the per-arm ones; the table is the spec's section 3, plus the three marked +):
//   armData[6]   vec4   (dataIndex, baseD, widthKind, lensIndex) per arm, in arm order; an unused arm has dataIndex < 0 (and weight 0 everywhere)
//   armAF[6]     vec4   per arm: x the arm's lens ramp position at its seam (lensSpan already applied), y the arm tube's alpha at its seam ring (the JS twin, fade-alpha.ts), z the arm tube's highlight weight vHi at its seam,
//                       w + how much of the arm's tube is there at its seam: its group visible, its draw-on (`reveal`) at the seam's u and its dive fade (arm-twins.ts armPresenceAt): the skin dissolves in the tubes' own pattern as they do, so it never stands alone
//                       (one vec4 each: a float array costs a whole vector a slot, and six arms of five floats broke the fragment budget)
//   armNarrow[6] float  + (vertex stage only) the arm tube's stenosis waist at its seam: its live width there is swell x (1 - narrow), as the tube's is, so a seam inside a short piece's waist meets the tube with no step
//   armColor[6]  vec4 + the arm tube's own `color` uniform (rgb: an artery wears the look's artery red, a vein its portal or systemic tone) and, in a, its `lensUse` (an artery 0, a vein 1)
//   armCopy[6]   vec4   + (w) the arm this one runs through the node with (through.ts), or -1: the outline's union takes the pair by a plain minimum
//   armAxisP[24] vec4   per arm four points of its axis (the node J, the start of the straight line through the seam, the seam, the far point), rest positions, model space; w the rest radius at the point
//   armArc[4]    vec4 + (the arm's flow marks) the arc, figure units, at its seam (u x len x SKIN_FIGURE_UNITS), +1 if the arc grows toward the node (the arm is its vessel's end 1) else -1, the vessel's length (figure units), its rest radius (figure units)
//   armFlow[4]   float + the arm tube's `flowAmount`
//   streamTex, chainTex, streakAmt, dustP, time, markDark, markLight, markRev: the tubes' (shared by reference)
//   skinK        float  the smooth-min blend width, scene units
//   lensUse + : 1 (the per-arm flag above is multiplied in), inkColor, inkColorCirc, tubeDark, fade, hiPx, inflate, res, dpr, projY, circT, vdata, vdataSize, useData, the two lens sets (lensGradA/B, lensLaneA/B,
//   lensModeA/B, laneColA/B, lensMix, lensTail, lensSmooth) are the tubes' (shared by reference).
//
// GROWING ARMS (spec 10.2; mesh.ts `GrowMorph`): a collateral or a shunt comes and goes, and its mouth on the trunk must ease in with it, never pop. The skin carries a second shape for each growing arm (at most SKIN_GROWERS, the shader's SKIN_GROW define): the same
// topology with that arm's capsule at radius 0. The vertex stage is `value = P1 - (1 - g) * delta` for position, normal, rest radius and weights, `g` the arm's live growth (`armGrow`, written by the SkinSet: its tube's draw-on at the seam), so on the arm's seam ring that
// is the tube's own ring at share g, and at g = 0 the trunk is a plain trunk (the weights are the trunk's own, so no dent). The arm's live width in the ink's capsule is `g x swell`, the same lumen, so the outline of the mouth grows with it. Plain skins compile without any of it.
//   armGrow[6]   float  + each arm's growth: 1 for a plain arm; a growing arm's draw-on at its seam (0 gone, 1 whole)
//   growG        vec2   + the growth of the first and second growing arm (the same numbers, in the order of the mesh's morphs)
//   gPosA0, gNorA0, gWtA0, gWt2A0 (and A1)   attributes +  per growing arm: (P1 - P0 position, restR1 - restR0), N1 - N0, the weight differences of arms 0 to 3 and of arms 4, 5
//
// Lane lenses (the Blood origin and First pass lenses draw lanes side by side ACROSS a tube): a skin has no "across" and takes the lane's centre (across 0), so a junction shows its arms' middle lane; the lens ramps
// (pressure, oxygen...) are exact.
import { CEL_LIGHT_GLSL, CEL_TUBE_GLSL } from '../../cel-glsl.ts';
import { FADE_GLSL } from '../../materials/shaders.ts';
import { TUBE_DEPTH_SHARE } from '../shaders.ts';
import { LENS_OF_AT_GLSL, CHEV_ONE_GLSL, CHEV_CREAM_GLSL, FLOW_MARKS_GLSL, SWELL_OF_GLSL, inkColourGlsl, inkPxGlsl, wpcGlsl, glowWeightGlsl, glowToneGlsl } from '../glsl-shared.ts';
import { CHEVRON_GLSL } from '../../blood/chevron-glsl.ts';
import { DUST_GLSL } from '../../blood/dust-glsl.ts';
import { glslNum as F } from '../../cel-glsl.ts';

/** How many arms a skin blends (a junction of three or four tubes): the weights are one vec4. */
export const SKIN_ARMS = 6;
/** The points of an arm's axis the fragment stage draws its ink from: the node J (the bridge over the art's gap, spec 10.5), the straight line's start, the seam, the far point. */
export const SKIN_AXIS_PTS = 4;
/** The figure's units in one scene unit on the body (the tube's vU at circShare 0, vessels/shaders.ts): the 2D figure's width and line rules are written in them. tests/skin-shaders.test.ts holds this to the vessel's own text. */
export const SKIN_FIGURE_UNITS = 300;
/** The Circuit crossfade (section 4.9): the skin is gone by this share of the morph, and the tubes' cut fades in over the same. */
export const SKIN_CIRCUIT_FADE = 0.35;
/** An arm whose live width share (its width times its growth) is under this is held out of the skin's outline, smoothly: a width of nothing is a line, not a vessel (the thorns on the SMV, Mohammad 20 Nov). */
export const SKIN_ARM_ABSENT = 0.3;
/** How many CSS px wider the outline's band is on a seam ring, so the skin never trims a pixel of the silhouette the cut tube no longer covers (the specks along the walls, Mohammad 20 Nov). */
export const SKIN_SEAM_PAD_PX = 1.5;

/** The weighted sum of a per-arm float uniform array over all the arms (`wAt` and `wAtF` read the two weight attributes). */
const BLEND = (name: string, w = 'wAt', comp = ''): string => Array.from({ length: SKIN_ARMS }, (_, i) => `${w}(${i}) * ${name}[${i}]${comp}`).join(' + ');
/** The four arms' shares of THIS copy are read per arm: component `SKIN_COPY` of each arm's (front, solid, veil), spec 10.4. */
const COPY_OF = (i: number): string => `armCopy[${i}][SKIN_COPY]`;

/** The vertex stage's growing-arm declarations and its morph (empty for a skin with none: SKIN_GROW 0). */
const GROW_DECL = /* glsl */ `
#if SKIN_GROW > 0
attribute vec4 gPosA0;   // growing arm 0: P1 - P0 (xyz) and restR1 - restR0 (w)
attribute vec3 gNorA0;   // N1 - N0
attribute vec4 gWtA0;    // weight1 - weight0, arms 0 to 3
attribute vec2 gWt2A0;   // arms 4 and 5
#endif
#if SKIN_GROW > 1
attribute vec4 gPosA1;
attribute vec3 gNorA1;
attribute vec4 gWtA1;
attribute vec2 gWt2A1;
#endif
uniform float armGrow[${SKIN_ARMS}];   // each arm's growth (1 for an arm that does not grow)
uniform vec2 growG;                    // the growth of the first and of the second growing arm
`;

export const SKIN_VS = /* glsl */ `
const float SKIN_U = ${F(SKIN_FIGURE_UNITS)};
#ifndef SKIN_GROW
#define SKIN_GROW 0   // how many growing arms the skin morphs (the material's define; a skin with none has no morph)
#endif
attribute vec3 cen;      // the nearest point on the nearest arm's axis: the depth and the lumen's centre, as a tube's ring centre is
attribute vec4 weight;   // how much of this vertex belongs to each arm (arms 0 to 3; the six sum to 1, arm order)
attribute vec2 weight2;  // arms 4 and 5
attribute float restR;   // the blended rest radius here (scene units)
attribute float sagK;    // the share of the radius this vertex stands out for its facets' chord sag (facet-sag.ts; a seam ring's is the tube's TUBE_SAG)
uniform float inflate;
uniform sampler2D vdata;
uniform vec2 vdataSize;
uniform float useData;
uniform vec2 res;
uniform float hiPx;
uniform vec4 armData[${SKIN_ARMS}];
uniform vec4 armAF[${SKIN_ARMS}];   // per arm (lensU, fade, hi, pres): one vec4 each, because a float array costs a whole vector a slot
uniform float armNarrow[${SKIN_ARMS}];   // each arm tube's stenosis waist at its seam (the narrow attribute there): 0 at rest and at a vessel's ends, a little more where a cut lies inside a short piece's waist
${GROW_DECL}
varying vec3 vN;
varying vec3 vV;
varying float vW;        // the surface's clip depth
varying float vCenW;     // the axis's clip depth: the one the ink band is built from (the tube's vCen.z)
varying vec4 vWeight;
varying vec2 vWeight2;
varying float vRest;
varying vec4 vSwell;
varying vec2 vSwell2;    // the arms' live widths against their built ones, read once here so the fragment stage does not fetch them again
varying vec3 vPos;       // the rest position: each arm's arc at this pixel (the flow marks) is read from it
${SWELL_OF_GLSL}
vec4 wgA;   // the weights now (the mesh's, less what each growing arm has still to grow)
vec2 wgB;
float wAt(int i) { return i < 4 ? wgA[i] : wgB[i - 4]; }
void main() {
  // THE SHAPE NOW: P1 less, for each growing arm, how far it has still to grow times its difference to the closed shape (a plain skin is its mesh as it is)
  vec3 pos = position, nor = normal;
  float rst = restR;
  vec4 wA = weight;
  vec2 wB = weight2;
#if SKIN_GROW > 0
  { float q = 1.0 - growG.x; pos -= q * gPosA0.xyz; rst -= q * gPosA0.w; nor -= q * gNorA0; wA -= q * gWtA0; wB -= q * gWt2A0; }
#endif
#if SKIN_GROW > 1
  { float q = 1.0 - growG.y; pos -= q * gPosA1.xyz; rst -= q * gPosA1.w; nor -= q * gNorA1; wA -= q * gWtA1; wB -= q * gWt2A1; }
#endif
#if SKIN_GROW > 0
  nor = normalize(nor + vec3(1e-6, 0.0, 0.0));
  wA = max(wA, vec4(0.0)); wB = max(wB, vec2(0.0));
  float wSum = max(wA.x + wA.y + wA.z + wA.w + wB.x + wB.y, 1e-6);
  wA /= wSum; wB /= wSum;
#endif
  wgA = wA; wgB = wB;
  // each arm's live width (the engine's diameter by the 2D figure's rule), then the blend: on a seam ring the weight is 1 on its own arm, so this IS the tube's swell and the ring lands where the tube's ring lands.
  // A growing arm has two: its LUMEN (swT: the width times its growth, what the ink's capsule and the flow marks are made from) and the SHIFT its vertices take along their normals (swE: the morph has already moved
  // them by the growth, so the engine's width is applied to the grown part only: radius g x R x swell = g R + g R (swell - 1))
  float swT[${SKIN_ARMS}];
  float swE[${SKIN_ARMS}];
  for (int i = 0; i < ${SKIN_ARMS}; i++) { swT[i] = 1.0; swE[i] = 1.0; }
  // (an arm's waist at its seam is part of its width there, as the tube's own narrowK is: the same share kept, 1 - narrow clamped as the tube clamps it)
  for (int i = 0; i < ${SKIN_ARMS}; i++) if (armData[i].x >= 0.0) {
    float sw = swellOf(armData[i].x, armData[i].y, armData[i].z) * (1.0 - clamp(armNarrow[i], 0.0, 0.97));
    float gi = 1.0;
#if SKIN_GROW > 0
    gi = armGrow[i];
#endif
    swT[i] = sw * gi; swE[i] = 1.0 + gi * (sw - 1.0);
  }
  float swell = 0.0, swellE = 0.0;
  for (int i = 0; i < ${SKIN_ARMS}; i++) { float wi = wAt(i); swell += wi * swT[i]; swellE += wi * swE[i]; }
  vec4 cc = projectionMatrix * (modelViewMatrix * vec4(cen, 1.0));
  float wpcV = ${wpcGlsl('cc.w', 'projectionMatrix[1][1]', 'SKIN_U')};   // the figure's units under one CSS px here
  float lumenW = rst * swell;
  float rCssV = lumenW * SKIN_U / max(wpcV, 1e-6);   // the lumen's radius in CSS px
  float hi = ${BLEND('armAF', 'wAt', '.z')};
  // the tube's own ink width (no stenosis waist at a seam, narrowK 1) plus the picked vein's extra line, blended
  float inkPx = ${inkPxGlsl('rCssV', 'rCssV')};
  float inkW = (inkPx + hiPx * hi) * wpcV / SKIN_U;   // scene units
  // the tube's vertex rule (vessels/shaders.ts) with its radius * rk replaced by this vertex's own rest radius and its swell by the blend; the ring is a polygon, so its corners stand TUBE_SAG farther out
  vec3 p = pos + nor * (inflate + rst * (swellE - 1.0) + inkW + (lumenW + inkW) * sagK);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * nor);
  vV = normalize(-mv.xyz);
  vec4 c = projectionMatrix * mv;
  c.z = mix(cc.z / cc.w, c.z / c.w, ${F(TUBE_DEPTH_SHARE)}) * c.w;   // depth by the axis, as the tube's: a fat skin never bulges over a thinner vessel above it
  vW = c.w;
  vCenW = cc.w;
  vWeight = wA;
  vWeight2 = wB;
  vRest = rst;
  vSwell = vec4(swT[0], swT[1], swT[2], swT[3]);
  vSwell2 = vec2(swT[4], swT[5]);
  vPos = position;
  gl_Position = c;
}`;

export const SKIN_FS = /* glsl */ `
#ifndef SKIN_COPY
#define SKIN_COPY 0   // which of the three copies this program draws (0 front, 1 solid, 2 veil): the material's define; a plain skin is its front copy
#endif
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
uniform vec4 armAF[${SKIN_ARMS}];   // per arm (lensU, fade, hi, pres)
uniform vec4 armCopy[${SKIN_ARMS}];   // each arm's shares of the three copies (xyz: front, solid, veil: vessel-object.ts copyShares; this program is ONE of them, SKIN_COPY) and in w the arm it runs THROUGH the node with (through.ts), or -1: their union is a plain minimum (one vec4, because a float array costs a whole vector a slot)
uniform vec4 armColor[${SKIN_ARMS}];
uniform vec4 armAxisP[${SKIN_ARMS * SKIN_AXIS_PTS}];   // xyz a point of the arm's axis, w the rest radius there
uniform float skinK;
uniform vec4 armArc[${SKIN_ARMS}];
uniform float armFlow[${SKIN_ARMS}];
uniform sampler2D vdata;
uniform vec2 vdataSize;
uniform float useData;
uniform sampler2D streamTex;
uniform sampler2D chainTex;
uniform float streakAmt;
uniform float time;
uniform vec3 markDark;
uniform vec3 markLight;
uniform vec3 markRev;
varying vec3 vN;
varying vec3 vV;
varying float vW;
varying float vCenW;
varying vec4 vWeight;
varying vec2 vWeight2;
varying float vRest;
varying vec4 vSwell;
varying vec2 vSwell2;
varying vec3 vPos;
float wAt(int i) { return i < 4 ? vWeight[i] : vWeight2[i - 4]; }
float swAt(int i) { return i < 4 ? vSwell[i] : vSwell2[i - 4]; }
${LENS_OF_AT_GLSL}
${CHEVRON_GLSL}
${DUST_GLSL}
${CHEV_ONE_GLSL}
${CHEV_CREAM_GLSL}
${FLOW_MARKS_GLSL}
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
  // the axis: J (the bridge over the art's gap), the start of the straight line through the seam, the seam, the far point
  vec3 p0 = skinPx(armAxisP[arm * ${SKIN_AXIS_PTS}].xyz, armAxisP[arm * ${SKIN_AXIS_PTS}].w, swell);
  vec3 p1 = skinPx(armAxisP[arm * ${SKIN_AXIS_PTS} + 1].xyz, armAxisP[arm * ${SKIN_AXIS_PTS} + 1].w, swell);
  vec3 p2 = skinPx(armAxisP[arm * ${SKIN_AXIS_PTS} + 2].xyz, armAxisP[arm * ${SKIN_AXIS_PTS} + 2].w, swell);
  vec3 p3 = skinPx(armAxisP[arm * ${SKIN_AXIS_PTS} + 3].xyz, armAxisP[arm * ${SKIN_AXIS_PTS} + 3].w, swell);
  vec2 a = p1.xy - p0.xy, b = p2.xy - p1.xy, c = p3.xy - p2.xy;
  float t0 = clamp(dot(frag - p0.xy, a) / max(dot(a, a), 1e-6), 0.0, 1.0);
  float t1 = clamp(dot(frag - p1.xy, b) / max(dot(b, b), 1e-6), 0.0, 1.0);
  float t2 = clamp(dot(frag - p2.xy, c) / max(dot(c, c), 1e-6), 0.0, 1.0);
  float d0 = length(frag - p0.xy - a * t0) - mix(p0.z, p1.z, t0);
  float d1 = length(frag - p1.xy - b * t1) - mix(p1.z, p2.z, t1);
  float d2 = length(frag - p2.xy - c * t2) - mix(p2.z, p3.z, t2);
  return min(d0, min(d1, d2));
}
// the outline of the smooth union of the live arms, in device px: negative inside the lumen, 0 on the wall (in arm order, as the mesh's own SDF: sdf.ts sdUnion). Two arms that run THROUGH the node (armCopy.w, through.ts: the trunk above and below
// a side vein) are united by a plain minimum and count as one: a blend between the halves of one trunk only adds a bulge
float skinSdPx(float kPx) {
  float dArm[${SKIN_ARMS}];
  // an arm that is not there (a collateral not yet grown, a vessel closed to nothing) is not in the outline: a capsule of no width is a LINE, its smooth union with the trunk a horn along it, and the cone of the arm's collapsed
  // ring out to the wall stayed inside its band as a thorn (Mohammad, 20 Nov). It is held out of reach (the blend sees nothing of it past k) and comes in as its width does: continuous, never a pop
  for (int i = 0; i < ${SKIN_ARMS}; i++) dArm[i] = armData[i].x < 0.0 ? 1.0e9 : skinArmPx(gl_FragCoord.xy, i, swAt(i)) + 2.0 * kPx * (1.0 - smoothstep(0.0, ${F(SKIN_ARM_ABSENT)}, swAt(i)));
  float d = 0.0;
  bool first = true;
  for (int i = 0; i < ${SKIN_ARMS}; i++) {
    if (armData[i].x < 0.0) continue;
    float m = armCopy[i].w;
    if (m > -0.5 && m < float(i) - 0.5) continue;   // (the second half of a run: taken with the first)
    float di = dArm[i];
    if (m > float(i) + 0.5) di = min(di, dArm[int(m + 0.5)]);
    d = first ? di : skinSmin(d, di, kPx);
    first = false;
  }
  return d;
}
void main() {
  // (a welded skin's normal is interpolated between vertices whose normals can face apart at a crease: its length can come to nothing, and normalize() of nothing is NaN, which the flow marks turned into
  // specks of any colour, one channel lost reading green on a blue lumen. Mohammad 20 Nov, gone with ?joins=nomarks. The length is checked first, everywhere in this shader)
  float nLen = length(vN);
  vec3 n = nLen > 1e-5 ? vN / nLen : vec3(0.0, 0.0, 1.0);
  float sT = dot(n, celLightView());   // n.L against the WORLD light, as the tube (a camera that moves changes no shade)
  float swT = fwidth(sT);              // (a derivative: taken outside any branch)
#ifndef SKIN_NOMARKS
  // EVERY derivative the flow marks need is taken HERE, before the first discard: after a discard a quad's other pixels get no usable neighbour (a device like Apple's drops the discarded lane, and fwidth is then garbage), so at a crotch or a silhouette, where
  // pixels beside each other are dropped (back faces, the ink band, the presence dither), the marks of the pixels that stay came out as clusters of blocky, wrongly coloured specks (Mohammad, 20 Nov: green and navy specks at every junction, gone with ?joins=nomarks)
  float vLen = length(vV);
  vec3 viewDir = vLen > 1e-6 ? vV / vLen : vec3(0.0, 0.0, 1.0);
  float sIa[${SKIN_ARMS}], acA[${SKIN_ARMS}], pxA[${SKIN_ARMS}], awA[${SKIN_ARMS}];
  vec3 sideA[${SKIN_ARMS}], headA[${SKIN_ARMS}];
  for (int i = 0; i < ${SKIN_ARMS}; i++) {
    sIa[i] = 0.0; acA[i] = 0.0; pxA[i] = 0.0; awA[i] = 0.03; sideA[i] = vec3(1.0, 0.0, 0.0); headA[i] = vec3(0.0);
    if (armData[i].x < 0.0) continue;
    vec3 toJ = armAxisP[i * ${SKIN_AXIS_PTS} + 1].xyz - armAxisP[i * ${SKIN_AXIS_PTS} + 2].xyz;   // (toward the node along the straight line through the seam)
    float tl = length(toJ);
    vec3 tJ = tl > 1e-6 ? toJ / tl : vec3(1.0, 0.0, 0.0);
    sIa[i] = armArc[i].x + armArc[i].y * dot(vPos - armAxisP[i * ${SKIN_AXIS_PTS} + 2].xyz, tJ) * SKIN_U;
    headA[i] = mat3(modelViewMatrix) * (armArc[i].y * tJ);   // (a heading of zero length would normalise to NaN, and a NaN pixel is a speck of any colour: the length is checked first)
    float headL = length(headA[i]);
    vec3 sideX = headL > 1e-6 ? cross(headA[i] / headL, viewDir) : vec3(0.0);
    float sideL = length(sideX);
    sideA[i] = sideL > 1e-4 ? sideX / sideL : vec3(1.0, 0.0, 0.0);
    acA[i] = clamp(dot(n, sideA[i]), -1.0, 1.0);
    pxA[i] = fwidth(sIa[i]);
    awA[i] = max(fwidth(acA[i]), 0.03);
  }
#endif
#ifdef SKIN_DEBUG
  if (!gl_FrontFacing) { gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); gl_FragDepth = min(gl_FragCoord.z + 0.002, 1.0); return; }
#endif
  if (!gl_FrontFacing) discard;
  // the skin is there only as much as its arms are (a tube not yet drawn on, retracted, dissolved or hidden has none at its seam): the tube's own screen pattern, so the skin comes and goes with the vessels, never beside them
  float pres = ${BLEND('armAF', 'wAt', '.w')};
#ifdef SKIN_DEBUG
  if (pres < 0.999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= pres) { gl_FragColor = vec4(0.0, 1.0, 1.0, 1.0); gl_FragDepth = min(gl_FragCoord.z + 0.002, 1.0); return; }
#endif
  if (pres < 0.999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= pres) discard;
  // the arms' alphas, blended by weight: the junction fade rule already holds on the tubes, so their seam alphas agree and the skin runs through them. On the Circuit's map the tubes become flat lines and the map draws its own
  // joins, so the skin fades out over the first SKIN_CIRCUIT_FADE of the morph (the arm tubes' cut fades back in over the same)
  float alpha = (${Array.from({ length: SKIN_ARMS }, (_, i) => `wAt(${i}) * armAF[${i}].y * ${COPY_OF(i)}`).join(' + ')}) * (1.0 - smoothstep(0.0, ${F(SKIN_CIRCUIT_FADE)}, circT));
#ifdef SKIN_DEBUG
  if (alpha < 0.004) { gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0); gl_FragDepth = min(gl_FragCoord.z + 0.002, 1.0); return; }
#endif
  if (alpha < 0.004) discard;
  // the live lumen's radius at the axis' depth, and the line the vertex stage built the mesh ink wider by (the tube's own rule: a share of the radius held between two CSS widths, thinned with a hairline)
  float swellB = 0.0;
  for (int i = 0; i < ${SKIN_ARMS}; i++) swellB += wAt(i) * swAt(i);
  float wpcAx = ${wpcGlsl('vCenW', 'projY', 'SKIN_U')};
  float vR = vRest * swellB * SKIN_U;
  float rCssAx = vR / max(wpcAx, 1e-6);
  float hi = ${BLEND('armAF', 'wAt', '.z')};
  float inkDev = (${inkPxGlsl('rCssAx', 'rCssAx')} + hiPx * hi) * dpr;
  float kPx = skinK / max(wpcAx / SKIN_U, 1e-9) * dpr;
  float sdPx = skinSdPx(kPx);
  // NEAR A SEAM THE TUBE'S OWN SILHOUETTE DECIDES, NOT THE OUTLINE'S APPROXIMATION OF IT (the black and brown specks along the walls at every junction: they are the background, a pixel or two of the seam's edge that the band
  // trimmed, where the tube past the seam is cut and no longer there to cover it). The ring is the tube's exact polygon stood out by its sag, the outline a smooth capsule: they differ by about a pixel. Where one arm's weight
  // is nearly 1 the band is wider by that pixel and a half, fading out over the weights 0.75 .. 0.97, so the outline rules the free skin and the mesh rules the seam
  float wMax = 0.0;
  for (int i = 0; i < ${SKIN_ARMS}; i++) wMax = max(wMax, wAt(i));
  float seamPad = ${F(SKIN_SEAM_PAD_PX)} * dpr * smoothstep(0.75, 0.97, wMax);
#ifdef SKIN_DEBUG
  if (sdPx > inkDev + 0.5 + seamPad) { gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); gl_FragDepth = min(gl_FragCoord.z + 0.002, 1.0); return; }
#endif
  if (sdPx > inkDev + 0.5 + seamPad) discard;   // (past the band: the mesh is a little wider than the union's line where the arms spread)
  // THE BODY COLOUR: each arm's lens colour at its seam's ramp position (the tube's own rule, the two lens sets crossfaded by lensMix), then the arms blended by weight: a gradient through the junction, the tube's colour on a seam
  vec3 base = vec3(0.0);
  vec4 laArm[${SKIN_ARMS}];
  vec4 lbArm[${SKIN_ARMS}];
  for (int i = 0; i < ${SKIN_ARMS}; i++) {
    laArm[i] = vec4(0.0); lbArm[i] = vec4(0.0);
    if (armData[i].x < 0.0) continue;
    vec4 la = lensOfAt(armData[i].w, armAF[i].x, lensGradA, lensLaneA, lensModeA, laneColA, 0.0);
    vec4 lb = lensOfAt(armData[i].w, armAF[i].x, lensGradB, lensLaneB, lensModeB, laneColB, 0.0);
    la.a *= armColor[i].a;
    lb.a *= armColor[i].a;
    laArm[i] = la; lbArm[i] = lb;
    base += wAt(i) * mix(mix(armColor[i].rgb, la.rgb, la.a), mix(armColor[i].rgb, lb.rgb, lb.a), lensMix);
  }
#ifdef GLOW
  // THE GLOW'S MASK (glow.ts, glow-fx.ts): the skin as it is drawn, weighted by the arms' blended pick weight, painted into the mask texture by max with the tubes' own: the junction is part of the one mask the blur turns into a halo
  {
    float sG = sdPx / dpr - ${inkPxGlsl('rCssAx', 'rCssAx')};   // CSS px past the line's outer edge
    float wG = ${glowWeightGlsl('hi')} * alpha * (1.0 - smoothstep(-0.5, 0.5, sG * dpr));
    if (wG < 0.002) discard;
    gl_FragColor = vec4(${glowToneGlsl('base')} * wG, wG);
    return;
  }
#endif
  float rDev = vR / max(${wpcGlsl('vW', 'projY', 'SKIN_U')}, 1e-6) * dpr;
  vec3 c = celTubeTone(base, sT, swT, rDev);   // two flat tones, matte and opaque: the tube's own
  // THE FLOW MARKS (Mohammad, 20 Nov: "the streaks still break between vessels", "the particles should cross at the junction, not disappear"). The tube draws its dust and chevrons from its own arc and the stream chain's A and B
  // (vessels/shaders.ts); the skin draws the SAME, once per arm, on that arm's arc carried on past its seam along the arm's axis (armArc: the arc at the seam, which way it grows, the length), across taken from the arm's own heading, and blends
  // the arms by their weights: on a seam ring one weight is 1 and this is the tube's pixel, so a streak or a head runs out of one tube, through the skin and into the next (a chained arm carries its parent's particles at the stream's place).
#ifndef SKIN_NOMARKS
  vec3 cBody = c;
  vec4 dustAcc = vec4(0.0), headAcc = vec4(0.0);
  float wpcM = ${wpcGlsl('vW', 'projY', 'SKIN_U')};
  float rCssM = vR / max(wpcM, 1e-6);
  vec3 litD = celTubeBase(base);
  DFrame FD0, FD1;
  float wD0 = 0.0, wD1 = 0.0, wD2 = 0.0, onD0 = 0.0, onD1 = 0.0, revD0 = 0.0, revD1 = 0.0;
  for (int i = 0; i < ${SKIN_ARMS}; i++) {
    if (armData[i].x < 0.0) continue;
    // the arm's own frame, taken at the top of main (sIa, acA, pxA, awA, sideA, headA): its arc here, and the across the tube would have (its heading, in the view's frame, grows with its arc)
    float sI = sIa[i], acrossI = acA[i], pxI = pxA[i], acrossW = awA[i];
    vec3 sideDir = sideA[i];
    float wI = wAt(i);
    if (wI < 0.004 || vR <= 0.0) continue;
    float lensI = armData[i].w, Lw = armArc[i].z, rOwn = max(armArc[i].w, 1e-3);
    // the dust (blood/dust-glsl.ts dustSkin): this arm's frame, kept for the two heaviest arms; the particles are drawn once below, each at the blend of its places in the two (never two ghosts)
    DFrame FI; float revI;
    float onI = flowFrame(acrossI, dustFrame(headA[i], mat3(modelViewMatrix) * vec3(0.0, 0.0, 1.0), viewDir, sideDir), sI, Lw, rOwn, vR, rCssM, lensI, armData[i].x, armData[i].y, SKIN_U, FI, revI);
    if (wI > wD0) { wD2 = wD1; FD1 = FD0; wD1 = wD0; onD1 = onD0; revD1 = revD0; FD0 = FI; wD0 = wI; onD0 = onI; revD0 = revI; }
    else if (wI > wD1) { wD2 = wD1; FD1 = FI; wD1 = wI; onD1 = onI; revD1 = revI; }
    else wD2 = max(wD2, wI);
#ifndef SKIN_NOHEADS
    headAcc += wI * flowHeads(acrossI, acrossW, sI, Lw, vR, wpcM, pxI, lensI, armFlow[i], 1.0, laArm[i], lbArm[i], armColor[i].rgb, base);
#endif
  }
  if (wD0 > 0.0) {
    // the two heaviest arms' share (renormalised): on a seam ring one weight is 1 and this is the tube's own pixel (dustTube)
    // (less the third heaviest's weight: where the second and third arms weigh the same, the pair the dust is drawn in changes, and the second's share is 0 on both sides of that line, so the change is
    // continuous. Without it a fork's skin showed a seam down the line between its two branches, Mohammad 20 Nov: "i still see a seam at the blood vessels junction")
    float w1 = max(wD1 - wD2, 0.0) / max(wD0 + wD1 - 2.0 * wD2, 1e-4);
    float dOn = mix(onD0, onD1, w1);
#ifndef SKIN_NODUST
    if (dOn > 0.002) {
      // THE DUST IS EACH ARM'S OWN, CROSSFADED (Mohammad, 20 Nov: black and lime specks at every crotch and seam band, gone with ?joins=nodust, not with noheads). dustSkin drew each particle ONCE at the BLEND of its places in the two
      // frames; a frame's own pixel (its across, its arc) means nothing where the pixel is on the other arm's side, and the average of two frames that disagree puts a particle where neither has one: a dot of ink and a hue-shifted
      // tone at a place no lane passes. dustTube is the tube's own, exact in its frame and drawing nothing past the lumen it knows; the two frames' dust is mixed by the weights instead (?joins=dustblend: the old blend, to compare)
#ifdef SKIN_DUSTBLEND
      vec4 dust = w1 > 0.004 ? dustSkin(FD0, FD1, w1, litD, inkColor, mix(revD0, revD1, w1)) : dustTube(FD0, litD, inkColor, revD0);
#else
      vec4 dust = dustTube(FD0, litD, inkColor, revD0);
      if (w1 > 0.004) dust = mix(dust, dustTube(FD1, litD, inkColor, revD1), w1);
#endif
      dustAcc = clamp(vec4(dust.rgb * dOn, dust.a * dOn), 0.0, 1.0);
    }
#endif
  }
  headAcc = clamp(headAcc, 0.0, 1.0);   // (the arms' weights can sum past 1 while an arm grows: premultiplied marks never past 0 .. 1, or the lumen under them is inverted)
  c = c * (1.0 - dustAcc.a) + dustAcc.rgb;
  c = mix(c, cBody, headAcc.a);   // (the streaks lie UNDER the heads: a head's pixel is never tinted by one)
  c = c * (1.0 - headAcc.a) + headAcc.rgb;
#endif
  float inkT = smoothstep(-0.5, 0.5, sdPx);   // the outline: ink outside the live lumen, antialiased half a pixel each side
#ifndef SKIN_NOINK
  c = mix(c, mix(${inkColourGlsl('base')}, inkColorCirc, circT), inkT);
#endif
  gl_FragColor = vec4(c, alpha);
}`;
