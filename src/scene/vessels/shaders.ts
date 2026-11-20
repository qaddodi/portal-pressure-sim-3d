// The vessel's own fragment shader: the cel look of materials/shaders.ts (banded light, rim, wet dot) with three things added.
//   1. The colour lens: a vessel wears the colour of the lens at each end (two textures, one texel per topology edge, 2 rows: upstream, downstream),
//      or lanes side by side for the Blood origin and First pass lenses. Two lenses are held and crossfaded by `lensMix`, so a lens switch is
//      one uniform tween on the clock, no CPU work per frame.
//   2. Moving blood: the 2D app's flow heads (chevron-glsl.js chevHead, blood-heads.js): a slim head with a notched back, 4 to 8 CSS px of half width,
//      one every 130 CSS px along the vessel (the spacing level 28 * 2^n units, coarser heads a subset of finer ones), riding the stream the CPU keeps
//      (streams.ts: distance, display speed, eased reversed flag); near-black on a light lumen and cream on a dark one, orange where reversed with a
//      second small head behind; stagnant blood in a big vein drifts as smoke.
//   3. Closed potential collaterals: a dotted thread (`dotted` 1) instead of a tube.
// 4. One draw per vessel (the draw-call budget): the geometry holds the tube twice (attribute `hull` 0 and 1). The body copy draws its front faces
//    as the toon pass; the hull copy, pushed out in screen pixels along its normal as INK_VS does, draws its back faces as the ink. Both copies
//    ride the same swell, so the ink hugs the lumen as it widens. The highlight (hiOn, hiDir, hiOffset, hiAhead, hiBehind, hiPx) and the lift
//    (`inflate`) are the scene's own uniforms with the same meaning as in INK_VS.

import { CIRCUIT_VS_CALL, CIRCUIT_VS_HEAD } from '../circuit/shader.ts';
import { FADE_GLSL } from '../materials/shaders.ts';
import { QUIET_BACK } from '../camera/quiet.ts';
import { CEL_STYLE } from '../cel-style.ts';
import { CEL_TUBE_GLSL, glslNum as F } from '../cel-glsl.ts';
import { TAPER_FROM, TAPER_TO } from './cel-ink.ts';

