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

export const VESSEL_VS = /* glsl */ `
attribute vec3 tang;
attribute float hull;
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
uniform float hiOn;
uniform float hiDir;
uniform float hiOffset;
uniform float hiAhead;
uniform float hiBehind;
uniform float hiPx;
varying vec3 vN;
varying vec3 vV;
varying vec3 vT;
varying vec2 vUv;
varying float vHull;
varying float vHi;
${CIRCUIT_VS_HEAD}
varying float vW;
varying float vR;
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
  vec3 p = aPos + aNor * (inflate + radius * (swell - 1.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * aNor);
  vT = normalize(normalMatrix * aTan);
  vV = normalize(-mv.xyz);
  vUv = uv;
  vHull = hull;
  vHi = 0.0;
  vR = radius * swell * 300.0;   // the tube's half width in the 2D figure's units
  vec4 c = projectionMatrix * mv;
  if (hull > 0.5) {
    float a = uv.x * len;
    float dist = hiDir > 0.5 ? hiOffset + a : (hiDir < -0.5 ? hiOffset + (len - a) : 0.0);
    float limit = hiDir < -0.5 ? hiBehind : hiAhead;
    vHi = hiOn * (1.0 - smoothstep(0.0, max(limit, 0.0001), dist));
    vec2 nd = (projectionMatrix * vec4(normalMatrix * aNor, 0.0)).xy;
    float l = length(nd);
    nd = l > 1e-5 ? nd / l : vec2(0.0);
    c.xy += nd * (px + hiPx * vHi) * 2.0 / res * c.w;
  }
  vW = c.w;
  gl_Position = c;
}`;

