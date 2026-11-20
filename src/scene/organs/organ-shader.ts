// The organs' own fill: 2D's three-tone organ painter (the #og-<organ> gradient, the og-vol radial, the inner shade strokes s1..s3 and the top-left rim light),
// laid at the organ layer's opacity over whatever is behind (atlas-look-plan.md 2.5 and 2.6; the visual review's 2.1 to 2.4). layer.ts blends the organs in 2D's order,
// each once per pixel, so they show through each other as 2D's groups do. Plain strings so the tests can read them without a GPU.
import { FADE_GLSL } from '../materials/shaders.ts';
import { CEL_STYLE } from '../cel-style.ts';
import { LUMA } from '../disease/copied/anatomy-b4.ts';

const num = (n: number) => (Number.isInteger(n) ? `${n}.0` : String(n));

const CEL_LIGHT_N = (() => { const [x, y, z] = CEL_STYLE.ORGAN.LIGHT; const l = Math.hypot(x, y, z); return [x / l, y / l, z / l] as const; })();

export const ORGAN_VS = /* glsl */ `
#ifdef VERTEX_INK
attribute vec3 ink;
varying vec3 vInk;
#endif
// organ depth (organ-depth.ts): how tucked in this vertex is, 0..1, baked at load (a geometry without it reads 0)
attribute float depthAo;
varying float vAo;
// the normal the cel bands are cut by: the liver's at rest, before cirrhosis's nodule bumps (a hard band on a bumpy normal is a honeycomb); an organ without CEL_NORMAL uses its own
#ifdef CEL_NORMAL
attribute vec3 celNormal;
#endif
varying vec3 vCn;
uniform vec4 box;
varying vec3 vN;
varying vec3 vV;
varying vec2 vBox;
varying vec4 vClip;
varying vec2 vSvg;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
#ifdef CEL_NORMAL
  vCn = normalize(normalMatrix * celNormal);
#else
  vCn = vN;
#endif
  vV = normalize(-mv.xyz);
  vAo = depthAo;
  // where this point sits in the organ's own 2D box: (0,0) top left, (1,1) bottom right, as the SVG gradient's objectBoundingBox
  vBox = vec2((position.x - box.x) / max(box.z, 1e-5), (box.y - position.y) / max(box.w, 1e-5));
  // where this point sits in the 2D figure's own units (x right, y down: frame2d.ts), for what 2D lays in the figure's frame (the liver's sheen)
  vSvg = vec2(700.0 + 300.0 * position.x, 556.0 - 300.0 * position.y);
#ifdef VERTEX_INK
  vInk = ink;
#endif
  gl_Position = projectionMatrix * mv;
  vClip = gl_Position;
}`;

