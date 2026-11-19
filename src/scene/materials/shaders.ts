// GLSL for the cel look (look-and-feel.md sections 2, 3, 9). Ported from the slice mocks, with the flow marks and the per-vessel data
// texture added. Plain strings so the unit tests can check them without a GPU; `node scripts/glsl-compile.mjs` compiles them in
// software WebGL2 (the one headless step the owner allows, and only on about:blank).

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

export const TOON_VS = /* glsl */ `
attribute vec3 tang;
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
  gl_Position = projectionMatrix * mv;
}`;

export const TOON_FS = /* glsl */ `
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
uniform float fade;
uniform float flowAmount;
uniform float flowBands;
uniform vec3 markColor;
uniform vec3 markReversed;
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
  if (reveal < 0.9999 && vUv.x > reveal) discard;
  vec3 n = normalize(vN);
  vec3 l = normalize((viewMatrix * vec4(light, 0.0)).xyz);
  float d = dot(n, l) * 0.5 + 0.5;
  float q = d * bands;
  float f = fract(q);
  float w = fwidth(q) * 0.75;
  float b = (floor(q) + smoothstep(0.5 - w, 0.5 + w, f)) / bands;
  vec3 c = mix(shade, color, clamp(b, 0.0, 1.0));
  float ndv = max(dot(n, vV), 0.0);
  float rim = smoothstep(0.66, 0.70, 1.0 - ndv) * step(0.5, d);
  float sp = spec * smoothstep(0.962, 0.972, max(dot(reflect(-l, n), vV), 0.0));

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
  c += rim * 0.10 + sp * 0.32;
  gl_FragColor = vec4(c, fade);
}`;

export const INK_VS = /* glsl */ `
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
  vHi = hiOn * (1.0 - smoothstep(0.0, max(limit, 0.0001), dist));
  vec2 nd = (projectionMatrix * vec4(normalMatrix * normal, 0.0)).xy;
  float l = length(nd);
  nd = l > 1e-5 ? nd / l : vec2(0.0);
  c.xy += nd * (px + hiPx * vHi) * 2.0 / res * c.w;
  gl_Position = c;
}`;

export const INK_FS = /* glsl */ `
uniform vec3 color;
uniform vec3 hiColor;
uniform float reveal;
uniform float fade;
varying float vHi;
varying float vU;
void main() { if (reveal < 0.9999 && vU > reveal) discard; gl_FragColor = vec4(mix(color, hiColor, clamp(vHi, 0.0, 1.0)), fade); }`;
