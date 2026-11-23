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
import { WEDGE_GLSL } from './wedge-glsl.ts';
import { CHEV, CHEVRON_GLSL } from '../blood/chevron-glsl.ts';
import { STREAK } from '../blood/streak-glsl.ts';
import { DUST_GLSL } from '../blood/dust-glsl.ts';
import { QUIET_BACK } from '../camera/quiet.ts';
import { CEL_STYLE } from '../cel-style.ts';
import { CEL_LIGHT_GLSL, CEL_TUBE_GLSL, glslNum as F } from '../cel-glsl.ts';
import { TUBE_RADIAL } from './tubes.ts';
import { SKIN_CIRC_IN, SKIN_CIRC_SPAN, SKIN_CUT_EPS } from './skin/types.ts';
import { CAP_CARVED_GLSL, CIRC_WIDTH_OF_GLSL, FADE_ALPHA_GLSL, HIGHLIGHT_ALONG_GLSL, PROCEDURE_MARKS_GLSL, SEAM_STITCH_GLSL, STUMP_K_GLSL, LENS_OF_AT_GLSL, CHEV_ONE_GLSL, CHEV_CREAM_GLSL, FLOW_MARKS_GLSL, SWELL_OF_GLSL, inkColourGlsl, inkPxGlsl, wpcGlsl, glowWeightGlsl, glowToneGlsl } from './glsl-shared.ts';

/** The tube's ring is a polygon of TUBE_RADIAL sides: its corners stand 1 / cos(pi / n) - 1 of the radius outside its flats. The tube is built that much fatter, so the silhouette never falls inside the outline. */
/** plainHere(): within this many CSS px of a joined end, a seam or a hole the tube keeps its whole hull (the junction owns that edge). */
export const PLAIN_EDGE_PX = 6;
export const TUBE_SAG = 1 / Math.cos(Math.PI / TUBE_RADIAL) - 1;
/** How much of a tube's own round depth its pixels keep. The figure is a stack of tiers 0.01 to 0.02 apart (frame2d.ts TIER_Z) whose order is the 2D figure's over and under (the hepatic artery between the cava and the portal vein),
 *  but a round tube's front stands its RADIUS in front of its axis: the cava (z -0.02, radius 0.027) bulged 0.007, past the hepatic artery's axis (z 0.0) and its own front (0.005), and hid it (Mohammad, 20 Nov: "fix the hepatic artery
 *  to be between the IVC and PV"). The vertex shader moves each vertex's depth (along its own ray: nothing moves on screen) to the axis's depth plus this share of the bulge, so a crossing is decided by the tiers and the thick tube's bulge
 *  (at most 0.15 x 0.035 = 0.005, under the narrowest gap that has to hold, cava to artery 0.02) only sorts two tubes of one tier. */
export const TUBE_DEPTH_SHARE = 0.15;
import { CIRC_INK_K, CIRC_INNER, SHADOW_FEATHER, TAPER_FROM, TAPER_TO } from './cel-ink.ts';
import { VDBG_GLSL } from './debug-view.ts';
import { CLOT_CONST_GLSL, CLOT_FN_GLSL, CLOT_INK_MAX_R, CLOT_LIFT_AT, CLOT_SHADE_AT } from '../disease/clot-field.ts';

