// GLSL for the cel look (look-and-feel.md sections 2, 3, 9). Ported from the slice mocks, with the flow marks and the per-vessel data
// texture added. Plain strings so the unit tests can check them without a GPU; `node scripts/glsl-compile.mjs` compiles them in
// software WebGL2 (the one headless step the owner allows, and only on about:blank).
import { CEL_LIGHT_GLSL, CEL_TUBE_GLSL } from '../cel-glsl.ts';

/** Texel layout of the per-vessel data texture, written by src/engine/vessel-data.ts (one texel per topology edge, RGBA32F, nearest). */
export const VESSEL_TEXEL = {
  /** Pressure at the vessel's upstream end, mmHg. */
  r: 'upstreamPressure',
  /** Flow in mL/s along the edge's own direction (from to to); negative = reversed. */
  g: 'flow',
  /** Diameter, mm. */
  b: 'diameter',
  /** Pressure at the downstream end, mmHg. */
  a: 'downstreamPressure',
} as const;

/** The dive's dissolve: a part fades by dropping a growing share of its pixels in a fixed screen pattern (interleaved gradient noise), so an object can be there, half there
 *  and gone with no alpha and no sorting, and never pops. `fade` 1 draws everything (one compare), 0 nothing. The toon, ink and vessel passes use the same pattern, so an
 *  object's ink goes with its fill. */
export const FADE_GLSL = /* glsl */ `
uniform float fade;
bool fadedOut() { return fade < 0.999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= fade; }
// A tube drawing on or retracting along its length (\`reveal\`, 0 to 1 over u): the front is a soft gradient, a tenth of the length, dissolved in the same screen pattern, never a hard cut.
bool frontOut(float u, float rv) {
  if (rv >= 0.9999) return false;
  float k = clamp((rv * 1.1 - u) / 0.1, 0.0, 1.0);
  return k < 0.999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= k;
}
`;

export const TOON_VS = /* glsl */ `
attribute vec3 tang;
#ifdef VERTEX_INK
attribute vec3 ink;
varying vec3 vInk;
#endif
uniform float inflate;
uniform sampler2D vdata;
uniform vec2 vdataSize;
uniform float vindex;
uniform float useData;
uniform float radius;
uniform float baseD;
varying vec3 vN;
varying vec3 vV;
varying vec3 vT;
varying vec2 vUv;
void main() {
  // the lumen swells and narrows with the engine's diameter against its healthy one, never more than 35% either way
  float swell = 1.0;
  if (useData > 0.5) {
    ivec2 tc = ivec2(int(mod(vindex, vdataSize.x)), int(floor(vindex / vdataSize.x)));
    swell = clamp(texelFetch(vdata, tc, 0).b / max(baseD, 0.01), 0.65, 1.35);
  }
  vec3 p = position + normal * (inflate + radius * (swell - 1.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal);
  vT = normalize(normalMatrix * tang);
  vV = normalize(-mv.xyz);
  vUv = uv;
#ifdef VERTEX_INK
  vInk = ink;
#endif
  gl_Position = projectionMatrix * mv;
}`;

