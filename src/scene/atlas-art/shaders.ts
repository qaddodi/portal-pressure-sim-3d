// The artist's atlas material (external package, README: shaders/atlas.vert, atlas.frag), used as delivered with three small changes, each marked:
//   1. the vertex stage reads three's own projectionMatrix, modelViewMatrix and normalMatrix (the package's uClipFromAtlas / uEyeFromAtlas are exactly their products), so three binds them;
//   2. both stages carry the clip position (vClip) and the dive's cutaway window (`cut`, the one every organ shares), so the liver opens for the dive into the lobule;
//   3. the window multiplies the alpha.
// 4. CEL SHADED (Mohammad, 20 Nov: "everything cel shaded in the figures"): the artist's smooth satin wash is cut into stepped tones with the shared cel constants (vessels/cel-ink.ts CEL:
//    shadow and lit steps, lit from the upper left), and every organ gets the figure's ink line (the hull pass, ATLAS_INK_*). His forms (the meshes), the COLOR_0 wash and both palettes are kept.
// The colour is linear in (uColor, COLOR_0), and the fragment converts its final colour to sRGB itself, as the cel shaders do: no output conversion is added.
// GLSL ES 3.0: three is given the source without the version line (glslVersion GLSL3), the registry and the glslang test see it whole.
import { CEL } from '../vessels/cel-ink.ts';

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

export const ATLAS_FS = `#version 300 es
precision highp float;

in vec3 vNormal;
in vec3 vDetail;
in vec3 vPosition;
in vec3 vWash;
in vec2 vUv;
in vec4 vClip;
uniform sampler2D uGrain;
uniform vec3 uColor;
uniform float uDark;
uniform float uAlpha;
uniform float uNod;      // how much the broad nodules (the liver's relief the vertex stage carries as \`detail\`) darken the facets turned from the light; 0 for every other organ
uniform float uShine;    // the share of the pale lit band kept (the liver keeps a quarter: no shine)
// the dive's cutaway window, the same for every organ (organs/layer.ts ORGAN_CUT): x, y the dive point (ndc), z the radius cleared (negative: nothing), w the aspect
uniform vec4 cut;
out vec4 outColor;

// the figure's cel steps (vessels/cel-ink.ts CEL): the shadow multiplier and the share lifted toward the light. An organ is a large surface, so it takes two steps of each where a tube takes one.
#define CEL_SHADE ${CEL.SHADE}
#define CEL_LIT ${CEL.LIT}

vec3 linearToSrgb(vec3 c) {
    c = max(c, vec3(0.0));
    return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - .055, step(vec3(.0031308), c));
}

// one step: 0 below \`at\`, 1 above it, the edge one pixel wide (a cel edge stays crisp at any zoom)
float stepAt(float x, float at, float px) { return smoothstep(at - px, at + px, x); }

void main() {
    vec2 q = vClip.xy / vClip.w - cut.xy;
    float win = smoothstep(cut.z, cut.z + 0.3, length(vec2(q.x * cut.w, q.y)));
    if (win < 0.004) discard;
    vec3 n = normalize(vNormal);
    if (!gl_FrontFacing) n = -n;
    // the light from the upper left of the screen and a little toward the viewer (the package's key)
    vec3 key = normalize(vec3(-.52, .74, 1.08));
    float nl = dot(n, key);
    float px = max(fwidth(nl), 1e-4);
    float shadow = 1.0 - stepAt(nl, 0.30, px);    // turned from the light
    float core = 1.0 - stepAt(nl, -0.10, px);     // turned well away: the core shadow
    float lit = stepAt(nl, 0.86, px);             // facing the light
    // the broad nodules: the facets that turn from the light more than the form under them do, one flat low-contrast band (no highlight from them)
    vec3 nd = normalize(vDetail);
    if (!gl_FrontFacing) nd = -nd;
    float rel = dot(nd, key) - nl;
    float nod = 1.0 - stepAt(rel, -0.08, max(fwidth(rel), 1e-4));
    vec3 base = uColor * vWash;
    // the print grain the package ships, kept very light so the bands stay flat
    float grain = texture(uGrain, vec2(vPosition.x * 1.37, vPosition.y * 1.37)).r - .5;
    base *= 1.0 + .03 * grain;
    vec3 pale = vec3(.96, .76, .60);
    vec3 organ = base * (1.0 - 2.0 * CEL_SHADE * shadow - 2.0 * CEL_SHADE * core);
    organ *= 1.0 - uNod * CEL_SHADE * nod;
    organ = mix(organ, pale, 1.6 * CEL_LIT * lit * uShine);
    organ += uColor * uDark * .10;
    outColor = vec4(linearToSrgb(clamp(organ, 0.0, 1.0)), uAlpha * win);
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
uniform vec3 uColor;
uniform float uAlpha;     // the pool's fade in and the body's dissolve
uniform float uWash;      // the wash's strength
uniform float uBand;      // the meniscus band's thickness (scene units)
uniform vec3 inkColor;
uniform float inkA;
uniform vec4 cut;
out vec4 outColor;

#define CEL_SHADE ${CEL.SHADE}
#define CEL_LIT ${CEL.LIT}

vec3 linearToSrgb(vec3 c) {
    c = max(c, vec3(0.0));
    return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - .055, step(vec3(.0031308), c));
}

void main() {
    vec2 q = vClip.xy / vClip.w - cut.xy;
    float win = smoothstep(cut.z, cut.z + 0.3, length(vec2(q.x * cut.w, q.y)));
    if (win < 0.004) discard;
    float dTop = max(vEdge.x, 0.0), dBot = max(vEdge.y, 0.0), colH = vEdge.z;
    // soft at the cavity's walls (the columns shrink to nothing there) and floor
    float soft = smoothstep(0.0, 0.05, colH) * mix(0.35, 1.0, smoothstep(0.0, 0.07, dBot));
    // the tones: the deeper amber at the floor, the pale meniscus under the waterline; the wash is made richer than the artist's tan
    vec3 c = uColor;
    c = mix(vec3(dot(c, vec3(.2126, .7152, .0722))), c, 1.45);
    float deep = 1.0 - smoothstep(0.08, 0.13, dBot);
    float skin = 1.0 - smoothstep(0.7 * uBand, uBand, dTop);
    c *= 1.0 - 1.2 * CEL_SHADE * deep;
    c = mix(c, vec3(.98, .88, .52), 2.4 * CEL_LIT * skin);
    float a = uWash * soft * (1.0 + 0.30 * deep) * (1.0 + 0.50 * skin);
    vec3 srgb = linearToSrgb(clamp(c, 0.0, 1.0));
    // the waterline's ink: a line of about a pixel and a half along the surface
    float dpx = dTop / max(fwidth(dTop), 1e-6);
    float line = (1.0 - smoothstep(0.7, 1.8, dpx)) * inkA * smoothstep(0.0, 0.02, colH);
    srgb = mix(srgb, inkColor, line);
    outColor = vec4(srgb, clamp(max(a, line), 0.0, 1.0) * uAlpha * win);
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