export const VESSEL_VS = /* glsl */ `
const float RUN_ON_PX = 0.75;   // CSS px
attribute vec3 tang;
// a stent narrows its shunt's lumen (waist, end stenosis): the share of the tube taken off at this vertex, 0 on every vessel that has none (a missing attribute reads 0)
attribute float narrow;
attribute vec3 nbr;   // a fork's other tube: this vertex's distance from its axis, its radius there, and how far it lies past the tube's nearer end (negative inside its length), scene units (0: none; neighbour.ts)
attribute float tipK;   // a fan's free tip: the share of the alpha taken off here, 0 to 1 (a missing attribute reads 0)
attribute vec2 lensR;   // a fan's course: the stretch of the host's colour ramp it wears, (from, span) (0, 0: the vessel's own lensSpan)
attribute float rk;   // this vertex's tube radius as a share of the vessel's own (a strand is thinner than its trunk; a run-on eases to its neighbour's width)
attribute float rkc;   // the same on the Circuit's map: the course's own share only (a strand is thinner than its trunk), without the body's tapers, collars and beads, which belong to the 3D figure (the map draws a vessel one width along its length)
uniform float inflate;
uniform float frontDepth;   // how far toward the viewer this vessel is drawn in the depth buffer, scene units (the caput fan over every other vein): a depth offset only
uniform float mapDepth;   // the Circuit's over and under: how far toward the viewer this line stands on the map's plate, scene units (circuit/map-depth.ts); applied as a depth offset only, scaled by the change's share
uniform float shadowPx;   // the crossing shadow's band beyond the line, CSS px (cel-ink.ts SHADOW_PX): the SHADOW program's hull is the tube this much wider
uniform float shadowDepth;   // and how far behind its own tube it lies, scene units: on the body and on the map
uniform float shadowDepthC;
uniform sampler2D vdata;
uniform vec2 vdataSize;
uniform float vindex;
uniform float useData;
uniform float radius;
uniform float baseD;
uniform float widthKind;
uniform float len;
uniform float stentT0;   // the map course's heading turned at the stent's start (the turn attribute there)
uniform float px;
uniform vec2 res;
// smooth joins (Settings > Figure depth): the vessel this one's start (mate0) and end (mate1) carries on into, as (its texel in the vessel data, the diameter its tube was built at, its width rule);
// x < 0 where nothing, which is every vessel with the switch off
uniform vec3 mate0;
uniform vec3 mate1;
uniform vec2 mateK;   // how far each mate counts (1: always, the tube beside it is there; a mate that is drawn on and off, the ascending lumbar vein into the azygos's start, counts as far as it is drawn)
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
uniform float lensUse;   // 0 on an ARTERY (it keeps its own colour), 1 on a vein: here it also says whose wall the line is built for (cel-style ARTERY)
uniform float liveW;   // a conditional tributary group's width share, 2D's 0.5 + 0.5 * live (feeders.ts): 1 for every other vessel
uniform float dpr;   // device pixels to a CSS pixel (the renderer's pixel ratio)
// the fade at a free end (2D's TIP_FADE, ART_FADE, FADE_DOWN_Y, FADE_IN, SIN_FADE): mode 1 runs along the vessel (uv.x), mode 2 down the figure (y), mode 3 along a line (the 2D linear mask, solid from the offset), mode 4 along a line with a dip (faintest at the offset, solid at the end); (from, to, alpha at from, alpha at to); fadeKeep 1: the Circuit does not let go of it
uniform float fadeMode;
uniform vec4 fadeA;
uniform vec2 cavaEnd;    // a hepatic vein: the share of its length at the cava end that eases to this alpha (fades.ts cavaEndSpan); 0 = none
uniform vec4 fadeLine;   // modes 3 and 4: a line across the figure, scene (x1, y1, x2, y2); fadeA is then (offset, -, alpha at the start, alpha at the end)
uniform float fadeKeep;
uniform vec3 mapFade;   // the Circuit's own fade of an artery's end: (from, to) along the map course, 1 in z if on (fades.ts MAP_ART_FADE); 0: none, the map holds every fade off
uniform vec3 stump;   // a vein divided at surgery (2D divideLen / stumpPinch): x the divided stretch's length from its start (figure units, 0: whole), y where the tie pinches it (units from the start), z the pinch's share
varying float vFade;
varying float vCircShare;   // this vertex's own share of the change (the flow peel on its rank): the map's cut takes the tube's end away as THIS point lands, not as the whole change ends
varying vec3 vNbr;
varying vec3 vCen;   // the tube's centreline point at this fragment, in clip space (x, y, w): the exact lateral distance to the axis, in device pixels, for the outline
varying vec3 vN;
varying vec3 vV;
varying vec3 vT;
varying vec3 vZf;   // the figure's normal (model z) in the view's frame: the dust's section frame (blood/dust-glsl.ts dustFrame)
varying vec2 vUv;
varying vec2 vLensR;
varying float vHi;
${CIRCUIT_VS_HEAD}
varying float vW;
varying float vR;
// ONE packed varying (a phone's floor is 15 vectors, and every one counts): x vU, the figure's units in one scene unit here (300 on the body, 1 / MAP_K on the map, the Circuit share of this vertex); y vArcLen, the vessel's
// length along the course it is drawn on now (the body course's len at rest, the map course's cl.y in the Circuit, by the same share); z vR0, the lumen's half width before a stenosis or the stent's waist pinches it (figure units:
// the stent's cells and bare length are sized from it); w vSkew, the stent's wires' shift along the tube here (figure units: the lateral offset in the map's plane times the bend turned since the stent began, so a cell keeps
// its length round a corner). Named by macros, so every use reads as before.
varying vec4 vUp;
#define vU vUp.x
#define vArcLen vUp.y
#define vR0 vUp.z
#define vSkew vUp.w
float buryK(float d0, float d1) {   // d0, d1: the figure units from the start and from the end of the tube
  float k0 = bury.x > 0.0 ? smoothstep(0.5 * bury.x * vU, bury.x * vU, d0) : 1.0;
  float k1 = bury.y > 0.0 ? smoothstep(0.5 * bury.y * vU, bury.y * vU, d1) : 1.0;
  return k0 * k1;
}
uniform float circBoost;   // 2D's circBoost: the map's lines are drawn up to 1.75 times wide when it is zoomed out (stage-tubes.js)
uniform float circPerPx;   // map units under one CSS pixel here
uniform vec3 cmate0;   // the vessel this one's start and end carry on into on the MAP (circuit/mates.ts), as mate0 and mate1: x < 0 where nothing
uniform vec3 cmate1;
uniform vec2 cease;    // the half length (map units) of the taper at each of those ends
uniform vec4 circW;   // the vessel's width in the Circuit, map units: (fixed width or -1 for the engine's diameter, 1 if circBoost applies, the least width, the least width on the screen in CSS px)
${SWELL_OF_GLSL}
// the swell the tube has at the map's end (2D stage-tubes.js widthAt, t = 1): a vein clamp(vesselPx(D) * 0.95, 6, 15) map units, an artery 3, a liver bed 8, the boost on veins and beds;
// as a share of the radius the tube was built at, so the shared morph can ease the width with the line (the map's units are MAP_K scene units, the body's 1 / 300)
// the width (map units, before the boost's floor on the screen) a vessel of this kind and diameter has on the map: a vein clamp(vesselPx(D) * 0.95, 6, 15) times the boost, an artery 3, a bed 8 times the boost (width.ts circuitWidthMap)
${CIRC_WIDTH_OF_GLSL}
float circMateMin(vec3 m) { return m.z > 1.5 ? 4.5 : (m.z > 0.5 ? 3.0 : 5.0); }   // the least width on the screen of a mate's kind, CSS px (circuit/width.ts MIN_PX)
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
  // WHERE THIS VESSEL CARRIES ON INTO ANOTHER (circuit/mates.ts: the map's own pairs) the two calibres are joined by ONE smoothstep through the node, over cease map units each way (the mean at the node): the 2D map blends a join over a fixed run, never over a share
  // of each vessel's length (that made a 6 unit step on a short stretch and a 36 unit taper on a long one, each ending flat at the node: a shoulder; Mohammad, 20 Nov: "why is this not smooth tapering?"). Both widths take the least width on the screen
  // before they are joined, so the two sides of a node agree whatever the zoom.
  wc = max(wc, circW.w * circPerPx);
  float circAt = uv.x * cl.y / CIRC_MAPK;   // map units from this vessel's start
  float circTo = (1.0 - uv.x) * cl.y / CIRC_MAPK;   // and from its end
  if (cmate0.x >= 0.0 && cease.x > 0.0) wc += (max(circMateWidth(cmate0), circMateMin(cmate0) * circPerPx) - wc) * (1.0 - smoothstep(-cease.x, cease.x, circAt));
  if (cmate1.x >= 0.0 && cease.y > 0.0) wc += (max(circMateWidth(cmate1), circMateMin(cmate1) * circPerPx) - wc) * (1.0 - smoothstep(-cease.y, cease.y, circTo));
  wc = max(wc, circW.w * circPerPx);
  return 0.5 * wc * CIRC_MAPK / max(radius, 1e-6);
}
// The stump of a divided vein: the first stump.x of it is not drawn, its end is round (a quarter circle over one radius) and it narrows a little at its tie (stage-tubes.js tubeRadius stumpPinch: 1 - 0.2 exp(-((a - tie) / 5.5)^2)).
${STUMP_K_GLSL}
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
  if (mate0.x >= 0.0) { float k0 = (1.0 - smoothstep(0.0, 0.3, uv.x)) * (1.0 - stump.z) * mateK.x;   // (a divided vein's cut start carries on into nothing: it eases to its own width as the cut opens)
    if (k0 > 0.0) swell += k0 * (0.5 * (swell + swellOf(mate0.x, mate0.y, mate0.z)) - swell); }
  if (mate1.x >= 0.0) { float k1 = smoothstep(0.7, 1.0, uv.x) * mateK.y; if (k1 > 0.0) swell += k1 * (0.5 * (swell + swellOf(mate1.x, mate1.y, mate1.z)) - swell); }
  if (circShare > 0.0) swell = mix(swell, circSwell(), circShare);
  swell *= liveW;
  vCircShare = circShare;
  vU = mix(300.0, 1.0 / CIRC_MAPK, circShare);
  vArcLen = mix(len, cl.y, circShare);
  vSkew = 0.0;
  // THE STUMP'S ROUND END: the cut and one radius past it narrow as a quarter circle (stumpK), from the rings the tube has there. A divided vein is built with rings a twelfth of the usual distance apart (shape.ts tubularOf), so the quarter circle has
  // a dozen of them. (Laying the stretch's rings over the cap along each ring's own tangent was tried: on the vein's bend every ring went off its path and the end was a skewed spike; Mohammad, 22 Nov: "tied off the portal vein looks bad")
  if (stump.x > 0.0 && circShare < 0.001) swell *= stumpK(uv.x * len * vU, radius * swell * vU);
  float fa = 1.0;
  // the Circuit lets an artery's end go the same way (mapFade: from, to along the map course, on): it eases to nothing before it reaches the lane tip, never a blunt end; every other fade is off on the map
  float mapFa = mapFade.z > 0.5 ? 1.0 - smoothstep(mapFade.x, mapFade.y, uv.x) : 1.0;
  float rkE = mix(rk, rkc, circShare);   // (the tube's radius share here: on the map the course's own, not the body's tapers)
${FADE_ALPHA_GLSL}
  fa *= 1.0 - tipK;   // (a fan's free tip eases to transparent: body and outline together)
  vFade = fa;
  // the other tube's radius is the one it is DRAWN at: its built radius times its own live swell (the engine's diameter). Its built radius put the cut and the union's outline inside the real wall wherever the engine widens it (Mohammad, 20 Nov: "a big gaping hole" at the hepatic veins' mouths)
  vNbr = vec3(nbr.x, nbr.y * (nbrMate.x >= 0.0 ? swellOf(nbrMate.x, nbrMate.y, nbrMate.z) : 1.0), nbr.z);   // (the swell is the mate's width; its end plane does not move with it)
  // THE OUTLINE is part of the tube (no second mesh, no stencil, no depth tie): the tube is built INK wider than its lumen, and the fragment shader paints the outer ink band, so the line is continuous by construction.
  // Its width is the figure's line (cel-style.ts LINE_R, LINE_MIN, LINE_MAX; 2D's tube-cel-glsl.js CEL is 0.14, 1.5, 3): a share of the tube's radius held between two widths in CSS px (never device px: a device-px clamp drew
  // the line a third as heavy on a 3x iPhone as on a 1x screen), the same on a hairline and on the portal trunk, on a 1x Mac and a 3x iPhone; thinned with a lumen under LINE_MIN CSS px of radius (cel-ink.ts inkTaper), so the smallest branches keep their colour.
  // THE DRAWN LUMEN: the tube's half width AFTER a stenosis has pinched it (the narrow attribute, which the geometry below applies). Every width the fragment stage and the line are made from (the ink band's place, the heads' size, the dust, the
  // tones) is this one radius, so a narrowed stretch keeps its outline and its flow marks are sized to the lumen they are drawn in. They were made from the radius WITHOUT the pinch: the line was placed at the old wall, outside the pinched tube, so
  // the outline vanished through the narrowing, and the heads were built for a wide tube and spilled over a thin one (Mohammad, 20 Nov, the stenosed portal vein).
  float narrowK = 1.0 - clamp(narrow, 0.0, 0.97);
  vR = radius * rkE * swell * narrowK * vU;   // the lumen's half width in the 2D figure's units
  vR0 = radius * rkE * swell * vU;
  vec3 cenW = aPos - aNor * (radius * rkE);   // the ring's centre
  vec4 cc = projectionMatrix * (modelViewMatrix * vec4(cenW, 1.0));
  vCen = vec3(cc.x, cc.y, cc.w);
  float wpcV = ${wpcGlsl('cc.w', 'projectionMatrix[1][1]', 'vU')};   // the figure's units under one CSS px here
  float rCssV = vR / max(wpcV, 1e-6);   // the lumen's radius in CSS px
${HIGHLIGHT_ALONG_GLSL}
  // the ink is held back ONLY on the part of a declared branch's end that lies inside its trunk (bury: the trunk's radius, per end): never along a vessel's own sides, never at a run-on's ring, never where vessels merely cross
  float endK = vHi > 0.001 ? 1.0 : buryK(uv.x * len * vU, (1.0 - uv.x) * len * vU);
  // (the line thins with a lumen that is hairline by NATURE, a small branch; a pinch is not one: the taper is judged on the radius the vessel would have without it, so the outline runs on through a stenosis at the figure's least weight)
  float inkPx = ${inkPxGlsl('rCssV', 'rCssV / narrowK', '1.0 - lensUse')};   // CSS px
  inkPx *= mix(1.0, ${F(CIRC_INK_K)}, circT);   // (the Circuit's line is bolder: its tubes are thick and its ground flat)
  float inkW = (inkPx * endK + hiPx * vHi) * inkOn * wpcV / vU;   // scene units
  float lumenW = radius * rkE * swell * narrowK;
  { vec2 tl = aTan.xy; float tn = length(tl); if (circShare > 0.0 && tn > 1e-5) { tl /= tn; vSkew = circShare * dot(aNor.xy, vec2(-tl.y, tl.x)) * lumenW * vU * (turn - stentT0); } }
  // (the ring is a polygon: its flats sit at the radius, its corners ${F(TUBE_SAG)} of the radius farther out, so the silhouette never falls inside the line)
  float shW = 0.0;
#ifdef SHADOW
  shW = shadowPx * wpcV / vU;   // (the crossing shadow's hull: the tube and its line, wider by the band)
#endif
  vec3 p = aPos + aNor * (inflate + radius * rkE * (swell * narrowK - 1.0) + inkW + shW + (lumenW + inkW + shW) * ${F(TUBE_SAG)});
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
  vLensR = lensR;
  vec4 c = projectionMatrix * mv;
  c.z = mix(cc.z / cc.w, c.z / c.w, ${F(TUBE_DEPTH_SHARE)} * (1.0 - circT)) * c.w;   // depth by the tier of the axis (TUBE_DEPTH_SHARE): a fat tube at a lower tier never bulges over a thin one above it; on the Circuit's plate none at all (a flat line has no bulge: the lines' own depths, mapDepth, decide a crossing)
  // the Circuit's lines lie on one plate: each stands its own mapDepth in front of it (a depth offset, nothing moves), so a crossing has an over and an under (circuit/map-depth.ts)
  c.z -= mapDepth * circT * (-projectionMatrix[3][2]) / c.w;
  c.z -= frontDepth * (-projectionMatrix[3][2]) / c.w;
#ifdef SHADOW
  c.z += mix(shadowDepth, shadowDepthC, circT) * (-projectionMatrix[3][2]) / c.w;   // (the hull lies behind its own tube: a neighbour at the same tier is nearer, so it is never shadowed)
#endif
  vW = c.w;
  gl_Position = c;
  // a tube of no radius (a strand a band has closed, a channel not yet grown) is not drawn: not even its ink, which has a width of its own on screen
  if (rk <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

export const VESSEL_FS = /* glsl */ `
${FADE_GLSL}
${WEDGE_GLSL}
uniform float tubeDark;   // 1 on the dark looks: brighter tube caps (cel-glsl.ts celTubeBase)
${CEL_TUBE_GLSL}
${CEL_LIGHT_GLSL}
${VDBG_GLSL}
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
uniform float lensRawA;
uniform float lensRawB;
uniform vec3 laneColA[5];
uniform vec3 laneColB[5];
uniform float lensIndex;
uniform vec2 lensSpan;
uniform float lensSmooth;   // smooth joins on (1): the lens colour runs through the colours a third and two thirds along (grad rows 2 and 3), not straight from one end's to the other's
uniform float smokeOn;
uniform vec3 hiColor;
uniform float shadowPx;   // the crossing shadow (cel-ink.ts SHADOW): the band's width beyond the line, CSS px
uniform float shadowA;   // its strength in this look
uniform vec3 shadowCol;   // its tone
uniform vec2 shadowEnd;   // the radii over which it fades out at each end that joins another vessel (0: a free end)
uniform float glowK;   // the glow's strength (1; a shunt's target under the pointer more: highlight.ts HOVER_GLOW)
uniform float inkOn;
uniform vec3 stump;   // (the vertex stage's: a divided vein's stump and its tie)
uniform vec4 seamA[2];   // a surgical shunt's stitches, its start's then its end's (seams.ts): the seam's distance in from the end as a quartic in the place across (c0..c3 here, c0 = 0: none)
uniform vec4 seamB[2];   // (c4, how many dashes (0: three ticks), one dash's share of the seam, one dash and its gap's share)
uniform vec4 stentWire;   // the stent's wire in the Circuit: rgb the Anatomy stent's own wire colour, a its strength (stent-look.ts, one source for both views)
uniform vec4 stentGoldC;  // the band's colour and strength, the same way
uniform vec4 stentU;   // a stent in this vessel, drawn on the tube in the Circuit (where the 3D device is faded out): x its share shown (0 none), y and z where it starts and ends along the course (0..1), w where its graft starts
// smooth joins, as in the vertex shader: the ends that carry on into another vessel (x < 0 where nothing); their last stretch draws no ink, so no flat cut is outlined where a branch meets its trunk
uniform vec3 mate0;
uniform vec3 mate1;
uniform vec2 bury;   // the ink is held back ONLY inside a declared branch's trunk: how far from the branch's start and end (figure units per radius unit, 0: none: a run-on, a crossing, a free end keep their whole outline)
uniform float cavaCut;   // 1 on a vein that opens into the cava (2: only its opacity ramp, where a skin has the end) (nbr is the cava's): it takes the cava's colour and alpha as it nears the wall and is not drawn inside the lumen, so it ends exactly at the wall with no step
uniform float solidK;    // a vessel drawn behind the organs: how much of its solid copy (drawn with the organs, hidden by one in front) shows: 1 for every other vessel (Settings > Hide vessels behind organs)
uniform float veilK;     // and of its veil copy (drawn over the organs, shown through them)
uniform float cavaA;     // the cava's opacity where the vein joins it: the vein's own comes to it at the wall (no step in alpha)
uniform vec2 cavaRef;    // the cava piece's lens index and the share along it where the vein joins: the colour the vein takes on
uniform vec2 skinCut;   // junction skins (skin/types.ts, WP4): the tube is drawn only between u = skinCut.x and u = skinCut.y; past either the skin (one welded mesh at the junction) takes over. (-1, 2): no cut, every branch it guards a no-op
uniform vec2 skinCutC;  // the same on the Circuit's MAP (circuit/skins.ts): the tube is cut at its map seams (u is the same share of the course in both views) and the map's own skin draws the junction; it takes effect over the end of the change (SKIN_CIRC_IN), the body's cut over its start. (-1, 2): none
uniform vec2 skinHole;   // a side-wall junction's HOLE (skin/types.ts, spec 10.1): the tube is not drawn between u = skinHole.x and u = skinHole.y, the skin draws that stretch. (2, -1): no hole (never true for any u)
uniform vec2 skinHole2; // a vessel has at most two
uniform vec2 skinWeldC;  // the same weld on the Circuit's MAP cut (circuit/skins.ts): per end, 1 the cut is whole (the map's skin has taken it), less and a growing arm's cut end is drawn at the pixels the skin does not draw
uniform vec3 skinWeld;  // how much of the tube's CUT end the skin has taken over, per end (x the start's, y the end's, z a hole's): 1 the cut is whole (every skinned end but a growing one's), less and the cut part is still drawn at the pixels the skin does not draw (the same screen pattern: a pixel is the skin's where the pattern is under this), so a growing arm's flared end goes as its welded skin comes in
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
uniform vec4 wedge;       // the wedged vein's static column as a tint on the vessels themselves (wedge-glsl.ts): x how much, y how softly it ends behind the balloon's distal edge (route distance), z how far the fade to the branch tip runs (u), w how much of it fades
uniform vec3 wedgeCol;
uniform vec4 wedgeD;       // the column's ONE field: x + y u is this vessel's route distance from the balloon's distal edge at u; z the front's distance (the column filling), w how softly it ends
uniform float quietK;       // quiet depth on a turn (camera/quiet.ts): the back tier eases toward the page by QUIET_BACK of this, 0 face on
uniform vec3 pageCol;       // the plate colour it eases toward
uniform vec4 rimInk;        // (kept for the palette's API: no light rim is drawn)
varying float vW;
varying float vR;
// ONE packed varying (a phone's floor is 15 vectors, and every one counts): x vU, the figure's units in one scene unit here (300 on the body, 1 / MAP_K on the map, the Circuit share of this vertex); y vArcLen, the vessel's
// length along the course it is drawn on now (the body course's len at rest, the map course's cl.y in the Circuit, by the same share); z vR0, the lumen's half width before a stenosis or the stent's waist pinches it (figure units:
// the stent's cells and bare length are sized from it); w vSkew, the stent's wires' shift along the tube here (figure units: the lateral offset in the map's plane times the bend turned since the stent began, so a cell keeps
// its length round a corner). Named by macros, so every use reads as before.
varying vec4 vUp;
#define vU vUp.x
#define vArcLen vUp.y
#define vR0 vUp.z
#define vSkew vUp.w
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
varying float vCircShare;
varying float circStay;
varying vec3 vNbr;
varying vec3 vCen;
varying float vHi;
varying vec3 vN;
varying vec3 vV;
varying vec3 vT;
varying vec3 vZf;   // the figure's normal (model z) in the view's frame: the dust's section frame (blood/dust-glsl.ts dustFrame)
varying vec2 vUv;
varying vec2 vLensR;

