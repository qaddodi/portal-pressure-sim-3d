// The vessel's own fragment shader: the cel look of materials/shaders.ts (banded light, rim, wet dot) with three things added.
//   1. The colour lens: a vessel wears the colour of the lens at each end (two textures, one texel per topology edge, 2 rows: upstream, downstream),
//      or lanes side by side for the Blood origin and First pass lenses. Two lenses are held and crossfaded by `lensMix`, so a lens switch is
//      one uniform tween on the clock, no CPU work per frame.
//   2. Moving blood: the 2D app's flow heads (chevron-glsl.js chevHead, blood-heads.js): a slim head with a notched back, 4 to 8 CSS px of half width,
//      one every 60 CSS px (40 to 80 with the lattice's levels) along the vessel (the spacing level 28 * 2^n units, coarser heads a subset of finer ones), riding the stream the CPU keeps
//      (streams.ts: distance, display speed, eased reversed flag); near-black on a light lumen and cream on a dark one, orange where reversed with a
//      second small head behind; stagnant blood in a big vein drifts as smoke.
//   3. Closed potential collaterals: a dotted thread (`dotted` 1) instead of a tube.
// 4. One draw per vessel, ONE mesh and one material: the tube is built INK wider than its lumen (the figure's line, constant in device px, see the vertex stage) and this fragment shader paints the band as the outline,
//    from the exact lateral distance to the tube's axis, so the line is continuous by construction (no hull mesh, no stencil, no depth tie). The highlight (hiOn, hiDir, hiOffset, hiAhead, hiBehind, hiPx) and the lift
//    (`inflate`) are the scene's own uniforms with the same meaning as in INK_VS.

import { CIRCUIT_VS_CALL, CIRCUIT_VS_HEAD } from '../circuit/shader.ts';
import { FADE_GLSL } from '../materials/shaders.ts';
import { CHEV, CHEVRON_GLSL } from '../blood/chevron-glsl.ts';
import { STREAK } from '../blood/streak-glsl.ts';
import { DUST_GLSL } from '../blood/dust-glsl.ts';
import { QUIET_BACK } from '../camera/quiet.ts';
import { CEL_STYLE } from '../cel-style.ts';
import { CEL_LIGHT_GLSL, CEL_TUBE_GLSL, glslNum as F } from '../cel-glsl.ts';
import { TUBE_RADIAL } from './tubes.ts';
import { SKIN_CIRC_SPAN, SKIN_CUT_EPS } from './skin/types.ts';
import { LENS_OF_AT_GLSL, CHEV_ONE_GLSL, CHEV_CREAM_GLSL, FLOW_MARKS_GLSL, SWELL_OF_GLSL, inkColourGlsl, inkPxGlsl, wpcGlsl } from './glsl-shared.ts';

/** The tube's ring is a polygon of TUBE_RADIAL sides: its corners stand 1 / cos(pi / n) - 1 of the radius outside its flats. The tube is built that much fatter, so the silhouette never falls inside the outline. */
export const TUBE_SAG = 1 / Math.cos(Math.PI / TUBE_RADIAL) - 1;
/** How much of a tube's own round depth its pixels keep. The figure is a stack of tiers 0.01 to 0.02 apart (frame2d.ts TIER_Z) whose order is the 2D figure's over and under (the hepatic artery between the cava and the portal vein),
 *  but a round tube's front stands its RADIUS in front of its axis: the cava (z -0.02, radius 0.027) bulged 0.007, past the hepatic artery's axis (z 0.0) and its own front (0.005), and hid it (Mohammad, 20 Nov: "fix the hepatic artery
 *  to be between the IVC and PV"). The vertex shader moves each vertex's depth (along its own ray: nothing moves on screen) to the axis's depth plus this share of the bulge, so a crossing is decided by the tiers and the thick tube's bulge
 *  (at most 0.15 x 0.035 = 0.005, under the narrowest gap that has to hold, cava to artery 0.02) only sorts two tubes of one tier. */
export const TUBE_DEPTH_SHARE = 0.15;
import { CIRC_INK_K, CIRC_INNER } from './cel-ink.ts';

