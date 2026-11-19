// The organs' own fill: 2D's three-tone organ painter (the #og-<organ> gradient, the og-vol radial, the inner shade strokes s1..s3 and the top-left rim light),
// laid on the page at the organ layer's opacity (atlas-look-plan.md 2.5 and 2.6). The layer is pre-mixed against the page in the shader, so it is opaque:
// no blending and no sorting, and a front organ hides the one behind as the depth says. Plain strings so the tests can read them without a GPU.
import { FADE_GLSL } from '../materials/shaders.ts';

export const ORGAN_VS = /* glsl */ `
#ifdef VERTEX_INK
attribute vec3 ink;
varying vec3 vInk;
#endif
uniform vec4 box;
varying vec3 vN;
varying vec3 vV;
varying vec2 vBox;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  // where this point sits in the organ's own 2D box: (0,0) top left, (1,1) bottom right, as the SVG gradient's objectBoundingBox
  vBox = vec2((position.x - box.x) / max(box.z, 1e-5), (box.y - position.y) / max(box.w, 1e-5));
#ifdef VERTEX_INK
  vInk = ink;
#endif
  gl_Position = projectionMatrix * mv;
}`;

export const ORGAN_FS = /* glsl */ `
${FADE_GLSL}
uniform vec3 o1;
uniform vec3 o2;
uniform vec3 color;
uniform vec4 ogLight;
uniform vec4 ogDark;
uniform vec4 volShade;
uniform vec3 page;
uniform float layer;
uniform float inkAmount;
#ifdef VERTEX_INK
varying vec3 vInk;
#endif
varying vec3 vN;
varying vec3 vV;
varying vec2 vBox;
void main() {
  if (fadedOut()) discard;
  vec3 n = normalize(vN);
  // the gradient from the box's (.15,0) to (.85,1)
  vec2 g = vec2(0.7, 1.0);
  float t = clamp(dot(vBox - vec2(0.15, 0.0), g) / dot(g, g), 0.0, 1.0);
  vec3 fill = mix(o1, o2, t);
#ifdef VERTEX_INK
  // what varies over the surface (nodules, the dead spleen, the pool) moves the fill by as much as it moves the organ's one colour
  fill += (vInk - color) * inkAmount;
#endif
  // og-vol: light at (.34,.26), the volume shade toward the rim
  float r = clamp(distance(vBox, vec2(0.34, 0.26)) / 0.78, 0.0, 1.0);
  fill = mix(fill, ogLight.rgb, ogLight.a * 0.4 * (1.0 - r) * (1.0 - r));
  fill = mix(fill, volShade.rgb, 0.17 * volShade.a * smoothstep(0.55, 1.0, r));
  // the inner shade: three soft steps of the turn away from the eye (2D strokes 30/18/8 px at .09/.15/.24)
  float ndv = clamp(dot(n, normalize(vV)), 0.0, 1.0);
  float turn = 1.0 - ndv;
  float w = max(fwidth(turn), 1e-4);
  float s = 0.09 * smoothstep(0.45 - w, 0.45 + w, turn) + 0.15 * smoothstep(0.68 - w, 0.68 + w, turn) + 0.24 * smoothstep(0.86 - w, 0.86 + w, turn);
  fill = mix(fill, ogDark.rgb, s * ogDark.a / 0.26);
  // the rim light on the edge that faces the top left
  vec2 side = length(n.xy) > 1e-4 ? normalize(n.xy) : vec2(0.0);
  float lit = smoothstep(0.62, 0.8, turn) * clamp(dot(side, vec2(-0.6, 0.8)), 0.0, 1.0);
  fill = mix(fill, ogLight.rgb, ogLight.a * 0.58 * lit);
  gl_FragColor = vec4(mix(page, fill, layer), 1.0);
}`;