// junction skins (skin/types.ts): the tube has a seam at either end
// (a divided vein's start is its tied, round end: no skin joins it there, so the tube is not cut at its start seam: the skin arm there is absent, arm-twins.ts liveFadeAt)
float skinStartCut() { return stump.x > 0.0 ? -1.0 : skinCut.x; }
bool inSkinHole(vec2 h) { return h.y > h.x && vUv.x > h.x + ${F(SKIN_CUT_EPS)} && vUv.x < h.y - ${F(SKIN_CUT_EPS)}; }
// (a dotted thread, a closed potential collateral, is never cut: it runs on into the trunk's wall, and the skin there is a plain trunk, its growth 0: skin-set.ts sync, spec 10.2. A hole is the host's own and is never a dotted thread's)
bool skinPastC() { return circT > 0.0 && dotted < 0.5 && ((skinCutC.x >= 0.0 && vUv.x < skinCutC.x - ${F(SKIN_CUT_EPS)}) || (skinCutC.y <= 1.0 && vUv.x > skinCutC.y + ${F(SKIN_CUT_EPS)})); }
bool skinCutOn() { return dotted < 0.5 && (skinStartCut() >= 0.0 || skinCut.y <= 1.0) || skinHole.y > skinHole.x || skinHole2.y > skinHole2.x; }
float skinWeldAtC() { return (dotted < 0.5 && skinCutC.x >= 0.0 && vUv.x < skinCutC.x - ${F(SKIN_CUT_EPS)}) ? skinWeldC.x : (dotted < 0.5 && skinCutC.y <= 1.0 && vUv.x > skinCutC.y + ${F(SKIN_CUT_EPS)}) ? skinWeldC.y : 1.0; }
float skinWeldAt() { return (dotted < 0.5 && skinStartCut() >= 0.0 && vUv.x < skinStartCut() - ${F(SKIN_CUT_EPS)}) ? skinWeld.x : (dotted < 0.5 && skinCut.y <= 1.0 && vUv.x > skinCut.y + ${F(SKIN_CUT_EPS)}) ? skinWeld.y : (inSkinHole(skinHole) || inSkinHole(skinHole2)) ? skinWeld.z : 1.0; }
bool skinPast() { return (dotted < 0.5 && ((skinStartCut() >= 0.0 && vUv.x < skinStartCut() - ${F(SKIN_CUT_EPS)}) || (skinCut.y <= 1.0 && vUv.x > skinCut.y + ${F(SKIN_CUT_EPS)}))) || inSkinHole(skinHole) || inSkinHole(skinHole2); }