export const VESSEL_VS = /* glsl */ `
attribute vec3 tang;
attribute float hull;
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
uniform float hiOn;
uniform float hiDir;
uniform float hiOffset;
uniform float hiAhead;
uniform float hiBehind;
uniform float hiPx;
uniform float dpr;   // device pixels to a CSS pixel (the renderer's pixel ratio)
// the fade at a free end (2D's TIP_FADE, ART_FADE, FADE_DOWN_Y, FADE_IN, SIN_FADE): mode 1 runs along the vessel (uv.x), mode 2 down the figure (y), mode 3 along a line (the 2D linear mask, solid from the offset), mode 4 along a line with a dip (faintest at the offset, solid at the end); (from, to, alpha at from, alpha at to); fadeKeep 1: the Circuit does not let go of it
uniform float fadeMode;
uniform vec4 fadeA;
uniform vec4 fadeLine;   // modes 3 and 4: a line across the figure, scene (x1, y1, x2, y2); fadeA is then (offset, -, alpha at the start, alpha at the end)
uniform float fadeKeep;
varying float vFade;
varying vec3 vN;
varying vec3 vV;
varying vec3 vT;
varying vec2 vUv;
varying float vHull;
varying float vHi;
${CIRCUIT_VS_HEAD}
varying float vW;
varying float vR;
varying float vU;   // the figure's units in one scene unit here: 300 on the body, 1 / MAP_K on the map (the Circuit share of this vertex)
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
  vec3 p = aPos + aNor * (inflate + radius * rk * (swell * (1.0 - narrow) - 1.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * aNor);
  vT = normalize(normalMatrix * aTan);
  vV = normalize(-mv.xyz);
  vUv = uv;
  vHull = hull;
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
  vFade = fa;
  vHi = 0.0;
  vR = radius * rk * swell * vU;   // the tube's half width in the 2D figure's units
  vec4 c = projectionMatrix * mv;
  if (hull > 0.5) {
    float a = uv.x * len;
    float dist = hiDir > 0.5 ? hiOffset + a : (hiDir < -0.5 ? hiOffset + (len - a) : 0.0);
    float limit = hiDir < -0.5 ? hiBehind : hiAhead;
    vHi = hiOn * (1.0 - smoothstep(0.0, max(limit, 0.0001), dist));
    vec2 nd = (projectionMatrix * vec4(normalMatrix * aNor, 0.0)).xy;
    float l = length(nd);
    nd = l > 1e-5 ? nd / l : vec2(0.0);
    // the figure's line (cel-style.ts LINE_R, LINE_MIN, LINE_MAX; 2D's tube-cel-glsl.js CEL is 0.14, 1.5, 3): a share of the tube's radius held between two device px widths, the same on a hairline and on the portal trunk,
    // on a 1x Mac and a 3x iPhone (the line was a fixed 1.2 to 1.8 CSS px, 3.6 to 5.4 device px on a phone, a black rope on every thin strand)
    float wpc = c.w * 2.0 / (res.y * projectionMatrix[1][1]) * vU;   // the figure's units under one CSS px here
    float rDev = vR / max(wpc, 1e-6) * dpr;
    // (thinned with a lumen under LINE_MIN device px of radius, so the smallest branches keep their colour: cel-ink.ts inkTaper)
    float inkPx = clamp(${F(CEL_STYLE.LINE_R)} * rDev, ${F(CEL_STYLE.LINE_MIN)}, ${F(CEL_STYLE.LINE_MAX)}) * smoothstep(${F(TAPER_FROM)}, ${F(TAPER_TO)}, rDev) / dpr;
    c.xy += nd * (inkPx + hiPx * vHi) * 2.0 / res * c.w;
  }
  vW = c.w;
  gl_Position = c;
  // a tube of no radius (a strand a band has closed, a channel not yet grown) is not drawn: not even its ink, which has a width of its own on screen
  if (rk <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

export const VESSEL_FS = /* glsl */ `
${FADE_GLSL}
${CEL_TUBE_GLSL}
// a vessel behind the organs is drawn a second time over them with VEIL defined: the organ's veil (stage's VEIL_K 0.6: a vessel behind an organ shows at 0.4)
#ifdef VEIL
uniform float veilA;   // 0.4 while the vessel is veiled; eases to 1 as the cava is shown whole (drawn at no less than TUBE.VEIL_FLOOR: a vessel behind an organ stays a colour, never grey)
#define VEIL_A max(veilA, ${F(CEL_STYLE.TUBE.VEIL_FLOOR)})
#else
const float VEIL_A = 1.0;
#endif
uniform vec3 color;
uniform vec3 inkColor;
uniform float shadeK;
uniform vec3 light;
uniform float bands;
uniform float spec;
uniform float len;
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
uniform float lensSmooth;   // smooth joins on (1): the lens colour runs through the colours a third and two thirds along (grad rows 2 and 3), not straight from one end's to the other's
uniform float smokeOn;
uniform vec3 hiColor;
uniform float hullOn;
// smooth joins, as in the vertex shader: the ends that carry on into another vessel (x < 0 where nothing); their last stretch draws no ink, so no flat cut is outlined where a branch meets its trunk
uniform vec3 mate0;
uniform vec3 mate1;
uniform sampler2D streamTex;
uniform sampler2D chainTex;
uniform float projY;
uniform vec2 res;
uniform float dpr;
uniform float casingA;      // the look's casing alpha (2D --casing-a)
uniform float casingCircA;  // and in the Circuit (2D .stage-wrap.cmap), by circT
uniform vec3 inkColorCirc;
uniform float circT;
uniform vec2 circCap;       // the Circuit rounds this vessel's start / end (1): the ends nothing joins
uniform float wallLine;     // 1 on an artery: a lighter inner line, the wall, at a quarter of the radius in from the edge (visual review 10.5), so an artery reads apart from a vein without colour
uniform float quietK;       // quiet depth on a turn (camera/quiet.ts): the back tier eases toward the page by QUIET_BACK of this, 0 face on
uniform vec3 pageCol;       // the plate colour it eases toward
uniform vec4 rimInk;        // a dark lumen's light rim on the dark looks: rgb, alpha (0 on the light looks)
varying float vW;
varying float vR;
varying float vU;
varying float vHull;
varying float vFade;
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
float chevD(float u, float ay, float hw) {
  float L = 1.6 * hw, tip = 0.55 * L, back = -0.45 * L, notch = 0.32 * L, k = L / hw;
  float side = (u - tip + ay * k) / sqrt(1.0 + k * k);
  float rear = back + notch * (1.0 - clamp(ay / hw, 0.0, 1.0)) - u;
  return max(max(side, rear), ay - hw);
}
vec2 chevHead(float u, float ay, float hw, float px, float rev) {
  float d = chevD(u, ay, hw);
  float c = 1.0 - smoothstep(-0.7 * px, 0.7 * px, d);
  float rw = 1.8 * px + 0.1 * hw;   // the head's ring: a hard-edged outline of this width, never a halo
  float rim = 1.0 - smoothstep(rw - 0.7 * px, rw + 0.7 * px, d);
  if (rev > 0.0) {
    float d2 = 0.6 * chevD((u + 1.088 * hw) / 0.6, ay / 0.6, hw);
    c = max(c, rev * (1.0 - smoothstep(-0.7 * px, 0.7 * px, d2)));
    float rw2 = 1.8 * px + 0.06 * hw;
    rim = max(rim, rev * (1.0 - smoothstep(rw2 - 0.7 * px, rw2 + 0.7 * px, d2)));
  }
  return vec2(c, rim * (1.0 - c));
}
// how much of head j of the lattice of level n0 shows at level lv (coarser heads are a subset of finer ones; nothing jumps)
float chevKeep(float j, float n0, float lv) {
  float m = 0.0, q = abs(j);
  for (int i = 0; i < 10; i++) { if (q < 0.5 || mod(q, 2.0) > 0.5) break; q *= 0.5; m += 1.0; }
  if (q < 0.5) m = 10.0;
  return clamp(exp2(1.0 - (lv - n0 - m)) - 1.0, 0.0, 1.0);
}
// One vessel's heads placed by a stream's pattern (veins-gl.js chevOne): se = A + B s is the vessel's arc along that stream (B = 1, se = s for its own), Dm the stream's distance. The
// spacing is the zoom's, by the arc a head takes here (B), so a parcel that slows on entering a vessel bunches up as the blood does. ends: the weights of a link at the vessel's from and
// to end (above 0: a chained end, through which the heads run on instead of fading). Returns the head's coverage and its rim, already faded by its place and its lattice.
vec2 chevOne(float s, float Lw, float se, float Bm, float Dm, float vd, float rv, vec2 ends, float R, float across, float wpc, float Pt, float px) {
  float lv = max(-1.0, log2(Pt * max(abs(Bm), 0.05) / 28.0));
  float n0 = floor(lv), P = 28.0 * exp2(n0);
  float j = floor((se - Dm) / P + 0.5);
  float x = (se - (Dm + j * P)) / (abs(Bm) < 0.05 ? (Bm < 0.0 ? -0.05 : 0.05) : Bm), sc = s - x;
  float hw = min(0.6 * R, clamp(0.5 * R, 4.0 * wpc, 8.0 * wpc)), L = 1.6 * hw;   // (a head's half width is at most 0.6 of the tube's radius, so it and its ring stay inside the lumen)
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
  float u = vUv.x;
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

// A free end in the Circuit is round: the pixels outside a half circle of the tube's own radius at the end are carved away (the outline's hull the same, a line's width wider, so the ink runs round the cap).
// Exact at any ring spacing, which a geometry dome is not (a tube has a ring every 1/24 of a scene unit, about a radius).
bool capCarved(float across, bool hull) {
  float k = smoothstep(0.7, 1.0, circT);
  if (k <= 0.0 || circCap.x + circCap.y < 0.5) return false;
  float dd = 1e9;
  if (circCap.x > 0.5) dd = vUv.x * len * vU;
  if (circCap.y > 0.5) dd = min(dd, (1.0 - vUv.x) * len * vU);
  float wpc = vW * 2.0 / (res.y * projY) * vU;
  float rDev = vR / max(wpc, 1e-6) * dpr;
  float ink = hull ? clamp(${F(CEL_STYLE.LINE_R)} * rDev, ${F(CEL_STYLE.LINE_MIN)}, ${F(CEL_STYLE.LINE_MAX)}) / dpr * wpc : 0.0;
  float R = (vR + ink) * k, a = dd + ink * k;
  if (a >= R) return false;
  float q = 1.0 - a / R;
  return across * across + q * q > 1.0;
}

void main() {
  if (reveal < 0.9999 && vUv.x > reveal) discard;
  if (fadedOut()) discard;
  vec3 n = normalize(vN);
  // (a tube seen end on has no sideways direction: a fixed one keeps the fragment finite, never a NaN, which a device draws black)
  vec3 sideX = cross(normalize(vT), normalize(vV));
  float sideL = length(sideX);
  vec3 side = sideL > 1e-4 ? sideX / sideL : vec3(1.0, 0.0, 0.0);
  float across = dot(n, side);
  if (capCarved(across, vHull > 0.5)) discard;
  if (vHull > 0.5) {
    // the ink: the hull's back faces only, in the ink colour, warming to the highlight colour where the vessel is picked
    if (gl_FrontFacing || hullOn < 0.5) discard;
    // the outline in the look's casing colour at its alpha (2D: --casing-a, and the Circuit's own on the dark look (.stage-wrap.cmap), by the Circuit's share, whole on a vessel behind an organ too; a picked vessel's ring is solid)
    float ca = mix(casingA, casingCircA, circT);
    // a joined end is buried in its trunk: no ink on its last stretch, so the cut is never outlined
    float endU = min(mate0.x >= 0.0 ? vUv.x : 1e9, mate1.x >= 0.0 ? 1.0 - vUv.x : 1e9) * len * 300.0;
    if (endU < ${F(CEL_STYLE.TUBE.END_R)} * vR && vHi < 0.001) discard;
    // the line's colour: the look's casing ink taken most of the way to a deep tone of the vessel's own colour (never black, never white)
    vec4 laH = lensOf(lensGradA, lensLaneA, lensModeA, laneColA, 0.0), lbH = lensOf(lensGradB, lensLaneB, lensModeB, laneColB, 0.0);
    vec3 baseH = mix(mix(color, laH.rgb, laH.a), mix(color, lbH.rgb, lbH.a), lensMix);
    vec3 inkH = mix(inkColor, celTubeBase(baseH) * ${F(CEL_STYLE.TUBE.INK_TONE)}, ${F(CEL_STYLE.TUBE.INK_OWN)});
    gl_FragColor = vec4(mix(mix(inkH, inkColorCirc, circT), hiColor, clamp(vHi, 0.0, 1.0)), mix(ca, 1.0, clamp(vHi, 0.0, 1.0)) * VEIL_A * vFade);
    return;
  }
  if (!gl_FrontFacing) discard;
  if (dotted > 0.5) {
    // a closed potential collateral: a dotted thread along the tube's axis, nothing round it
    float dash = fract(vUv.x * len / 0.09);
    if (dash > 0.45) discard;
  }
  vec3 l = normalize((viewMatrix * vec4(light, 0.0)).xyz);

  vec4 la = lensOf(lensGradA, lensLaneA, lensModeA, laneColA, across);
  vec4 lb = lensOf(lensGradB, lensLaneB, lensModeB, laneColB, across);
  vec3 base = mix(mix(color, la.rgb, la.a), mix(color, lb.rgb, lb.a), lensMix);

  // the fill: exactly three FLAT tones across the tube, lit from the top left of the screen (cel-glsl.ts: shade, base, lit, a hard edge EDGE_PX device px across, no gradient), so two pieces of one vein shade alike at
  // their join and a turned vein keeps its tones; no rim, no world-lit band. rDev: the tube's radius in device px; the tones fade in over the radius (never across the tube) and a hairline is one tone.
  float wpc0 = vW * 2.0 / (res.y * projY) * vU;
  float rDev = vR / max(wpc0, 1e-6) * dpr;
  vec2 sideS = side.xy;
  float sl = length(sideS);
  sideS = sl > 1e-4 ? sideS / sl : vec2(1.0, 0.0);
  float kT = celTubeK(sideS);
  vec3 c = celTubeTone(base, across, kT, rDev);
  // the hard highlight: a flat pale streak on the lit side, at the middle of each stretch of the vessel (a long one has one every SPEC.PERIOD figure units, a short one has one), none on a hairline
  float lenU = len * vU, cntS = max(1.0, floor(lenU / ${F(CEL_STYLE.SPEC.PERIOD)} + 0.5));
  float alongR = (fract(vUv.x * cntS) - 0.5) * lenU / cntS / max(vR, 1e-4);
  c = mix(c, vec3(1.0), celTubeSpec(across, kT, rDev, alongR) * (dotted > 0.5 ? 0.0 : 1.0));
  // a dark lumen on the dark looks (where the outline is no darker than the ground) gets a light edge a device pixel wide just inside its wall, hard-edged (2D rimInk)
  float lumY = dot(base, vec3(0.299, 0.587, 0.114));
  c = mix(c, rimInk.rgb, rimInk.a * (1.0 - smoothstep(0.2, 0.4, lumY)) * (1.0 - smoothstep(1.0 - ${F(CEL_STYLE.EDGE_PX * 0.5)}, 1.0 + ${F(CEL_STYLE.EDGE_PX * 0.5)}, (1.0 - abs(across)) * rDev)) * celTubeHw(rDev));

  // (an artery's wall: a hard line a device pixel wide, 0.25 R inside the edge, 22% toward white, on a tube wide enough to carry it)
  c = mix(c, vec3(1.0), 0.22 * wallLine * smoothstep(3.0, 6.0, rDev) * (1.0 - smoothstep(0.5 - ${F(CEL_STYLE.EDGE_PX * 0.5)}, 0.5 + ${F(CEL_STYLE.EDGE_PX * 0.5)}, abs(abs(across) - 0.75) * rDev)));
  c = mix(c, pageCol, ${QUIET_BACK.toFixed(3)} * quietK);   // (0 for every tier but the back one)

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

  // the flow heads, over the lit lumen as the 2D composite lays them
  float pxArc = fwidth(vUv.x * len * vU);   // (a derivative: taken outside any branch)
  float acrossW = max(fwidth(across), 0.03);
  if (flowAmount > 0.001 && vR > 0.0) {
    vec4 stm = texelFetch(streamTex, ivec2(int(lensIndex), 0), 0);
    float Dm = stm.x, vd = stm.y, rv = stm.z;
    float wpc = vW * 2.0 / (res.y * projY) * vU;      // the figure's units under one CSS px here
    float R = max(vR, 0.3), Lw = len * vU, s = vUv.x * Lw;
    float px = clamp(pxArc, 0.15 * wpc, 1.5 * wpc);   // (held to a CSS pixel: at a grazing silhouette the arc's derivative runs away and would smear a head)
    float Pt = 130.0 * wpc;
    vec4 c4 = texelFetch(chainTex, ivec2(int(lensIndex), 0), 0), c5 = texelFetch(chainTex, ivec2(int(lensIndex), 1), 0);
    vec2 ch = vec2(0.0);
    if (c4.w < 1.0) ch = chevOne(s, Lw, s, 1.0, Dm, vd, rv, c5.xy, R, across, wpc, Pt, px);
    if (c4.w > 0.0) {
      float rootD = texelFetch(streamTex, ivec2(int(c4.x + 0.5) - 1, 0), 0).x;
      vec2 cc = chevOne(s, Lw, c4.y + c4.z * s, c4.z, rootD, vd, rv, c5.xy, R, across, wpc, Pt, px);
      ch = c4.w >= 1.0 ? cc : mix(ch, cc, c4.w);
    }
    float hwv = min(0.6 * R, clamp(0.5 * R, 4.0 * wpc, 8.0 * wpc));
    // heads come in only on a tube wide enough to carry one that reads as a head (half width 3.5 CSS px, so R from 5.8 px: a smaller one is a dot), and are cut a little inside the wall (never on the ink or the edge)
    float fade = flowAmount * smoothstep(5.8 * wpc, 7.0 * wpc, R) * (1.0 - smoothstep(0.78, 0.78 + acrossW, abs(across)));
    fade *= mix(0.3, 1.0, smoothstep(0.5, 3.0, abs(vd)));
    if (fade > 0.0 && ch.x + ch.y > 0.0) {
      float origin = mix(lensModeA > 1.5 ? 1.0 : 0.0, lensModeB > 1.5 ? 1.0 : 0.0, lensMix);
      // one flat tone for the head, never a grey halfway: dark ink on a light lumen, cream on a dark one, decided by a hard step on the lumen's luminance (2D blended over 0.175 to 0.205, which on a mid lavender is a grey head)
      float dk = 1.0 - step(0.19, dot(pow(max(base, vec3(0.0)), vec3(2.2)), vec3(0.2126, 0.7152, 0.0722)));
      float rk = rv * (1.0 - origin), warm = rk * chevOrange(base);
      vec3 ink = mix(markDark, base * 0.3, 0.2);
      vec3 core = mix(mix(mix(ink, markLight, dk), markRev, rk), markLight, warm);
      vec3 rimc = vec3(0.2314, 0.1725, 0.1333);   // the head's outline is always the dark ink: a flat head with a dark line, never a pale ring
      float ar = clamp(ch.y * 0.75 * fade, 0.0, 1.0), ac = clamp(ch.x * fade, 0.0, 1.0);
      float ha = ac + ar * (1.0 - ac);
      c = c * (1.0 - ha) + core * ac + rimc * ar * (1.0 - ac);
    }
  }
  gl_FragColor = vec4(c, VEIL_A * vFade);
}`;
