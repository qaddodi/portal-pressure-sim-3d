// The organs' own fill: 2D's three-tone organ painter (the #og-<organ> gradient, the og-vol radial, the inner shade strokes s1..s3 and the top-left rim light),
// laid at the organ layer's opacity over whatever is behind (atlas-look-plan.md 2.5 and 2.6; the visual review's 2.1 to 2.4). layer.ts blends the organs in 2D's order,
// each once per pixel, so they show through each other as 2D's groups do. Plain strings so the tests can read them without a GPU.
import { FADE_GLSL, INK_RIM_GLSL } from '../materials/shaders.ts';
import { CEL_LIGHT_UNIT } from '../cel-glsl.ts';
import { RIM_SPECK } from './rim-profile.ts';

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
// the rim strip (rim-profile.ts): this vertex's distance from the silhouette over RIM_ZONE (0..1) and its region's offset from the organ's tilt profile (0.5 none); a geometry without them reads 0 and the strip is off (rimW 0)
attribute float rimD;
attribute float rimC;
varying float vRimS;
varying float vRimC;
// the normal the shade steps, the lit patch and the soft light are cut by: the mesh's own normal jags over a mesh that is a vertex every 2.5 units (and its slivers), and every contour cut by it wobbles
// (the dark crescent on the spleen, the lit patch on the liver, Mohammad 20 Nov: "jagged edges"). shadeN is the rest normal smoothed over the surface (normal-smooth.ts), shadeK how much of it (1 at rest;
// the scarred liver takes back some of its own bumpy normal, the gut keeps all of its own: its folds are the relief)
attribute vec3 shadeN;
uniform float shadeK;
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
  vec3 sn = normalize(mix(normal, shadeN, shadeK));
  vN = normalize(normalMatrix * sn);
  vNw = normalize(mat3(modelMatrix) * sn);
  vV = normalize(-mv.xyz);
  vAo = depthAo;
  vRimS = rimD;
  vRimC = rimC - 0.5;
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
uniform float rimK;      // the rim light's opacity (0 on the liver and the stomach: too shiny, owner 20 Nov)
uniform vec3 page;
uniform float layer;
uniform float inkAmount;
// the liver look (liver-texture.ts): R septum, G tone, B light; nodAmt 0 when the organ has none
uniform sampler2D nodTex;
uniform float nodAmt;
uniform vec3 sepDelta;
uniform vec2 nodK;
varying vec2 vRest;
// the pool of blood in the stomach (pool-level.ts), drawn per pixel: x the surface's place in the box (vBox.y), y the figure's units in one box height, z how much blood there is (0 none: nothing below runs),
// w how strongly the jet lands on the surface; poolLand x the landing's place in the box (vBox.x), y its half width in box widths (16 figure units), z how high the ripples stand (0 none: they ease out with the bleed), w their phase (radians, from the clock); poolDelta how far the pool's colour is from the organ's
uniform vec4 poolA;
uniform vec4 poolLand;
uniform vec3 poolDelta;
// Settings > Figure depth: organDepth (0 off, 1 on, eased) adds the baked crease and contact shade and a soft light from the upper left
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
varying vec2 vBox;
varying float vAo;
varying float vRimS;
varying float vRimC;
uniform vec4 rimP0;   // the organ's tilt profile (rim-profile.ts): the normal's z at eight points from the silhouette (0) to RIM_ZONE in (1)
uniform vec4 rimP1;
uniform float rimW;   // how much of the strip's own tilt the organ takes: 1, less as the scarred liver takes back its own bumpy normal, 0 with no strip
// the shade normal: the interpolated one, but in the rim strip its TILT is the profile's at the pixel's interpolated distance from the rim, so the crescent's edge follows the rim whatever the triangulation (rim-profile.ts rimShadeNormal, the JS twin)
vec3 rimShadeNormal(vec3 n) {
  float f = clamp(vRimS, 0.0, 1.0) * 7.0;
  vec4 wa = max(vec4(0.0), 1.0 - abs(f - vec4(0.0, 1.0, 2.0, 3.0))), wb = max(vec4(0.0), 1.0 - abs(f - vec4(4.0, 5.0, 6.0, 7.0)));
  float nzP = clamp(dot(rimP0, wa) + dot(rimP1, wb) + vRimC, 0.0, 1.0);
  float hl = length(n.xy);
  // (the speck guard: where the normal nearly faces the eye its direction round the rim, n.xy / |n.xy|, is noise, so the strip's share fades in with |n.xy|, RIM_SPECK in rim-profile.ts; twin: rimShadeNormal there)
  float k = (1.0 - smoothstep(0.75, 1.0, vRimS)) * rimW * smoothstep(${num(RIM_SPECK[0])}, ${num(RIM_SPECK[1])}, hl);
  vec2 dir = hl > 1e-4 ? n.xy / hl : vec2(0.0);
  return normalize(mix(n, vec3(dir * sqrt(max(0.0, 1.0 - nzP * nzP)), nzP), k));
}
const vec3 LIGHT = vec3(${ORGAN_LIGHT.map((v) => num(v)).join(', ')});   // (normalized here, not by a constant expression in GLSL: one less thing a phone's compiler can refuse)
void main() {
  // (the derivatives first, before the window's discard: a quad whose other pixels were dropped gives a garbage fwidth on a device that drops the lane, tests/no-derivative-after-discard.test.ts)
  vec3 nws = rimShadeNormal(normalize(vNw));
  float turn = 1.0 - clamp(nws.z, 0.0, 1.0);
  float w = max(fwidth(turn), 1e-4);
  float fwLam = fwidth(dot(nws, LIGHT));
  float fwPool = fwidth(vBox.y) * poolA.y;
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
  float lay = layer;
  if (poolA.z > 0.004) {
    // the pool: a level in the figure (a line across the stomach, per pixel, never per vertex), mirrored by poolShade in pool-level.ts (which the node render and the tests run).
    // dU is how many figure units below the surface this pixel is (negative above it).
    // ripples: gentle waves run out along the surface from where the jet lands (the surface is seen edge-on, so a ring is a wave of the waterline): the level rises and falls by a unit or two,
    // dying away with distance, and the crests catch the light.
    float dxU = (vBox.x - poolLand.x) * 16.0 / max(poolLand.y, 1e-4);
    float ad = abs(dxU);
    float env = (1.0 - exp(-ad / 4.0)) * exp(-ad / 70.0);
    float th = 6.2831853 * ad / 24.0 - poolLand.w;
    float amp = poolLand.z * (0.5 + 0.5 * poolA.w) * 1.6;
    float rise = amp * env * sin(th);
    float slope = amp * env * cos(th) * (6.2831853 / 24.0) * sign(dxU);
    float dU = (vBox.y - poolA.x) * poolA.y - rise;
    float aa = max(fwPool, 1.5);   // the waterline is a soft blend a few units wide (colours blend, never step), and never narrower than a pixel
    float body = smoothstep(-aa, aa, dU);
    float wet = smoothstep(-3.5, -aa, dU) * (1.0 - body);   // the meniscus: the wall just above the surface is wet, a faint film that climbs a few units and fades
    fill += poolDelta * (body + 0.25 * wet);
    fill *= 1.0 - 0.26 * smoothstep(0.0, 90.0, dU) * body * poolA.z;   // deeper blood is darker, in the same hue
    float lobe = exp(-pow((vBox.x - poolLand.x) / max(poolLand.y, 1e-4), 2.0));   // the jet lands: a lighter, fresher patch on the surface, a little wider than the jet
    float skin = (1.0 - smoothstep(0.0, 6.0, dU)) * smoothstep(-0.5, 2.0, dU);   // the lit skin of the surface: a few units under it
    fill = mix(fill, ogLight.rgb, clamp((0.07 + poolA.w * lobe * 0.12) * skin * poolA.z, 0.0, 1.0));
    float band = (1.0 - smoothstep(0.0, 9.0, dU)) * smoothstep(-1.5, 1.0, dU);   // the ripples' light lies in the blood's top few units
    fill = mix(fill, slope > 0.0 ? ogLight.rgb : ogDark.rgb, clamp(abs(slope) * 0.5, 0.0, 0.2) * band * poolA.z);
    lay = mix(layer, max(layer, 0.9), body * poolA.z);   // blood is not a wash: it lies on the page nearly opaque, so it reads red, not mauve
  }
  if (nodAmt > 0.0) {
    vec4 nt = texture2D(nodTex, vRest);
    fill += sepDelta * nt.r;
    fill *= 1.0 + (nt.g - 0.5) * nodK.y * nodAmt;
    float nl = (nt.b - 0.5) * 2.0;
    fill = mix(fill, nl > 0.0 ? ogLight.rgb : ogDark.rgb, abs(nl) * nodK.x * nodAmt * (1.0 - nt.r));
  }
  // #ogVol (2D stage.js): --light-ink at its first stop's opacity from the centre out to the light's end, then --og-vol-shade from its start to the rim
  float r = distance(vBox, volGeo.xy) / volGeo.z;
  fill = mix(fill, volLight.rgb, volLight.a * (1.0 - clamp(r / volGeo.w, 0.0, 1.0)));
  fill = mix(fill, volShade.rgb, volShade.a * clamp((r - volShadeAt) / (1.0 - volShadeAt), 0.0, 1.0));
  // the inner shade: three soft steps of the turn away from the eye (2D strokes 30/18/8 px)
  // (the turn is measured against the figure's own facing axis (+z in the world), not the camera's: tilting or orbiting must never change an organ's shading, Mohammad 20 Nov 2026
  //  "when i tilt, the organs and everything loses shading or becomes darker"; at the rest view the eye is on that axis, so the look there is exactly 2D's)
  vec3 nw = nws;
  float ndv = clamp(nw.z, 0.0, 1.0);
  // the steps stack as 2D's strokes do (each over the last), at og-dark's own alpha, and sit on the lower right edge: 2D moves its shade
  // strokes by (-3.5, -5) inside the organ's clip, so the upper left edge gets almost none
  vec2 side = length(nw.xy) > 1e-4 ? normalize(nw.xy) : vec2(0.0);
  float lowerRight = smoothstep(-0.35, 0.65, dot(side, vec2(0.57, -0.82)));
  // (ONE monotonic ramp that reaches the three strokes' stacked total at the rim and passes through each plateau (2D's 30/18/8 px strokes, but blended as the owner's rule has it): three smoothsteps one pixel wide were three crisp concentric
  //  bands at a close-up rim, review 21 Nov #16. The total is the same product of the strokes' alphas; the ramp's own value at turn .56 / .77 / .93 is within a hair of the plateaus .09 / .24 / .41 of the stack)
  float k = (1.0 - (1.0 - shadeSteps.x) * (1.0 - shadeSteps.y) * (1.0 - shadeSteps.z)) * smoothstep(0.35, 1.0, turn);
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
    float lam = dot(nws, LIGHT);   // n.L in the world: the camera never changes it
    float wl = 0.08 + fwLam;
    float away = 1.0 - smoothstep(0.3 - wl, 0.3 + wl, lam);
    float toward = smoothstep(0.7 - wl, 0.7 + wl, lam) * (1.0 - ao);
    fill = mix(fill, ogDark.rgb, clamp(ogDark.a * (1.5 * tuck + 0.6 * away), 0.0, 1.0) * depthAmt);
    fill = mix(fill, ogLight.rgb, clamp(ogLight.a * 0.5 * toward, 0.0, 1.0) * depthAmt);
  }
  // the organ lies on whatever is behind it at the layer's opacity, as 2D's organ groups do (blended in 2D's order: layer.ts); the dive fades the layer, no dots.
  gl_FragColor = vec4(fill, lay * fade * win);
}`;

/** The organ outline: the hull's width in the figure's units (2D's .org-line is 1.1 SVG units, the kidney 1.4), so it scales with the figure as 2D's does,
 *  never under one device pixel. Feeds INK_FS (its varyings vHi and vU). */
export const ORGAN_INK_VS = /* glsl */ `
${INK_RIM_GLSL}
uniform float px;
uniform float dpr;
#ifdef INK_EDGE
attribute float ringD;   // steps in from the rim ring (contour.ts ringDistance)
varying float vRd;
#endif
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
#ifdef INK_EDGE
  vRd = ringD;
  w += 1.0 / max(dpr, 1.0);   // (one device pixel past the line: the coverage ramp takes it back, INK_FS)
#endif
  vec2 nd = (projectionMatrix * vec4(normalMatrix * hullN, 0.0)).xy;
  float l = length(nd);
  nd = l > 1e-5 ? nd / l : vec2(0.0);
  c.xy += nd * w * inkRim(hullN) * 2.0 / res * c.w;
  gl_Position = c;
}`;