// PLAN 12, THE OUTER EDGE ON THE TRUE CIRCLE. The tube is built wider than the circle of its lumen plus line (the ring is a 14-sided polygon built TUBE_SAG fatter so its flats stand on the circle and its corners outside it), so the outer edge of its
// hull wobbles up to a pixel or more past the circle. Where the tube is PLAIN the hull is wider than the circle for that one reason only, and the pixels past the circle go. The reasons the hull is legitimately wider are every one a "no" below, in this one
// place (tests/plain-here.test.ts reads the list): the Circuit, a highlighted line, a divided stump, a fork or a cava mouth (the union's outline, the neighbour's pull), a buried or run-on end, and the stretch the skin overlaps at a seam or a hole
// (the skin draws that edge, and its band is up to SKIN_SEAM_PAD_PX wider).
uniform float inflate;
bool plainHere(float wpc0) {
  if (circT > 0.0 || vHi > 0.001 || stump.x > 0.0 || dotted > 0.5 || inflate != 0.0 || nbrOn > 0.5 || cavaCut > 0.5) return false;
  if (vNbr.y > 0.0 || vNbr.x != 0.0 || vNbr.z != 0.0) return false;
  if (buryK(vUv.x * len * vU, (1.0 - vUv.x) * len * vU) < 0.9999) return false;
  float arcPx = vArcLen * vU / max(wpc0, 1e-6);   // CSS px along the course from u = 0 to 1
  float edgePx = ${F(PLAIN_EDGE_PX)};   // a joined or cut end's reach, CSS px
  if ((mate0.x >= 0.0 && vUv.x * arcPx < edgePx) || (mate1.x >= 0.0 && (1.0 - vUv.x) * arcPx < edgePx)) return false;
  if (skinStartCut() >= 0.0 && abs(vUv.x - skinStartCut()) * arcPx < edgePx) return false;
  if (skinCut.y <= 1.0 && abs(vUv.x - skinCut.y) * arcPx < edgePx) return false;
  if (skinHole.y > skinHole.x && (abs(vUv.x - skinHole.x) * arcPx < edgePx || abs(vUv.x - skinHole.y) * arcPx < edgePx)) return false;
  if (skinHole2.y > skinHole2.x && (abs(vUv.x - skinHole2.x) * arcPx < edgePx || abs(vUv.x - skinHole2.y) * arcPx < edgePx)) return false;
  return true;
}

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
  return lensOfAt(lensIndex, (vLensR.y > 0.0 ? vLensR.x + vLensR.y * vUv.x : mix(lensSpan.x, lensSpan.y, vUv.x)), grad, lanes, mode, pal, across);   // (a branch of a vessel wears the stretch of its host's ramp it leaves from: no step in colour at the branch point)
}

