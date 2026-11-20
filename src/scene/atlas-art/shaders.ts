// The artist's atlas material (external package, README: shaders/atlas.vert, atlas.frag), used as delivered with three small changes, each marked:
//   1. the vertex stage reads three's own projectionMatrix, modelViewMatrix and normalMatrix (the package's uClipFromAtlas / uEyeFromAtlas are exactly their products), so three binds them;
//   2. both stages carry the clip position (vClip) and the dive's cutaway window (`cut`, the one every organ shares), so the liver opens for the dive into the lobule;
//   3. the window multiplies the alpha.
// 4. MATTE CEL, IN 2D's PALETTE (Mohammad, 20 Nov: "every figure matte, flat-banded with bold ink, in 2D's palette"): the artist's satin shading, his pale highlight and his palettes are gone. The fragment
//    lays the figure's one organ cel (cel-style.ts CEL_STYLE.ORGAN: the same three flat tones, the same band edges, the same light and box lean as organs/organ-shader.ts), in the three tones the organ
//    painter computes for this organ, look and state (organs.ts paint: 2D's og-* tones through organColour, shade and lit as the painter's shader mixes them), so an organ is the colour Classic's is.
//    There is no specular and no gloss: a lit band is a flat tone, never a gradient. His forms (the meshes) and his wash (COLOR_0, as a mean-preserving mottle) are kept.
// The tones are sRGB numbers as the cel shaders take them, and the fragment writes them as they are.
// GLSL ES 3.0: three is given the source without the version line (glslVersion GLSL3), the registry and the glslang test see it whole.
import { CEL_STYLE } from '../cel-style.ts';

/** three is given the GLSL ES 3.0 source without its version line (RawShaderMaterial's glslVersion adds it). */
export const stripVersion = (s: string): string => s.slice(s.indexOf('\n') + 1);

export const ATLAS_VS = `#version 300 es
precision highp float;

in vec3 position;
in vec3 normal;
in vec3 detail;
in vec2 uv;
in vec3 color;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform mat3 normalMatrix;
out vec3 vNormal;
out vec3 vDetail;
out vec3 vPosition;
out vec3 vWash;
out vec2 vUv;
out vec4 vClip;

void main() {
    vNormal = normalize(normalMatrix * normal);
    vDetail = normalize(normalMatrix * detail);
    vPosition = position;
    vWash = color;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vClip = gl_Position;
}
`;

const f = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));
const L = CEL_STYLE.ORGAN.LIGHT, LL = Math.hypot(L[0], L[1], L[2]);

export const ATLAS_FS = `#version 300 es
precision highp float;

in vec3 vNormal;
in vec3 vDetail;
in vec3 vPosition;
in vec3 vWash;
in vec2 vUv;
in vec4 vClip;
uniform sampler2D uGrain;
uniform vec3 uBase;       // 2D's tones for this organ in this look and state (organs.ts paint), sRGB: the base, the shade and the lit tone
uniform vec3 uShade;
uniform vec3 uLit;
uniform vec4 uBox;        // the mesh's own box: min x, min y, width, height (the light leans across it as it does across 2D's organ box)
uniform float uWashMean;  // the mean of the artist's wash, so the mottle varies the tone and never moves its mean
uniform float uAlpha;
uniform float uNod;       // how much the broad nodules (the liver's relief the vertex stage carries as \`detail\`) darken the facets turned from the light; 0 for every other organ
// the dive's cutaway window, the same for every organ (organs/layer.ts ORGAN_CUT): x, y the dive point (ndc), z the radius cleared (negative: nothing), w the aspect
uniform vec4 cut;
out vec4 outColor;

// organ-shader.ts's cel, from cel-style.ts: the terminator where the lambert of the screen's upper-left light crosses SHADE_LAM, the lit cap at LIT_LAM, an edge EDGE_PX device px either side
const float CEL_SHADE_LAM = ${f(CEL_STYLE.ORGAN.SHADE_LAM)};
const float CEL_LIT_LAM = ${f(CEL_STYLE.ORGAN.LIT_LAM)};
const float CEL_EDGE_PX = ${f(CEL_STYLE.EDGE_PX)};
const float CEL_BOX_BIAS = ${f(CEL_STYLE.ORGAN.BOX_BIAS)};
const vec2 CEL_BOX_DIR = vec2(${f(CEL_STYLE.DIR[0])}, ${f(-CEL_STYLE.DIR[1])});   // toward the light in the organ's own box (x right, y DOWN)
const vec3 CEL_LIGHT = vec3(${f(L[0] / LL)}, ${f(L[1] / LL)}, ${f(L[2] / LL)});

void main() {
    vec2 q = vClip.xy / vClip.w - cut.xy;
    float win = smoothstep(cut.z, cut.z + 0.3, length(vec2(q.x * cut.w, q.y)));
    if (win < 0.004) discard;
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;
    vec2 box = vec2((vPosition.x - uBox.x) / uBox.z, 1.0 - (vPosition.y - uBox.y) / uBox.w);
    float lam = dot(n, CEL_LIGHT) + CEL_BOX_BIAS * dot(box - vec2(0.5), CEL_BOX_DIR);
    float wl = max(fwidth(lam) * CEL_EDGE_PX, 1e-5);
    float shade = 1.0 - smoothstep(CEL_SHADE_LAM - wl, CEL_SHADE_LAM + wl, lam);
    float lit = smoothstep(CEL_LIT_LAM - wl, CEL_LIT_LAM + wl, lam) * (1.0 - shade);
    // the broad nodules: the facets that turn from the light more than the form under them do, one flat low-contrast band (no highlight from them)
    vec3 nd = normalize(vDetail);
    if (!gl_FrontFacing) nd = -nd;
    float rel = dot(nd, CEL_LIGHT) - dot(n, CEL_LIGHT);
    float nod = (1.0 - smoothstep(-0.08 - max(fwidth(rel), 1e-4), -0.08 + max(fwidth(rel), 1e-4), rel)) * (1.0 - shade);
    // the artist's wash, as a mottle about 1 (and the print grain, very light, so the bands stay flat)
    float grain = texture(uGrain, vec2(vPosition.x * 1.37, vPosition.y * 1.37)).r - .5;
    float k = clamp(vWash.r / uWashMean, 0.0, 1.4) * (1.0 + .02 * grain);
    vec3 cel = mix(mix(uBase, uShade, shade), uLit, lit);
    cel = mix(cel, uShade, 0.5 * uNod * nod);
    outColor = vec4(clamp(cel * k, 0.0, 1.0), uAlpha * win);
}
`;

