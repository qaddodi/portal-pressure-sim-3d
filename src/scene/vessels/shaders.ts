// The vessel's own fragment shader: the cel look of materials/shaders.ts (banded light, rim, wet dot) with three things added.
//   1. The colour lens: a vessel wears the colour of the lens at each end (two textures, one texel per topology edge, 2 rows: upstream, downstream),
//      or lanes side by side for the Blood origin and First pass lenses. Two lenses are held and crossfaded by `lensMix`, so a lens switch is
//      one uniform tween on the clock, no CPU work per frame.
//   2. Moving blood: chevrons or soft bands at the Doppler's own speed (sqrt of mean velocity, standing under 0.25 cm/s), orange where
//      the flow runs backward, black or cream by the colour under them; stagnant blood in a big vein drifts as smoke.
//   3. Closed potential collaterals: a dotted thread (`dotted` 1) instead of a tube.
// 4. One draw per vessel (the draw-call budget): the geometry holds the tube twice (attribute `hull` 0 and 1). The body copy draws its front faces
//    as the toon pass; the hull copy, pushed out in screen pixels along its normal as INK_VS does, draws its back faces as the ink. Both copies
//    ride the same swell, so the ink hugs the lumen as it widens. The highlight (hiOn, hiDir, hiOffset, hiAhead, hiBehind, hiPx) and the lift
//    (`inflate`) are the scene's own uniforms with the same meaning as in INK_VS.

import { CIRCUIT_VS_CALL, CIRCUIT_VS_HEAD } from '../circuit/shader.ts';

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
void main() {
${CIRCUIT_VS_CALL}
  float swell = 1.0;
  if (useData > 0.5) {
    ivec2 tc = ivec2(int(mod(vindex, vdataSize.x)), int(floor(vindex / vdataSize.x)));
    swell = clamp(texelFetch(vdata, tc, 0).b / max(baseD, 0.01), 0.65, 1.35);
  }
  vec3 p = aPos + aNor * (inflate + radius * (swell - 1.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * aNor);
  vT = normalize(normalMatrix * aTan);
  vV = normalize(-mv.xyz);
  vUv = uv;
  vHull = hull;
  vHi = 0.0;
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
  gl_Position = c;
}`;

export const VESSEL_FS = /* glsl */ `
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
// display speed of the blood: sqrt of the velocity, rising from rest between 0.25 and 0.6 cm/s (blood.js displaySpeed), then marks per second
float markSpeedOf(float v) {
  float a = abs(v);
  return sign(v) * 0.26 * sqrt(a) * smoothstep(0.25, 0.6, a);
}

float flowMask(float speed, float across) {
  float a = vUv.x * len / 0.45;
  float dir = speed >= 0.0 ? 1.0 : -1.0;
  if (flowBands < 0.5) {
    float q = fract(a + dir * abs(across) * 0.55 - time * speed);
    float w = 0.2;
    return smoothstep(0.0, 0.05, q) * (1.0 - smoothstep(w, w + 0.05, q));
  }
  float m = fract(a - time * speed);
  return smoothstep(0.0, 0.06, m) * (1.0 - smoothstep(0.16, 0.24, m));
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

  float speed = stubSpeed;
  float vel = 0.0;
  float dmm = 8.0;
  if (useData > 0.5) {
    ivec2 tc = ivec2(int(mod(vindex, vdataSize.x)), int(floor(vindex / vdataSize.x)));
    vec4 td = texelFetch(vdata, tc, 0);
    dmm = td.b;
    vel = meanVelocity(td.g, dmm);
    speed = markSpeedOf(vel);
  }

  // stagnant blood in a big vein: slow, but not none (FLOW_CUTS none 1, stasis 9 cm/s), drifts as smoke
  if (smokeOn > 0.5 && useData > 0.5 && dmm > 5.0 && abs(vel) > 1.0 && abs(vel) < 9.0) {
    float drift = time * 0.04;
    float nz = vnoise(vec2(vUv.x * len * 5.0 + drift * 6.0, across * 3.0 + drift)) * 0.65 + vnoise(vec2(vUv.x * len * 11.0 - drift * 4.0, across * 6.0)) * 0.35;
    float amt = (1.0 - smoothstep(1.0, 9.0, abs(vel))) * 0.5 + 0.12;
    c = mix(c, mix(base, vec3(lum(base) > 0.5 ? 0.15 : 0.92), 0.5), nz * amt * 0.55);
  }

  if (flowAmount > 0.001) {
    float amount = abs(speed) < 0.02 ? 0.0 : flowAmount;
    float m = flowMask(speed, across) * amount;
    float L = lum(base);
    vec3 mc = L > 0.36 ? markDark : markLight;
    if (speed < 0.0) mc = abs(L - lum(markRev)) > 0.22 ? markRev : (L > 0.5 ? vec3(0.23, 0.08, 0.0) : vec3(1.0, 0.93, 0.86));
    c = mix(c, mc, m * (flowBands > 0.5 ? 0.30 : 0.85));
  }
  c += rim * 0.10 + sp * 0.32;
  gl_FragColor = vec4(c, 1.0);
}`;