// A free end in the Circuit is round: the pixels outside a half circle of the tube's own radius at the end are carved away (the tube is the lumen plus its line, so the ink runs round the cap).
// Exact at any ring spacing, which a geometry dome is not (a tube has a ring every 1/24 of a scene unit, about a radius).
${CAP_CARVED_GLSL}
${SEAM_STITCH_GLSL}

uniform vec4 clotA;   // the vein's clot in this piece (disease/clot-field.ts): (f0, df, side * v, length); z 0: none, and the clot's code is never run
uniform vec4 clotP;   // its seed's lump phases
uniform vec3 clotShade;
uniform vec3 clotBase;
uniform vec3 clotLift;
${CLOT_CONST_GLSL}
${CLOT_FN_GLSL}

void main() {
  float streakCover = 0.0;   // (how much a streak covers this pixel: a chevron's pixel is never tinted by one)
  // THE DERIVATIVES, before any discard: a quad whose other pixels have been discarded (the cut, the dissolve, a cap, a back face) gives a garbage fwidth on a device that drops the lane (Apple's), and the flow heads, the shade band and the
  // marks of the pixels that stay came out as blocky, wrongly coloured specks along the seam rings (Mohammad, 20 Nov). So every one the body needs is taken here, in uniform control flow, and used below.
  vec3 nD = normalize(vN);
  vec3 sideD = cross(normalize(vT), normalize(vV));
  float sideDL = length(sideD);
  sideD = sideDL > 1e-4 ? sideD / sideDL : vec3(1.0, 0.0, 0.0);
  float fwSt = fwidth(dot(nD, celLightView())), fwPx = fwidth(vUv.x * vArcLen * vU), fwAw = max(fwidth(dot(nD, sideD)), 0.03);
  lensAcrossFw = fwidth(dot(nD, sideD) * 0.5 + 0.5);
  // (the stent crowns, the suture dashes and the smoke below each want one more: the across angle's, the raw across's and the smoke's own, taken here for the same reason)
  float acrossD = dot(nD, sideD), fwAcr = fwidth(acrossD), fwTh = fwidth(asin(clamp(acrossD, -0.999, 0.999)));
  float nzD = 0.0, fwNz = 0.0;
  if (smokeOn > 0.5) {   // (a uniform: every pixel takes the branch together)
    float driftD = time * 0.04;
    nzD = vnoise(vec2(vUv.x * len * 5.0 + driftD * 6.0, acrossD * 3.0 + driftD)) * 0.65 + vnoise(vec2(vUv.x * len * 11.0 - driftD * 4.0, acrossD * 6.0)) * 0.35;
    fwNz = fwidth(nzD);
  }
  vec3 cBody = vec3(0.0);    // (the tube's tone before the streaks)
  if (frontOut(vUv.x, reveal)) DROP(1);
  if (fadedOut()) DROP(2);
  // a part with no map course (a fan, a strand) fades out over the first half of the Circuit's change in the same screen pattern as the dive's dissolve (circuit/shader.ts)
  if (circStay < 0.999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= circStay) DROP(3);
  if (vFade < 0.004) DROP(4);
  // past the seam the skin draws this junction. On the Circuit's map the tubes morph into flat lines and the map draws its own joins, so the cut part comes back as the skin goes (SKIN_CIRC_SPAN of the change), by the same screen pattern as circStay's; at rest it is a plain discard
  if (skinCutOn() && skinPast()) {
    float cutA = smoothstep(0.0, ${F(SKIN_CIRC_SPAN)}, circT);
    float cutH = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float weldW = skinWeldAt();
    // (a growing arm's cut end is drawn where the skin is not: the skin keeps the pixels whose pattern is under the weld, skin-object.ts setWeld, so each pixel is one or the other)
    if ((cutA <= 0.0 || cutH >= cutA) && (weldW > 0.9999 || cutH < weldW)) DROP(5);
  }
  // the map's own cut (circuit/skins.ts): past a seam of the Circuit the map's skin draws the junction, and it comes in over the end of the change as this goes (the same screen pattern again: both drawn on one pixel never)
  if (skinPastC()) {
    float keepC = 1.0 - smoothstep(${F(SKIN_CIRC_IN)}, 1.0, vCircShare);
    float cutHC = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))), weldC = skinWeldAtC();
    // (a growing arm's cut end is drawn where the map's skin is not: the skin keeps the pixels whose pattern is under the weld, skin-object.ts setWeld, so each pixel is one or the other)
    if ((keepC <= 0.0 || cutHC >= keepC) && (weldC > 0.9999 || cutHC < weldC)) DROP(6);
  }
  vec3 n = normalize(vN);
  // (a tube seen end on has no sideways direction: a fixed one keeps the fragment finite, never a NaN, which a device draws black)
  vec3 sideX = cross(normalize(vT), normalize(vV));
  float sideL = length(sideX);
  vec3 side = sideL > 1e-4 ? sideX / sideL : vec3(1.0, 0.0, 0.0);
  float across = dot(n, side);
  if (capCarved(across)) DROP(7);
  if (!gl_FrontFacing) DROP(8);
  if (dotted > 0.5) {
    // a closed potential collateral: a dotted thread along the tube's axis, nothing round it
    float dash = fract(vUv.x * len / 0.09);
    if (dash > 0.45) DROP(9);
  }

  vec4 la = lensOf(lensGradA, lensLaneA, lensModeA, laneColA, across);
  vec4 lb = lensOf(lensGradB, lensLaneB, lensModeB, laneColB, across);
  vec3 base = mix(mix(color, la.rgb, la.a), mix(color, lb.rgb, lb.a), lensMix);
  tubeRawK = mix(la.a * lensRawA, lb.a * lensRawB, lensMix);   // (the pressure ramp is authored as drawn: cel-glsl.ts tubeRawK)

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
  // (past the other tube's open end nothing of it is drawn: the ink and the drop give way over half a pixel either side of its end plane, by vNbr.z, which the GPU blends exactly where the radius ramped to 0 over a whole triangle)
  if (vNbr.y > 0.0) nbrK = smoothstep(-0.5, 0.5, (vNbr.y - abs(vNbr.x)) / max(vW * 2.0 / (res.y * projY), 1e-9) * dpr) * (1.0 - circT) * (1.0 - smoothstep(-0.5, 0.5, vNbr.z / max(vW * 2.0 / (res.y * projY), 1e-9) * dpr));
  // THE CLOT'S OWN PIXELS (plan 34b): coverage and shape are computed here, before the cava opacity ramp and the fade discards, so the ramp is lifted under the clot (a thrombus is not the cava: it stays as solid as the vein's own fade, with no screen dither on its caps).
  float rDevC = vR / max(${wpcGlsl('vCen.z', 'projY', 'vU')}, 1e-6) * dpr;
  vec3 ct = vec3(0.0);
  float covC = 0.0;
  if (clotA.z != 0.0 && dotted < 0.5) {
    float latC = tl > 1e-3 ? dot(dvPx, vec2(-tS.y, tS.x) / tl) / max(rDevC, 1e-3) : 0.0;
    ct = clotAt(clotA, clotP.xy, vUv.x, latC, vR, rDevC);
    covC = ct.x * (1.0 - smoothstep(rDevC + 0.5, rDevC + 1.5, dLat)) * (1.0 - smoothstep(0.0, 0.35, circT)) * (1.0 - nbrK);
  }
  // A VEIN INTO THE CAVA (a vessel that merges into a faded one: Mohammad, 20 Nov: "there should be a gradual fade into the target vessel, so that they both have the same fade at the point of junction") is one tube with the cava: as it nears the
  // wall it takes the cava's COLOUR (wB: 0 more than 1.6 cava radii before it, 1 at it) and eases its OPACITY down to the cava's (fadeHere: from 2.5 cava radii before the wall, by the pixel's own distance from the wall, never by a share of the vein's
  // length, so the ramp is the same across the vein's width and the wall's slant cannot make a diagonal), so at the wall both are the same colour and the same alpha and there is no step either way. It is drawn up to the wall and not inside the lumen, cut
  // along the wall's own line (cavA: a pixel wide, anti-aliased), so it opens into the cava with nothing hanging on the far side and the cava's own two tones carry on. Body and outline fade together, the vein is never a flat pale wedge.
  float cavA = 1.0, fadeHere = vFade;
  if (cavaCut > 0.5 && vNbr.y > 0.0) {
    float cd = vNbr.y - abs(vNbr.x);
    float wB = smoothstep(-1.6 * vNbr.y, 0.0, cd) * (1.0 - circT);
    float wA = smoothstep(-2.5 * vNbr.y, 0.0, cd) * (1.0 - circT);
    fadeHere = mix(vFade, cavaA, wA);
    // (cavaCut 2: a vein whose cava end a SKIN has taken over (skin/shaders.ts THE JUNCTION FADE RULE): the tube stops at its seam outside the wall, so no cut and no colour of the cava's here, but the same opacity ramp, which the skin carries on through the junction)
    if (cavaCut < 1.5) {
      vec4 la2 = lensOfAt(cavaRef.x, cavaRef.y, lensGradA, lensLaneA, lensModeA, laneColA, across), lb2 = lensOfAt(cavaRef.x, cavaRef.y, lensGradB, lensLaneB, lensModeB, laneColB, across);
      base = mix(base, mix(mix(color, la2.rgb, la2.a), mix(color, lb2.rgb, lb2.a), lensMix), wB);
      tubeRawK = mix(tubeRawK, mix(la2.a * lensRawA, lb2.a * lensRawB, lensMix), wB);
      float cdPx = cd / max(vW * 2.0 / (res.y * projY), 1e-9) * dpr;
      cavA = mix(1.0 - smoothstep(-0.5, 0.5, cdPx), 1.0, circT);
    }
  }
  covC *= cavA;   // (plan 34e: a clot is never inside the cava: cut along the wall's own line with the vein, so its tone never paints over the wall's pixel of anti-aliasing)
  fadeHere = mix(fadeHere, vFade, covC);   // (plan 34b: the cava's opacity ramp is lifted in the clot's own pixels, before the dither and every fade discard: a thrombus is not the cava)
  if (cavA < 0.004) DROP(10);
