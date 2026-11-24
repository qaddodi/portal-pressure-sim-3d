// The junction skin's two shaders (rebuild-3d/junction-skin-spec.md sections 4.6 to 4.9). A skin is ONE closed mesh that fills the gap at a junction between the seam rings of the tubes that meet there (its ARMS).
// Every vertex carries four weights (how much it belongs to each arm). Nothing about an arm is baked into the mesh but its rest shape: the live width, the colour, the fade and the highlight of each arm are read
// on the GPU and blended by those weights, so a calibre eases, a colour runs through the junction as a gradient and nothing is rebuilt while the figure moves.
//
// The rules are the tube's own, spliced from vessels/glsl-shared.ts (swellOf, lensOfAt, the ink's colour and width, the pixel rule) and from the cel chunks, so on a seam ring, where one arm's weight is 1, the skin is the
// tube: same position (VERTEX), same colour, same line. The skin differs from the tube in exactly four ways:
//   1. It has no single centreline, so its ink is the OUTLINE OF THE SMOOTH UNION of its arms' live capsules in screen pixels (the 2D figure's own rule, fork-joins.copied.js), not a distance to one axis.
//   2. Its flow marks (chevrons, streaks, dust) are the tubes' own, drawn once per arm on that arm's arc and blended by the arm weights (Mohammad, 20 Nov: they cross a junction, they do not break at the seam): see THE FLOW MARKS below.
//   3. It has no Circuit MORPH: the body's skin fades out with `circT` (section 4.9). The Circuit has skins of its own (circuit/skins.ts, the program built with SKIN_CIRC): the same mesh builder on the map's courses, the map's widths (circSwellOf: 2D's
//      widthAt, the zoom's boost and the least width on the screen), the map's bolder line and its inner line, and in at the END of the change (SKIN_CIRC_IN). The map's turn is the object's matrix.
//   4. It does no run-on mate easing: the weights do the blending.
//
// THE UNIFORMS (the scene wiring, skin-object.ts, spreads the shared ones by reference and writes the per-arm ones; the table is the spec's section 3, plus the three marked +):
//   armData[6]   vec4   (dataIndex, baseD, widthKind, lensIndex) per arm, in arm order; an unused arm has dataIndex < 0 (and weight 0 everywhere)
//   armAF[6]     vec4   per arm: x the arm's lens ramp position at its seam (lensSpan already applied), y the arm tube's alpha at its seam ring (the JS twin, fade-alpha.ts), z the arm tube's highlight weight vHi at its seam,
//                       w + how much of the arm's tube is there at its seam: its group visible, its draw-on (`reveal`) at the seam's u and its dive fade (arm-twins.ts armPresenceAt): the skin dissolves in the tubes' own pattern as they do, so it never stands alone
//                       (one vec4 each: a float array costs a whole vector a slot, and six arms of five floats broke the fragment budget)
//   armNarrow[6] float  + (vertex stage only) the arm tube's stenosis waist at its seam: its live width there is swell x (1 - narrow), as the tube's is, so a seam inside a short piece's waist meets the tube with no step
//   armColor[6]  vec4 + the arm tube's own `color` uniform (rgb: an artery wears the look's artery red, a vein its portal or systemic tone) and, in a, its `lensUse` (an artery 0, a vein 1)
//   armCopy[6]   vec4   + (w) the arm this one runs through the node with (through.ts), or -1 (-2: none, and a vein that opens into the trunk's side: THE JUNCTION FADE RULE): the outline's union takes the pair by a plain minimum
//   armAxisP[24] vec4   per arm four points of its axis (the node J, the start of the straight line through the seam, the seam, the far point), rest positions, model space; w the rest radius at the point
//   armArc[4]    vec4 + (the arm's flow marks) the arc, figure units, at its seam (u x len x SKIN_FIGURE_UNITS), +1 if the arc grows toward the node (the arm is its vessel's end 1) else -1, the vessel's length (figure units), its rest radius (figure units)
//   armFlow[4]   float + the arm tube's `flowAmount`
//   streamTex, chainTex, streakAmt, dustP, time, markDark, markLight, markRev: the tubes' (shared by reference)
//   skinKW       vec3   x the smooth-min blend width, scene units (`skinK` below); y, z a skin of a growing arm's pair (skin-set.ts): y +1 draws only the pixels whose screen pattern is under z (the welded skin coming in), -1 only the pixels at or over it (the plain trunk going out), 0 draws all
//   lensUse + : 1 (the per-arm flag above is multiplied in), inkColor, inkColorCirc, tubeDark, fade, hiPx, inflate, res, dpr, projY, circT, vdata, vdataSize, useData, the two lens sets (lensGradA/B, lensLaneA/B,
//   lensModeA/B, laneColA/B, lensMix, lensSmooth) are the tubes' (shared by reference).
//
// GROWING ARMS (spec 10.2): a collateral or a shunt comes and goes. Its skin is ONE static full-size shape (nothing morphs): the arms that stay have a plain trunk skin of their own, and the welded skin comes in over the tube's flared end
// from growth 0.9 to 1 by the screen pattern of `skinKW` (skin/plain.ts weldOf), the two skins and the tube's cut end drawing complementary pixels.
//
// Lane lenses (the Blood origin and First pass lenses draw lanes side by side ACROSS a tube): each arm's lane colour is read at that arm's own across (the dot of the normal with its side, as the tube's), then the arms are blended
// by weight, so the lanes run on from the tubes through the skin; the lens ramps (pressure, oxygen...) are exact.
import { VDBG_GLSL } from '../debug-view.ts';
import { CEL_LIGHT_GLSL, CEL_TUBE_GLSL } from '../../cel-glsl.ts';
import { FADE_GLSL } from '../../materials/shaders.ts';
import { TUBE_DEPTH_SHARE } from '../shaders.ts';
import { LENS_OF_AT_GLSL, CHEV_ONE_GLSL, CHEV_CREAM_GLSL, FLOW_MARKS_GLSL, SWELL_OF_GLSL, inkColourGlsl, inkPxGlsl, wpcGlsl, glowWeightGlsl, glowToneGlsl } from '../glsl-shared.ts';
import { CHEVRON_GLSL } from '../../blood/chevron-glsl.ts';
import { DUST_GLSL } from '../../blood/dust-glsl.ts';
import { glslNum as F } from '../../cel-glsl.ts';
import { CIRC_INK_K, CIRC_INNER } from '../cel-ink.ts';
import { CEL_STYLE } from '../../cel-style.ts';
import { MAP_K, MAP_CENTRE, CIRC_C } from '../../circuit/map.ts';
import { PEEL_DL, PEEL_SPAN } from '../../circuit/peel.ts';
import { VB_CIRC } from '../../circuit/data.copied.ts';
import { SKIN_CIRC_IN } from './types.ts';
import { skinNormalGlsl, SKIN_SHADE_K, SKIN_SHADE_FLOOR_PX, SKIN_RING_W_FROM } from './exact-normal.ts';
import { SKIN_WALL_GLSL } from './dust-wall.ts';
import { CAVA_RAMP_R } from '../fade-alpha.ts';
import { WEDGE_GLSL } from '../wedge-glsl.ts';
import { CLOT_CONST_GLSL, CLOT_FN_GLSL, CLOT_INK_MAX_R, CLOT_LIFT_AT, CLOT_SHADE_AT } from '../../disease/clot-field.ts';

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
/** The depth hold-out's ramp (skinArmHeld), in shares of the blend width k of 3D gap between a pixel's rest surface and an arm's wall: an arm is not held out of the outline within SKIN_HOLD_FROM_K of it, wholly from SKIN_HOLD_TO_K. It was 0.25 to 1; the FILLET spans the whole of k, so
 *  a pixel a quarter k from an arm already lies in the smooth union of the mesh and was held out of the outline's: the stem's edge was inked inside the fillet, the two lines that ran on into the azygos (Plan 16C, 22 Nov, node numbers: 281 pixels of ink inside the union at the azygos landing, 0 from 1 to 2). */
export const SKIN_HOLD_FROM_K = 1;
export const SKIN_HOLD_TO_K = 2;
/** How many CSS px wider the outline's band is on a seam ring, so the skin never trims a pixel of the silhouette the cut tube no longer covers (the specks along the walls, Mohammad 20 Nov). */
export const SKIN_SEAM_PAD_PX = 1.5;
/** A head of an arm's frame is drawn only within that arm's own cylinder: fully inside SKIN_HEAD_LAT_FROM radii of its axis line, gone by SKIN_HEAD_LAT_TO. */
export const SKIN_HEAD_LAT_FROM = 1.1;
export const SKIN_HEAD_LAT_TO = 1.7;
/** A head is whole or it is not drawn (the smeared black blobs in the crotch of a fork, Mohammad 21 Nov). Root cause: a head was drawn by EVERY arm, scaled by that arm's soft share of its centre and by a lateral gate fading over 1.1 to 1.7 radii, so in the fillet two
 *  half-strength copies of one head, each stretched over pixels outside its own frame's cylinder (a head lies within 0.6 of the axis), summed to a dark smear. Now its owner share is sharpened (SKIN_HEAD_OWN_FROM .. TO: 0 under, 1 over, so the two arms' shares still sum to 1) and the gate
 *  closes at the head's own reach, not the wall's. */
