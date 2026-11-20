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
//   armAxisP[24] vec4   per arm four points of its axis (the node J, the start of the straight line through the seam, the seam, the far point), rest positions, model space; w the rest radius at the point
//   armArc[4]    vec4 + (the arm's flow marks) the arc, figure units, at its seam (u x len x SKIN_FIGURE_UNITS), +1 if the arc grows toward the node (the arm is its vessel's end 1) else -1, the vessel's length (figure units), its rest radius (figure units)
//   armFlow[4]   float + the arm tube's `flowAmount`
//   streamTex, chainTex, streakAmt, dustP, time, markDark, markLight, markRev: the tubes' (shared by reference)
//   skinK        float  the smooth-min blend width, scene units
//   lensUse + : 1 (the per-arm flag above is multiplied in), inkColor, inkColorCirc, tubeDark, fade, hiPx, inflate, res, dpr, projY, circT, vdata, vdataSize, useData, the two lens sets (lensGradA/B, lensLaneA/B,
//   lensModeA/B, laneColA/B, lensMix, lensTail, lensSmooth) are the tubes' (shared by reference).
//
// Lane lenses (the Blood origin and First pass lenses draw lanes side by side ACROSS a tube): a skin has no "across" and takes the lane's centre (across 0), so a junction shows its arms' middle lane; the lens ramps
// (pressure, oxygen...) are exact.
import { CEL_LIGHT_GLSL, CEL_TUBE_GLSL } from '../../cel-glsl.ts';
import { FADE_GLSL } from '../../materials/shaders.ts';
import { TUBE_DEPTH_SHARE, TUBE_SAG } from '../shaders.ts';
import { LENS_OF_AT_GLSL, CHEV_ONE_GLSL, CHEV_CREAM_GLSL, FLOW_MARKS_GLSL, SWELL_OF_GLSL, inkColourGlsl, inkPxGlsl, wpcGlsl } from '../glsl-shared.ts';
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

/** The weighted sum of a per-arm float uniform array over all the arms (`wAt` and `wAtF` read the two weight attributes). */
const BLEND = (name: string, w = 'wAt', comp = ''): string => Array.from({ length: SKIN_ARMS }, (_, i) => `${w}(${i}) * ${name}[${i}]${comp}`).join(' + ');