export const TOON_FS = /* glsl */ `
${FADE_GLSL}
uniform float tubeDark;   // 1 on the dark looks: brighter tube caps (cel-glsl.ts celTubeBase)
#ifdef TUBE_TONES
${CEL_TUBE_GLSL}
${CEL_LIGHT_GLSL}
#endif
uniform vec3 color;
uniform vec3 shade;
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
uniform vec3 markColor;
uniform vec3 markReversed;
// a part that carries its own colour at each vertex (the lobule's vessels wear the colour lens along their length): the vertex colour in place of the tone, its shade a fixed share of it
uniform float inkShade;
uniform float inkAmount;
#ifdef VERTEX_INK
varying vec3 vInk;
#endif
varying vec3 vN;
varying vec3 vV;
varying vec3 vT;
varying vec2 vUv;

// marks per second from the engine's flow in mL/s: the same curve as markSpeed() in flow.ts
float markSpeed(float q) {
  float a = abs(q);
  if (a < 0.05) return 0.0;
  return sign(q) * (0.3 + 0.55 * sqrt(min(a, 60.0) / 20.0));
}

float flowMask(float speed, float across) {
  // arc length in marks: one mark every 0.45 world units
  float a = vUv.x * len / 0.45;
  float dir = speed >= 0.0 ? 1.0 : -1.0;
  if (flowBands < 0.5) {
    // chevrons pointing the way the blood goes; the tip is the centre of the visible tube
    float q = fract(a + dir * abs(across) * 0.55 - time * speed);
    float w = 0.2;
    return smoothstep(0.0, 0.05, q) * (1.0 - smoothstep(w, w + 0.05, q));
  }
  // soft bands straight across
  float m = fract(a - time * speed);
  return smoothstep(0.0, 0.06, m) * (1.0 - smoothstep(0.16, 0.24, m));
}

void main() {
  // EVERY derivative here is taken before the first discard (a quad whose other pixels were dropped gives a garbage fwidth on a device that drops the lane: specks, Mohammad 20 Nov; tests/no-derivative-after-discard.test.ts)
  vec3 n = normalize(vN);
  vec3 l = normalize((viewMatrix * vec4(light, 0.0)).xyz);   // the world light turned by the camera: a world-fixed n.L
  float d = dot(n, l) * 0.5 + 0.5;
  float q = d * bands;
  float f = fract(q);
  float w = fwidth(q) * 0.75;
#ifdef TUBE_TONES
  vec3 sideX = cross(normalize(vT), normalize(vV));
  float sideL = length(sideX);
  vec3 side0 = sideL > 1e-4 ? sideX / sideL : vec3(1.0, 0.0, 0.0);
  float across0 = dot(n, side0);
  float fwAcross0 = fwidth(across0);
  float sT0 = dot(n, celLightView());
  float fwS0 = fwidth(sT0);
#endif
  if (frontOut(vUv.x, reveal)) discard;
  if (fadedOut()) discard;
  float b = (floor(q) + smoothstep(0.5 - w, 0.5 + w, f)) / bands;
  vec3 base = color;
  vec3 sh = shade;
#ifdef VERTEX_INK
  base = mix(color, vInk, inkAmount);
  sh = mix(shade, vInk * inkShade, inkAmount);
#endif
#ifdef TUBE_TONES
  // a tube of the vessels' own look (a plexus strand, a varix): the two tones lit by the one WORLD light (n.L, cel-glsl.ts celLightView: the camera never changes a shade), as vessels/shaders.ts does, so a varix
  // beside its vein shades as the vein does. rDev, the radius in device px, is read from how fast across changes (it is the lateral position over the radius).
  float rDev0 = 1.0 / max(fwAcross0, 1e-3);
  vec3 c = celTubeTone(base, sT0, fwS0, rDev0);
#else
  vec3 c = mix(sh, base, clamp(b, 0.0, 1.0));
#endif
  // (no rim light and no specular: both turned with the eye, so a tilt or an orbit changed a catheter's or a strand's shading, and the look is matte, Mohammad 20 Nov 2026; spec stays a uniform, unused; rim and sp stay as zero so the lobule's patch point holds)
  float rim = 0.0, sp = 0.0;

  if (flowAmount > 0.001) {
    float speed = stubSpeed;
    if (useData > 0.5) {
      ivec2 tc = ivec2(int(mod(vindex, vdataSize.x)), int(floor(vindex / vdataSize.x)));
      speed = markSpeed(texelFetch(vdata, tc, 0).g);
    }
    float amount = abs(speed) < 0.02 ? 0.0 : flowAmount;
    // lateral position of this pixel across the tube as seen, -1 to 1: the normal against the sideways direction on screen
    vec3 side = normalize(cross(normalize(vT), normalize(vV)));
    float across = dot(n, side);
    float m = flowMask(speed, across) * amount;
    vec3 mc = speed < 0.0 ? markReversed : markColor;
    c = mix(c, mc, m * (flowBands > 0.5 ? 0.30 : 0.85));
  }
#ifndef TUBE_TONES
  c += rim * 0.10 + sp * 0.32;
#endif
  gl_FragColor = vec4(c, 1.0);
}`;