/** The band about a tie of two arms' shares over which a head's ownership passes from one arm to the other (a head is whole to the winner everywhere else). */
/** A head whose centre is less than this many of the arm's radii past its seam (or anywhere on the tube's side) is the tube's, and the skin finishes it whole. */
export const SKIN_HEAD_TUBE_SIDE = 0.8;
/** FLICKER AT JOINS (Mohammad, 24 Nov: chevrons flicker as they move toward or through joins). Root cause: a head's ownership was cut by step(0.5, ...) of a share that eased over only 0.04..0.12 of the arms' weights (a few px of travel), so a whole
 *  head went from full to nothing between two frames as its centre crossed the line; with heads streaming that is a pop per head per pass. Ownership now eases over a wide band (TIE..WIN) so a head fades out on one arm and in on the next over a quarter second or so. */
export const SKIN_HEAD_SHARP = 16;   // exp(-16 d / k): the softmax shares to the fourth power, still smooth and summing to 1
export const SKIN_HEAD_GATE_FROM = 0.75, SKIN_HEAD_GATE_TO = 1.0;

/** The weighted sum of a per-arm float uniform array over all the arms (`wAt` and `wAtF` read the two weight attributes). */
const BLEND = (name: string, w = 'wAt', comp = ''): string => Array.from({ length: SKIN_ARMS }, (_, i) => `${w}(${i}) * ${name}[${i}]${comp}`).join(' + ');
/** The four arms' shares of THIS copy are read per arm: component `SKIN_COPY` of each arm's (front, solid, veil), spec 10.4. */
const COPY_OF = (i: number): string => `armCopy[${i}][SKIN_COPY]`;

