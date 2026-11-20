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
import { CHEV, CHEVRON_GLSL, CHEV_LEVEL_MIN } from '../blood/chevron-glsl.ts';
import { STREAK_FIELD_GLSL } from '../blood/streak-glsl.ts';
import { STREAK } from '../blood/streak-glsl.ts';
import { QUIET_BACK } from '../camera/quiet.ts';
import { CEL_STYLE } from '../cel-style.ts';
import { CEL_LIGHT_GLSL, CEL_TUBE_GLSL, glslNum as F } from '../cel-glsl.ts';
import { TUBE_RADIAL } from './tubes.ts';

/** The tube's ring is a polygon of TUBE_RADIAL sides: its corners stand 1 / cos(pi / n) - 1 of the radius outside its flats. The tube is built that much fatter, so the silhouette never falls inside the outline. */
export const TUBE_SAG = 1 / Math.cos(Math.PI / TUBE_RADIAL) - 1;
/** How much of a tube's own round depth its pixels keep. The figure is a stack of tiers 0.01 to 0.02 apart (frame2d.ts TIER_Z) whose order is the 2D figure's over and under (the hepatic artery between the cava and the portal vein),
 *  but a round tube's front stands its RADIUS in front of its axis: the cava (z -0.02, radius 0.027) bulged 0.007, past the hepatic artery's axis (z 0.0) and its own front (0.005), and hid it (Mohammad, 20 Nov: "fix the hepatic artery
 *  to be between the IVC and PV"). The vertex shader moves each vertex's depth (along its own ray: nothing moves on screen) to the axis's depth plus this share of the bulge, so a crossing is decided by the tiers and the thick tube's bulge
 *  (at most 0.15 x 0.035 = 0.005, under the narrowest gap that has to hold, cava to artery 0.02) only sorts two tubes of one tier. */
export const TUBE_DEPTH_SHARE = 0.15;
import { CIRC_INK_K, CIRC_INNER, TAPER_FROM, TAPER_TO } from './cel-ink.ts';

