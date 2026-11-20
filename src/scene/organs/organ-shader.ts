// The organs' own fill: CEL. Three authored tones (the look's lit, base and shade tones of the organ, palette.ts organs.tones) cut from one quantised lighting signal (n.L in the world,
// less the baked contact shade), flat everywhere and antialiased by the derivative at the band edges only (cel-style.ts CEL_STYLE.ORGAN). It replaces 2D's painter (the #og gradient, the
// og-vol radial, the inner shade strokes and the rim light), which was a continuous gradient under layered washes (external review, 20 Nov). The fill is opaque; the outline is its own
// ink (ORGAN_INK_VS + INK_FS), never premixed against the page. Plain strings so the tests can read them without a GPU.
import { FADE_GLSL } from '../materials/shaders.ts';
import { CEL_LIGHT_UNIT } from '../cel-glsl.ts';
import { CEL_STYLE } from '../cel-style.ts';

const num = (n: number) => (Number.isInteger(n) ? `${n}.0` : String(n));

/** The soft light of Organ depth: the one WORLD light (cel-style.ts LIGHT), as a unit vector; n.L is taken with the normal in world axes (vNw), so the camera never changes it. */
const ORGAN_LIGHT = CEL_LIGHT_UNIT;

export const ORGAN_VS = /* glsl */ `
#ifdef VERTEX_INK
attribute vec3 ink;
varying vec3 vInk;
#endif
// organ depth (organ-depth.ts): how tucked in this vertex is, 0..1, baked at load (a geometry without it reads 0)
attribute float depthAo;
varying float vAo;
// the liver look's place in its texture (liver-texture.ts): the vertex's rest place in the 2D figure; the other organs leave it 0
attribute vec2 restUV;
varying vec2 vRest;
uniform vec4 box;
varying vec3 vN;
varying vec3 vNw;   // the normal in WORLD axes (the model matrix: the light is fixed in the world, not on the screen)
varying vec3 vV;
varying vec2 vBox;
varying vec4 vClip;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vNw = normalize(mat3(modelMatrix) * normal);
  vV = normalize(-mv.xyz);
  vAo = depthAo;
  vRest = restUV;
  // where this point sits in the organ's own 2D box: (0,0) top left, (1,1) bottom right, as the SVG gradient's objectBoundingBox
  vBox = vec2((position.x - box.x) / max(box.z, 1e-5), (box.y - position.y) / max(box.w, 1e-5));
#ifdef VERTEX_INK
  vInk = ink;
#endif
  gl_Position = projectionMatrix * mv;
  vClip = gl_Position;
}`;