export const VESSEL_VS = /* glsl */ `
const float RUN_ON_PX = 0.75;   // CSS px
attribute vec3 tang;
// a stent narrows its shunt's lumen (waist, end stenosis): the share of the tube taken off at this vertex, 0 on every vessel that has none (a missing attribute reads 0)
attribute float narrow;
attribute vec2 nbr;   // a fork's other tube: this vertex's signed distance from its axis and its radius there, scene units (0: none; neighbour.ts)
attribute float rk;   // this vertex's tube radius as a share of the vessel's own (a strand is thinner than its trunk; a run-on eases to its neighbour's width)
attribute float rkc;   // the same on the Circuit's map: the course's own share only (a strand is thinner than its trunk), without the body's tapers, collars and beads, which belong to the 3D figure (the map draws a vessel one width along its length)
uniform float inflate;
uniform sampler2D vdata;
uniform vec2 vdataSize;
uniform float vindex;
uniform float useData;
uniform float radius;
uniform float baseD;
uniform float widthKind;
uniform float len;
uniform float px;
uniform vec2 res;
// smooth joins (Settings > Figure depth): the vessel this one's start (mate0) and end (mate1) carries on into, as (its texel in the vessel data, the diameter its tube was built at, its width rule);
// x < 0 where nothing, which is every vessel with the switch off
uniform vec3 mate0;
uniform vec3 mate1;
uniform vec3 nbrMate;   // the vessel nbr is measured against (a fork's other tube, the cava): its data index, the diameter it was built at, its width kind (-1: none)
uniform vec2 bury;   // the ink is held back ONLY inside a declared branch's trunk: how far from the branch's start and end (figure units per radius unit, 0: none: a run-on, a crossing, a free end keep their whole outline)
uniform float hiOn;
uniform float hiDir;
uniform float hiOffset;
uniform float hiAhead;
uniform float hiBehind;
uniform vec2 hiEnds;   // the picked vein's distance to its outer start and outer end (materials/shaders.ts HI_NONE: no fade at that end)
uniform float hiFade;
uniform float hiPx;
uniform float inkOn;   // 0 on a dotted thread (no outline), else 1
uniform float liveW;   // a conditional tributary group's width share, 2D's 0.5 + 0.5 * live (feeders.ts): 1 for every other vessel
uniform float dpr;   // device pixels to a CSS pixel (the renderer's pixel ratio)
// the fade at a free end (2D's TIP_FADE, ART_FADE, FADE_DOWN_Y, FADE_IN, SIN_FADE): mode 1 runs along the vessel (uv.x), mode 2 down the figure (y), mode 3 along a line (the 2D linear mask, solid from the offset), mode 4 along a line with a dip (faintest at the offset, solid at the end); (from, to, alpha at from, alpha at to); fadeKeep 1: the Circuit does not let go of it
uniform float fadeMode;
uniform vec4 fadeA;
uniform vec2 cavaEnd;    // a hepatic vein: the share of its length at the cava end that eases to this alpha (fades.ts cavaEndSpan); 0 = none
uniform vec4 fadeLine;   // modes 3 and 4: a line across the figure, scene (x1, y1, x2, y2); fadeA is then (offset, -, alpha at the start, alpha at the end)
uniform float fadeKeep;
uniform vec3 stump;   // a vein divided at surgery (2D divideLen / stumpPinch): x the divided stretch's length from its start (figure units, 0: whole), y where the tie pinches it (units from the start), z the pinch's share
varying float vFade;
varying vec2 vNbr;
varying vec3 vCen;   // the tube's centreline point at this fragment, in clip space (x, y, w): the exact lateral distance to the axis, in device pixels, for the outline
varying vec3 vN;
varying vec3 vV;
varying vec3 vT;
varying vec3 vZf;   // the figure's normal (model z) in the view's frame: the dust's section frame (blood/dust-glsl.ts dustFrame)
varying vec2 vUv;
varying float vHi;
${CIRCUIT_VS_HEAD}
varying float vW;
varying float vR;
varying float vU;   // the figure's units in one scene unit here: 300 on the body, 1 / MAP_K on the map (the Circuit share of this vertex)
float buryK(float d0, float d1) {   // d0, d1: the figure units from the start and from the end of the tube
  float k0 = bury.x > 0.0 ? smoothstep(0.5 * bury.x * vU, bury.x * vU, d0) : 1.0;
  float k1 = bury.y > 0.0 ? smoothstep(0.5 * bury.y * vU, bury.y * vU, d1) : 1.0;
  return k0 * k1;
}
uniform float circBoost;   // 2D's circBoost: the map's lines are drawn up to 1.75 times wide when it is zoomed out (stage-tubes.js)
uniform float circPerPx;   // map units under one CSS pixel here
uniform vec4 circW;   // the vessel's width in the Circuit, map units: (fixed width or -1 for the engine's diameter, 1 if circBoost applies, the least width, the least width on the screen in CSS px)
${SWELL_OF_GLSL}
// the swell the tube has at the map's end (2D stage-tubes.js widthAt, t = 1): a vein clamp(vesselPx(D) * 0.95, 6, 15) map units, an artery 3, a liver bed 8, the boost on veins and beds;
// as a share of the radius the tube was built at, so the shared morph can ease the width with the line (the map's units are MAP_K scene units, the body's 1 / 300)
// the width (map units, before the boost's floor on the screen) a vessel of this kind and diameter has on the map: a vein clamp(vesselPx(D) * 0.95, 6, 15) times the boost, an artery 3, a bed 8 times the boost (width.ts circuitWidthMap)
float circWidthOf(float d, float kind) {
  if (kind > 1.5) return 8.0 * circBoost;
  if (kind > 0.5) return 3.0;
  return clamp(1.3 * max(2.6, 2.0 * pow(max(d, 0.1), 0.72)) * 0.95, 6.0, 15.0) * circBoost;
}
float circMateWidth(vec3 m) {   // a run-on mate's width on the map (m: its data index, its built diameter, its kind)
  float d = m.y;
  if (useData > 0.5) { ivec2 tc = ivec2(int(mod(m.x, vdataSize.x)), int(floor(m.x / vdataSize.x))); d = texelFetch(vdata, tc, 0).b; }
  return circWidthOf(d, m.z);
}
float circSwell() {
  float wc;
  if (circW.x >= 0.0) wc = max(circW.z, circW.x * mix(1.0, circBoost, circW.y));
  else {
    float d = baseD;
    if (useData > 0.5) { ivec2 tc = ivec2(int(mod(vindex, vdataSize.x)), int(floor(vindex / vdataSize.x))); d = texelFetch(vdata, tc, 0).b; }
    wc = clamp(1.3 * max(2.6, 2.0 * pow(max(d, 0.1), 0.72)) * 0.95, 6.0, 15.0) * circBoost;
  }
  // where this vessel carries on into another, the two meet at the mean of their widths over the first and last 30 %, as the body's do: the map's width is its own (the body's tapers are not carried onto it), so the join is eased here
  if (mate0.x >= 0.0) { float k0 = 1.0 - smoothstep(0.0, 0.3, uv.x); if (k0 > 0.0) wc += k0 * (0.5 * (wc + circMateWidth(mate0)) - wc); }
  if (mate1.x >= 0.0) { float k1 = smoothstep(0.7, 1.0, uv.x); if (k1 > 0.0) wc += k1 * (0.5 * (wc + circMateWidth(mate1)) - wc); }
  wc = max(wc, circW.w * circPerPx);
  return 0.5 * wc * CIRC_MAPK / max(radius, 1e-6);
}
// The stump of a divided vein: the first stump.x of it is not drawn, its end is round (a quarter circle over one radius) and it narrows a little at its tie (stage-tubes.js tubeRadius stumpPinch: 1 - 0.2 exp(-((a - tie) / 5.5)^2)).
float stumpK(float a, float R) {
  float q = clamp((a - stump.x) / max(R, 1e-3), 0.0, 1.0);
  float pq = (a - stump.y) / 5.5;
  return max(sqrt(max(0.0, 1.0 - (1.0 - q) * (1.0 - q))), 0.02) * (1.0 - 0.2 * stump.z * exp(-pq * pq));
}
void main() {
${CIRCUIT_VS_CALL}
  // the width follows the engine's diameter by the 2D figure's own rule (stage-tubes.js widthAt): a vein 1.3 * max(2.6, 2 d^0.72), an artery half of that (at
  // least 1.8), the liver's beds fixed; the ratio to the width the course was built at is the swell. The figure's own smallest radius is 0.35 units.
  float swell = 1.0;
  if (useData > 0.5 && widthKind < 1.5) {
    ivec2 tc = ivec2(int(mod(vindex, vdataSize.x)), int(floor(vindex / vdataSize.x)));
    float d = texelFetch(vdata, tc, 0).b;
    float w1 = 1.3 * max(2.6, 2.0 * pow(max(d, 0.1), 0.72)), w0 = 1.3 * max(2.6, 2.0 * pow(max(baseD, 0.1), 0.72));
    if (widthKind > 0.5) { w1 = max(1.8, w1 * 0.5); w0 = max(1.8, w0 * 0.5); }
    swell = clamp(w1 / w0, 0.2, 8.0);
  }
  // smooth joins: where this vessel carries on into another, both ease to the mean of their two live widths over the same stretch the tube's own taper takes (tubes.ts factorAt: the first and
  // last 30 %), so the ring they share has one radius and no step or seam shows when the engine widens one of them and not the other (smooth-joins.ts joinSwell)
  if (mate0.x >= 0.0) { float k0 = 1.0 - smoothstep(0.0, 0.3, uv.x); if (k0 > 0.0) swell += k0 * (0.5 * (swell + swellOf(mate0.x, mate0.y, mate0.z)) - swell); }
  if (mate1.x >= 0.0) { float k1 = smoothstep(0.7, 1.0, uv.x); if (k1 > 0.0) swell += k1 * (0.5 * (swell + swellOf(mate1.x, mate1.y, mate1.z)) - swell); }
  if (circShare > 0.0) swell = mix(swell, circSwell(), circShare);
  swell *= liveW;
  vU = mix(300.0, 1.0 / CIRC_MAPK, circShare);
  if (stump.x > 0.0 && circShare < 0.001) swell *= stumpK(uv.x * len * vU, radius * rk * swell * vU);
  float fa = 1.0;
  float rkE = mix(rk, rkc, circShare);   // (the tube's radius share here: on the map the course's own, not the body's tapers)
  if (fadeMode > 2.5) {
    // tube-geo.js tubeAlpha: the projection of the point on the line
    vec2 fd = fadeLine.zw - fadeLine.xy;
    float fv = dot(position.xy - fadeLine.xy, fd) / max(dot(fd, fd), 1e-9);
    if (fadeMode > 3.5) {
      fv = clamp(fv, 0.0, 1.0);
      fa = fv < fadeA.x ? mix(fadeA.z, fadeA.w, smoothstep(0.0, max(fadeA.x, 1e-4), fv)) : mix(fadeA.w, 1.0, smoothstep(fadeA.x, 1.0, fv));
    } else {
      fa = mix(fadeA.z, fadeA.w, clamp((fv - fadeA.x) / max(1.0 - fadeA.x, 1e-4), 0.0, 1.0));
    }
    fa = mix(fa, 1.0, circT);
  } else if (fadeMode > 0.5) {
    float fs = fadeMode < 1.5 ? uv.x : position.y;
    float ft = clamp((fs - fadeA.x) / (abs(fadeA.y - fadeA.x) < 1e-5 ? 1e-5 : fadeA.y - fadeA.x), 0.0, 1.0);
    fa = mix(fadeA.z, fadeA.w, ft);
    fa = mix(fa, 1.0, circT);
  }
  // the fade zone (a tip into its organ, a bed through the lobe, a vein into the cava): the tube keeps its full width and fades by opacity, body and outline together (vFade, 1 outside a fade zone: opaque)
  if (stump.x > 0.0 && circShare < 0.001) fa *= step(stump.x, uv.x * len * vU);   // (the divided stretch is not there: body and outline)
  if (cavaEnd.x > 0.0) fa *= mix(mix(1.0, cavaEnd.y, smoothstep(1.0 - cavaEnd.x, 1.0, uv.x)), 1.0, circT);
  vFade = fa;
  // the other tube's radius is the one it is DRAWN at: its built radius times its own live swell (the engine's diameter). Its built radius put the cut and the union's outline inside the real wall wherever the engine widens it (Mohammad, 20 Nov: "a big gaping hole" at the hepatic veins' mouths)
  vNbr = vec2(nbr.x, nbr.y * (nbrMate.x >= 0.0 ? swellOf(nbrMate.x, nbrMate.y, nbrMate.z) : 1.0));
  // THE OUTLINE is part of the tube (no second mesh, no stencil, no depth tie): the tube is built INK wider than its lumen, and the fragment shader paints the outer ink band, so the line is continuous by construction.
  // Its width is the figure's line (cel-style.ts LINE_R, LINE_MIN, LINE_MAX; 2D's tube-cel-glsl.js CEL is 0.14, 1.5, 3): a share of the tube's radius held between two widths in CSS px (never device px: a device-px clamp drew
  // the line a third as heavy on a 3x iPhone as on a 1x screen), the same on a hairline and on the portal trunk, on a 1x Mac and a 3x iPhone; thinned with a lumen under LINE_MIN CSS px of radius (cel-ink.ts inkTaper), so the smallest branches keep their colour.
  // THE DRAWN LUMEN: the tube's half width AFTER a stenosis has pinched it (the narrow attribute, which the geometry below applies). Every width the fragment stage and the line are made from (the ink band's place, the heads' size, the dust, the
  // tones) is this one radius, so a narrowed stretch keeps its outline and its flow marks are sized to the lumen they are drawn in. They were made from the radius WITHOUT the pinch: the line was placed at the old wall, outside the pinched tube, so
  // the outline vanished through the narrowing, and the heads were built for a wide tube and spilled over a thin one (Mohammad, 20 Nov, the stenosed portal vein).
  float narrowK = 1.0 - clamp(narrow, 0.0, 0.97);
  vR = radius * rkE * swell * narrowK * vU;   // the lumen's half width in the 2D figure's units
  vec3 cenW = aPos - aNor * (radius * rkE);   // the ring's centre
  vec4 cc = projectionMatrix * (modelViewMatrix * vec4(cenW, 1.0));
  vCen = vec3(cc.x, cc.y, cc.w);
  float wpcV = ${wpcGlsl('cc.w', 'projectionMatrix[1][1]', 'vU')};   // the figure's units under one CSS px here
  float rCssV = vR / max(wpcV, 1e-6);   // the lumen's radius in CSS px
  float aU = uv.x * len;
  float distH = hiDir > 0.5 ? hiOffset + aU : (hiDir < -0.5 ? hiOffset + (len - aU) : 0.0);
  float limitH = hiDir < -0.5 ? hiBehind : hiAhead;
  float ownH = smoothstep(0.0, max(hiFade, 0.0001), min(hiEnds.x + aU, hiEnds.y + (len - aU)));   // the picked vein's own line: nothing at its two outer ends, full a fade's length in
  vHi = hiOn * (abs(hiDir) > 0.5 ? 1.0 - smoothstep(0.0, max(limitH, 0.0001), distH) : ownH);
  // the ink is held back ONLY on the part of a declared branch's end that lies inside its trunk (bury: the trunk's radius, per end): never along a vessel's own sides, never at a run-on's ring, never where vessels merely cross
  float endK = vHi > 0.001 ? 1.0 : buryK(uv.x * len * vU, (1.0 - uv.x) * len * vU);
  // (the line thins with a lumen that is hairline by NATURE, a small branch; a pinch is not one: the taper is judged on the radius the vessel would have without it, so the outline runs on through a stenosis at the figure's least weight)
  float inkPx = ${inkPxGlsl('rCssV', 'rCssV / narrowK')};   // CSS px
  inkPx *= mix(1.0, ${F(CIRC_INK_K)}, circT);   // (the Circuit's line is bolder: its tubes are thick and its ground flat)
  float inkW = (inkPx * endK + hiPx * vHi) * inkOn * wpcV / vU;   // scene units
  float lumenW = radius * rkE * swell * narrowK;
  // (the ring is a polygon: its flats sit at the radius, its corners ${F(TUBE_SAG)} of the radius farther out, so the silhouette never falls inside the line)
  vec3 p = aPos + aNor * (inflate + radius * rkE * (swell * narrowK - 1.0) + inkW + (lumenW + inkW) * ${F(TUBE_SAG)});
  // where this tube carries on into another (a mate), its end ring runs on a hair (under a CSS px) into the next: two flat rings that meet exactly leave a light line between them where their edges are smoothed, along the whole of a straight join
  // (only where the tube is opaque: a faint tube (the cava at 0.45, a fading vein) drawn twice over those 1.5 px is a darker band, a faint dashed line across it at every join of its pieces; Mohammad, 20 Nov)
  float runOn = RUN_ON_PX * smoothstep(0.97, 1.0, fa);
  if (uv.x < 0.0001 && mate0.x >= 0.0) p -= aTan * (runOn * wpcV / vU);
  if (uv.x > 0.9999 && mate1.x >= 0.0) p += aTan * (runOn * wpcV / vU);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * aNor);
  vT = normalize(normalMatrix * aTan);
  vZf = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));
  vV = normalize(-mv.xyz);
  vUv = uv;
  vec4 c = projectionMatrix * mv;
  c.z = mix(cc.z / cc.w, c.z / c.w, ${F(TUBE_DEPTH_SHARE)}) * c.w;   // depth by the tier of the axis (TUBE_DEPTH_SHARE): a fat tube at a lower tier never bulges over a thin one above it
  vW = c.w;
  gl_Position = c;
  // a tube of no radius (a strand a band has closed, a channel not yet grown) is not drawn: not even its ink, which has a width of its own on screen
  if (rk <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

export const VESSEL_FS = /* glsl */ `
${FADE_GLSL}
uniform float tubeDark;   // 1 on the dark looks: brighter tube caps (cel-glsl.ts celTubeBase)
${CEL_TUBE_GLSL}
${CEL_LIGHT_GLSL}
// a vessel behind the organs (the cava) is drawn a second time over them with VEIL defined: OPAQUE, as every vessel is (no alpha at rest: two flat tones and the ink; Mohammad, 20 Nov: "Why is the venacava glassy")
uniform vec3 color;
uniform vec3 inkColor;
uniform float shadeK;
uniform vec3 light;
uniform float bands;
uniform float spec;
uniform float len;
uniform float radius;
uniform float time;
uniform float baseD;
uniform sampler2D vdata;
uniform vec2 vdataSize;
uniform float vindex;
uniform float useData;
uniform float stubSpeed;
uniform float reveal;
uniform float flowAmount;
uniform float flowBands;
uniform float dotted;
uniform vec3 markDark;
uniform vec3 markLight;
uniform vec3 markRev;
uniform float lensUse;
uniform float lensMix;
uniform float lensTail;
uniform sampler2D lensGradA;
uniform sampler2D lensLaneA;
uniform sampler2D lensGradB;
uniform sampler2D lensLaneB;
uniform float lensModeA;
uniform float lensModeB;
uniform vec3 laneColA[5];
uniform vec3 laneColB[5];
uniform float lensIndex;
uniform vec2 lensSpan;
uniform float lensSmooth;   // smooth joins on (1): the lens colour runs through the colours a third and two thirds along (grad rows 2 and 3), not straight from one end's to the other's
uniform float smokeOn;
uniform vec3 hiColor;
uniform float inkOn;
uniform vec3 stump;   // (the vertex stage's: a divided vein's stump and its tie)
uniform vec4 seamA[2];   // a surgical shunt's stitches, its start's then its end's (seams.ts): the seam's distance in from the end as a quartic in the place across (c0..c3 here, c0 = 0: none)
uniform vec4 seamB[2];   // (c4, how many dashes (0: three ticks), one dash's share of the seam, one dash and its gap's share)
uniform vec4 stentU;   // a stent in this vessel, drawn on the tube in the Circuit (where the 3D device is faded out): x its share shown (0 none), y and z where it starts and ends along the course (0..1), w where its graft starts
// smooth joins, as in the vertex shader: the ends that carry on into another vessel (x < 0 where nothing); their last stretch draws no ink, so no flat cut is outlined where a branch meets its trunk
uniform vec3 mate0;
uniform vec3 mate1;
uniform vec2 bury;   // the ink is held back ONLY inside a declared branch's trunk: how far from the branch's start and end (figure units per radius unit, 0: none: a run-on, a crossing, a free end keep their whole outline)
uniform float cavaCut;   // 1 on a vein that opens into the cava (nbr is the cava's): it takes the cava's colour and alpha as it nears the wall and is not drawn inside the lumen, so it ends exactly at the wall with no step
uniform float solidK;    // a vessel drawn behind the organs: how much of its solid copy (drawn with the organs, hidden by one in front) shows: 1 for every other vessel (Settings > Hide vessels behind organs)
uniform float veilK;     // and of its veil copy (drawn over the organs, shown through them)
uniform float cavaA;     // the cava's opacity where the vein joins it: the vein's own comes to it at the wall (no step in alpha)
uniform vec2 cavaRef;    // the cava piece's lens index and the share along it where the vein joins: the colour the vein takes on
uniform vec2 skinCut;   // junction skins (skin/types.ts, WP4): the tube is drawn only between u = skinCut.x and u = skinCut.y; past either the skin (one welded mesh at the junction) takes over. (-1, 2): no cut, every branch it guards a no-op
uniform vec2 skinHole;   // a side-wall junction's HOLE (skin/types.ts, spec 10.1): the tube is not drawn between u = skinHole.x and u = skinHole.y, the skin draws that stretch. (2, -1): no hole (never true for any u)
uniform vec2 skinHole2; // a vessel has at most two
uniform float nbrOn;   // 1 on the two tubes of a fork: the outline is the union's (neighbour.ts), so the buried end does not hold the ink back
uniform sampler2D streamTex;
uniform sampler2D chainTex;
uniform float streakAmt;   // how much of the streak layer shows (the Blood streaks setting, the view, the Circuit): 0 none
uniform float projY;
uniform vec2 res;
uniform float dpr;
uniform float casingA;      // the look's casing alpha (2D --casing-a)
uniform float casingCircA;  // and in the Circuit (2D .stage-wrap.cmap), by circT
uniform vec3 inkColorCirc;
uniform float circT;
uniform vec2 circCap;       // the Circuit rounds this vessel's start / end (1): the ends nothing joins
uniform vec4 wedge;       // the wedged vein's static column as a tint on the vessels themselves: x how much, y the share of the course (u) it reaches up to (2 = all of it), z how far the fade to the branch tip runs, w how much of it fades
uniform vec3 wedgeCol;
uniform float quietK;       // quiet depth on a turn (camera/quiet.ts): the back tier eases toward the page by QUIET_BACK of this, 0 face on
uniform vec3 pageCol;       // the plate colour it eases toward
uniform vec4 rimInk;        // (kept for the palette's API: no light rim is drawn)
varying float vW;
varying float vR;
varying float vU;
float buryK(float d0, float d1) {   // d0, d1: the figure units from the start and from the end of the tube
  float k0 = bury.x > 0.0 ? smoothstep(0.5 * bury.x * vU, bury.x * vU, d0) : 1.0;
  float k1 = bury.y > 0.0 ? smoothstep(0.5 * bury.y * vU, bury.y * vU, d1) : 1.0;
  return k0 * k1;
}
// no flow marks (chevrons, streaks) inside the vessel a tube leaves or opens into: where the tube lies in its parent's lumen its marks would be drawn over the parent's own (a torn chevron at every fork). They begin a little beyond where the ink does.
float markK(float d0, float d1) {
  float k0 = bury.x > 0.0 ? smoothstep(2.0 * bury.x * vU, 3.6 * bury.x * vU, d0) : 1.0;
  float k1 = bury.y > 0.0 ? smoothstep(2.0 * bury.y * vU, 3.6 * bury.y * vU, d1) : 1.0;
  return k0 * k1;
}
varying float vFade;
varying float circStay;
varying vec2 vNbr;
varying vec3 vCen;
varying float vHi;
varying vec3 vN;
varying vec3 vV;
varying vec3 vT;
varying vec3 vZf;   // the figure's normal (model z) in the view's frame: the dust's section frame (blood/dust-glsl.ts dustFrame)
varying vec2 vUv;