export const SKIN_VS = /* glsl */ `
uniform vec4 skinKW;     // (x, y, z: the blend width and the weld pair, below) (w) the units in one scene unit: the figure's (300), or on the Circuit's own skins the map's (1 / MAP_K: the vessel's own vU at circShare 1) with its SIGN flipped: negative is the Circuit's own skins (circuit/skins.ts: the map's widths, its bolder line and inner line, in over the end of the change). A uniform, not a define: the map's skins share the body's programs (skin-object.ts). One slot for both: the fragment stage is held under 120 uniform vectors (tests/skin-shaders.test.ts)
#define SKIN_U abs(skinKW.w)
#define skinCirc (skinKW.w < 0.0 ? 1.0 : 0.0)
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
uniform vec4 armFade[${SKIN_ARMS}];   // per arm (a0, 1 / (a1 - a0), a2, a3): the tube's own fade by its length share u (arm-twins.ts uFadeOf), so the skin's alpha at each vertex is the tube's at that place along the arm and not its value at the seam; a2 < 0: none (the seam's value stands)
uniform vec4 armArc[${SKIN_ARMS}];   // (as the fragment stage's) the arc at the seam, which way it grows toward the node, the vessel's length, its rest radius
uniform vec4 armColor[${SKIN_ARMS}];   // (as the fragment stage's; here only its .a, the arm's lens flag: 0 an artery) the share of the junction that is an artery sets the wall's line (cel-style ARTERY)
uniform vec4 armAxisP[${SKIN_ARMS * SKIN_AXIS_PTS}];   // (as the fragment stage's)
varying vec4 vFadeA;     // each arm's fade at this vertex (arms 0 to 3), -1 where the arm has no u-fade: the seam's value stands
varying vec2 vFadeB;
varying vec3 vN;
varying vec3 vV;
varying float vW;        // the surface's clip depth
varying float vCenW;     // the axis's clip depth: the one the ink band is built from (the tube's vCen.z)
varying vec4 vWeight;
varying vec2 vWeight2;
varying float vRest;
varying vec4 vSwell;
varying vec2 vSwell2;    // the arms' live widths against their built ones, read once here so the fragment stage does not fetch them again
varying vec3 vPos;       // the rest position now (after the growth morph): each arm's arc at this pixel (the flow marks), its lateral gate and the union's gradient are read from it
${SWELL_OF_GLSL}
uniform float circBoost;
uniform float circPerPx;
// 2D's width on the map (widthAt at t = 1; the tube's own circWidthOf): a vein clamp(1.3 max(2.6, 2 d^0.72) 0.95, 6, 15) times the boost, an artery 3, a liver bed 8 times the boost
float circWidthAt(float d, float kind, float boost) {
  if (kind > 1.5) return 8.0 * boost;
  if (kind > 0.5) return 3.0;
  return clamp(1.3 * max(2.6, 2.0 * pow(max(d, 0.1), 0.72)) * 0.95, 6.0, 15.0) * boost;
}
// an arm's live width on the map against the width its rings were built at (boost 1, no floor): the tube's circSwell, with no mate (a skinned end has none)
float circSwellOf(vec4 a) {
  float d = a.y;
  if (useData > 0.5 && a.z < 0.5) { ivec2 tc = ivec2(int(mod(a.x, vdataSize.x)), int(floor(a.x / vdataSize.x))); d = texelFetch(vdata, tc, 0).b; }
  float least = (a.z > 1.5 ? 4.5 : (a.z > 0.5 ? 3.0 : 5.0)) * circPerPx;
  return max(circWidthAt(d, a.z, circBoost), least) / circWidthAt(a.y, a.z, 1.0);
}
vec4 wgA;   // the weights (the mesh's)
vec2 wgB;
float wAt(int i) { return i < 4 ? wgA[i] : wgB[i - 4]; }
void main() {
  // THE SHAPE: the mesh as it is (every growing arm is built whole, one static shape: the weld of skin/plain.ts hands it over, nothing morphs)
  vec3 pos = position, nor = normal;
  float rst = restR;
  vec4 wA = weight;
  vec2 wB = weight2;
  wgA = wA; wgB = wB;
  // each arm's live width (the engine's diameter by the 2D figure's rule), then the blend: on a seam ring the weight is 1 on its own arm, so this IS the tube's swell and the ring lands where the tube's ring lands.
  // an arm's LUMEN (swT: what the ink's capsule and the flow marks are made from) and the SHIFT its vertices take along their normals (swE; the same number now that nothing morphs): the one live width of the arm (the morph has already moved
  // them by the growth, so the engine's width is applied to the grown part only: radius g x R x swell = g R + g R (swell - 1))
  float swT[${SKIN_ARMS}];
  float swE[${SKIN_ARMS}];
  for (int i = 0; i < ${SKIN_ARMS}; i++) { swT[i] = 1.0; swE[i] = 1.0; }
  // (an arm's waist at its seam is part of its width there, as the tube's own narrowK is: the same share kept, 1 - narrow clamped as the tube clamps it)
  for (int i = 0; i < ${SKIN_ARMS}; i++) if (armData[i].x >= 0.0) {
    float sw = (skinCirc > 0.5 ? circSwellOf(armData[i]) : swellOf(armData[i].x, armData[i].y, armData[i].z)) * (1.0 - clamp(armNarrow[i], 0.0, 0.97));
    swT[i] = sw; swE[i] = sw;
  }
  float swell = 0.0, swellE = 0.0;
  for (int i = 0; i < ${SKIN_ARMS}; i++) { float wi = wAt(i); swell += wi * swT[i]; swellE += wi * swE[i]; }
  vec4 cc = projectionMatrix * (modelViewMatrix * vec4(cen, 1.0));
  float wpcV = ${wpcGlsl('cc.w', 'projectionMatrix[1][1]', 'SKIN_U')};   // the figure's units under one CSS px here
  float lumenW = rst * swell;
  float rCssV = lumenW * SKIN_U / max(wpcV, 1e-6);   // the lumen's radius in CSS px
  float hi = ${BLEND('armAF', 'wAt', '.z')};
  // the tube's own ink width (no stenosis waist at a seam, narrowK 1) plus the picked vein's extra line, blended
  float skinArt = clamp(1.0 - (${BLEND('armColor', 'wAt', '.a')}), 0.0, 1.0);   // (the arms' share that is an artery: 0 at a vein's junction, 1 at an artery's, a gradient where one runs into the other)
  float inkPx = ${inkPxGlsl('rCssV', 'rCssV', 'skinArt')};
  inkPx *= mix(1.0, ${F(CIRC_INK_K)}, skinCirc);   // (the Circuit's line is bolder: the tube's own, vessels/shaders.ts)
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
  // EACH ARM'S FADE AT THIS VERTEX (the junction's seam far out on a fading vein washed the whole skin and drew its neighbour's fork branch as a ghost, 21 Nov): the tube's own fade rule at this vertex's arc along the arm, the arc the flow marks use. An arm whose seam is whole keeps -1: its seam value, as before
  float fdA[${SKIN_ARMS}];
  for (int i = 0; i < ${SKIN_ARMS}; i++) {
    fdA[i] = -1.0;
    if (armData[i].x < 0.0 || armFade[i].z < 0.0) continue;
    vec3 seamP = armAxisP[i * ${SKIN_AXIS_PTS} + 2].xyz, toNode = armAxisP[i * ${SKIN_AXIS_PTS} + 1].xyz - seamP;
    float tn = length(toNode);
    if (tn < 1e-6) continue;
    float uAt = clamp((armArc[i].x + armArc[i].y * dot(pos - seamP, toNode / tn) * SKIN_U) / max(armArc[i].z, 1e-6), 0.0, 1.0);
    fdA[i] = mix(armFade[i].z, armFade[i].w, clamp((uAt - armFade[i].x) * armFade[i].y, 0.0, 1.0));
  }
  vFadeA = vec4(fdA[0], fdA[1], fdA[2], fdA[3]);
  vFadeB = vec2(fdA[4], fdA[5]);
  vPos = pos;   // (the rest position NOW, the morph's: an absent growing arm's mesh is moved off the other arms, and every arc, lateral gate and union gradient the fragment stage reads from this must be taken where the pixel is drawn, not at the full-grown shape's vertex it was moved from)
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
${VDBG_GLSL}
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform vec4 skinKW;     // (x, y, z: the blend width and the weld pair, below) (w) the units in one scene unit: the figure's (300), or on the Circuit's own skins the map's (1 / MAP_K: the vessel's own vU at circShare 1) with its SIGN flipped: negative is the Circuit's own skins (circuit/skins.ts: the map's widths, its bolder line and inner line, in over the end of the change). A uniform, not a define: the map's skins share the body's programs (skin-object.ts). One slot for both: the fragment stage is held under 120 uniform vectors (tests/skin-shaders.test.ts)
#define SKIN_U abs(skinKW.w)
#define skinCirc (skinKW.w < 0.0 ? 1.0 : 0.0)
uniform vec3 inkColor;
uniform vec3 inkColorCirc;
uniform float circT;
float skinPeelShare(vec3 p) {
  float mx = ${F(CIRC_C[0])} + (p.x - ${F(MAP_CENTRE.x)}) / ${F(MAP_K)};
  float r = clamp((mx - ${F(VB_CIRC[0] + 30)}) / ${F(PEEL_SPAN)}, 0.0, 1.0);
  if (circT <= 0.0) return 0.0;
  if (circT >= 1.0) return 1.0;
  float x = (circT - ${F(PEEL_DL)} * r) / ${F(1 - PEEL_DL)};
  if (x <= 0.0) return 0.0;
  if (x >= 1.0) return 1.0;
  return x * x * (3.0 - 2.0 * x);
}
uniform vec2 res;
uniform float dpr;
uniform float projY;
uniform float hiPx;
#define lensUse 1.0   // (the skin's own lens flag was a uniform that was always 1; the per-arm flag is multiplied in: armColor.a. A slot saved: tests/skin-shaders.test.ts)
uniform float lensMix;
uniform float lensSmooth;
uniform sampler2D lensGradA;
uniform sampler2D lensLaneA;
uniform sampler2D lensGradB;
uniform sampler2D lensLaneB;
uniform float lensModeA;
uniform float lensModeB;
uniform float lensRawA;
uniform float lensRawB;
uniform vec3 laneColA[5];
uniform vec3 laneColB[5];
uniform vec4 armData[${SKIN_ARMS}];
uniform vec4 armAF[${SKIN_ARMS}];   // per arm (lensU, fade, hi, pres)
uniform vec4 armCopy[${SKIN_ARMS}];   // each arm's shares of the three copies (xyz: front, solid, veil: vessel-object.ts copyShares; this program is ONE of them, SKIN_COPY) and in w the arm it runs THROUGH the node with (through.ts), or -1: their union is a plain minimum (one vec4, because a float array costs a whole vector a slot)
uniform vec4 armColor[${SKIN_ARMS}];
uniform vec4 armAxisP[${SKIN_ARMS * SKIN_AXIS_PTS}];   // xyz a point of the arm's axis, w the rest radius there
#define skinK skinKW.x
uniform vec4 armArc[${SKIN_ARMS}];
uniform vec4 armClotA[${SKIN_ARMS}];   // each arm's clot (disease/clot-field.ts, plan 26): (f0, df, side * v, length); z 0: none
uniform vec4 armClotP[${SKIN_ARMS}];   // its seed's lump phases
uniform vec3 clotShade;
uniform vec3 clotBase;
uniform vec3 clotLift;
${CLOT_CONST_GLSL}
${CLOT_FN_GLSL}
uniform vec4 armFlow[2];    // each arm tube's flowAmount, six floats PACKED in two vectors (a float array costs a whole vector a slot: the fragment stage is held to 120 vectors, tests/skin-shaders.test.ts); read with armFlowAt
uniform vec4 armWedge[2];   // each arm tube's route distance from the balloon's distal edge at its seam (wedge-glsl.ts), -1e4 for an arm whose tube carries no wedge
float armFlowAt(int i) { return i < 4 ? armFlow[0][i] : armFlow[1][i - 4]; }
float armWedgeAt(int i) { return i < 4 ? armWedge[0][i] : armWedge[1][i - 4]; }
uniform vec3 wedgeColS;
uniform vec4 wedgeS;   // the column (as every tube has it): x how much, y how softly it ends behind the balloon's edge, z the front, w how softly the front ends
${WEDGE_GLSL}
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
varying vec4 vFadeA;
varying vec2 vFadeB;
// THE WEIGHTS OF THE ARMS THAT ARE THERE (Mohammad, 21 Nov, Budd-Chiari: a gap with a hatched edge in the cava below the liver). A growing arm that is not there (a closed shunt or collateral: its tube hidden or a dotted thread) is kept 0 (the armFlow bits): its weight goes to
// the arms that stay, so the skin at the pixels it owned is the host's own lumen. Before, its weight stayed in the blend with presence 0: the presence dither (pres, below) threw away every pixel it owned, and the host's tube is cut away under the skin
// (a hole), so the cava was missing there with a screen-door edge. Kept arms: the weights as the mesh has them (the sum of the weights is 1, so nothing changes where every arm is kept).
float gWKeep = 1.0;
float rawW(int i) { return i < 4 ? vWeight[i] : vWeight2[i - 4]; }
float keepOf(int i) { return mod(floor(armFlow[1].w / exp2(float(i))), 2.0); }   // the kept arms as bits of one float in a free slot of armFlow (skin-object.ts setKeep): a uniform of its own would go over the fragment stage's 120 vectors
float wAt(int i) { return rawW(i) * keepOf(i) * gWKeep; }
// an arm's alpha HERE: its tube's fade at this place along the arm (the vertex stage), or its value at the seam where the arm carries no u-fade (vFade < 0)
float fadeOf(int i) { float v = i < 4 ? vFadeA[i] : vFadeB[i - 4]; return v >= 0.0 ? v : armAF[i].y; }
float swAt(int i) { return i < 4 ? vSwell[i] : vSwell2[i - 4]; }
${LENS_OF_AT_GLSL}
${CHEVRON_GLSL}
${DUST_GLSL}
${CHEV_ONE_GLSL}
${CHEV_CREAM_GLSL}
${FLOW_MARKS_GLSL}
${SKIN_WALL_GLSL}
// (the arms' exact 3D distances come first: the outline's depth hold-out below reads them)
${skinNormalGlsl(SKIN_ARMS, SKIN_AXIS_PTS, (sw) => `smoothstep(0.0, ${F(SKIN_ARM_ABSENT)}, ${sw})`, (arm) => `keepOf(${arm})`)}
// the polynomial smooth-min of the 2D figure's own join (fork-joins.copied.js; spec 4.3): a blend k wide, and never lower than the smaller of the two
float skinSmin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / max(k, 1e-4), 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
// the point's place in device pixels (x, y), the radius a rest radius R has there in device pixels (z) and its view depth (w: the clip w, the distance along the view axis)
vec4 skinPx(vec3 p, float R, float swell) {
  vec4 q = projectionMatrix * (modelViewMatrix * vec4(p, 1.0));
  return vec4((q.xy / q.w * 0.5 + 0.5) * res * dpr, R * swell / max(${wpcGlsl('q.w', 'projY', '1.0')}, 1e-9) * dpr, q.w);
}
// signed distance, in device px, from this pixel to the live capsule of one arm: the least over its two segments of (the distance to the segment, less the radius interpolated at the closest point).
// DEPTH (the seam's ink): the outline is a screen-space field, and a WALL skin's arm leaves its host's wall, so from the front its silhouette lies over the host's though the two are a whole radius apart in depth: the blend then pulled the arm's own outline in
// (3 px at the seam of S_PC on wall:IVC_IS_1:S_PC1,C90; the front-view kink at the four-arm nodes). So an arm whose capsule lies out of reach of the pixel's own place in the figure (fragP, the lumen's rest surface at the pixel; fragW its view depth, below 0: no judgement) is held out of the blend as an absent
// arm is, by how far out it is, in px at the pixel's depth: nothing within SKIN_HOLD_FROM_K (1) k of the arm's wall, all of it from SKIN_HOLD_TO_K (2) k: the fillet spans k. Continuous in the distance, never a step; the distance is the exact one in 3D, so it does not change with the camera
float skinArmPx(vec2 frag, int arm, float swell) {
  // the axis: J (the bridge over the art's gap), the start of the straight line through the seam, the seam, the far point
  vec4 p0 = skinPx(armAxisP[arm * ${SKIN_AXIS_PTS}].xyz, armAxisP[arm * ${SKIN_AXIS_PTS}].w, swell);
  vec4 p1 = skinPx(armAxisP[arm * ${SKIN_AXIS_PTS} + 1].xyz, armAxisP[arm * ${SKIN_AXIS_PTS} + 1].w, swell);
  vec4 p2 = skinPx(armAxisP[arm * ${SKIN_AXIS_PTS} + 2].xyz, armAxisP[arm * ${SKIN_AXIS_PTS} + 2].w, swell);
  vec4 p3 = skinPx(armAxisP[arm * ${SKIN_AXIS_PTS} + 3].xyz, armAxisP[arm * ${SKIN_AXIS_PTS} + 3].w, swell);
  vec2 a = p1.xy - p0.xy, b = p2.xy - p1.xy, c = p3.xy - p2.xy;
  float t0 = clamp(dot(frag - p0.xy, a) / max(dot(a, a), 1e-6), 0.0, 1.0);
  float t1 = clamp(dot(frag - p1.xy, b) / max(dot(b, b), 1e-6), 0.0, 1.0);
  float t2 = clamp(dot(frag - p2.xy, c) / max(dot(c, c), 1e-6), 0.0, 1.0);
  float d0 = length(frag - p0.xy - a * t0) - mix(p0.z, p1.z, t0);
  float d1 = length(frag - p1.xy - b * t1) - mix(p1.z, p2.z, t1);
  float d2 = length(frag - p2.xy - c * t2) - mix(p2.z, p3.z, t2);
  return min(d0, min(d1, d2));
}
// the signed lateral of this pixel from the axis of arm i on the screen, in lumen units, the tube's own sign (the left of its heading as the arc grows: vessels/shaders.ts), and the lumen's radius there in device px (rPx)
float skinArmLat(vec2 frag, int arm, float swell, out float rPx) {
  vec4 p0 = skinPx(armAxisP[arm * ${SKIN_AXIS_PTS}].xyz, armAxisP[arm * ${SKIN_AXIS_PTS}].w, swell);
  vec4 p1 = skinPx(armAxisP[arm * ${SKIN_AXIS_PTS} + 1].xyz, armAxisP[arm * ${SKIN_AXIS_PTS} + 1].w, swell);
  vec4 p2 = skinPx(armAxisP[arm * ${SKIN_AXIS_PTS} + 2].xyz, armAxisP[arm * ${SKIN_AXIS_PTS} + 2].w, swell);
  vec4 p3 = skinPx(armAxisP[arm * ${SKIN_AXIS_PTS} + 3].xyz, armAxisP[arm * ${SKIN_AXIS_PTS} + 3].w, swell);
  vec2 a = p1.xy - p0.xy, b = p2.xy - p1.xy, c = p3.xy - p2.xy;
  float t0 = clamp(dot(frag - p0.xy, a) / max(dot(a, a), 1e-6), 0.0, 1.0);
  float t1 = clamp(dot(frag - p1.xy, b) / max(dot(b, b), 1e-6), 0.0, 1.0);
  float t2 = clamp(dot(frag - p2.xy, c) / max(dot(c, c), 1e-6), 0.0, 1.0);
  vec2 e0 = frag - p0.xy - a * t0, e1 = frag - p1.xy - b * t1, e2 = frag - p2.xy - c * t2;
  float r0 = mix(p0.z, p1.z, t0), r1 = mix(p1.z, p2.z, t1), r2 = mix(p2.z, p3.z, t2);
  float d0 = length(e0) - r0, d1 = length(e1) - r1, d2 = length(e2) - r2;
  vec2 e = e0, dir = a; rPx = r0;
  if (d1 < d0 && d1 <= d2) { e = e1; dir = b; rPx = r1; }
  else if (d2 < d0 && d2 < d1) { e = e2; dir = c; rPx = r2; }
  float dl = length(dir);
  vec2 tg = dl > 1e-6 ? dir / dl : vec2(1.0, 0.0);
  tg *= -sign(armArc[arm].y);   // (the heading as the arc grows: the axis runs from the node outward, so toward the node the arc grows against it)
  return dot(e, vec2(-tg.y, tg.x)) / max(rPx, 1e-3);
}
// THE CLOT STOPS AT THE TRUNK'S WALL (plan 34e, disease/clot-field.ts trunkCutTwin): 0 inside the lumen of any arm of the trunk (the arms of the run through the node: armCopy.w >= 0 or -1, not a vein that opens into its side), 1 half a pixel outside every one, by the pixel's own
// distance to each arm's axis against its live radius, the one-pixel edge the tube's cava cut has (vessels/shaders.ts cavA). ROOT CAUSE it answers: the clot was clipped to the UNION's lumen, which includes the cava, and a vein meets the cava on a slant, so the clot's corners stood inside the cava.
float skinOutsideTrunk(vec2 frag) {
  float k = 1.0;
  for (int j = 0; j < ${SKIN_ARMS}; j++) {
    if (armData[j].x < 0.0 || armCopy[j].w < -0.5 || keepOf(j) < 0.5) continue;
    float rPx;
    float lat = skinArmLat(frag, j, swAt(j), rPx);
    k *= smoothstep(-0.5, 0.5, (abs(lat) - 1.0) * rPx);
  }
  return k;
}
// THE DEPTH HOLD-OUT, as a share 0 to 1 (see skinSdPx for how it is used). A pixel's own place in the figure (vPos, the lumen's rest surface, which the mesh stands the line out from) is a point in 3D: its distance to the arm's capsule (skinArmSd3, exact) is how far out of
// the arm it is, whatever the camera does (an arm that runs along the view is foreshortened to a few pixels, so a depth taken at the nearest SCREEN point was the wrong one and held out the pixels of an arm that were its own: holes in the junctions when the figure is turned,
// Mohammad 22 Nov). In px at the pixel's depth: nothing within SKIN_HOLD_FROM_K (1) k of the arm's wall, all of it from SKIN_HOLD_TO_K (2) k: the fillet spans k.
// (THE CAPSULE AT REST, NOT AT THE LIVE WIDTH, Mohammad 22 Nov: the collaterals' arms at the azygos were thin spikes. fragP is the lumen's REST surface, a whole radius out, so an arm narrower than its built width (swell 0.53 for C1b, 0.61 for C9) put its own rest
// surface 1 - swell radii outside itself: held out as if absent. The rest surface is judged against the arm's rest capsule, so the gap is the pixel's own distance to the arm whatever the engine's width is.)
float skinArmHeld(int arm, float fragW, vec3 fragP, float kPx) {
  vec3 g3; float r3;
  float gap = skinArmSd3(fragP, arm, 1.0, g3, r3) / max(${wpcGlsl('fragW', 'projY', '1.0')}, 1e-9) * dpr;
  return smoothstep(${F(SKIN_HOLD_FROM_K)} * kPx, ${F(SKIN_HOLD_TO_K)} * kPx, gap);
}
// the outline of the smooth union of the live arms, in device px: negative inside the lumen, 0 on the wall (in arm order, as the mesh's own SDF: sdf.ts sdUnion). Two arms that run THROUGH the node (armCopy.w, through.ts: the trunk above and below
// a side vein) are united by a plain minimum and count as one: a blend between the halves of one trunk only adds a bulge
float skinSdPx(float kPx, bool noDepth) {
  float dArm[${SKIN_ARMS}];
  // A GROWING ARM THAT IS NOT THERE (keepOf 0: a collateral that is collapsed, a dotted thread) is not in the outline either: the mesh is one static shape with every arm whole, so its stub (the ascending lumbar's connection into the azygos, Mohammad 22 Nov: "just don't draw it
  // if the ascending lumbar is collapsed") stood out of the wall with its ink, a dotted tip where the kept weights ran out; held out of the union, the band test below drops it. It comes in with its presence (keep turns on at the first of it; its dither does the easing).
  // an arm that is not there (a collateral not yet grown, a vessel closed to nothing) is not in the outline: a capsule of no width is a LINE, its smooth union with the trunk a horn along it, and the cone of the arm's collapsed
  // ring out to the wall stayed inside its band as a thorn (Mohammad, 20 Nov). It is held out of reach (the blend sees nothing of it past k) and comes in as its width does: continuous, never a pop
  // THE HOLD-OUT IS RELATIVE TO THE LEAST-HELD ARM THAT IS THERE (Mohammad, 22 Nov: a black hole at the azygos where the varices land, the ascending lumbar collapsed). ROOT CAUSE: the mesh is one static shape with every arm whole, and the host's tube is cut away under it, so at a collapsed arm's
  // stub the pixel's surface belongs to the arm that is not there and the host's wall behind it is not drawn by anything. Every arm that is there held that pixel out by depth (it lies on the stub, a radius or more from each), so the band dropped it: a hole in the host (a tenth or more of the
  // skin's pixels at every skin that has a growing arm out, measured in node on the live swells). A pixel that every arm that is there holds out equally is held out by none: it is judged by the screen union of the arms that are there, the host's lumen, as it would be with no hold-out at all. Where any arm
  // that is there lies at the pixel (every pixel of a skin whose arms are all there) its share is 0 and nothing changes. Continuous in the distances, never a step.
  float heldOf[${SKIN_ARMS}];
  float heldMin = 1.0;
  for (int i = 0; i < ${SKIN_ARMS}; i++) { heldOf[i] = (noDepth || armData[i].x < 0.0 || keepOf(i) < 0.5) ? (noDepth ? 0.0 : 1.0) : skinArmHeld(i, 1.0 / gl_FragCoord.w, vPos, kPx); heldMin = min(heldMin, heldOf[i]); }
  for (int i = 0; i < ${SKIN_ARMS}; i++) dArm[i] = (armData[i].x < 0.0 || keepOf(i) < 0.5) ? 1.0e9 : skinArmPx(gl_FragCoord.xy, i, swAt(i)) + 2.0 * kPx * (heldOf[i] - heldMin) + 2.0 * kPx * (1.0 - smoothstep(0.0, ${F(SKIN_ARM_ABSENT)}, swAt(i)));
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
// WHO OWNS A HEAD (Mohammad, 20 Nov: a chevron cut in two at the fork). A head is drawn in its arm's frame and was weighted by the arm's mesh weight AT THE PIXEL, so where the ownership of the skin changes across a head, the head was cut along the line.
// A head now belongs to the arm that owns its CENTRE, whole: the centre is the point of the arm's axis at the head's arc (the axis line through the seam, the arc growing along it as the marks' own arc does), its owner the mesh's own rule
// (a softmax of the arms' distances, sharpened to the fourth power, sdf.ts weights) taken in device px at that point
float skinOwner(int arm, vec3 centre, float kPx) {
  vec2 fc = skinPx(centre, 0.0, 1.0).xy;
  float d[${SKIN_ARMS}];
  float lo = 1.0e9;
  for (int k = 0; k < ${SKIN_ARMS}; k++) {
    d[k] = (armData[k].x < 0.0 || keepOf(k) < 0.5) ? 1.0e9 : skinArmPx(fc, k, swAt(k)) + 2.0 * kPx * (1.0 - smoothstep(0.0, ${F(SKIN_ARM_ABSENT)}, swAt(k)));
    lo = min(lo, d[k]);
  }
  // THE WINNER OWNS THE HEAD WHOLE. The share of an arm is its softmax weight over the sum, which at a three-way fillet is about a third for every arm: a head there was drawn at a third of its strength (a pale ghost lying under the join) or, where
  // the shares tie under the gate, by nobody at all (Mohammad, 24 Nov: chevrons hidden under the joins, in every lens). An arm now owns the head by how much its share beats the best of the others', eased: 1 for the arm that wins
  // by SKIN_HEAD_WIN of the shares, 0 for the others, and where no arm wins (the centre of the crotch, a tie) NO arm draws it: a head there is dropped and the next one comes in just past it (never a ghost, never two copies).
  // (the arms' ownership weights are the sharpened shares, each over their sum, so they add to exactly 1 at every point: a head handed from one arm to the next keeps its combined opacity through the join, never a dip)
  float mine = 0.0, sum = 0.0;
  for (int k = 0; k < ${SKIN_ARMS}; k++) {
    if (armData[k].x < 0.0) continue;
    float w = exp(-${F(SKIN_HEAD_SHARP)} * (d[k] - lo) / max(kPx, 1e-3));
    sum += w;
    if (k == arm) mine = w;
  }
  return mine / max(sum, 1e-6);
}
void main() {
  { float kept = 0.0; for (int i = 0; i < ${SKIN_ARMS}; i++) kept += rawW(i) * keepOf(i); gWKeep = armFlow[1].w > exp2(float(${SKIN_ARMS})) - 1.5 ? 1.0 : 1.0 / max(kept, 1.0e-4); }   // (every arm kept: the weights as they are)
  // (a welded skin's normal is interpolated between vertices whose normals can face apart at a crease: its length can come to nothing, and normalize() of nothing is NaN, which the flow marks turned into
  // specks of any colour, one channel lost reading green on a blue lumen. Mohammad 20 Nov, gone with ?joins=nomarks. The length is checked first, everywhere in this shader)
  float nLen = length(vN);
  vec3 n = nLen > 1e-5 ? vN / nLen : vec3(0.0, 0.0, 1.0);
  // THE NORMAL IS THE SMOOTH UNION'S OWN GRADIENT AT THIS PIXEL (exact-normal.ts), not the vertices' normals lerped over a triangle: across a fillet those are wrong by up to 56 degrees and every contour of them (the cel shade's
  // hard threshold, the lens lanes, the streaks' across) is a polygon, and in a crease the mesh's eased vertex normals depend on how the triangles lie (Mohammad, 20 Nov: the torn edge at the hepatic veins' mouths). The vertices' normal stays only as the fallback where the union has no gradient
  // (a seam ring keeps the tube's own normal: where an arm's weight is 1 the pixel takes the lerped vertex normal, SKIN_RING_W_FROM)
  {
    float wTop = 0.0;
    for (int i = 0; i < ${SKIN_ARMS}; i++) wTop = max(wTop, rawW(i) * keepOf(i));   // (the raw weights of the arms that are THERE, as the seam band's wMax: wAt renormalises them, so the pixels of an absent arm's stub read as a kept arm's weight 1 and took the mesh's own stub normal)
    vec3 gx = skinNormalExact(vPos, max(skinK * ${F(SKIN_SHADE_K)}, ${F(SKIN_SHADE_FLOOR_PX)} * ${wpcGlsl('vCenW', 'projY', '1.0')}), vec3(0.0));   // (skinShadeK: the shade's blend is never narrower than SKIN_SHADE_FLOOR_PX of the screen)
    if (dot(gx, gx) > 0.25) n = normalize(mix(n, normalize(mat3(modelViewMatrix) * gx), (1.0 - smoothstep(${F(SKIN_RING_W_FROM)}, 1.0, wTop))));
  }
  float sT = dot(n, celLightView());   // n.L against the WORLD light, as the tube (a camera that moves changes no shade)
  float swT = fwidth(sT);              // (a derivative: taken outside any branch)
  // (the lens lanes need the arms' across and its derivative too, so this block is the skin's always, whatever marks are left out)
  // EVERY derivative the flow marks and the lens lanes need is taken HERE, before the first discard: after a discard a quad's other pixels get no usable neighbour (a device like Apple's drops the discarded lane, and fwidth is then garbage), so at a crotch or a silhouette, where
  // pixels beside each other are dropped (back faces, the ink band, the presence dither), the marks of the pixels that stay came out as clusters of blocky, wrongly coloured specks (Mohammad, 20 Nov: green and navy specks at every junction, gone with ?joins=nomarks)
  float vLen = length(vV);
  vec3 viewDir = vLen > 1e-6 ? vV / vLen : vec3(0.0, 0.0, 1.0);
  float sIa[${SKIN_ARMS}], acA[${SKIN_ARMS}], pxA[${SKIN_ARMS}], awA[${SKIN_ARMS}], fwLn[${SKIN_ARMS}];
  vec3 sideA[${SKIN_ARMS}], headA[${SKIN_ARMS}], tJA[${SKIN_ARMS}];
  for (int i = 0; i < ${SKIN_ARMS}; i++) {
    sIa[i] = 0.0; acA[i] = 0.0; pxA[i] = 0.0; awA[i] = 0.03; fwLn[i] = 0.0; sideA[i] = vec3(1.0, 0.0, 0.0); headA[i] = vec3(0.0); tJA[i] = vec3(1.0, 0.0, 0.0);
    if (armData[i].x < 0.0) continue;
    vec3 toJ = armAxisP[i * ${SKIN_AXIS_PTS} + 1].xyz - armAxisP[i * ${SKIN_AXIS_PTS} + 2].xyz;   // (toward the node along the straight line through the seam)
    float tl = length(toJ);
    vec3 tJ = tl > 1e-6 ? toJ / tl : vec3(1.0, 0.0, 0.0);
    tJA[i] = tJ;
    sIa[i] = armArc[i].x + armArc[i].y * dot(vPos - armAxisP[i * ${SKIN_AXIS_PTS} + 2].xyz, tJ) * SKIN_U;
    headA[i] = mat3(modelViewMatrix) * (armArc[i].y * tJ);   // (a heading of zero length would normalise to NaN, and a NaN pixel is a speck of any colour: the length is checked first)
    float headL = length(headA[i]);
    vec3 sideX = headL > 1e-6 ? cross(headA[i] / headL, viewDir) : vec3(0.0);
    float sideL = length(sideX);
    sideA[i] = sideL > 1e-4 ? sideX / sideL : vec3(1.0, 0.0, 0.0);
    acA[i] = clamp(dot(n, sideA[i]), -1.0, 1.0);
    pxA[i] = fwidth(sIa[i]);
    awA[i] = max(fwidth(acA[i]), 0.03);
    fwLn[i] = fwidth(acA[i] * 0.5 + 0.5);   // (the lane lens's edge softness, as the tube's lensAcrossFw)
  }
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
  // THE ALPHA IS THE PRESENT ARMS' ONLY (Mohammad, 20 Nov: a dotted pink and blue patch left at the old end of both hepatic arteries, at the sinusoid nodes): the body does not draw the liver's beds, so at SIN_R and SIN_L the arteriole is the one arm that is there, and the skin is dithered
  // by its share (pres). The alpha blended EVERY arm's fade by weight, the hidden beds' too (PRE_R whole, SIN_RR 0.8), so the skin kept an alpha and a colour from vessels that are not drawn at the pixels the artery's own dither let through, long after the artery had faded to nothing. The alpha is the weighted fade of the arms that are
  // there (each arm's weight times its presence, over their sum), so an arm that is not drawn adds nothing, and where the one that is has faded the skin is gone with it.
  if (skinKW.y != 0.0) { float wh = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); if (skinKW.y > 0.0 ? wh >= skinKW.z : wh < skinKW.z) discard; }
  // the arms' alphas, blended by weight: the junction fade rule already holds on the tubes, so their seam alphas agree and the skin runs through them. On the Circuit's map the tubes become flat lines and the map draws its own
  // joins, so the skin fades out over the first SKIN_CIRCUIT_FADE of the morph (the arm tubes' cut fades back in over the same)
  // THE JUNCTION FADE RULE (Mohammad, 20 Nov: "a vessel merging into a faded vessel fades gradually on approach, so both share the same fade at the junction", and the torn edge where the hepatic veins' solid streaks met the faint cava): a vein that opens into the side
  // of a trunk (armCopy.w -2: the hepatic veins into the cava, fades.ts opensIntoCava; the trunk is the arms of the run through the node) comes to the trunk's opacity as the pixel nears the trunk's wall: 0 from CAVA_RAMP_R trunk radii out, whole at the wall, by the pixel's own distance to the trunk (the tube's own ramp, vessels/shaders.ts wA, which a
  // skinned vein keeps: cavaCut 2). Before, a vein stayed solid to its seam and the skin changed from its opacity to the cava's across the weights' contour, a polygon: the tear
  float aTrunk = 0.0, sdTrunk = 1.0e9, radTrunk = 1.0;
  bool hasTrunk = false;
  for (int k = 0; k < ${SKIN_ARMS}; k++) {
    if (armData[k].x < 0.0 || armCopy[k].w < -0.5) continue;
    vec3 gT; float rT;
    float dT = skinArmSd3(vPos, k, swAt(k), gT, rT);
    if (dT < sdTrunk) { sdTrunk = dT; radTrunk = rT; aTrunk = armAF[k].y; hasTrunk = true; }
  }
  float wRamp = hasTrunk ? 1.0 - smoothstep(0.0, ${F(CAVA_RAMP_R)} * max(radTrunk, 1.0e-5), sdTrunk) : 0.0;
  // the map's skin comes in as the map POINT under it lands (the flow peel on its rank, from its place on the map), as the tubes' cut goes (vessels/shaders.ts keepC): the whole change's clock brought the heart end's skins in while its tubes were still on the way (floating bars, 21 Nov)
  float skinShare = skinPeelShare(vPos);
  float circK = mix(1.0 - smoothstep(0.0, ${F(SKIN_CIRCUIT_FADE)}, circT), smoothstep(${F(SKIN_CIRC_IN)}, 1.0, skinShare), skinCirc);
  float alpha = (${Array.from({ length: SKIN_ARMS }, (_, i) => `wAt(${i}) * (armCopy[${i}].w < -1.5 ? mix(fadeOf(${i}), aTrunk, wRamp) : fadeOf(${i})) * ${COPY_OF(i)} * armAF[${i}].w`).join(' + ')}) / max(pres, 1.0e-4) * circK;
#if SKIN_COPY == 2
  // THE COPIES SHARE ONE COVERAGE (a patch where the cava's lower edge meets the liver, Mohammad 21 Nov): at a junction of arms drawn over the organs (the front copy: the renal vein) and arms behind them (the veil copy: the cava) the weights split the pixel between the two copies, and
  // two alpha blends in turn cover 1 - (1 - a0)(1 - a2), less than a0 + a2: the organ showed through the vessel across the mixing zone. The veil is drawn after the front copy, so its alpha is what is left of the pixel once the front has taken its share (the shares add to the pixel's coverage).
  float alphaFront = (${Array.from({ length: SKIN_ARMS }, (_, i) => `wAt(${i}) * (armCopy[${i}].w < -1.5 ? mix(fadeOf(${i}), aTrunk, wRamp) : fadeOf(${i})) * armCopy[${i}][0] * armAF[${i}].w`).join(' + ')}) / max(pres, 1.0e-4) * circK;
  alpha = min(1.0, alpha / max(1.0 - alphaFront, 1.0e-3));
#endif   // (the body's skin fades out as the map comes in; the map's own skin is in over the end of the change, as the arm tubes' map cut takes their ends away)
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
  float skinArt = clamp(1.0 - (${BLEND('armColor', 'wAt', '.a')}), 0.0, 1.0);
  float inkDev = (${inkPxGlsl('rCssAx', 'rCssAx', 'skinArt')} * mix(1.0, ${F(CIRC_INK_K)}, skinCirc) + hiPx * hi) * dpr;
  float kPx = skinK / max(wpcAx / SKIN_U, 1e-9) * dpr;
  float sdPx = skinSdPx(kPx, false);
  // NEAR A SEAM THE TUBE'S OWN SILHOUETTE DECIDES, NOT THE OUTLINE'S APPROXIMATION OF IT (the black and brown specks along the walls at every junction: they are the background, a pixel or two of the seam's edge that the band
  // trimmed, where the tube past the seam is cut and no longer there to cover it). The ring is the tube's exact polygon stood out by its sag, the outline a smooth capsule: they differ by about a pixel. Where one arm's weight
  // is nearly 1 the band is wider by that pixel and a half, fading out over the weights 0.75 .. 0.97, so the outline rules the free skin and the mesh rules the seam
  float wMax = 0.0;
  for (int i = 0; i < ${SKIN_ARMS}; i++) wMax = max(wMax, rawW(i) * keepOf(i));   // (the raw weights of the arms that are THERE: wAt renormalises them, so an absent arm's seam ring read as a kept arm's weight 1 and the band stayed wide there)
  float seamPad = ${F(SKIN_SEAM_PAD_PX)} * dpr * smoothstep(0.75, 0.97, wMax);
  // THE UNION'S OWN SCREEN FOOTPRINT IS NEVER DROPPED (Mohammad, 22 Nov: a black crescent under the purple's landing at the azygos). ROOT CAUSE: the mesh is one static shape at the arms' REST widths and the host's tube is cut away under it, so where a narrow arm (C1b at swell 0.45) leaves the host the mesh has the arm's fat stub and no host wall behind it.
  // The stub's pixels lie 13 px outside the live arm and the depth hold-out (right, for the outline's ink) holds every other arm out of them: the band dropped them, and nothing else draws there. A pixel past the band that the arms' union with no depth rule calls lumen is lumen:
  // it takes that distance. Pixels the band keeps are untouched, so the hold-out's work on the seam's ink stays.
  if (sdPx > inkDev + 0.5 + seamPad) { float sdFlat = skinSdPx(kPx, true); if (sdFlat <= -0.5) sdPx = sdFlat; }
#ifdef SKIN_DEBUG
  if (sdPx > inkDev + 0.5 + seamPad) { gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); gl_FragDepth = min(gl_FragCoord.z + 0.002, 1.0); return; }
#endif
  if (sdPx > inkDev + 0.5 + seamPad) discard;   // (past the band: the mesh is a little wider than the union's line where the arms spread)
  // THE BODY COLOUR: each arm's lens colour at its seam's ramp position (the tube's own rule, the two lens sets crossfaded by lensMix), then the arms blended by weight: a gradient through the junction, the tube's colour on a seam
  vec3 base = vec3(0.0);
  float rawAcc = 0.0;   // (the arms' as-drawn share, weighted as the colour is: cel-glsl.ts tubeRawK)
  vec4 laArm[${SKIN_ARMS}];
  vec4 lbArm[${SKIN_ARMS}];
  for (int i = 0; i < ${SKIN_ARMS}; i++) {
    laArm[i] = vec4(0.0); lbArm[i] = vec4(0.0);
    if (armData[i].x < 0.0) continue;
    // (the lanes of the Blood origin and First pass lenses run ACROSS the tube: this arm's own across at this pixel, which on its seam ring is the tube's, so the lanes run on through the skin and the colour is continuous with the tube's)
    lensAcrossFw = fwLn[i];
    vec4 la = lensOfAt(armData[i].w, armAF[i].x, lensGradA, lensLaneA, lensModeA, laneColA, acA[i]);
    vec4 lb = lensOfAt(armData[i].w, armAF[i].x, lensGradB, lensLaneB, lensModeB, laneColB, acA[i]);
    la.a *= armColor[i].a;
    lb.a *= armColor[i].a;
    laArm[i] = lensHeadAt(armData[i].w, armAF[i].x, lensGradA, lensLaneA, lensModeA, laneColA, la); lbArm[i] = lensHeadAt(armData[i].w, armAF[i].x, lensGradB, lensLaneB, lensModeB, laneColB, lb);   // (the heads' tone is judged at the arm's middle lane, one per head: lensHeadAt)
    base += wAt(i) * mix(mix(armColor[i].rgb, la.rgb, la.a), mix(armColor[i].rgb, lb.rgb, lb.a), lensMix);
    rawAcc += wAt(i) * mix(la.a * lensRawA, lb.a * lensRawB, lensMix);
  }
  tubeRawK = rawAcc;
#ifdef GLOW
  // THE GLOW'S MASK (glow.ts, glow-fx.ts): the skin as it is drawn, weighted by the arms' blended pick weight, painted into the mask texture by max with the tubes' own: the junction is part of the one mask the blur turns into a halo
  {
    float sG = sdPx / dpr - ${inkPxGlsl('rCssAx', 'rCssAx', 'skinArt')};   // CSS px past the line's outer edge
    float wG = ${glowWeightGlsl('hi')} * alpha * (1.0 - smoothstep(-0.5, 0.5, sG * dpr));
    if (wG < 0.002) discard;
    gl_FragColor = vec4(${glowToneGlsl('base')} * wG, wG);
    return;
  }
#endif
  float rDev = vR / max(${wpcGlsl('vW', 'projY', 'SKIN_U')}, 1e-6) * dpr;
  vec3 c = celTubeToneArt(base, sT, swT, rDev, skinArt);   // two flat tones, matte and opaque: the tube's own
#ifdef VDBG
  c = dbgBody(c, base, n);   // (the inspector's shade mode: debug-view.ts)
#endif
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
  float wD0 = 0.0, wD1 = 0.0, wD2 = 0.0, onD0 = 0.0, onD1 = 0.0, revD0 = 0.0, revD1 = 0.0, inD0 = 0.0, inD1 = 0.0;   // (inD: how far inside the arm's own cylinder the pixel is: 1 inside, 0 outside)
  for (int i = 0; i < ${SKIN_ARMS}; i++) {
    if (armData[i].x < 0.0) continue;
    // the arm's own frame, taken at the top of main (sIa, acA, pxA, awA, sideA, headA): its arc here, and the across the tube would have (its heading, in the view's frame, grows with its arc)
    float sI = sIa[i], acrossI = acA[i], pxI = pxA[i], acrossW = awA[i];
    vec3 sideDir = sideA[i];
    float wI = wAt(i);
    float lensI = armData[i].w, Lw = armArc[i].z, rOwn = max(armArc[i].w, 1e-3);
#ifndef SKIN_NOHEADS
    // THE HEADS: this arm's own, each drawn whole by the arm that owns its centre (skinOwner), within the arm's own cylinder (a head of this arm's frame is never drawn on another arm's wall, which the pixel's weight used to see to)
    if (vR > 0.0) {
      // (a head is sized by the ARM's own radius, never by the pixel's: the skin's radius at a pixel blends the arms' radii, so near a node it can be wider than this arm's lumen, and a head sized to it was wider than the lumen it lay in,
      // met the wall and was faded to a ghost: Mohammad, 24 Nov, the pale head on the portal vein under the hepatic artery's leader)
      float vRH = min(vR, rOwn * swAt(i));
      // (and its place across is the pixel's lateral from the arm's live axis, which is the tube's own across wherever the pixel lies: the normal-based one is true only inside the arm's cylinder, so a head carried past the seam into the
      // trunk beside it was sheared and cut to a crescent at a vein's mouth: Mohammad, 24 Nov, the left gastric vein)
      float rPxH;
      float latH = skinArmLat(gl_FragCoord.xy, i, swAt(i), rPxH);
      vec4 hI = flowHeads(clamp(latH, -1.0, 1.0), acrossW, sI, Lw, vRH, wpcM, pxI, lensI, armFlowAt(i), 1.0, laArm[i], lbArm[i], armColor[i].rgb, base);
      if (hI.a > 0.002) {
        vec3 seamP = armAxisP[i * ${SKIN_AXIS_PTS} + 2].xyz;
        // (the pixel's lateral from the arm's LIVE axis, the bent chain J - start - seam - far the mesh itself is built on, in lumen units: skinArmLat. It was the distance to the straight line through the seam, which a bending vessel
        // leaves within a radius or two, so on a curved trunk the gate closed on a head standing mid-lumen and drew it a ghost, or not at all: Mohammad, 24 Nov, chevrons hidden under the joins in every lens)
        float latK = abs(latH);
        float gate = 1.0 - smoothstep(${F(SKIN_HEAD_GATE_FROM)}, ${F(SKIN_HEAD_GATE_TO)}, latK);
        if (gate > 0.0 && abs(armArc[i].y) > 0.5) {
          // A HEAD WHOSE CENTRE IS STILL ON THE TUBE'S SIDE of the seam is the TUBE's: the tube has drawn its pixels up to the seam and the skin must finish it, whoever owns the place its
          // centre would be in the skin. Asked of the owner rule, a head at the mouth of a side vein (whose centre lies where the trunk's wall is as near as its own) was drawn by the tube up to the seam and dropped past it: half a chevron
          // under the join (Mohammad, 24 Nov, the left gastric vein's mouth, the portal vein under the bifurcation). Further in, the skin owns it whole by the winner rule, and the tube has no pixel of it.
          float aIn = (chevCentreArc - armArc[i].x) * armArc[i].y / max(rOwn, 1e-4);
          float tubeSide = 1.0 - smoothstep(${F(SKIN_HEAD_TUBE_SIDE)}, ${F(SKIN_HEAD_TUBE_SIDE + 0.3)}, aIn);
          float ownH = max(skinOwner(i, seamP + tJA[i] * ((chevCentreArc - armArc[i].x) / (armArc[i].y * SKIN_U)), kPx), tubeSide);
          hI *= gate * ownH;   // (the owner share eases in and out as the head's centre travels: never a cut, so a head never pops at a join)
        }
        else hI = vec4(0.0);
      }
      headAcc += hI;
    }
#endif
    if (wI < 0.004 || vR <= 0.0) continue;
    // the dust (blood/dust-glsl.ts dustSkin): this arm's frame, kept for the two heaviest arms; the particles are drawn once below, each at the blend of its places in the two (never two ghosts)
    DFrame FI; float revI;
    float onI = flowFrame(acrossI, dustFrame(headA[i], mat3(modelViewMatrix) * vec3(0.0, 0.0, 1.0), viewDir, sideDir), sI, Lw, rOwn, vR, rCssM, lensI, armData[i].x, armData[i].y, SKIN_U, FI, revI);
    // AN ARM'S FRAME IS TRUE ONLY WITHIN ITS OWN CYLINDER (the heads' rule above): beside it, in the fillet or on the other arm's wall, its across and arc are those of a line that does not pass here, and its particles are specks of the wrong lane
    vec3 relD = vPos - armAxisP[i * ${SKIN_AXIS_PTS} + 2].xyz;
    float inI = 1.0 - smoothstep(${F(SKIN_HEAD_LAT_FROM)}, ${F(SKIN_HEAD_LAT_TO)}, length(relD - tJA[i] * dot(relD, tJA[i])) * SKIN_U / max(rOwn * swAt(i), 1e-4));
    if (wI > wD0) { wD2 = wD1; FD1 = FD0; wD1 = wD0; onD1 = onD0; revD1 = revD0; inD1 = inD0; FD0 = FI; wD0 = wI; onD0 = onI; revD0 = revI; inD0 = inI; }
    else if (wI > wD1) { wD2 = wD1; FD1 = FI; wD1 = wI; onD1 = onI; revD1 = revI; inD1 = inI; }
    else wD2 = max(wD2, wI);
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
      // each frame's dust by its own gate (on) and by how far inside its own cylinder the pixel is (in), renormalised by those shares: a frame that does not hold here gives way to the one that does, never half a ghost
      float a0 = (1.0 - w1) * inD0, a1 = w1 * inD1, aN = a0 + a1;
      vec4 dust = vec4(0.0);
      if (aN > 1e-4) {
        if (a0 > 0.004 && onD0 > 0.002) dust += dustTube(FD0, litD, inkColor, revD0) * (onD0 * a0);
        if (a1 > 0.004 && onD1 > 0.002) dust += dustTube(FD1, litD, inkColor, revD1) * (onD1 * a1);
        dust /= aN;
        // THE SHARE THAT HOLDS (Mohammad, 21 Nov: the join is a brighter patch, gone with ?joins=nodust). The renormalising above lets whichever frame holds a little draw at FULL strength, so in the fillet and the web between the arms,
        // where neither cylinder holds (inD near 0 in both), the dust a frame still sees there was drawn whole, a pale slab over the wall the tubes beside it do not have (a tube draws nothing past its own lumen). The dust fades with the
        // best frame's hold (twin and test: tests/skin-dust-hold.test.ts), so it is whole wherever an arm holds and gone where none does.
        dust *= max(a0 > 0.004 ? inD0 : 0.0, a1 > 0.004 ? inD1 : 0.0);
      }
#endif
#ifdef SKIN_DUSTBLEND
      dustAcc = clamp(vec4(dust.rgb * dOn, dust.a * dOn), 0.0, 1.0);
#else
      dustAcc = clamp(dust, 0.0, 1.0);
#endif
    }
#endif
  }
#ifdef VDBG
  if (dbgDust < 0.5) dustAcc = vec4(0.0);
  if (dbgHeads < 0.5) headAcc = vec4(0.0);
#endif
  headAcc = clamp(headAcc, 0.0, 1.0);   // (the arms' weights can sum past 1 while an arm grows: premultiplied marks never past 0 .. 1, or the lumen under them is inverted)
  dustAcc = clamp(dSafe(dustAcc), 0.0, 1.0);   // (a NaN from any arm's share, weight or wall is no dust, tested on the bits: dust-glsl.ts dSafe)
  dustAcc *= dHold(alpha);   // (the dust follows this pixel's final alpha: blood/dust-glsl.ts dHold)
  // THE WALL RULE BY THE PIXEL'S OWN DISTANCE TO THE OUTLINE (skin/dust-wall.ts): the arms' gates in dustTube read the normal's across, true only inside an arm's cylinder, so in a fillet they stood open on the line itself (dashes at the seams and the crotch)
  dustAcc *= dWall(skinWall(rCssAx * dpr, sdPx, inkDev));
  dustAcc = dSafe(dustAcc);   // (and a NaN of the wall's own distance is no dust either)
  // (the HEADS keep the same wall: a head is gated by its arm's own cylinder, which at the fork's inner corner reaches past the union's lumen, so a chevron there was drawn up to and over the crotch's ink and clipped against it, white on
  // the light look: Mohammad, 21 Nov. A head lies within 0.6 of its axis, so the wall (from 0.90 of the way to the ink) never touches one inside its own tube)
  headAcc *= dWall(skinWall(rCssAx * dpr, sdPx, inkDev));
  dustCover = dustAcc;
  c = c * (1.0 - dustAcc.a) + dustAcc.rgb;
  c = mix(c, cBody, headAcc.a);   // (the streaks lie UNDER the heads: a head's pixel is never tinted by one)
  c = c * (1.0 - headAcc.a) + headAcc.rgb;
#endif
  // THE CLOT (plan 26): each arm that carries one paints it in its own frame (its share along the vein, its lateral), by the arm's weight, so it crosses the joint with no seam; the one function of the tube (clot-field.ts), lit by this
  // pixel's own n.L, clipped to the union's lumen before the ink band. A uniform branch per arm: a junction with no clot runs none of this.
  if (skinCirc < 0.5) {
    float covK = 0.0, inkK = 0.0, covRaw = 0.0;
    for (int i = 0; i < ${SKIN_ARMS}; i++) {
      if (armData[i].x < 0.0 || armClotA[i].z == 0.0) continue;
      float wI = wAt(i);
      if (wI < 0.004) continue;
      float rPxC;
      float latC = skinArmLat(gl_FragCoord.xy, i, swAt(i), rPxC);
      vec3 ct = clotAt(armClotA[i], armClotP[i].xy, sIa[i] / max(armArc[i].z, 1e-6), latC, armArc[i].w * swAt(i), rPxC);
      float inkC = min(inkDev, ${F(CLOT_INK_MAX_R)} * rPxC);
      float cv = wI * ct.x * (armCopy[i].w < -1.5 && ct.x > 0.0 ? skinOutsideTrunk(gl_FragCoord.xy) : 1.0);   // (a vein that opens into the trunk's side: its clot ends at the trunk's wall, not at the union's)
      covK += cv; covRaw += cv;
      inkK += cv * ct.z * (1.0 - smoothstep(inkC - 0.5, inkC + 0.5, ct.y));
    }
    covK = min(covK, 1.0) * (1.0 - smoothstep(0.5, 1.5, sdPx)) * (1.0 - smoothstep(0.0, 0.35, circT));
    if (covK > 0.0) {
      float etC = max(0.5 * ${F(CEL_STYLE.EDGE_PX)} * swT, 1e-4);
      vec3 toneC = mix(mix(clotShade, clotBase, smoothstep(${F(CLOT_SHADE_AT)} - etC, ${F(CLOT_SHADE_AT)} + etC, sT)), clotLift, smoothstep(${F(CLOT_LIFT_AT)} - etC, ${F(CLOT_LIFT_AT)} + etC, sT));
      vec3 lineC = mix(inkColor, clotShade * mix(${F(CEL_STYLE.TUBE.INK_TONE)}, ${F(CEL_STYLE.TUBE.INK_TONE_DARK)}, tubeDark), ${F(CEL_STYLE.TUBE.INK_OWN)});
      c = mix(c, mix(toneC, lineC, clamp(inkK / max(covRaw, 1e-4), 0.0, 1.0)), covK);
    }
  }
  float inkT = smoothstep(-0.5, 0.5, sdPx);   // the outline: ink outside the live lumen, antialiased half a pixel each side
#ifdef VDBG
  if (dbgInk < 0.5) inkT = 0.0;
#endif
#ifndef SKIN_NOINK
  c = mix(c, mix(${inkColourGlsl('base')}, inkColorCirc, circT), inkT);
#endif
  if (skinCirc > 0.5) {
    // the Circuit's INNER line (vessels/shaders.ts: the outline also sits a little inside the vessel and fades inward, so on a dark map the edge still reads): the lumen's own radius in device px sets its depth, the distance inside the wall is -sdPx
    float rDevIn = rCssAx * dpr;
    float inDepth = clamp(${F(CIRC_INNER.R)} * rDevIn, ${F(CIRC_INNER.MIN_PX)} * dpr, ${F(CIRC_INNER.MAX_PX)} * dpr);
    c = mix(c, inkColorCirc, skinCirc * circT * ${F(CIRC_INNER.K)} * smoothstep(-inDepth, 0.0, sdPx));
  }
#ifdef VDBG
  c = dbgEnd(c, armData[0].x + 0.5);
#endif
  // the wedge's amber column through the join: the SAME field the tubes carry (wedge-glsl.ts). The arms that carry it blend their seams' distances by the arms' weights, so a pixel in the join has the distance
  // of the place it is at, and the one front crosses the tubes and the skin at one speed
  if (skinCirc < 0.5 && wedgeS.x > 0.001) {
    float pwS = 0.0, dwS = 0.0;
    for (int i = 0; i < ${SKIN_ARMS}; i++) { float wi = wAt(i); float wdI = armWedgeAt(i); if (wdI > -1000.0) { pwS += wi; dwS += wi * wdI; } }
    if (pwS > 0.001) {
      float waS = wedgeS.x * clamp(pwS, 0.0, 1.0) * wedgeCover(dwS / pwS, vec3(wedgeS.y, wedgeS.z, wedgeS.w));
      c = mix(c, wedgeColS, WEDGE_A * waS * (1.0 - inkT));   // (under the outline: the vessel's line stays)
    }
  }
  c = dDbgPaint(c, alpha);   // (?dust, Paint the trouble: off unless asked)
#ifndef SKIN_NOMARKS
  c = dFinite(c, dFinite(cBody, vec3(0.5)));   // (a NaN colour is the tone before the dust, never a black block)
#else
  c = dFinite(c, vec3(0.5));
#endif
  if (dBad(vec4(alpha))) alpha = 1.0;   // (nor an alpha that is not a number: a NaN blended onto the figure is written as black)
  gl_FragColor = vec4(c, alpha);
}`;