#ifdef VEIL
  fadeHere *= veilK;
#elif defined(SHADOW)
  fadeHere *= max(solidK, veilK);   // (the band follows whichever copy of the vessel is showing)
#else
  fadeHere *= solidK;
#endif
#ifdef GLOW
  // THE GLOW'S MASK (glow.ts, glow-fx.ts): the picked vessel as it is drawn, in its colour as drawn, weighted by the pick's weight vHi (nothing at the vein's outer ends) and by its fades: premultiplied, painted into the mask texture
  // by max (so the pieces of a vein and the skins at its joins overlap without adding up). Only the lumen and its line: the blur makes the halo outside it.
  {
    float rCssG = vR / max(${wpcGlsl('vCen.z', 'projY', 'vU')}, 1e-6);
    float lineG = ${inkPxGlsl('rCssG', 'rCssG', '1.0 - lensUse')} * mix(1.0, ${F(CIRC_INK_K)}, circT) * inkOn;
    float sG = dLat / dpr - rCssG - lineG;   // CSS px past the line's outer edge
    float wG = ${glowWeightGlsl('vHi')} * glowK * fadeHere * cavA * (1.0 - smoothstep(-0.5, 0.5, sG * dpr));
    gl_FragColor = vec4(${glowToneGlsl('base')} * wG, wG);
    return;
  }