export const SKIN_VS = /* glsl */ `
const float SKIN_U = ${F(SKIN_FIGURE_UNITS)};
attribute vec3 cen;      // the nearest point on the nearest arm's axis: the depth and the lumen's centre, as a tube's ring centre is
attribute vec4 weight;   // how much of this vertex belongs to each arm (arms 0 to 3; the six sum to 1, arm order)
attribute vec2 weight2;  // arms 4 and 5
attribute float restR;   // the blended rest radius here (scene units)
uniform float inflate;
uniform sampler2D vdata;
uniform vec2 vdataSize;
uniform float useData;
uniform vec2 res;
uniform float hiPx;
uniform vec4 armData[${SKIN_ARMS}];
uniform vec4 armAF[${SKIN_ARMS}];   // per arm (lensU, fade, hi, pres): one vec4 each, because a float array costs a whole vector a slot
uniform float armNarrow[${SKIN_ARMS}];   // each arm tube's stenosis waist at its seam (the narrow attribute there): 0 at rest and at a vessel's ends, a little more where a cut lies inside a short piece's waist
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
float wAt(int i) { return i < 4 ? weight[i] : weight2[i - 4]; }
void main() {
  // each arm's live width (the engine's diameter by the 2D figure's rule), then the blend: on a seam ring the weight is 1 on its own arm, so this IS the tube's swell and the ring lands where the tube's ring lands
  float sw[${SKIN_ARMS}];
  for (int i = 0; i < ${SKIN_ARMS}; i++) sw[i] = 1.0;
  // (an arm's waist at its seam is part of its width there, as the tube's own narrowK is: the same share kept, 1 - narrow clamped as the tube clamps it)
  for (int i = 0; i < ${SKIN_ARMS}; i++) if (armData[i].x >= 0.0) sw[i] = swellOf(armData[i].x, armData[i].y, armData[i].z) * (1.0 - clamp(armNarrow[i], 0.0, 0.97));
  float swell = 0.0;
  for (int i = 0; i < ${SKIN_ARMS}; i++) swell += wAt(i) * sw[i];
  vec4 cc = projectionMatrix * (modelViewMatrix * vec4(cen, 1.0));
  float wpcV = ${wpcGlsl('cc.w', 'projectionMatrix[1][1]', 'SKIN_U')};   // the figure's units under one CSS px here
  float lumenW = restR * swell;
  float rCssV = lumenW * SKIN_U / max(wpcV, 1e-6);   // the lumen's radius in CSS px
  float hi = ${BLEND('armAF', 'wAt', '.z')};
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
  vWeight2 = weight2;
  vRest = restR;
  vSwell = vec4(sw[0], sw[1], sw[2], sw[3]);
  vSwell2 = vec2(sw[4], sw[5]);
  vPos = position;
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
uniform vec4 armAF[${SKIN_ARMS}];   // per arm (lensU, fade, hi, pres)
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
// the outline of the smooth union of the live arms, in device px: negative inside the lumen, 0 on the wall (pairwise in arm order, as the mesh's own SDF)
float skinSdPx(float kPx) {
  float d = 0.0;
  bool first = true;
  for (int i = 0; i < ${SKIN_ARMS}; i++) {
    if (armData[i].x < 0.0) continue;
    float di = skinArmPx(gl_FragCoord.xy, i, swAt(i));
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
  // the skin is there only as much as its arms are (a tube not yet drawn on, retracted, dissolved or hidden has none at its seam): the tube's own screen pattern, so the skin comes and goes with the vessels, never beside them
  float pres = ${BLEND('armAF', 'wAt', '.w')};
  if (pres < 0.999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= pres) discard;
  // the arms' alphas, blended by weight: the junction fade rule already holds on the tubes, so their seam alphas agree and the skin runs through them. On the Circuit's map the tubes become flat lines and the map draws its own
  // joins, so the skin fades out over the first SKIN_CIRCUIT_FADE of the morph (the arm tubes' cut fades back in over the same)
  float alpha = (${BLEND('armAF', 'wAt', '.y')}) * (1.0 - smoothstep(0.0, ${F(SKIN_CIRCUIT_FADE)}, circT));
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
  if (sdPx > inkDev + 0.5) discard;   // (past the band: the mesh is a little wider than the union's line where the arms spread)
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
  float rDev = vR / max(${wpcGlsl('vW', 'projY', 'SKIN_U')}, 1e-6) * dpr;
  vec3 c = celTubeTone(base, sT, swT, rDev);   // two flat tones, matte and opaque: the tube's own
  // THE FLOW MARKS (Mohammad, 20 Nov: "the streaks still break between vessels", "the particles should cross at the junction, not disappear"). The tube draws its dust and chevrons from its own arc and the stream chain's A and B
  // (vessels/shaders.ts); the skin draws the SAME, once per arm, on that arm's arc carried on past its seam along the arm's axis (armArc: the arc at the seam, which way it grows, the length), across taken from the arm's own heading, and blends
  // the arms by their weights: on a seam ring one weight is 1 and this is the tube's pixel, so a streak or a head runs out of one tube, through the skin and into the next (a chained arm carries its parent's particles at the stream's place).
  vec3 cBody = c;
  vec4 dustAcc = vec4(0.0), headAcc = vec4(0.0);
  float wpcM = ${wpcGlsl('vW', 'projY', 'SKIN_U')};
  float rCssM = vR / max(wpcM, 1e-6);
  vec3 litD = celTubeBase(base);
  vec3 viewDir = normalize(vV);
  DFrame FD0, FD1;
  float wD0 = 0.0, wD1 = 0.0, onD0 = 0.0, onD1 = 0.0, revD0 = 0.0, revD1 = 0.0;
  for (int i = 0; i < ${SKIN_ARMS}; i++) {
    if (armData[i].x < 0.0) continue;
    // the arm's own frame: its arc here, and the across the tube would have (its heading, in the view's frame, grows with its arc)
    vec3 toJ = armAxisP[i * ${SKIN_AXIS_PTS} + 1].xyz - armAxisP[i * ${SKIN_AXIS_PTS} + 2].xyz;   // (toward the node along the straight line through the seam)
    float tl = length(toJ);
    vec3 tJ = tl > 1e-6 ? toJ / tl : vec3(1.0, 0.0, 0.0);
    float sI = armArc[i].x + armArc[i].y * dot(vPos - armAxisP[i * ${SKIN_AXIS_PTS} + 2].xyz, tJ) * SKIN_U;
    vec3 sideX = cross(normalize(mat3(modelViewMatrix) * (armArc[i].y * tJ)), viewDir);
    float sideL = length(sideX);
    float acrossI = dot(n, sideL > 1e-4 ? sideX / sideL : vec3(1.0, 0.0, 0.0));
    float pxI = fwidth(sI);        // (derivatives are taken here, before any branch that depends on the weight)
    float acrossW = max(fwidth(acrossI), 0.03);
    float wI = wAt(i);
    if (wI < 0.004 || vR <= 0.0) continue;
    float lensI = armData[i].w, Lw = armArc[i].z, rOwn = max(armArc[i].w, 1e-3);
    // the dust (blood/dust-glsl.ts dustSkin): this arm's frame, kept for the two heaviest arms; the particles are drawn once below, each at the blend of its places in the two (never two ghosts)
    DFrame FI; float revI;
    float onI = flowFrame(acrossI, dustFrame(mat3(modelViewMatrix) * (armArc[i].y * tJ), mat3(modelViewMatrix) * vec3(0.0, 0.0, 1.0), viewDir, sideL > 1e-4 ? sideX / sideL : vec3(1.0, 0.0, 0.0)), sI, Lw, rOwn, vR, rCssM, lensI, armData[i].x, armData[i].y, SKIN_U, FI, revI);
    if (wI > wD0) { FD1 = FD0; wD1 = wD0; onD1 = onD0; revD1 = revD0; FD0 = FI; wD0 = wI; onD0 = onI; revD0 = revI; }
    else if (wI > wD1) { FD1 = FI; wD1 = wI; onD1 = onI; revD1 = revI; }
    headAcc += wI * flowHeads(acrossI, acrossW, sI, Lw, vR, wpcM, pxI, lensI, armFlow[i], 1.0, laArm[i], lbArm[i], armColor[i].rgb, base);
  }
  if (wD0 > 0.0) {
    // the two heaviest arms' share (renormalised): on a seam ring one weight is 1 and this is the tube's own pixel (dustTube)
    float w1 = wD1 / max(wD0 + wD1, 1e-4);
    float dOn = mix(onD0, onD1, w1);
    if (dOn > 0.002) {
      vec4 dust = wD1 > 0.004 ? dustSkin(FD0, FD1, w1, litD, inkColor, mix(revD0, revD1, w1)) : dustTube(FD0, litD, inkColor, revD0);
      dustAcc = vec4(dust.rgb * dOn, dust.a * dOn);
    }
  }
  c = c * (1.0 - dustAcc.a) + dustAcc.rgb;
  c = mix(c, cBody, headAcc.a);   // (the streaks lie UNDER the heads: a head's pixel is never tinted by one)
  c = c * (1.0 - headAcc.a) + headAcc.rgb;
  float inkT = smoothstep(-0.5, 0.5, sdPx);   // the outline: ink outside the live lumen, antialiased half a pixel each side
  c = mix(c, mix(${inkColourGlsl('base')}, inkColorCirc, circT), inkT);
  gl_FragColor = vec4(c, alpha);
}`;