export const VESSEL_FS = /* glsl */ `
${FADE_GLSL}
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
uniform float smokeOn;
uniform vec3 hiColor;
uniform float hullOn;
uniform sampler2D streamTex;
uniform float projY;
uniform vec2 res;
varying float vW;
varying float vR;
varying float vHull;
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
  float rim = 1.0 - smoothstep(0.0, 1.8 * px + 0.1 * hw, d);
  if (rev > 0.0) {
    float d2 = 0.6 * chevD((u + 1.088 * hw) / 0.6, ay / 0.6, hw);
    c = max(c, rev * (1.0 - smoothstep(-0.7 * px, 0.7 * px, d2)));
    rim = max(rim, rev * (1.0 - smoothstep(0.0, 1.8 * px + 0.06 * hw, d2)));
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
  if (mode < 1.5) return vec4(mix(g0.rgb, g1.rgb, t), 1.0);
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

void main() {
  if (reveal < 0.9999 && vUv.x > reveal) discard;
  if (fadedOut()) discard;
  if (vHull > 0.5) {
    // the ink: the hull's back faces only, in the ink colour, warming to the highlight colour where the vessel is picked
    if (gl_FrontFacing || hullOn < 0.5) discard;
    gl_FragColor = vec4(mix(inkColor, hiColor, clamp(vHi, 0.0, 1.0)), 1.0);
    return;
  }
  if (!gl_FrontFacing) discard;
  if (dotted > 0.5) {
    // a closed potential collateral: a dotted thread along the tube's axis, nothing round it
    float dash = fract(vUv.x * len / 0.09);
    if (dash > 0.45) discard;
  }
  vec3 n = normalize(vN);
  vec3 l = normalize((viewMatrix * vec4(light, 0.0)).xyz);
  vec3 side = normalize(cross(normalize(vT), normalize(vV)));
  float across = dot(n, side);

  vec4 la = lensOf(lensGradA, lensLaneA, lensModeA, laneColA, across);
  vec4 lb = lensOf(lensGradB, lensLaneB, lensModeB, laneColB, across);
  vec3 base = mix(mix(color, la.rgb, la.a), mix(color, lb.rgb, lb.a), lensMix);

  vec3 shade = mix(base * shadeK, inkColor, 0.08);
  float d = dot(n, l) * 0.5 + 0.5;
  float q = d * bands;
  float f = fract(q);
  float w = fwidth(q) * 0.75;
  float b = (floor(q) + smoothstep(0.5 - w, 0.5 + w, f)) / bands;
  vec3 c = mix(shade, base, clamp(b, 0.0, 1.0));
  float ndv = max(dot(n, vV), 0.0);
  float rim = smoothstep(0.66, 0.70, 1.0 - ndv) * step(0.5, d);
  float sp = spec * smoothstep(0.962, 0.972, max(dot(reflect(-l, n), vV), 0.0));

  float vel = 0.0;
  float dmm = 8.0;
  if (useData > 0.5) {
    ivec2 tc = ivec2(int(mod(vindex, vdataSize.x)), int(floor(vindex / vdataSize.x)));
    vec4 td = texelFetch(vdata, tc, 0);
    dmm = td.b;
    vel = meanVelocity(td.g, dmm);
  }

  // stagnant blood in a big vein: slow, but not none (FLOW_CUTS none 1, stasis 9 cm/s), drifts as smoke
  if (smokeOn > 0.5 && useData > 0.5 && dmm > 5.0 && abs(vel) > 1.0 && abs(vel) < 9.0) {
    float drift = time * 0.04;
    float nz = vnoise(vec2(vUv.x * len * 5.0 + drift * 6.0, across * 3.0 + drift)) * 0.65 + vnoise(vec2(vUv.x * len * 11.0 - drift * 4.0, across * 6.0)) * 0.35;
    float amt = (1.0 - smoothstep(1.0, 9.0, abs(vel))) * 0.5 + 0.12;
    c = mix(c, mix(base, vec3(lum(base) > 0.5 ? 0.15 : 0.92), 0.5), nz * amt * 0.55);
  }

  c += rim * 0.10 + sp * 0.32;

  // the flow heads, over the lit lumen as the 2D composite lays them
  float pxArc = fwidth(vUv.x * len * 300.0);   // (a derivative: taken outside any branch)
  if (flowAmount > 0.001 && vR > 0.0) {
    vec4 stm = texelFetch(streamTex, ivec2(int(lensIndex), 0), 0);
    float Dm = stm.x, vd = stm.y, rv = stm.z;
    float wpc = vW * 2.0 / (res.y * projY) * 300.0;      // the figure's units under one CSS px here
    float R = max(vR, 0.3), Lw = len * 300.0, s = vUv.x * Lw;
    float px = max(pxArc, 0.15 * wpc);
    float Pt = 130.0 * wpc;
    float lv = max(-1.0, log2(Pt / 28.0));
    float n0 = floor(lv), P = 28.0 * exp2(n0);
    float j = floor((s - Dm) / P + 0.5), sc = Dm + j * P;
    float hw = min(0.8 * R, clamp(0.5 * R, 4.0 * wpc, 8.0 * wpc)), L = 1.6 * hw;
    float lo = 0.6 * L, ramp = max(2.0 * L, 0.12 * Pt), e = min(sc, Lw - sc);
    float fade = e < lo ? 0.0 : smoothstep(lo, lo + ramp, e);
    fade *= chevKeep(j, n0, lv) * flowAmount * smoothstep(1.5 * wpc, 2.5 * wpc, R) * smoothstep(0.85 * hw, 1.15 * hw, R);
    fade *= mix(0.3, 1.0, smoothstep(0.5, 3.0, abs(vd)));
    if (fade > 0.0) {
      float dir = vd != 0.0 ? sign(vd) : (rv > 0.5 ? -1.0 : 1.0);
      vec2 ch = chevHead(dir * (s - sc), abs(across) * R, hw, px, rv);
      float origin = mix(lensModeA > 1.5 ? 1.0 : 0.0, lensModeB > 1.5 ? 1.0 : 0.0, lensMix);
      float dk = 1.0 - smoothstep(0.175, 0.205, dot(pow(max(base, vec3(0.0)), vec3(2.2)), vec3(0.2126, 0.7152, 0.0722)));
      float rk = rv * (1.0 - origin), warm = rk * chevOrange(base);
      vec3 ink = mix(markDark, base * 0.3, 0.2);
      vec3 core = mix(mix(mix(ink, markLight, dk), markRev, rk), markLight, warm);
      vec3 rimc = mix(vec3(0.2314, 0.1725, 0.1333), markLight, dk);
      float ar = clamp(ch.y * 0.75 * fade, 0.0, 1.0), ac = clamp(ch.x * fade, 0.0, 1.0);
      float ha = ac + ar * (1.0 - ac);
      c = c * (1.0 - ha) + core * ac + rimc * ar * (1.0 - ac);
    }
  }
  gl_FragColor = vec4(c, 1.0);
}`;