#endif
#ifdef SHADOW
  // THE CROSSING SHADOW (cel-ink.ts SHADOW): this vessel's hull, drawn after every tube with the depth test on and no depth write: it falls only on what is behind this tube, in the look's shadow tone, over the band
  // beyond the line (shadowFeather) and not at all over this tube itself. Where an end joins another vessel it fades out over that join (shadowEndK), so a junction never gaps.
  {
    if (dotted > 0.5) discard;
    float rCssS = vR / max(${wpcGlsl('vCen.z', 'projY', 'vU')}, 1e-6);
    float lineS = ${inkPxGlsl('rCssS', 'rCssS', '1.0 - lensUse')} * mix(1.0, ${F(CIRC_INK_K)}, circT) * inkOn;
    float sS = dLat / dpr - rCssS - lineS;   // CSS px past the line's outer edge
    float bandS = smoothstep(-0.5, 0.0, sS) * (1.0 - smoothstep(${F(SHADOW_FEATHER)} * shadowPx, shadowPx, sS));
    float d0S = vUv.x * len * vU, d1S = (1.0 - vUv.x) * len * vU, rS = max(vR, 1e-6);
    float endS = (shadowEnd.x > 0.0 ? smoothstep(0.5 * shadowEnd.x * rS, shadowEnd.x * rS, d0S) : 1.0) * (shadowEnd.y > 0.0 ? smoothstep(0.5 * shadowEnd.y * rS, shadowEnd.y * rS, d1S) : 1.0);
    float aS = shadowA * bandS * endS * fadeHere * cavA;
    if (aS < 0.004) discard;
    gl_FragColor = vec4(shadowCol, aS);
    return;
  }
#endif
  if (fadeHere < 0.004) DROP(11);
  float sT = dot(n, celLightView());   // n.L against the WORLD light (cel-glsl.ts), so the camera never changes a shade
  float rDevAx = vR / max(${wpcGlsl('vCen.z', 'projY', 'vU')}, 1e-6) * dpr;   // the same radius at the AXIS's depth: what the vertex stage built the ink band from (the surface's depth differs from it on a foreshortened tube near the camera, and the band would then start inside or outside the tube it was built for)
  // (plan 12: on a plain stretch the outer edge is the true circle of the lumen plus its line, half a pixel out as the skin's is, so the polygon's corners are gone and both sides of a seam stand on one curve)
  if (plainHere(wpc0)) {
    float rCssA = vR / max(${wpcGlsl('vCen.z', 'projY', 'vU')}, 1e-6), rCssA0 = vR0 / max(${wpcGlsl('vCen.z', 'projY', 'vU')}, 1e-6);
    float outerPx = rDevAx + ${inkPxGlsl('rCssA', 'rCssA0', '1.0 - lensUse')} * inkOn * dpr;
    if (dLat > outerPx + 0.5) DROP(13);
  }
  // (the shade band is not cut off at the other tube's wall: two tubes of a fork are one surface that blends, so the band thins and is gone by the time it reaches the other's lumen, over 0.8 of the other's radius: no ledge and no dash where the band would otherwise end)
  float nbrT = nbrK;
  if (vNbr.y > 0.0) nbrT = max(nbrK, smoothstep(-0.8, 0.0, (vNbr.y - abs(vNbr.x)) / vNbr.y) * (1.0 - circT) * (1.0 - smoothstep(0.0, 0.8 * vNbr.y, vNbr.z)));   // (and the pull ends at the other's end plane, easing out over 0.8 of its radius past it: no pale step along the band where the other has ended)
  vec3 c = celTubeToneArt(base, mix(sT, 1.0, nbrT), fwSt * (1.0 - nbrT), rDev, 1.0 - lensUse);   // two flat tones, matte and opaque: no highlight, no rim light
  c = mix(c, pageCol, ${QUIET_BACK.toFixed(3)} * quietK);   // (0 for every tier but the back one)
#ifdef VDBG
  c = dbgBody(c, base, n);   // (the inspector's shade mode: debug-view.ts)