// junction skins (skin/types.ts): the tube has a seam at either end
bool inSkinHole(vec2 h) { return h.y > h.x && vUv.x > h.x + ${F(SKIN_CUT_EPS)} && vUv.x < h.y - ${F(SKIN_CUT_EPS)}; }
bool skinCutOn() { return skinCut.x >= 0.0 || skinCut.y <= 1.0 || skinHole.y > skinHole.x || skinHole2.y > skinHole2.x; }
bool skinPast() { return (skinCut.x >= 0.0 && vUv.x < skinCut.x - ${F(SKIN_CUT_EPS)}) || (skinCut.y <= 1.0 && vUv.x > skinCut.y + ${F(SKIN_CUT_EPS)}) || inSkinHole(skinHole) || inSkinHole(skinHole2); }

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// Doppler-style mean velocity (cm/s, signed) from the engine's flow (mL/s) and diameter (mm): the lumen's area is pi r^2
float meanVelocity(float q, float dmm) {
  float r = max(dmm, 0.5) * 0.05;
  return q / (3.14159265 * r * r);
}
// ---- the 2D app's flow heads (chevron-glsl.js, blood-heads.js) ----
${CHEVRON_GLSL}
${DUST_GLSL}
// (chevKeep, the lattice's keep, is in the one chevron chunk above: blood/chevron-glsl.ts)
${CHEV_ONE_GLSL}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