/** The ascites pool (Mohammad, 20 Nov: "a flat tan trapezoid ... pasted on", then "almost invisible, no clear waterline ... match how 2D shows ascites"): the 2D figure's pool, columns cut to the
 *  abdominal cavity and standing to the 2D surface (pool.ts), in a cel look: a saturated amber wash over the organs, a deeper band at the floor, a pale meniscus band under the waterline and a thin
 *  ink line on it, and a soft fade at the cavity's floor and walls so it never looks cut out. Each vertex carries `edge` = (distance under the surface, distance above the floor, the column's height). */
export const ATLAS_POOL_VS = `#version 300 es
precision highp float;

in vec3 position;
in vec3 edge;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
out vec3 vEdge;
out vec4 vClip;

void main() {
    vEdge = edge;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vClip = gl_Position;
}
`;

export const ATLAS_ASCITES_FS = `#version 300 es
precision highp float;

in vec3 vEdge;
in vec4 vClip;
uniform vec3 uColor;      // 2D's fluid (stage.js fluidInkRGBA), sRGB
uniform vec3 uSkin;       // 2D's lighter band on the surface
uniform float uAlpha;     // the pool's fade in and the body's dissolve
uniform float uWash;      // the wash's strength
uniform float uBand;      // the meniscus band's thickness (scene units)
uniform vec3 inkColor;
uniform float inkA;
uniform vec4 cut;
out vec4 outColor;

#define CEL_SHADE ${f(CEL_STYLE.SHADE)}

void main() {
    vec2 q = vClip.xy / vClip.w - cut.xy;
    float win = smoothstep(cut.z, cut.z + 0.3, length(vec2(q.x * cut.w, q.y)));
    if (win < 0.004) discard;
    float dTop = max(vEdge.x, 0.0), dBot = max(vEdge.y, 0.0), colH = vEdge.z;
    // soft at the cavity's walls (the columns shrink to nothing there) and floor
    float soft = smoothstep(0.0, 0.05, colH) * mix(0.35, 1.0, smoothstep(0.0, 0.07, dBot));
    // flat tones: 2D's fluid, a deeper band at the floor, 2D's lighter band under the surface (no gradient, no highlight)
    float deep = 1.0 - smoothstep(0.08, 0.13, dBot);
    float skin = 1.0 - smoothstep(0.7 * uBand, uBand, dTop);
    vec3 c = mix(uColor * (1.0 - 1.2 * CEL_SHADE * deep), uSkin, skin);
    float a = uWash * soft * (1.0 + 0.30 * deep) * (1.0 + 0.50 * skin);
    // the waterline's ink: a line of about a pixel and a half along the surface
    float dpx = dTop / max(fwidth(dTop), 1e-6);
    float line = (1.0 - smoothstep(0.7, 1.8, dpx)) * inkA * smoothstep(0.0, 0.02, colH);
    c = mix(c, inkColor, line);
    outColor = vec4(clamp(c, 0.0, 1.0), clamp(max(a, line), 0.0, 1.0) * uAlpha * win);
}
`;

/** The ink line round an organ: the hull (the mesh again, back faces only, pushed out along its normals by a width that is held in device pixels and grows with the figure: the 2D organ
 *  line, 1.4 figure units, never under 1.5 device px, the figure's own floor). Drawn after the organ's fill and tested against it, so only the ring outside the silhouette shows. */
export const ATLAS_INK_VS = `#version 300 es
precision highp float;

in vec3 position;
in vec3 normal;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
uniform mat3 normalMatrix;
uniform float px;
uniform float dpr;
uniform vec2 res;
out vec4 vClip;

void main() {
    vec4 c = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    float wpc = c.w * 2.0 / (res.y * projectionMatrix[1][1]) * 300.0;   // the figure's units under one CSS px here
    float w = max(1.5 / max(dpr, 1.0), px / max(wpc, 1e-6));
    vec2 nd = (projectionMatrix * vec4(normalMatrix * normal, 0.0)).xy;
    float l = length(nd);
    nd = l > 1e-5 ? nd / l : vec2(0.0);
    c.xy += nd * w * 2.0 / res * c.w;
    gl_Position = c;
    vClip = c;
}
`;

export const ATLAS_INK_FS = `#version 300 es
precision highp float;

in vec4 vClip;
uniform vec3 inkColor;
uniform float inkA;
uniform float uAlpha;
uniform vec4 cut;
out vec4 outColor;

void main() {
    vec2 q = vClip.xy / vClip.w - cut.xy;
    float win = smoothstep(cut.z, cut.z + 0.3, length(vec2(q.x * cut.w, q.y)));
    if (win < 0.004) discard;
    outColor = vec4(inkColor, inkA * uAlpha * win);
}
`;