export const ORGAN_FS = /* glsl */ `
${FADE_GLSL}
uniform vec3 o1;
uniform vec3 o2;
uniform vec3 o3;
uniform vec3 color;
uniform vec4 ogLight;
uniform vec4 ogDark;
uniform vec4 volLight;   // see-through fill: #ogVol's light stop (--light-ink and its opacity)
uniform vec4 volShade;   // its shade stop: --og-vol-shade and its opacity
uniform vec4 volGeo;     // its centre (cx, cy), radius, and the offset where the light has ended
uniform float volShadeAt;
uniform vec3 shadeSteps; // the inner shade's three strokes' opacities (the right atrium's are fainter)
uniform float rimK;      // the rim light's opacity
uniform vec4 sheenE0;    // the liver's capsule sheen: two ellipses (cx, cy, rx, ry in the figure's units) and their turns, its stops and its strength (0: no sheen on this organ)
uniform vec4 sheenE1;
uniform vec2 sheenRot;
uniform vec4 sheenStops; // the opacities at the centre, at the middle stop and at the edge, and the middle stop's offset
uniform float sheenK;
uniform float wash;      // 1 minus the cel fill's share (layer.ts uWash): the see-through fill's own terms fade out with it
uniform vec3 page;
uniform float layer;
uniform float inkAmount;
// Settings > Figure depth: organDepth (0 off, 1 on, eased) adds the baked crease and contact shade and a soft light from the upper left; organFill solid (0 the see-through wash, 1 solid, eased)
// lays the same painted colour opaque, pre-mixed against the page
uniform float depthAmt;
uniform float solid;
// the dive's cutaway window (atlas-look-plan 3.1): x, y the dive point on the screen (ndc), z the radius that is cleared (ndc half-heights; below 0 nothing is), w the aspect; the same for every organ
uniform vec4 cut;
varying vec4 vClip;
#ifdef VERTEX_INK
varying vec3 vInk;
#endif
varying vec3 vN;
varying vec3 vV;
varying vec2 vBox;
varying float vAo;
varying vec3 vCn;
varying vec2 vSvg;
/** One of the sheen's ellipses as a radial gradient in its own box: the opacity at this point (SVG: rotate(a cx cy), then r = 1 at the ellipse's edge). */
float sheenAt(vec4 e, float turn) {
  vec2 d = vSvg - e.xy;
  float c = cos(turn), s = sin(turn);
  float r = length(vec2(c * d.x + s * d.y, -s * d.x + c * d.y) / e.zw);
  return r >= 1.0 ? 0.0 : (r < sheenStops.w ? mix(sheenStops.x, sheenStops.y, r / sheenStops.w) : mix(sheenStops.y, sheenStops.z, (r - sheenStops.w) / (1.0 - sheenStops.w)));
}
// Cel shaded (organFill solid): the figure's one cel style (src/scene/cel-style.ts, injected below, never retyped): three flat tones, shade / base / lit, from the organ's own colour, 2D's og-dark and
// og-light; the terminator is where the lambert of the screen's upper-left light crosses SHADE_LAM, the lit cap where it crosses LIT_LAM, and with organ depth on the baked tuck is one hard band of the
// shade tone. An edge is EDGE_PX device pixels either side of the line (fwidth) and no softer. tests/organ-depth.test.ts mirrors this function with celBand.
const float CEL_SHADE_LAM = ${num(CEL_STYLE.ORGAN.SHADE_LAM)};
const float CEL_LIT_LAM = ${num(CEL_STYLE.ORGAN.LIT_LAM)};
const float CEL_TUCK_AO = ${num(CEL_STYLE.ORGAN.TUCK_AO)};
const float CEL_EDGE_PX = ${num(CEL_STYLE.EDGE_PX)};
const float CEL_BOX_BIAS = ${num(CEL_STYLE.ORGAN.BOX_BIAS)};
const vec2 CEL_BOX_DIR = vec2(${num(CEL_STYLE.DIR[0])}, ${num(-CEL_STYLE.DIR[1])});   // toward the light in the organ's own box (x right, y DOWN)
const vec3 CEL_LUMA = vec3(${num(LUMA[0]!)}, ${num(LUMA[1]!)}, ${num(LUMA[2]!)});
const vec3 CEL_LIGHT = vec3(${num(CEL_LIGHT_N[0])}, ${num(CEL_LIGHT_N[1])}, ${num(CEL_LIGHT_N[2])});   // (normalized here, not by a constant expression in GLSL: one less thing a phone's compiler can refuse)
// how much of the shade tone (x) and the lit tone (y) a point wears, each 0 or 1 but for the pixel of an edge; tuckAt is where the tuck band starts (above 1: no band)
vec2 celBands(float lam, float ao, float tuckAt) {
  float wl = max(fwidth(lam) * CEL_EDGE_PX, 1e-5), wa = max(fwidth(ao) * CEL_EDGE_PX, 1e-5);
  float shade = max(1.0 - smoothstep(CEL_SHADE_LAM - wl, CEL_SHADE_LAM + wl, lam), smoothstep(tuckAt - wa, tuckAt + wa, ao));
  float lit = smoothstep(CEL_LIT_LAM - wl, CEL_LIT_LAM + wl, lam) * (1.0 - shade);
  return vec2(shade, lit);
}
void main() {
  // the window: the wash clears round the dive point, soft at its edge, so the lobule shows inside
  vec2 q = vClip.xy / vClip.w - cut.xy;
  float win = smoothstep(cut.z, cut.z + 0.3, length(vec2(q.x * cut.w, q.y)));
  if (win < 0.004) discard;
  vec3 n = normalize(vN);
  // the gradient from the box's (.15,0) to (.85,1)
  vec2 g = vec2(0.7, 1.0);
  float t = clamp(dot(vBox - vec2(0.15, 0.0), g) / dot(g, g), 0.0, 1.0);
  vec3 fill = mix(o1, o2, t);
#ifdef VERTEX_INK
  // what varies over the surface (nodules, the dead spleen, the pool) moves the fill by as much as it moves the organ's one colour
  fill += (vInk - color) * inkAmount;
#endif
  // The terms below that 2D adds on top of the plain gradient belong to the see-through fill: wash (1 at the wash, 0 once the fill is cel shaded, eased with it) fades each out.
  // #ogVol (2D stage.js): --light-ink at its first stop's opacity from the centre out to the light's end, then --og-vol-shade from its start to the rim
  float r = distance(vBox, volGeo.xy) / volGeo.z;
  fill = mix(fill, volLight.rgb, volLight.a * (1.0 - clamp(r / volGeo.w, 0.0, 1.0)) * wash);
  fill = mix(fill, volShade.rgb, volShade.a * clamp((r - volShadeAt) / (1.0 - volShadeAt), 0.0, 1.0) * wash);
  // the liver's capsule sheen (.lv-gloss): two soft reflections on the domes, --light-ink, at the capsule's gloss (a quarter of it left in cirrhosis)
  fill = mix(fill, volLight.rgb, sheenAt(sheenE0, sheenRot.x) * sheenK * wash);
  fill = mix(fill, volLight.rgb, sheenAt(sheenE1, sheenRot.y) * sheenK * wash);
  // the inner shade: three soft steps of the turn away from the eye (2D strokes 30/18/8 px)
  float ndv = clamp(dot(n, normalize(vV)), 0.0, 1.0);
  float turn = 1.0 - ndv;
  float w = max(fwidth(turn), 1e-4);
  // the steps stack as 2D's strokes do (each over the last), at og-dark's own alpha, and sit on the lower right edge: 2D moves its shade
  // strokes by (-3.5, -5) inside the organ's clip, so the upper left edge gets almost none
  vec2 side = length(n.xy) > 1e-4 ? normalize(n.xy) : vec2(0.0);
  float lowerRight = smoothstep(-0.35, 0.65, dot(side, vec2(0.57, -0.82)));
  float k = 1.0 - (1.0 - shadeSteps.x * smoothstep(0.45 - w, 0.45 + w, turn)) * (1.0 - shadeSteps.y * smoothstep(0.68 - w, 0.68 + w, turn)) * (1.0 - shadeSteps.z * smoothstep(0.86 - w, 0.86 + w, turn));
  fill = mix(fill, ogDark.rgb, ogDark.a * k * lowerRight);
  // the rim light on the edge that faces the top left
  float lit = smoothstep(0.62, 0.8, turn) * clamp(dot(side, vec2(-0.6, 0.8)), 0.0, 1.0);
  fill = mix(fill, ogLight.rgb, ogLight.a * rimK * lit);
  // Organ depth (a step beyond 2D; with depthAmt 0 nothing below runs and the fill is exactly the wash above). Three soft steps, in the look's own tones:
  // the baked tuck (creases, where one organ meets another) in og-dark, the side turned from a light at the upper left of the screen in og-dark, the side facing it in og-light
  // (the tuck keeps the light out). One baked byte per vertex and one dot: no texture, no pass.
  if (depthAmt > 0.001) {
    float ao = clamp(vAo, 0.0, 1.0);
    float wa = 0.12;
    float tuck = (smoothstep(0.2 - wa, 0.2 + wa, ao) + smoothstep(0.5 - wa, 0.5 + wa, ao) + smoothstep(0.8 - wa, 0.8 + wa, ao)) * (1.0 / 3.0);
    float lam = dot(n, CEL_LIGHT);
    float wl = 0.08 + fwidth(lam);
    float away = 1.0 - smoothstep(0.3 - wl, 0.3 + wl, lam);
    float toward = smoothstep(0.7 - wl, 0.7 + wl, lam) * (1.0 - ao);
    fill = mix(fill, ogDark.rgb, clamp(ogDark.a * (1.5 * tuck + 0.6 * away), 0.0, 1.0) * depthAmt);
    fill = mix(fill, ogLight.rgb, clamp(ogLight.a * 0.5 * toward, 0.0, 1.0) * depthAmt);
  }
  // Cel shaded: the wash's soft shade is replaced (eased by solid) by three hard tones in the organ's own hues: the base is its second tone (og-N-2) with what varies over it (nodules, the dead spleen, the pool);
  // the lit tone is toward its first (og-N-1) and og-light; the shade toward its third (og-N-3) or, where that is the light edge of a dark look, og-dark. The measure is n.L leaned across the organ's box toward
  // the light, so a flat face-on organ still shows a lit cap and a shade side.
  if (solid > 0.001) {
    vec3 base = o2;
#ifdef VERTEX_INK
    base += (vInk - color) * inkAmount * ${num(CEL_STYLE.ORGAN.PAINT)};   // (what varies over the organ, at its low-contrast share: the wash laid it at the layer's opacity)
#endif
    float lean = dot(vBox - vec2(0.5), CEL_BOX_DIR);
    vec2 b = celBands(dot(normalize(vCn), CEL_LIGHT) + CEL_BOX_BIAS * lean, clamp(vAo, 0.0, 1.0), mix(1.5, CEL_TUCK_AO, depthAmt));
    vec3 deep = dot(o3, CEL_LUMA) < dot(base, CEL_LUMA) ? o3 : ogDark.rgb;
    vec3 shadeTone = mix(base * (1.0 - ${num(CEL_STYLE.ORGAN.SHADE)}), deep, ${num(CEL_STYLE.ORGAN.DEEP)});
    vec3 litTone = mix(mix(base, o1, ${num(CEL_STYLE.ORGAN.LIT_O1)}), ogLight.rgb, ${num(CEL_STYLE.ORGAN.LIT)});
    vec3 cel = mix(mix(base, shadeTone, b.x), litTone, b.y);
    fill = mix(fill, cel, solid);
  }
  // the organ lies on whatever is behind it at the layer's opacity, as 2D's organ groups do (blended in 2D's order: layer.ts); the dive fades the layer, no dots.
  // Cel shaded (solid): the organ's own full tones laid opaque (alpha 1, no pre-mix against the page), so nothing shows through it; the dive's fade and window still thin it, never pop it
  float a = mix(layer, 1.0, solid);
  gl_FragColor = vec4(fill, a * fade * win);
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
