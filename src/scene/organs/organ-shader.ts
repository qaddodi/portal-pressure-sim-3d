// The organs' own fill: 2D's three-tone organ painter (the #og-<organ> gradient, the og-vol radial, the inner shade strokes s1..s3 and the top-left rim light),
// laid at the organ layer's opacity over whatever is behind (atlas-look-plan.md 2.5 and 2.6; the visual review's 2.1 to 2.4). layer.ts blends the organs in 2D's order,
// each once per pixel, so they show through each other as 2D's groups do. Plain strings so the tests can read them without a GPU.
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
  // (2D's #ogVol, stage.js: light out to r = .46 of the box, shade from .74 to .92)
  float r = distance(vBox, vec2(0.34, 0.26)) / 0.92;
  fill = mix(fill, ogLight.rgb, ogLight.a * 0.22 / 0.55 * (1.0 - clamp(r / 0.5, 0.0, 1.0)));
  fill = mix(fill, volShade.rgb, volShade.a * 0.17 * clamp((r - 0.8) / 0.2, 0.0, 1.0));
  // the inner shade: three soft steps of the turn away from the eye (2D strokes 30/18/8 px at .09/.15/.24)
  float ndv = clamp(dot(n, normalize(vV)), 0.0, 1.0);
  float turn = 1.0 - ndv;
  float w = max(fwidth(turn), 1e-4);
  // the steps stack as 2D's strokes do (each over the last), at og-dark's own alpha, and sit on the lower right edge: 2D moves its shade
  // strokes by (-3.5, -5) inside the organ's clip, so the upper left edge gets almost none
  vec2 side = length(n.xy) > 1e-4 ? normalize(n.xy) : vec2(0.0);
  float lowerRight = smoothstep(-0.35, 0.65, dot(side, vec2(0.57, -0.82)));
  float k = 1.0 - (1.0 - 0.09 * smoothstep(0.45 - w, 0.45 + w, turn)) * (1.0 - 0.15 * smoothstep(0.68 - w, 0.68 + w, turn)) * (1.0 - 0.24 * smoothstep(0.86 - w, 0.86 + w, turn));
  fill = mix(fill, ogDark.rgb, ogDark.a * k * lowerRight);
  // the rim light on the edge that faces the top left
  float lit = smoothstep(0.62, 0.8, turn) * clamp(dot(side, vec2(-0.6, 0.8)), 0.0, 1.0);
  fill = mix(fill, ogLight.rgb, ogLight.a * 0.58 * lit);
  // the organ lies on whatever is behind it at the layer's opacity, as 2D's organ groups do (blended in 2D's order: layer.ts); the dive fades the layer, no dots
  gl_FragColor = vec4(fill, layer * fade);
}`;

/** The organ outline: the hull's width in the figure's units (2D's .org-line is 1.1 SVG units, the kidney 1.4), so it scales with the figure as 2D's does,
 *  never under one device pixel. Feeds INK_FS (its varyings vHi and vU). */
export const ORGAN_INK_VS = /* glsl */ `
uniform float px;
uniform float dpr;
uniform vec2 res;
varying float vHi;
varying float vU;
void main() {
  vec4 c = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vU = uv.x;
  vHi = 0.0;
  float wpc = c.w * 2.0 / (res.y * projectionMatrix[1][1]) * 300.0;   // the figure's units under one CSS px here
  float w = max(1.0 / max(dpr, 1.0), px / max(wpc, 1e-6));
  vec2 nd = (projectionMatrix * vec4(normalMatrix * normal, 0.0)).xy;
  float l = length(nd);
  nd = l > 1e-5 ? nd / l : vec2(0.0);
  c.xy += nd * w * 2.0 / res * c.w;
  gl_Position = c;
}`;