#endif
  // THE DUST (blood/dust-glsl.ts, the Dust Lab's particles, Mohammad 20 Nov) is part of the tube: painted here, in its own fragment shader, so it is inside the lumen (dustTube draws nothing past 0.96 of the half width,
  // never touching the ink) and follows the tube's own alpha and fade zones by construction: there is no second mesh to stray past a tube's end, a taper or a fade. Under the chevrons, which come after.
  float sD = vUv.x * len * vU;
  // the blind end of a divided vein's stump (between its round end and its tie, and a head's length past the tie) holds no flow: no dust, no chevron, and so none half cut off by the cap or standing past the tie (Mohammad, 22 Nov); it eases in with the cut
  float stumpMk = (stump.x > 0.0 && circT < 0.001) ? mix(1.0, smoothstep(stump.y + 2.5, stump.y + 2.5 + 1.6 * vR, sD), stump.z) : 1.0;
  // REAL FLOW (blood/routes.ts): the particles of the roots this vessel's lanes carry, in its own section, at their place on their root's stream. No fade at a skin's seam (the skin draws the same particles on); where tubes
  // still overlap at a joint with no skin they fade as the chevrons do (markK), the vessel it opens into drawing the same particles.
  vec4 fd = flowDust(across, dustFrame(vT, vZf, normalize(vV), side), sD, len * vU, max(radius * vU, 1e-3), vR, vR / max(${wpcGlsl('vW', 'projY', 'vU')}, 1e-6), lensIndex, vindex, baseD, celTubeBase(base), vU) * markK(skinCut.x >= 0.0 ? 1e6 : sD, skinCut.y <= 1.0 ? 1e6 : (1.0 - vUv.x) * len * vU) * stumpMk;
  fd = clamp(fd, 0.0, 1.0) * dHold(fadeHere * cavA);   // (the dust follows this pixel's final alpha: dust-glsl.ts dHold; premultiplied marks are never past 0 .. 1: an alpha over 1 would invert the lumen under them, a blue one to yellow-green and a dark mark to black)
#ifdef VDBG
  if (dbgDust < 0.5) fd = vec4(0.0);
#endif
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
    float nz = nzD;   // (and its derivative fwNz: taken at the top of main)
    float amt = (1.0 - smoothstep(1.0, 9.0, abs(vel))) * 0.5 + 0.12;
    float nzW = max(fwNz * 0.75, 1e-3);
    c = mix(c, mix(base, vec3(lum(base) > 0.5 ? 0.15 : 0.92), 0.5), smoothstep(0.62 - amt - nzW, 0.62 - amt + nzW, nz) * 0.3);
  }

  // the flow heads, on the tube's surface as the 2D composite lays them
  float pxArc = fwPx;   // (derivatives taken at the top of main, before any discard)
  float acrossW = fwAw;
  vec4 hd = flowHeads(across, acrossW, vUv.x * len * vU, len * vU, vR, ${wpcGlsl('vW', 'projY', 'vU')}, pxArc, lensIndex, flowAmount, markK(vUv.x * len * vU, (1.0 - vUv.x) * len * vU) * stumpMk, la, lb, color, base);   // (a head stands inside the lumen, 55 percent of it, and is cut at the wall: never on the ink)
  hd = clamp(hd, 0.0, 1.0);
#ifdef VDBG
  if (dbgHeads < 0.5) hd = vec4(0.0);
#endif
  if (hd.a > 0.0) {
    if (streakCover > 0.0) c = mix(c, cBody, hd.a);   // the streaks lie UNDER the chevrons: a head's pixel is never tinted by one
    c = c * (1.0 - hd.a) + hd.rgb;
  }
  // THE CLOT (plan 26) is painted here, in the vein's own fragment: over the dust and the heads, inside the lumen (clipped at its edge, before the ink band below), lit by this pixel's own n.L, so it has the vein's depth, fades, cuts and
  // weights and looks the same from every angle. Its line is on its free edge and its caps only. A uniform branch: a vein with no clot runs none of this and is the same pixel as before.
  if (clotA.z != 0.0 && dotted < 0.5) {
    if (covC > 0.0) {
      float etC = max(0.5 * ${F(CEL_STYLE.EDGE_PX)} * fwSt, 1e-4);
      vec3 toneC = mix(mix(clotShade, clotBase, smoothstep(${F(CLOT_SHADE_AT)} - etC, ${F(CLOT_SHADE_AT)} + etC, sT)), clotLift, smoothstep(${F(CLOT_LIFT_AT)} - etC, ${F(CLOT_LIFT_AT)} + etC, sT));
      float rCssC = rDevC / dpr;
      float inkC = min(${inkPxGlsl('rCssC', 'rCssC', '1.0 - lensUse')} * dpr, ${F(CLOT_INK_MAX_R)} * rDevC);
      vec3 lineC = mix(inkColor, clotShade * mix(${F(CEL_STYLE.TUBE.INK_TONE)}, ${F(CEL_STYLE.TUBE.INK_TONE_DARK)}, tubeDark), ${F(CEL_STYLE.TUBE.INK_OWN)});
      c = mix(c, mix(toneC, lineC, ct.z * (1.0 - smoothstep(inkC - 0.5, inkC + 0.5, ct.y))), covC);
    }
  }
  // THE OUTLINE: the band between the lumen's edge and the tube's (it is built INK wider, see the vertex stage). The exact lateral distance from the pixel to the tube's axis, in device pixels, against the lumen's radius:
  // the line is continuous by construction (no second mesh, no stencil, no depth tie), constant in device pixels (the vertex stage widened the tube by the same line) and antialiased half a pixel each side. It follows the fade
  // (the same alpha as the body), is not drawn on a joined end's last stretch (a smooth join buries the cut) and is the look's casing ink taken most of the way to a deep tone of the vessel's own colour (never black, never white).
  float endK = vHi > 0.001 || nbrOn > 0.5 ? 1.0 : buryK(vUv.x * len * vU, (1.0 - vUv.x) * len * vU);
  float inkT = smoothstep(rDevAx - 0.5, rDevAx + 0.5, dLat) * endK * inkOn;
#ifdef VDBG
  if (dbgInk < 0.5) inkT = 0.0;
#endif
  inkT *= 1.0 - nbrK;
  if (nbrK > 0.5 && dLat > rDevAx + 0.5) DROP(12);
  // in the Circuit the outline also sits a little inside the vessel and fades inward, so on a dark map the edge still reads (the ink outside it is lost on the ground)
  float inDepth = clamp(${F(CIRC_INNER.R)} * rDevAx, ${F(CIRC_INNER.MIN_PX)} * dpr, ${F(CIRC_INNER.MAX_PX)} * dpr);   // (CSS px set, held in device px here: the same share of the line on every screen)
  c = mix(c, inkColorCirc, circT * ${F(CIRC_INNER.K)} * smoothstep(rDevAx - inDepth, rDevAx, dLat) * endK * inkOn);
  if (inkT > 0.0) {
    vec4 laH = lensOf(lensGradA, lensLaneA, lensModeA, laneColA, 0.0), lbH = lensOf(lensGradB, lensLaneB, lensModeB, laneColB, 0.0);
    vec3 baseH = mix(mix(color, laH.rgb, laH.a), mix(color, lbH.rgb, lbH.a), lensMix);
    float rawKeep = tubeRawK;
    tubeRawK = mix(laH.a * lensRawA, lbH.a * lensRawB, lensMix);
    vec3 inkH = ${inkColourGlsl('baseH')};
    tubeRawK = rawKeep;
    c = mix(c, mix(inkH, inkColorCirc, circT), inkT);   // (a selected vessel's line is its own: the glow is a separate halo, glow.ts)
  }
${PROCEDURE_MARKS_GLSL}
#ifdef VDBG
  c = dbgEnd(c, vindex);
#endif
  gl_FragColor = vec4(c, fadeHere * cavA);
}`;