export const VESSEL_VS = /* glsl */ `
attribute vec3 tang;
// a stent narrows its shunt's lumen (waist, end stenosis): the share of the tube taken off at this vertex, 0 on every vessel that has none (a missing attribute reads 0)
attribute float narrow;
attribute float rk;   // this vertex's tube radius as a share of the vessel's own (a strand is thinner than its trunk; a run-on eases to its neighbour's width)
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
uniform float dpr;   // device pixels to a CSS pixel (the renderer's pixel ratio)
// the fade at a free end (2D's TIP_FADE, ART_FADE, FADE_DOWN_Y, FADE_IN, SIN_FADE): mode 1 runs along the vessel (uv.x), mode 2 down the figure (y), mode 3 along a line (the 2D linear mask, solid from the offset), mode 4 along a line with a dip (faintest at the offset, solid at the end); (from, to, alpha at from, alpha at to); fadeKeep 1: the Circuit does not let go of it
uniform float fadeMode;
uniform vec4 fadeA;
uniform vec4 fadeLine;   // modes 3 and 4: a line across the figure, scene (x1, y1, x2, y2); fadeA is then (offset, -, alpha at the start, alpha at the end)
uniform float fadeKeep;
varying float vFade;
varying vec3 vCen;   // the tube's centreline point at this fragment, in clip space (x, y, w): the exact lateral distance to the axis, in device pixels, for the outline
varying vec3 vN;
varying vec3 vV;
varying vec3 vT;
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
// a vessel's live width against the one its tube was built at (the engine's diameter by the 2D figure's rule), as the body of main() reads it for this vessel
float swellOf(float idx, float bD, float kind) {
  if (useData < 0.5 || kind > 1.5) return 1.0;
  ivec2 tm = ivec2(int(mod(idx, vdataSize.x)), int(floor(idx / vdataSize.x)));
  float dm = texelFetch(vdata, tm, 0).b;
  float m1 = 1.3 * max(2.6, 2.0 * pow(max(dm, 0.1), 0.72)), m0 = 1.3 * max(2.6, 2.0 * pow(max(bD, 0.1), 0.72));
  if (kind > 0.5) { m1 = max(1.8, m1 * 0.5); m0 = max(1.8, m0 * 0.5); }
  return clamp(m1 / m0, 0.2, 8.0);
}
// the swell the tube has at the map's end (2D stage-tubes.js widthAt, t = 1): a vein clamp(vesselPx(D) * 0.95, 6, 15) map units, an artery 3, a liver bed 8, the boost on veins and beds;
// as a share of the radius the tube was built at, so the shared morph can ease the width with the line (the map's units are MAP_K scene units, the body's 1 / 300)
float circSwell() {
  float wc;
  if (circW.x >= 0.0) wc = max(circW.z, circW.x * mix(1.0, circBoost, circW.y));
  else {
    float d = baseD;
    if (useData > 0.5) { ivec2 tc = ivec2(int(mod(vindex, vdataSize.x)), int(floor(vindex / vdataSize.x))); d = texelFetch(vdata, tc, 0).b; }
    wc = clamp(1.3 * max(2.6, 2.0 * pow(max(d, 0.1), 0.72)) * 0.95, 6.0, 15.0) * circBoost;
  }
  wc = max(wc, circW.w * circPerPx);
  return 0.5 * wc * CIRC_MAPK / max(radius, 1e-6);
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
  vU = mix(300.0, 1.0 / CIRC_MAPK, circShare);
  float fa = 1.0;
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
  vFade = fa;
  // THE OUTLINE is part of the tube (no second mesh, no stencil, no depth tie): the tube is built INK wider than its lumen, and the fragment shader paints the outer ink band, so the line is continuous by construction.
  // Its width is the figure's line (cel-style.ts LINE_R, LINE_MIN, LINE_MAX; 2D's tube-cel-glsl.js CEL is 0.14, 1.5, 3): a share of the tube's radius held between two device px widths, the same on a hairline and on the
  // portal trunk, on a 1x Mac and a 3x iPhone; thinned with a lumen under LINE_MIN device px of radius (cel-ink.ts inkTaper), so the smallest branches keep their colour.
  vR = radius * rk * swell * vU;   // the lumen's half width in the 2D figure's units
  vec3 cenW = aPos - aNor * (radius * rk);   // the ring's centre
  vec4 cc = projectionMatrix * (modelViewMatrix * vec4(cenW, 1.0));
  vCen = vec3(cc.x, cc.y, cc.w);
  float wpcV = cc.w * 2.0 / (res.y * projectionMatrix[1][1]) * vU;   // the figure's units under one CSS px here
  float rDevV = vR / max(wpcV, 1e-6) * dpr;
  float aU = uv.x * len;
  float distH = hiDir > 0.5 ? hiOffset + aU : (hiDir < -0.5 ? hiOffset + (len - aU) : 0.0);
  float limitH = hiDir < -0.5 ? hiBehind : hiAhead;
  float ownH = smoothstep(0.0, max(hiFade, 0.0001), min(hiEnds.x + aU, hiEnds.y + (len - aU)));   // the picked vein's own line: nothing at its two outer ends, full a fade's length in
  vHi = hiOn * (abs(hiDir) > 0.5 ? 1.0 - smoothstep(0.0, max(limitH, 0.0001), distH) : ownH);
  // the ink is held back ONLY on the part of a declared branch's end that lies inside its trunk (bury: the trunk's radius, per end): never along a vessel's own sides, never at a run-on's ring, never where vessels merely cross
  float endK = vHi > 0.001 ? 1.0 : buryK(uv.x * len * vU, (1.0 - uv.x) * len * vU);
  float inkPx = clamp(${F(CEL_STYLE.LINE_R)} * rDevV, ${F(CEL_STYLE.LINE_MIN)}, ${F(CEL_STYLE.LINE_MAX)}) * smoothstep(${F(TAPER_FROM)}, ${F(TAPER_TO)}, rDevV) / dpr;
  inkPx *= mix(1.0, ${F(CIRC_INK_K)}, circT);   // (the Circuit's line is bolder: its tubes are thick and its ground flat)
  float inkW = (inkPx * endK + hiPx * vHi) * inkOn * wpcV / vU;   // scene units
  float lumenW = radius * rk * swell * (1.0 - narrow);
  // (the ring is a polygon: its flats sit at the radius, its corners ${F(TUBE_SAG)} of the radius farther out, so the silhouette never falls inside the line)
  vec3 p = aPos + aNor * (inflate + radius * rk * (swell * (1.0 - narrow) - 1.0) + inkW + (lumenW + inkW) * ${F(TUBE_SAG)});
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * aNor);
  vT = normalize(normalMatrix * aTan);
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
// smooth joins, as in the vertex shader: the ends that carry on into another vessel (x < 0 where nothing); their last stretch draws no ink, so no flat cut is outlined where a branch meets its trunk
uniform vec3 mate0;
uniform vec3 mate1;
uniform vec2 bury;   // the ink is held back ONLY inside a declared branch's trunk: how far from the branch's start and end (figure units per radius unit, 0: none: a run-on, a crossing, a free end keep their whole outline)
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
varying float vFade;
varying vec3 vCen;
varying float vHi;
varying vec3 vN;
varying vec3 vV;
varying vec3 vT;
varying vec2 vUv;

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// Doppler-style mean velocity (cm/s, signed) from the engine's flow (mL/s) and diameter (mm): the lumen's area is pi r^2
float meanVelocity(float q, float dmm) {
  float r = max(dmm, 0.5) * 0.05;
  return q / (3.14159265 * r * r);
}
// ---- the 2D app's flow heads (chevron-glsl.js, blood-heads.js) ----
${CHEVRON_GLSL}
${STREAK_FIELD_GLSL}
// (chevKeep, the lattice's keep, is in the one chevron chunk above: blood/chevron-glsl.ts)
// One vessel's heads placed by a stream's pattern (veins-gl.js chevOne): se = A + B s is the vessel's arc along that stream (B = 1, se = s for its own), Dm the stream's distance. The
// spacing is the zoom's, by the arc a head takes here (B), so a parcel that slows on entering a vessel bunches up as the blood does. ends: the weights of a link at the vessel's from and
// to end (above 0: a chained end, through which the heads run on instead of fading). Returns the head's coverage and its rim, already faded by its place and its lattice.
vec2 chevOne(float s, float Lw, float se, float Bm, float Dm, float vd, float rv, vec2 ends, float R, float across, float wpc, float Pt, float px) {
  float lv = max(${F(CHEV_LEVEL_MIN)}, log2(Pt * max(abs(Bm), 0.05) / 28.0));
  float n0 = floor(lv), P = 28.0 * exp2(n0);
  float j = floor((se - Dm) / P + 0.5);
  float x = (se - (Dm + j * P)) / (abs(Bm) < 0.05 ? (Bm < 0.0 ? -0.05 : 0.05) : Bm), sc = s - x;
  float hw = min(R + ${F(CHEV.OVER_PX)} * wpc, clamp(0.5 * R, ${F(CHEV.MIN_HW_PX)} * wpc, ${F(CHEV.MAX_HW_PX)} * wpc)), L = 1.6 * hw;   // (a head is 6 CSS px tall from a tube 6 px across, as tall as the tube on a narrower one)
  if (abs(x) > (0.6 + 0.4 * rv) * L + 0.15 * hw + 4.0 * px) return vec2(0.0);
  float lo = 0.6 * L, ramp = max(2.0 * L, 0.12 * Pt);
  float a0 = sc < lo ? 0.0 : smoothstep(lo, lo + ramp, sc), a1 = Lw - sc < lo ? 0.0 : smoothstep(lo, lo + ramp, Lw - sc);
  float fade = min(mix(a0, 1.0, clamp(ends.x, 0.0, 1.0)), mix(a1, 1.0, clamp(ends.y, 0.0, 1.0))) * chevKeep(j, n0, lv);
  if (fade <= 0.0) return vec2(0.0);
  float dir = vd != 0.0 ? sign(vd) : (rv > 0.5 ? -1.0 : 1.0);
  return chevHead(dir * x, abs(across) * R, hw, px, rv) * fade;
}
float chevOrange(vec3 c) {
  return smoothstep(0.35, 0.55, c.r - c.b) * smoothstep(0.65, 0.8, c.r) * smoothstep(0.25, 0.35, c.g) * (1.0 - smoothstep(0.62, 0.78, c.g));
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

// the colour of one lens set at this pixel; .a says whether the lens colours this vessel (0: it keeps its tone)
vec4 lensOf(sampler2D grad, sampler2D lanes, float mode, vec3 pal[5], float across) {
  if (mode < 0.5 || lensUse < 0.5) return vec4(0.0);
  ivec2 i0 = ivec2(int(lensIndex), 0), i1 = ivec2(int(lensIndex), 1);
  vec4 g0 = texelFetch(grad, i0, 0), g1 = texelFetch(grad, i1, 0);
  if (g0.a + g1.a < 0.5) return vec4(0.0);
  float u = mix(lensSpan.x, lensSpan.y, vUv.x);   // (a branch of a vessel wears the stretch of its host's ramp it leaves from: no step in colour at the branch point)
  float t = lensTail > 0.5 ? smoothstep(0.55, 1.0, u) : u;
  if (mode < 1.5) {
    if (lensSmooth > 0.5) {
      // the ramp's own colours along the vessel (model.ts: the pressure a third and two thirds of the way along), so a vessel that crosses a threshold passes through amber and not through a blend of its ends
      vec3 g2 = texelFetch(grad, ivec2(int(lensIndex), 2), 0).rgb, g3 = texelFetch(grad, ivec2(int(lensIndex), 3), 0).rgb;
      float x = t * 3.0;
      return vec4(x < 1.0 ? mix(g0.rgb, g2, x) : (x < 2.0 ? mix(g2, g3, x - 1.0) : mix(g3, g1.rgb, x - 2.0)), 1.0);
    }
    return vec4(mix(g0.rgb, g1.rgb, t), 1.0);
  }
  vec4 c = mix(texelFetch(lanes, i0, 0), texelFetch(lanes, i1, 0), t);
  float f = across * 0.5 + 0.5;
  float w = max(fwidth(f) * 1.2, 0.002);
  vec3 col = pal[4];
  col = mix(col, pal[3], 1.0 - smoothstep(c.w - w, c.w + w, f));
  col = mix(col, pal[2], 1.0 - smoothstep(c.z - w, c.z + w, f));
  col = mix(col, pal[1], 1.0 - smoothstep(c.y - w, c.y + w, f));
  col = mix(col, pal[0], 1.0 - smoothstep(c.x - w, c.x + w, f));
  return vec4(col, 1.0);
}

// A free end in the Circuit is round: the pixels outside a half circle of the tube's own radius at the end are carved away (the tube is the lumen plus its line, so the ink runs round the cap).
// Exact at any ring spacing, which a geometry dome is not (a tube has a ring every 1/24 of a scene unit, about a radius).
bool capCarved(float across) {
  float k = smoothstep(0.7, 1.0, circT);
  if (k <= 0.0 || circCap.x + circCap.y < 0.5) return false;
  float dd = 1e9;
  if (circCap.x > 0.5) dd = vUv.x * len * vU;
  if (circCap.y > 0.5) dd = min(dd, (1.0 - vUv.x) * len * vU);
  float wpc = vCen.z * 2.0 / (res.y * projY) * vU;   // (the axis's depth, the one the vertex stage built the line from)
  float rDev = vR / max(wpc, 1e-6) * dpr;
  float ink = clamp(${F(CEL_STYLE.LINE_R)} * rDev, ${F(CEL_STYLE.LINE_MIN)}, ${F(CEL_STYLE.LINE_MAX)}) * mix(1.0, ${F(CIRC_INK_K)}, circT) / dpr * wpc * inkOn;
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
  float wpc0 = vW * 2.0 / (res.y * projY) * vU;
  float rDev = vR / max(wpc0, 1e-6) * dpr;
  float sT = dot(n, celLightView());   // n.L against the WORLD light (cel-glsl.ts), so the camera never changes a shade
  float rDevAx = vR / max(vCen.z * 2.0 / (res.y * projY) * vU, 1e-6) * dpr;   // the same radius at the AXIS's depth: what the vertex stage built the ink band from (the surface's depth differs from it on a foreshortened tube near the camera, and the band would then start inside or outside the tube it was built for)
  vec3 c = celTubeTone(base, sT, fwidth(sT), rDev);   // two flat tones, matte and opaque: no highlight, no rim light
  c = mix(c, pageCol, ${QUIET_BACK.toFixed(3)} * quietK);   // (0 for every tier but the back one)
  // THE STREAKS (blood/streak-glsl.ts, the one streak) are part of the tube: painted here, in its own fragment shader, so they are inside the lumen (the field draws nothing past FIELD_EDGE of its half width,
  // never touching the ink) and follow the tube's own alpha and fade zones by construction: there is no second mesh to stray past a tube's end, a taper or a fade. Under the chevrons, which come after.
  if (streakAmt > 0.001 && vR > 0.0) {
    vec4 smS = texelFetch(streamTex, ivec2(int(lensIndex), 0), 0);   // the blood's own distance and speed on this vessel: reversed runs back, none stands
    float rFix = max(radius * vU, 1e-3);   // (the vessel's own radius, not its live width: the pattern does not slip when a stenosis narrows it)
    float rCss = vR / max(vW * 2.0 / (res.y * projY) * vU, 1e-6);
    float sc = ${F(STREAK.FIELD_AT_R)} / rFix * rCss / clamp(rCss, ${F(STREAK.LEN_R_PX[0])}, ${F(STREAK.LEN_R_PX[1])});   // (the pattern's scale: a streak is 24 to 96 CSS px long whatever the zoom, STREAK.LEN_R_PX)
    gStreakPx = rCss;   // (the lumen's radius in CSS px: the field draws a core of CORE_PX on screen)
    gStreakWide = smoothstep(${F(STREAK.WIDE_R_PX[0])}, ${F(STREAK.WIDE_R_PX[1])}, rCss);
    gStreakLanes = rCss < ${F(STREAK.LANE_R_PX[0])} ? 1.0 : rCss < ${F(STREAK.LANE_R_PX[1])} ? 3.0 : 5.0;   // (the lanes by the width on screen: 1 under 8 px across, 3 to 16 px, 5 above)
    float fld = streakField(across, vUv.x * len * vU * sc, smS.x * sc, 1.0, 1.0, 1.0);
    float sOn = streakAmt * smoothstep(${F(STREAK.MIN_R_PX)}, ${F(STREAK.MIN_R_PX + 0.5)}, rCss) * smoothstep(0.02, 0.2, abs(smS.y));
    streakCover = sOn * fld;
    cBody = c;
    c = mix(c, streakTone(c, vec3(1.0), gStreakK.x, gStreakK.y), streakCover);
  }

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
  if (flowAmount > 0.001 && vR > 0.0) {
    vec4 stm = texelFetch(streamTex, ivec2(int(lensIndex), 0), 0);
    float Dm = stm.x, vd = stm.y, rv = stm.z;
    float wpc = vW * 2.0 / (res.y * projY) * vU;      // the figure's units under one CSS px here
    float R = max(vR, 0.3), Lw = len * vU, s = vUv.x * Lw;
    float px = clamp(pxArc, 0.15 * wpc, 1.5 * wpc);   // (held to a CSS pixel: at a grazing silhouette the arc's derivative runs away and would smear a head)
    float Pt = ${F(CHEV.PITCH_PX)} * wpc;
    vec4 c4 = texelFetch(chainTex, ivec2(int(lensIndex), 0), 0), c5 = texelFetch(chainTex, ivec2(int(lensIndex), 1), 0);
    vec2 ch = vec2(0.0);
    if (c4.w < 1.0) ch = chevOne(s, Lw, s, 1.0, Dm, vd, rv, c5.xy, R, across, wpc, Pt, px);
    if (c4.w > 0.0) {
      float rootD = texelFetch(streamTex, ivec2(int(c4.x + 0.5) - 1, 0), 0).x;
      vec2 cc = chevOne(s, Lw, c4.y + c4.z * s, c4.z, rootD, vd, rv, c5.xy, R, across, wpc, Pt, px);
      ch = c4.w >= 1.0 ? cc : mix(ch, cc, c4.w);
    }
    // heads are on every tube down to about 4 CSS px across (R 1.5 px: the spacing never depends on the width), and are cut at the wall (never on the ink)
    float fade = flowAmount * smoothstep(${F(CHEV.MIN_R_PX)} * wpc, ${F(CHEV.MIN_R_PX + 0.6)} * wpc, R) * (1.0 - smoothstep(1.0, 1.0 + acrossW, abs(across)));   // (a head may stand a pixel over a wall: the ink outline, drawn after it, clips it to the tube)
    fade *= mix(0.3, 1.0, smoothstep(0.5, 3.0, abs(vd)));
    if (fade > 0.0 && ch.x + ch.y > 0.0) {
      float origin = mix(lensModeA > 1.5 ? 1.0 : 0.0, lensModeB > 1.5 ? 1.0 : 0.0, lensMix);
      // one flat tone for the head, never a grey halfway: dark ink on a light lumen, cream on a dark one, decided by a hard step on the lumen's luminance (2D blended over 0.175 to 0.205, which on a mid lavender is a grey head)
      float rk = rv * (1.0 - origin), warm = rk * chevOrange(base);
      vec3 core = mix(mix(chevInk(celTubeBase(base), markDark, markLight), markRev, rk), markLight, warm);   // (the one chevron's tone: blood/chevron-glsl.ts)
      vec3 rimc = CHEV_RIM;   // the head's outline is always the dark ink: a flat head with a dark line, never a pale ring
      float ar = clamp(ch.y * 0.75 * fade, 0.0, 1.0), ac = clamp(ch.x * fade, 0.0, 1.0);
      float ha = ac + ar * (1.0 - ac);
      if (streakCover > 0.0) c = mix(c, cBody, ha);   // the streaks lie UNDER the chevrons: a head's pixel is never tinted by one
      c = c * (1.0 - ha) + core * ac + rimc * ar * (1.0 - ac);
    }
  }
  // THE OUTLINE: the band between the lumen's edge and the tube's (it is built INK wider, see the vertex stage). The exact lateral distance from the pixel to the tube's axis, in device pixels, against the lumen's radius:
  // the line is continuous by construction (no second mesh, no stencil, no depth tie), constant in device pixels (the vertex stage widened the tube by the same line) and antialiased half a pixel each side. It follows the fade
  // (the same alpha as the body), is not drawn on a joined end's last stretch (a smooth join buries the cut) and is the look's casing ink taken most of the way to a deep tone of the vessel's own colour (never black, never white).
  vec2 tS = vT.xy;
  float tl = length(tS);
  vec2 dvPx = gl_FragCoord.xy - (vCen.xy / vCen.z * 0.5 + 0.5) * res * dpr;
  float dLat = tl > 1e-3 ? abs(dot(dvPx, vec2(-tS.y, tS.x) / tl)) : length(dvPx);
  float endK = vHi > 0.001 ? 1.0 : buryK(vUv.x * len * vU, (1.0 - vUv.x) * len * vU);
  float inkT = smoothstep(rDevAx - 0.5, rDevAx + 0.5, dLat) * endK * inkOn;
  // in the Circuit the outline also sits a little inside the vessel and fades inward, so on a dark map the edge still reads (the ink outside it is lost on the ground)
  float inDepth = clamp(${F(CIRC_INNER.R)} * rDevAx, ${F(CIRC_INNER.MIN_PX)}, ${F(CIRC_INNER.MAX_PX)});
  c = mix(c, inkColorCirc, circT * ${F(CIRC_INNER.K)} * smoothstep(rDevAx - inDepth, rDevAx, dLat) * endK * inkOn);
  if (inkT > 0.0) {
    vec4 laH = lensOf(lensGradA, lensLaneA, lensModeA, laneColA, 0.0), lbH = lensOf(lensGradB, lensLaneB, lensModeB, laneColB, 0.0);
    vec3 baseH = mix(mix(color, laH.rgb, laH.a), mix(color, lbH.rgb, lbH.a), lensMix);
    vec3 inkH = mix(inkColor, celTubeBase(baseH) * mix(${F(CEL_STYLE.TUBE.INK_TONE)}, ${F(CEL_STYLE.TUBE.INK_TONE_DARK)}, tubeDark), ${F(CEL_STYLE.TUBE.INK_OWN)});
    c = mix(c, mix(inkH, inkColorCirc, circT), inkT);   // (a selected vessel's line is its own: the glow is a separate halo, glow.ts)
  }
  gl_FragColor = vec4(c, vFade);
}`;