${LENS_OF_AT_GLSL}
${CHEV_CREAM_GLSL}
${FLOW_MARKS_GLSL}
// the colour of one lens set at this pixel; .a says whether the lens colours this vessel (0: it keeps its tone)
vec4 lensOf(sampler2D grad, sampler2D lanes, float mode, vec3 pal[5], float across) {
  return lensOfAt(lensIndex, mix(lensSpan.x, lensSpan.y, vUv.x), grad, lanes, mode, pal, across);   // (a branch of a vessel wears the stretch of its host's ramp it leaves from: no step in colour at the branch point)
}

// A free end in the Circuit is round: the pixels outside a half circle of the tube's own radius at the end are carved away (the tube is the lumen plus its line, so the ink runs round the cap).
// Exact at any ring spacing, which a geometry dome is not (a tube has a ring every 1/24 of a scene unit, about a radius).
bool capCarved(float across) {
  float k = smoothstep(0.7, 1.0, circT);
  if (k <= 0.0 || circCap.x + circCap.y < 0.5) return false;
  float dd = 1e9;
  if (circCap.x > 0.5) dd = vUv.x * len * vU;
  if (circCap.y > 0.5) dd = min(dd, (1.0 - vUv.x) * len * vU);
  float wpc = ${wpcGlsl('vCen.z', 'projY', 'vU')};   // (the axis's depth, the one the vertex stage built the line from)
  float rCss = vR / max(wpc, 1e-6);   // CSS px, as the vertex stage's line is (the same clamp)
  float ink = clamp(${F(CEL_STYLE.LINE_R)} * rCss, ${F(CEL_STYLE.LINE_MIN)}, ${F(CEL_STYLE.LINE_MAX)}) * mix(1.0, ${F(CIRC_INK_K)}, circT) * wpc * inkOn;
  float R = (vR + ink) * k, a = dd + ink * k;
  if (a >= R) return false;
  float q = 1.0 - a / R;
  return across * across + q * q > 1.0;
}