/** "No outer end here": the highlight's distance to an end the vein does not have (it runs on into another piece of the same vein). */
export const HI_NONE = 1e3;

/** How much of its push an outline hull vertex takes (0..1): the share of its normal that lies sideways on screen. A vertex whose normal faces the eye has a near-zero screen direction (a few
 *  thousandths, noise), and normalising that sent it the full width in a random direction: under a wide line (a tapped organ's glow, 26 figure units) those vertices drew pale hair across the
 *  face of the organ, Mohammad 20 Nov: "streaks on the liver when I highlight the outline". Only what faces sideways is pushed (the same rule as micro3d/cel3d.ts); the rest stays hidden under the fill. */
export const INK_RIM_GLSL = /* glsl */ `
float inkRim(vec3 n) { vec3 v = normalMatrix * n; float l = length(v); return l > 1e-6 ? smoothstep(0.2, 0.6, length(v.xy) / l) : 0.0; }`;

export const INK_VS = /* glsl */ `
${INK_RIM_GLSL}
uniform float inflate;
uniform float px;
uniform vec2 res;
uniform float len;
// highlight: hiDir +1 downstream of the pick, -1 upstream, 0 the picked vessel itself, hiOn 0 when nothing is picked
uniform float hiOn;
uniform float hiDir;
uniform float hiOffset;
uniform float hiAhead;
uniform float hiBehind;
uniform vec2 hiEnds;   // the picked vein's own outline: its distance to the vein's outer start and outer end (HI_NONE: that end runs on, no fade)
uniform float hiFade;  // how far in from an outer end the outline takes to come to full
uniform float hiPx;
varying float vHi;
varying float vU;
void main() {
  vec3 p = position + normal * inflate;
  vec4 c = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  vU = uv.x;
  float a = uv.x * len;
  float dist = hiDir > 0.5 ? hiOffset + a : (hiDir < -0.5 ? hiOffset + (len - a) : 0.0);
  float limit = hiDir < -0.5 ? hiBehind : hiAhead;
  float own = smoothstep(0.0, max(hiFade, 0.0001), min(hiEnds.x + a, hiEnds.y + (len - a)));
  vHi = hiOn * (abs(hiDir) > 0.5 ? 1.0 - smoothstep(0.0, max(limit, 0.0001), dist) : own);
  vec2 nd = (projectionMatrix * vec4(normalMatrix * normal, 0.0)).xy;
  float l = length(nd);
  nd = l > 1e-5 ? nd / l : vec2(0.0);
  c.xy += nd * (px + hiPx * vHi) * inkRim(normal) * 2.0 / res * c.w;
  gl_Position = c;
}`;

export const INK_FS = /* glsl */ `
${FADE_GLSL}
uniform vec3 color;
uniform vec3 hiColor;
uniform float reveal;
uniform float inkA;   // the line's own alpha: 1 for an organ's or a part's solid ink, the look's casing alpha for a strand (setSoftInk)
varying float vHi;
varying float vU;
#ifdef INK_EDGE
// an organ's outline (layer.ts defines it): the hull is built one device pixel wider, and its coverage ramps from its outer edge over the next pixel and a half (vRd is steps in from the rim, so vRd over its
// own screen gradient is the distance in device pixels), so the edge is anti-aliased by arithmetic: half covered a pixel in from the raster edge, which is the line's true edge
varying float vRd;
#endif
void main() {
  float cov = 1.0;
#ifdef INK_EDGE
  cov = clamp(vRd / max(length(vec2(dFdx(vRd), dFdy(vRd))), 1e-5) - 0.5, 0.0, 1.0);   // (the derivative before the discards: tests/no-derivative-after-discard.test.ts)
#endif
  if (frontOut(vU, reveal)) discard; if (fadedOut()) discard;
  gl_FragColor = vec4(mix(color, hiColor, clamp(vHi, 0.0, 1.0)), mix(inkA, 1.0, clamp(vHi, 0.0, 1.0)) * cov);
}`;