export const ORGAN_FS = /* glsl */ `
${FADE_GLSL}
uniform vec3 o1;         // the look's LIT tone of this organ (its lighter authored tone)
uniform vec3 o2;         // its SHADE tone (the darker one); the base tone is halfway between them (and is 'color')
uniform vec3 o3;
uniform vec3 color;
uniform vec4 ogLight;
uniform vec4 ogDark;
uniform vec3 page;
uniform float inkAmount;
// the liver look (liver-texture.ts): R septum, G tone, B light; nodAmt 0 when the organ has none
uniform sampler2D nodTex;
uniform float nodAmt;
uniform vec3 sepDelta;
uniform vec2 nodK;
varying vec2 vRest;
// Settings > Figure depth > Organ depth: depthAmt (0 off, 1 on, eased) is how much of the light and shade the organ wears: 0 is its one flat base tone, 1 the three tones and the contact shade
uniform float depthAmt;
// the dive's cutaway window (atlas-look-plan 3.1): x, y the dive point on the screen (ndc), z the radius that is cleared (ndc half-heights; below 0 nothing is), w the aspect; the same for every organ
uniform vec4 cut;
varying vec4 vClip;
#ifdef VERTEX_INK
varying vec3 vInk;
#endif
varying vec3 vN;
varying vec3 vNw;
varying vec3 vV;
varying float vAo;
const vec3 LIGHT = vec3(${ORGAN_LIGHT.map((v) => num(v)).join(', ')});   // (normalized here, not by a constant expression in GLSL: one less thing a phone's compiler can refuse)
const float ORG_SHADE_AT = ${num(CEL_STYLE.ORGAN.SHADE_AT)};
const float ORG_LIT_AT = ${num(CEL_STYLE.ORGAN.LIT_AT)};
const float ORG_TUCK = ${num(CEL_STYLE.ORGAN.TUCK)};
const float ORG_EDGE_PX = ${num(CEL_STYLE.EDGE_PX)};
// how much of each tone this pixel wears (x shade, y base, z lit; they sum to 1): flat everywhere except across a band's edge, one device pixel wide. The art patch (organ-art.ts) reads it to put the esophagus's own tones in the same bands.
vec3 gBand = vec3(0.0, 1.0, 0.0);
vec3 organTone(vec3 lit, vec3 shade) { return shade * gBand.x + mix(lit, shade, 0.5) * gBand.y + lit * gBand.z; }
void main() {
  // the window: the fill clears round the dive point, soft at its edge, so the lobule shows inside
  vec2 q = vClip.xy / vClip.w - cut.xy;
  float win = smoothstep(cut.z, cut.z + 0.3, length(vec2(q.x * cut.w, q.y)));
  if (win < 0.004) discard;
  // THE LIGHTING SIGNAL, one number: n.L against the world light (the camera never changes it; tilting and orbiting leave every shade alone), lowered where the baked contact shade says this
  // vertex is tucked in between organs. Everything below is a hard step of it: nothing is mixed continuously over the surface.
  float s = dot(normalize(vNw), LIGHT) - ORG_TUCK * clamp(vAo, 0.0, 1.0);
  float e = max(0.5 * ORG_EDGE_PX * fwidth(s), 1e-4);   // derivative antialiasing: the edge is one device pixel wide, at the band edges only
  float litW = smoothstep(ORG_LIT_AT - e, ORG_LIT_AT + e, s) * depthAmt;
  float shadeW = (1.0 - smoothstep(ORG_SHADE_AT - e, ORG_SHADE_AT + e, s)) * depthAmt;
  gBand = vec3(shadeW, 1.0 - shadeW - litW, litW);   // (the two edges are 0.55 apart in s and about a pixel wide: both are never inside one)
  vec3 fill = organTone(o1, o2);
#ifdef VERTEX_INK
  // what varies over the surface (nodules, the dead spleen, the pool) moves every tone by as much as it moves the organ's one colour
  fill += (vInk - color) * inkAmount;
#endif
  if (nodAmt > 0.0) {
    vec4 nt = texture2D(nodTex, vRest);
    fill += sepDelta * nt.r;
    fill *= 1.0 + (nt.g - 0.5) * nodK.y * nodAmt;
    float nl = (nt.b - 0.5) * 2.0;
    fill = mix(fill, nl > 0.0 ? ogLight.rgb : ogDark.rgb, abs(nl) * nodK.x * nodAmt * (1.0 - nt.r));
  }
  // opaque: the organ hides what is behind it by depth (the blend is only the dive's and the fades', never a see-through layer)
  gl_FragColor = vec4(fill, fade * win);
}`;

/** The organ outline: the hull's width in the figure's units (2D's .org-line is 1.1 SVG units, the kidney 1.4), so it scales with the figure as 2D's does,
 *  never under one device pixel. Feeds INK_FS (its varyings vHi and vU). */
export const ORGAN_INK_VS = /* glsl */ `
uniform float px;
uniform float dpr;
attribute vec3 hullN;   // the smoothed normal the outline is pushed out along (normal-smooth.ts): the mesh's own normals jag at a coarse rim
uniform vec2 res;
uniform float hiOn;   // 0..1: a slide's pin or a tapped organ (highlight.ts OrganPins): the line widens by hiPx figure units and takes the organ's highlight colour
uniform float hiPx;
varying float vHi;
varying float vU;
void main() {
  vec4 c = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vU = uv.x;
  vHi = hiOn;
  float wpc = c.w * 2.0 / (res.y * projectionMatrix[1][1]) * 300.0;   // the figure's units under one CSS px here
  float w = max(1.0 / max(dpr, 1.0), (px + hiOn * hiPx) / max(wpc, 1e-6));
  vec2 nd = (projectionMatrix * vec4(normalMatrix * hullN, 0.0)).xy;
  float l = length(nd);
  nd = l > 1e-5 ? nd / l : vec2(0.0);
  c.xy += nd * w * 2.0 / res * c.w;
  gl_Position = c;
}`;