void main() {
  float streakCover = 0.0;   // (how much a streak covers this pixel: a chevron's pixel is never tinted by one)
  vec3 cBody = vec3(0.0);    // (the tube's tone before the streaks)
  if (frontOut(vUv.x, reveal)) discard;
  if (fadedOut()) discard;
  // a part with no map course (a fan, a strand) fades out over the first half of the Circuit's change in the same screen pattern as the dive's dissolve (circuit/shader.ts)
  if (circStay < 0.999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= circStay) discard;
  if (vFade < 0.004) discard;
  // past the seam the skin draws this junction. On the Circuit's map the tubes morph into flat lines and the map draws its own joins, so the cut part comes back as the skin goes (SKIN_CIRC_SPAN of the change), by the same screen pattern as circStay's; at rest it is a plain discard
  if (skinCutOn() && skinPast()) {
    float cutA = smoothstep(0.0, ${F(SKIN_CIRC_SPAN)}, circT);
    if (cutA <= 0.0 || fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= cutA) discard;
  }
  vec3 n = normalize(vN);
  // (a tube seen end on has no sideways direction: a fixed one keeps the fragment finite, never a NaN, which a device draws black)
  vec3 sideX = cross(normalize(vT), normalize(vV));
  float sideL = length(sideX);
  vec3 side = sideL > 1e-4 ? sideX / sideL : vec3(1.0, 0.0, 0.0);
  float across = dot(n, side);
  if (capCarved(across)) discard;
  if (!gl_FrontFacing) discard;
  if (dotted > 0.5) {
    // a closed potential collateral: a dotted thread along the tube's axis, nothing round it
    float dash = fract(vUv.x * len / 0.09);
    if (dash > 0.45) discard;
  }

  vec4 la = lensOf(lensGradA, lensLaneA, lensModeA, laneColA, across);
  vec4 lb = lensOf(lensGradB, lensLaneB, lensModeB, laneColB, across);
  vec3 base = mix(mix(color, la.rgb, la.a), mix(color, lb.rgb, lb.a), lensMix);

  // the fill: exactly TWO flat tones, lit by the one world light (cel-glsl.ts: the base, a hard edge EDGE_PX device px across, the shade, no gradient), so two pieces of one vein shade alike at their join and a turned camera
  // changes nothing; no rim, no highlight. rDev: the tube's radius in device px; the tones fade in over the radius (never across the tube) and a hairline is one tone.
  float wpc0 = ${wpcGlsl('vW', 'projY', 'vU')};
  float rDev = vR / max(wpc0, 1e-6) * dpr;
  // the screen's own frame at this pixel: the tube's heading on screen, the pixel's offset from its axis, and its distance from it (device px)
  vec2 tS = vT.xy;
  float tl = length(tS);
  vec2 dvPx = gl_FragCoord.xy - (vCen.xy / vCen.z * 0.5 + 0.5) * res * dpr;
  float dLat = tl > 1e-3 ? abs(dot(dvPx, vec2(-tS.y, tS.x) / tl)) : length(dvPx);
  // the outline of the two tubes of a fork together is the outline of their UNION (neighbour.ts): where this pixel lies inside the other tube's lumen this tube draws no line, no fill past its own lumen, and no shade band (the other's
  // lumen opens there, lit). nbrK: how far inside, in device px, from 0 (on the other's wall) to 1 (half a pixel in).
  float nbrK = 0.0;
  if (vNbr.y > 0.0) nbrK = smoothstep(-0.5, 0.5, (vNbr.y - abs(vNbr.x)) / max(vW * 2.0 / (res.y * projY), 1e-9) * dpr) * (1.0 - circT);
  // A VEIN INTO THE CAVA (a vessel that merges into a faded one: Mohammad, 20 Nov: "there should be a gradual fade into the target vessel, so that they both have the same fade at the point of junction") is one tube with the cava: as it nears the
  // wall it takes the cava's COLOUR (wB: 0 more than 1.6 cava radii before it, 1 at it) and eases its OPACITY down to the cava's (fadeHere: from 2.5 cava radii before the wall, by the pixel's own distance from the wall, never by a share of the vein's
  // length, so the ramp is the same across the vein's width and the wall's slant cannot make a diagonal), so at the wall both are the same colour and the same alpha and there is no step either way. It is drawn up to the wall and not inside the lumen, cut
  // along the wall's own line (cavA: a pixel wide, anti-aliased), so it opens into the cava with nothing hanging on the far side and the cava's own two tones carry on. Body and outline fade together, the vein is never a flat pale wedge.
  float cavA = 1.0, fadeHere = vFade;
  if (cavaCut > 0.5 && vNbr.y > 0.0) {
    float cd = vNbr.y - abs(vNbr.x);
    float wB = smoothstep(-1.6 * vNbr.y, 0.0, cd) * (1.0 - circT);
    float wA = smoothstep(-2.5 * vNbr.y, 0.0, cd) * (1.0 - circT);
    vec4 la2 = lensOfAt(cavaRef.x, cavaRef.y, lensGradA, lensLaneA, lensModeA, laneColA, across), lb2 = lensOfAt(cavaRef.x, cavaRef.y, lensGradB, lensLaneB, lensModeB, laneColB, across);
    base = mix(base, mix(mix(color, la2.rgb, la2.a), mix(color, lb2.rgb, lb2.a), lensMix), wB);
    fadeHere = mix(vFade, cavaA, wA);
    float cdPx = cd / max(vW * 2.0 / (res.y * projY), 1e-9) * dpr;
    cavA = mix(1.0 - smoothstep(-0.5, 0.5, cdPx), 1.0, circT);
  }
  if (cavA < 0.004) discard;
#ifdef VEIL
  fadeHere *= veilK;
#else
  fadeHere *= solidK;
#endif
  if (fadeHere < 0.004) discard;
  float sT = dot(n, celLightView());   // n.L against the WORLD light (cel-glsl.ts), so the camera never changes a shade
  float rDevAx = vR / max(${wpcGlsl('vCen.z', 'projY', 'vU')}, 1e-6) * dpr;   // the same radius at the AXIS's depth: what the vertex stage built the ink band from (the surface's depth differs from it on a foreshortened tube near the camera, and the band would then start inside or outside the tube it was built for)
  // (the shade band is not cut off at the other tube's wall: two tubes of a fork are one surface that blends, so the band thins and is gone by the time it reaches the other's lumen, over 0.8 of the other's radius: no ledge and no dash where the band would otherwise end)
  float nbrT = nbrK;
  if (vNbr.y > 0.0) nbrT = max(nbrK, smoothstep(-0.8, 0.0, (vNbr.y - abs(vNbr.x)) / vNbr.y) * (1.0 - circT));
  vec3 c = celTubeTone(base, mix(sT, 1.0, nbrT), fwidth(sT) * (1.0 - nbrT), rDev);   // two flat tones, matte and opaque: no highlight, no rim light
  c = mix(c, pageCol, ${QUIET_BACK.toFixed(3)} * quietK);   // (0 for every tier but the back one)
  // THE DUST (blood/dust-glsl.ts, the Dust Lab's particles, Mohammad 20 Nov) is part of the tube: painted here, in its own fragment shader, so it is inside the lumen (dustTube draws nothing past 0.96 of the half width,
  // never touching the ink) and follows the tube's own alpha and fade zones by construction: there is no second mesh to stray past a tube's end, a taper or a fade. Under the chevrons, which come after.
  float sD = vUv.x * len * vU;
  // REAL FLOW (blood/routes.ts): the particles of the roots this vessel's lanes carry, in its own section, at their place on their root's stream. No fade at a skin's seam (the skin draws the same particles on); where tubes
  // still overlap at a joint with no skin they fade as the chevrons do (markK), the vessel it opens into drawing the same particles.
  vec4 fd = flowDust(across, dustFrame(vT, vZf, normalize(vV), side), sD, len * vU, max(radius * vU, 1e-3), vR, vR / max(${wpcGlsl('vW', 'projY', 'vU')}, 1e-6), lensIndex, vindex, baseD, celTubeBase(base), vU) * markK(skinCut.x >= 0.0 ? 1e6 : sD, skinCut.y <= 1.0 ? 1e6 : (1.0 - vUv.x) * len * vU);
  cBody = c;
  streakCover = fd.a;
  c = c * (1.0 - fd.a) + fd.rgb;

  float vel = 0.0;
  float dmm = 8.0;
  if (useData > 0.5) {
    ivec2 tc = ivec2(int(mod(vindex, vdataSize.x)), int(floor(vindex / vdataSize.x)));
    vec4 td = texelFetch(vdata, tc, 0);
    dmm = td.b;
    vel = meanVelocity(td.g, dmm);
  }

  // stagnant blood in a big vein: slow, but not none (FLOW_CUTS none 1, stasis 9 cm/s), drifts as smoke. OFF by default (vessel-object.ts smokeOn 0, setSmoke(true) for a slide that asks for stasis): inside a tube there
  // are only the three flat tones and the flow heads, never blobs. When on, the smoke is flat patches of one tone with a hard edge, never a soft cloud.
  if (smokeOn > 0.5 && useData > 0.5 && dmm > 5.0 && abs(vel) > 1.0 && abs(vel) < 9.0) {
    float drift = time * 0.04;
    float nz = vnoise(vec2(vUv.x * len * 5.0 + drift * 6.0, across * 3.0 + drift)) * 0.65 + vnoise(vec2(vUv.x * len * 11.0 - drift * 4.0, across * 6.0)) * 0.35;
    float amt = (1.0 - smoothstep(1.0, 9.0, abs(vel))) * 0.5 + 0.12;
    float nzW = max(fwidth(nz) * 0.75, 1e-3);
    c = mix(c, mix(base, vec3(lum(base) > 0.5 ? 0.15 : 0.92), 0.5), smoothstep(0.62 - amt - nzW, 0.62 - amt + nzW, nz) * 0.3);
  }

  // the flow heads, on the tube's surface as the 2D composite lays them
  float pxArc = fwidth(vUv.x * len * vU);   // (a derivative: taken outside any branch)
  float acrossW = max(fwidth(across), 0.03);
  vec4 hd = flowHeads(across, acrossW, vUv.x * len * vU, len * vU, vR, ${wpcGlsl('vW', 'projY', 'vU')}, pxArc, lensIndex, flowAmount, markK(vUv.x * len * vU, (1.0 - vUv.x) * len * vU), la, lb, color, base);   // (a head stands inside the lumen, 55 percent of it, and is cut at the wall: never on the ink)
  if (hd.a > 0.0) {
    if (streakCover > 0.0) c = mix(c, cBody, hd.a);   // the streaks lie UNDER the chevrons: a head's pixel is never tinted by one
    c = c * (1.0 - hd.a) + hd.rgb;
  }
  // THE OUTLINE: the band between the lumen's edge and the tube's (it is built INK wider, see the vertex stage). The exact lateral distance from the pixel to the tube's axis, in device pixels, against the lumen's radius:
  // the line is continuous by construction (no second mesh, no stencil, no depth tie), constant in device pixels (the vertex stage widened the tube by the same line) and antialiased half a pixel each side. It follows the fade
  // (the same alpha as the body), is not drawn on a joined end's last stretch (a smooth join buries the cut) and is the look's casing ink taken most of the way to a deep tone of the vessel's own colour (never black, never white).
  float endK = vHi > 0.001 || nbrOn > 0.5 ? 1.0 : buryK(vUv.x * len * vU, (1.0 - vUv.x) * len * vU);
  float inkT = smoothstep(rDevAx - 0.5, rDevAx + 0.5, dLat) * endK * inkOn;
  inkT *= 1.0 - nbrK;
  if (nbrK > 0.5 && dLat > rDevAx + 0.5) discard;
  // in the Circuit the outline also sits a little inside the vessel and fades inward, so on a dark map the edge still reads (the ink outside it is lost on the ground)
  float inDepth = clamp(${F(CIRC_INNER.R)} * rDevAx, ${F(CIRC_INNER.MIN_PX)} * dpr, ${F(CIRC_INNER.MAX_PX)} * dpr);   // (CSS px set, held in device px here: the same share of the line on every screen)
  c = mix(c, inkColorCirc, circT * ${F(CIRC_INNER.K)} * smoothstep(rDevAx - inDepth, rDevAx, dLat) * endK * inkOn);
  if (inkT > 0.0) {
    vec4 laH = lensOf(lensGradA, lensLaneA, lensModeA, laneColA, 0.0), lbH = lensOf(lensGradB, lensLaneB, lensModeB, laneColB, 0.0);
    vec3 baseH = mix(mix(color, laH.rgb, laH.a), mix(color, lbH.rgb, lbH.a), lensMix);
    vec3 inkH = ${inkColourGlsl('baseH')};
    c = mix(c, mix(inkH, inkColorCirc, circT), inkT);   // (a selected vessel's line is its own: the glow is a separate halo, glow.ts)
  }
  // the stent in the Circuit (the 3D device is the body's; the map draws it on the shunt's own lane, as 2D does): the bare open cells (rings of five crowns, every other one turned half a crown), the gold band where the
  // graft starts, the nested rings along the graft and the graft's faint sleeve, all sized by the lumen (a twelfth of its half width is the mocks' unit, stent-build.ts), eased in with the morph
  if (stentU.x > 0.001 && circT > 0.001 && vUv.x > stentU.y && vUv.x < stentU.z) {
    float kS = stentU.x * circT, Lw = len * vU, s = vUv.x * Lw, un = max(vR, 0.3) / 12.0, s0 = stentU.y * Lw, sB = stentU.w * Lw, sE = stentU.z * Lw;
    float th = asin(clamp(across, -1.0, 1.0)), px = max(pxArc, 1e-4), cov = 0.0, gold = 0.0;
    float bEnd = sB > s0 + 6.0 * un ? sB : sE - 1.2 * un, t0 = s0 + 1.2 * un;
    float Nb = max(1.0, floor((bEnd - t0) / (17.0 * un) + 0.5)), Pb = (bEnd - t0) / Nb, Ab = 0.5 * Pb;
    float jb = floor((s - t0) / Pb);
    for (int i = -1; i <= 1; i++) {
      float j = jb + float(i), ok = (j < 0.0 || j >= Nb || s > bEnd + Ab) ? 0.0 : 1.0;
      float ph = mod(j, 2.0) > 0.5 ? 3.14159265 : 0.0;
      // (a wire's distance in SCREEN pixels, the distance over its own slope: a crown's steep flank stays one even line instead of breaking into dashes)
      float dv = s - (t0 + Ab + j * Pb + Ab * cos(5.0 * th + ph));
      cov = max(cov, ok * (1.0 - smoothstep(0.5, 1.4, abs(dv) / max(fwidth(dv), 1e-5))));
    }
    if (sB > s0 + 6.0 * un) {
      float Pc = 11.0 * un, Ac = 0.42 * Pc, c0 = sB + Ac + 2.5 * un, Kc = max(0.0, floor((sE - 1.2 * un - Ac - c0) / Pc));
      float jc = floor((s - c0) / Pc + 0.5);
      for (int i = -1; i <= 1; i++) {
        float j = jc + float(i), ok = (j < 0.0 || j > Kc) ? 0.0 : 1.0;
        float dv = s - (c0 + j * Pc + Ac * cos(5.0 * th));
        cov = max(cov, ok * (1.0 - smoothstep(0.5, 1.4, abs(dv) / max(fwidth(dv), 1e-5))));
      }
      c = mix(c, vec3(1.0), 0.16 * kS * smoothstep(sB - px, sB + px, s));
      gold = 1.0 - smoothstep(0.5 * px, 1.4 * px, abs(s - (sB + 1.5 * un * (1.0 - abs(cos(th))))));
    }
    c = mix(c, inkColor, 0.85 * cov * kS);
    c = mix(c, vec3(0.86, 0.66, 0.2), gold * kS);
  }
  // the running stitch at a surgical shunt's sewn end (suture-marks.js seamDashes): dashes along the curve where the host's wall crosses the shunt (a slanted curve, found on the 2D courses), a dark halo under a thin thread,
  // with the 2D's thread and edge colours; a shunt in no host keeps 2D's three ticks. The distance to the curve is taken square to it (its slant against the tube's half width).
  if ((seamA[0].x > 0.0 || seamA[1].x > 0.0) && circT < 0.001) {
    float Lw = len * vU, aF = vUv.x * Lw, aa = clamp(across, -1.0, 1.0), rr = max(vR, 0.3), tw = 0.0, te = 0.0;
    for (int e = 0; e < 2; e++) {
      vec4 A = seamA[e], B = seamB[e];
      if (A.x <= 0.0) continue;
      float sl = e == 0 ? aF : Lw - aF;
      float s0 = A.x + aa * (A.y + aa * (A.z + aa * (A.w + aa * B.x)));
      float ds = (A.y + aa * (2.0 * A.z + aa * (3.0 * A.w + aa * 4.0 * B.x))) / rr;
      float dd = abs(sl - s0) / sqrt(1.0 + ds * ds), dsh = 1.0;
      if (B.y > 0.5) {
        float tn = clamp((aa + 0.97) / 1.94, 0.0, 1.0), kd = floor(tn / B.w), q = tn - kd * B.w, ew = max(fwidth(tn), 1e-4);
        dsh = (1.0 - smoothstep(B.z - ew, B.z + ew, q)) * step(kd, B.y - 0.5) * smoothstep(0.97, 0.9, abs(aa));
      } else {
        dd = min(dd, min(abs(sl - s0 - 3.5), abs(sl - s0 + 3.5)));
        dsh = smoothstep(1.0, 0.92, abs(aa));
      }
      tw = max(tw, (1.0 - smoothstep(0.32, 0.5, dd)) * dsh);
      te = max(te, (1.0 - smoothstep(0.7, 1.0, dd)) * dsh);
    }
    c = mix(c, vec3(0.227, 0.114, 0.039), te * 0.4);
    c = mix(c, vec3(0.910, 0.455, 0.165), tw);
  }
  // the tie on a divided vein's stump (suture-marks.js woundTie): three turns of thread, 2.2 units apart, a little slanted across the vein, with the 2D's own thread and edge colours (--suture-thread, --suture-edge)
  if (stump.z > 0.001 && circT < 0.001) {
    float aF = vUv.x * len * vU, ph = vUv.y * 6.2831853, tw = 0.0, te = 0.0;
    for (int j = 0; j < 3; j++) {
      float dd = abs(aF - (stump.y + (float(j) - 1.0) * 2.2 + 0.5 * sin(ph)));
      tw = max(tw, 1.0 - smoothstep(0.32, 0.5, dd));
      te = max(te, 1.0 - smoothstep(0.7, 1.0, dd));
    }
    c = mix(c, vec3(0.227, 0.114, 0.039), te * 0.4 * stump.z);
    c = mix(c, vec3(0.910, 0.455, 0.165), tw * stump.z);
  }
  // the amber column of the wedge: everything upstream of the balloon in that vein and its branches, a tint on the tube itself that thins toward each branch's tip
  if (wedge.x > 0.001 && circT < 0.001) {
    float wa = wedge.x * (1.0 - smoothstep(wedge.y - 0.08, wedge.y, vUv.x));
    wa *= mix(1.0, smoothstep(0.0, max(wedge.z, 0.001), vUv.x), wedge.w);
    c = mix(c, wedgeCol, 0.78 * wa);
  }
  gl_FragColor = vec4(c, fadeHere * cavA);
}`;
