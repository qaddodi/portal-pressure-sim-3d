// The one material of the true-3D lobule and sinusoid (Settings > Figure depth > 3D lobule and sinusoid): solid shapes in the figure's cel style. EXACTLY TWO flat tones (the base and the shade, one hard but
// antialiased edge at CEL_STYLE.VESSEL_STEP_AT: the same two tones as the vessels), matte: no lit tone toward white, no gloss, no rim, no gradient. The light is THE WORLD light (CEL_STYLE.LIGHT): n.L is taken with the
// normal in world axes (the model matrix), so orbiting, zooming or tilting the camera never changes a shade; only a shape's own motion does. A bold ink round every shape (an inverted hull pushed out a fixed number
// of CSS px on screen, as the figure's other inks). Colours are raw sRGB numbers, as every cel shader of the app writes them.
//
// A part's colour is its `tint` times its vertex colours (when the geometry has them) times its instance colours (an InstancedMesh with setColorAt). Instances may be scaled
// unevenly: the normal is carried through the instance matrix's inverse transpose, so a squashed sphere still shades as a squashed sphere.
//
//   const m = microMaterials(shared, fade, { tint: [r, g, b], ink: [r, g, b], px: 1.25 });
//   const part = microPart(geometry, m);                group.add(part.group)
//   const many = microInstanced(geometry, m, count);    many.toon.setMatrixAt(i, m4); many.ink.setMatrixAt(i, m4) (or `many.setAt(i, m4, colour)`)
import {
  BufferAttribute, DoubleSide, BufferGeometry, Color, DataTexture, FrontSide, Group, InstancedMesh, LinearSRGBColorSpace, Matrix4, Mesh, ShaderMaterial, type Texture, type Vector2, Vector4,
} from 'three';
import { CEL_STYLE } from '../cel-style.ts';
import { CHEV, CHEVRON_GLSL, CHEV_LEVEL_MIN } from '../blood/chevron-glsl.ts';
import { LENS_SHARED } from '../lenses/tokens.copied.ts';
import { FADE_GLSL } from '../materials/shaders.ts';
import { CEL_LIGHT_UNIT } from '../cel-glsl.ts';
import { STREAK, STREAK_FIELD_GLSL } from '../blood/streak-glsl.ts';
/** The streak field's units to a tube radius, so a streak's mean length (FIELD_LEN) is LEN_OF_R radii, as the Anatomy's are. */
const STREAK_FIELD_PER_R = (STREAK.FIELD_LEN[0] + STREAK.FIELD_LEN[1] / 2) / STREAK.FIELD_LEN_R;

const hexRGB = (h: string): [number, number, number] => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const F = (x: number): string => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const L = CEL_LIGHT_UNIT;

export const MICRO_VS = /* glsl */ `
uniform float inflate;
varying vec3 vN;
varying vec3 vVD;
varying vec3 vC;
varying float vHy;
#if defined(STREAKS) || defined(FLOW)
attribute float aux;
#endif
varying vec3 vP;
#ifdef STREAKS
varying float vAux;
#endif
#ifdef FLOW
attribute float aux2;
varying float vArc;
varying float vAcross;
#endif
#ifdef GAPS
varying vec2 vG;
#endif
void main() {
  vec3 p = position;
  vec3 n = normal;
#ifdef USE_INSTANCING
  mat3 im = mat3(instanceMatrix);
  vec3 s2 = vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
  n = im * (n / max(s2, vec3(1e-12)));
  p = (instanceMatrix * vec4(p, 1.0)).xyz;
#endif
  vC = vec3(1.0);
#ifdef USE_COLOR
  vC *= color.rgb;
#endif
#ifdef USE_INSTANCING_COLOR
  vC *= instanceColor;
#endif
  vN = normalize(mat3(modelMatrix) * n);   // the normal in WORLD axes: the light is fixed in the world, not on the screen
  vHy = p.y; vP = p;
#ifdef STREAKS
  vAux = aux;
#endif
#ifdef FLOW
  vArc = aux; vAcross = aux2;
#endif
#ifdef GAPS
  vG = position.xy;
#endif
  vec4 mvR = modelViewMatrix * vec4(p + normal * inflate, 1.0);
  vVD = cameraPosition - (modelMatrix * vec4(p, 1.0)).xyz;   // (toward the eye in WORLD axes, beside the world normal vN: the rim's n.v needs no view-space normal)
  gl_Position = projectionMatrix * mvR;
}`;

export const MICRO_FS = /* glsl */ `
${FADE_GLSL}
uniform vec3 tint;
uniform float opacity;
varying vec3 vN;
varying vec3 vC;
// the haze: what lies away from the scene's subject (|y| past uHaze.x, whole by uHaze.y, local units) melts toward uHazeCol by up to uHaze.z, its detail and line with it, as a lens's
// depth of field would soften it (the next sinusoids, their Disse and plates must not pull the eye from the one in focus, Mohammad 20 Nov 2026); uHaze.z 0: none
uniform vec4 uHaze;
uniform vec3 uHazeCol;
varying float vHy;
float hazeK() { return uHaze.z * smoothstep(uHaze.x, uHaze.y, abs(vHy)); }
uniform float uHole;
// the shape's own line, drawn in its fill (uRim CSS px wide, uMicroDpr the canvas's pixel ratio, ink uRimCol, 0: none): where the surface turns away from the eye, measured in screen pixels from the outline by the
// rate the facing changes (a dome's facing falls as the square root of the distance to its rim, so half the facing over its screen rate is that distance). It lies inside the shape: it
// can never fight a surface behind it or its own fill, so it is whole and smooth on every screen (the hull's line broke into dashes and specks, eyes 20 Nov).
uniform float uRim;
uniform float uMicroDpr;
uniform vec3 uRimCol;
varying vec3 vVD;
varying vec3 vP;
// the wedged column's wash (2D sinusoid-gl.js wedgeA): an amber column in the stream from the central vein's end (uWash.z) toward the portal venule's (uWash.y), as far as uWash.w of the way, soft at
// its front; uWash.x its strength (0: none, as on every slide but one). The blood in it is still: its streaks die away.
uniform vec4 uWash;
uniform vec3 uWashCol;
// (uWashR > 0: the lobule's wash, a front of radius uWash.w lobule radii from the central vein out, uWashR local units to a lobule radius: 2D lobule-wash.js)
uniform float uWashR;
float washA() {
  if (uWash.x <= 0.0) return 0.0;
  if (uWashR > 0.0) { float rho = length(vP.xy) / uWashR; return uWash.x * (1.0 - smoothstep(uWash.w - 0.04, uWash.w, rho)); }
  float span = uWash.y - uWash.z;
  if (uWash.x <= 0.0 || abs(span) < 1.0) return 0.0;
  float t = (vP.x - uWash.z) / span, f = uWash.w * 1.08;
  return uWash.x * (1.0 - smoothstep(f - 0.08, f, t));
}
#if defined(STREAKS) || defined(FLOW)
${CHEVRON_GLSL}
// the ONE streak (blood/streak-glsl.ts: 3, 5 or 7 lanes, slim rounded lozenges feathered at both ends, a tone and a pace of their own, parabolic lanes): the same as the Anatomy's vessels
${STREAK_FIELD_GLSL}
#endif
#ifdef STREAKS
// streaks in a stream (the blood in a lumen, the lymph in Disse), fixed to the tissue (µm along x) and carried by the flow: lanes across the stream (aux: -1 .. 1 across it), the middle lanes fastest;
// one flat lighter tone (one shade above the lumen's), never a gradient
uniform float uFlow;      // how far the stream has run (µm)
uniform float uHalf;      // the stream's half width (µm): the lanes' pitch is across it
uniform float uStreak;    // how strong the streaks are (0 none)
uniform float uProfile;   // 1: the parabolic lanes of the blood; 0: one speed; under 0: chevrons across the stream (the lymph), pointing the way it runs
uniform vec3 uStreakCol;  // the streaks' one tone
varying float vAux;
uniform float uStreakDir; // +1: the heads lead toward +x (the way the stream runs); -1: toward -x (a reversed flow)
float streaks() { return streakField(vAux, vP.x, uFlow, uHalf, uProfile, uStreakDir); }
// the Anatomy's chevron (blood/chevron-glsl.ts), every 6 µm across the stream, its point leading the way the stream runs (the flow's sign): (core, ring)
vec2 chevrons() {
  float dir = uFlow >= 0.0 ? 1.0 : -1.0;
  return chevLattice(vP.x - uFlow, vAux, 6.0, max(fwidth(vP.x), 1e-5), dir);
}
#endif
#ifdef FLOW
// the flow along a tube (Mohammad, 20 Nov 2026: "chevrons + streaks ... quiet and inside the vessel"): aux is the place along it in the blood's own direction (local units),
// aux2 the place across it (-1 .. 1 over the face the viewer sees; 3 where no mark may be, at the central vein's mouth). Chevrons, their point leading, in the middle of the tube
// only; with uFlowStreak, a few slim streaks in lanes between them. One lighter tone, hard-edged, never a gradient.
uniform float uFlowT;      // how far the marks have run (local units)
uniform float uFlowPitch;  // between chevrons (local units)
uniform float uFlowK;      // how strong (0 none)
uniform float uFlowStreak; // the streaks' share of uFlowK (0 none)
uniform float uFlowHead;   // (kept for the API: every head is THE flow head now)
uniform vec3 uFlowCol;
uniform float uFlowR;      // the tube's radius (local units): the heads' size
uniform float uFlowDark;   // 1: the blood's heads, near black as the Anatomy's
uniform vec3 uFlowInk;     // their colour (LENS_SHARED.chevron)
uniform float uDpr;        // device px per CSS px (the heads' sizes are the Anatomy's, in CSS px)
varying float vArc;
varying float vAcross;
float fh(float x) { return fract(sin(x * 91.7 + 13.3) * 43758.5453); }
// the heads: THE flow head of every view (blood/chevron-glsl.ts, the Anatomy's own shape), one every uFlowPitch along the tube, as wide as 0.55 of its radius (uFlowR); the blood's are
// near black with their dark ring (uFlowDark 1, uFlowInk), as the Anatomy's are; the lymph's and the bile's in their own lighter tone. Returns (coverage, ring).
vec2 flowHeads() {
  if (vAcross > 2.0) return vec2(0.0);
  // the Anatomy's rules, in its CSS px (blood/chevron-glsl.ts CHEV, the one table: vessels/shaders.ts chevOne): one head every PITCH_PX CSS px along the tube on the SCREEN, on a lattice that halves and doubles with the zoom (nothing jumps),
  // a head 55 percent of the lumen wide (at least 4 px, never over 60 percent), 1.4 x its width long, sharp: blood/chevron-glsl.ts CHEV, chevHw; and none on a tube under MIN_R_PX of radius
  float R = max(uFlowR, 1e-5);
  float pxA = max(length(vec2(dFdx(vArc), dFdy(vArc))), 1e-7), wpc = pxA * uDpr;
  float lv = max(${F(CHEV_LEVEL_MIN)}, log2(${F(CHEV.PITCH_PX)} * wpc / max(uFlowPitch, 1e-5)));
  float n0 = floor(lv), P = uFlowPitch * exp2(n0);
  float j = floor((vArc - uFlowT) / P + 0.5), x = vArc - uFlowT - j * P;
  float kp = chevKeep(j, n0, lv);
  float hw = chevHw(R, wpc) * chevSize(kp);
  if (abs(x) > 2.0 * hw + 4.0 * pxA) return vec2(0.0);
  float k = chevAlpha(kp) * smoothstep(${F(CHEV.MIN_R_PX)} * wpc, ${F(CHEV.MIN_R_PX + 0.6)} * wpc, R);
  return chevHead(x, abs(vAcross) * R, hw, pxA, 0.0) * k;
}
// the streaks: THE ONE STREAK field (blood/streak-glsl.ts, the Anatomy's and the sinusoid's), sized on the SCREEN as the Anatomy's are: 3, 5 or 7 lanes by the tube's radius in CSS px, each streak a long
// soft lozenge (STREAK.FIELD_LEN_R radii), its core CORE_PX thick, one lane under 8 px across, three to 16 px, five above, none under 3.5 px. uFlowStreak: how strong (0 none: the Blood streaks setting off, or not this fluid).
float flowStreaks() {
  if (uFlowStreak <= 0.0 || vAcross > 2.0) return 0.0;
  float R = max(uFlowR, 1e-5);
  float wpc = max(length(vec2(dFdx(vArc), dFdy(vArc))), 1e-7) * uDpr, rPx = R / wpc;
  if (rPx < ${F(CHEV.MIN_R_PX)}) return 0.0;   // (a tube under 3.5 px across carries none)
  float lanes = rPx < ${F(STREAK.LANE_R_PX[0])} ? 1.0 : rPx < ${F(STREAK.LANE_R_PX[1])} ? 3.0 : 5.0;   // (1 under 8 px across, 3 to 16 px, 5 above)
  float s = ${F(STREAK_FIELD_PER_R)} / R * rPx / clamp(rPx, ${F(STREAK.LEN_R_PX[0])}, ${F(STREAK.LEN_R_PX[1])});   // field units per local unit: a streak's mean length about FIELD_LEN_R radii, held to 24 to 96 CSS px (STREAK.LEN_R_PX)
  gStreakPx = rPx; gStreakLanes = lanes; gStreakWide = smoothstep(${F(STREAK.WIDE_R_PX[0])}, ${F(STREAK.WIDE_R_PX[1])}, rPx);
  return streakField(vAcross, vArc * s, uFlowT * s, 1.0, 1.0, 1.0) * uFlowStreak;
}
#endif
#ifdef GAPS
// real gaps through a sheet (the sinusoid's fenestrae, Mohammad 20 Nov 2026: "complete, not just circle holes: actually a gap in the membrane"): one texel per 1 µm slot along x, per side (row 0 the
// side at local y > 0, row 1 the other), holding the gap's half width (red, 0..1 of 0.5 µm). A fragment within it is not drawn at all, across the whole bead and its wall, so the space of Disse shows through;
// the cut's own edge is a slim dark line (screen px wide, antialiased), as the sheet's other edges are inked.
uniform sampler2D uGaps;
varying vec2 vG;      // the fragment's own place on the sheet (local x and y, µm)
uniform vec4 uGapX;   // x: the first slot's x (µm), y: the slots (the texture's width), z: 0.5 µm per unit of red
float gapCut() {
  float u = vG.x - uGapX.x, j = floor(u);
  if (j < 0.0 || j >= uGapX.y) return 0.0;
  float hw = texture2D(uGaps, vec2((j + 0.5) / uGapX.y, vG.y > 0.0 ? 0.25 : 0.75)).r * uGapX.z;
  if (hw <= 0.0) return 0.0;
  float d = abs(u - j - 0.5) - hw, wpx = max(fwidth(u), 1e-5);
  if (d < 0.0) discard;
  return 1.0 - smoothstep(0.6 * wpx, 1.8 * wpx, d);
}
#endif
void main() {
  if (fadedOut()) discard;
  // (a hole: what lies within uHole of the part's own origin is not drawn: the sinusoids' ends inside the central vein's pool, so they merge into it with no shade or line of theirs inside)
  if (uHole > 0.0 && length(vP.xy) < uHole) discard;
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  // the world light (CEL_STYLE.LIGHT): n.L with n in world axes. TWO tones: the base, and the shade below the step
  float s = dot(n, vec3(${F(L[0])}, ${F(L[1])}, ${F(L[2])}));
  float w = max(fwidth(s) * 0.75, 1e-3);
  float shadeT = 1.0 - smoothstep(${F(CEL_STYLE.VESSEL_STEP_AT)} - w, ${F(CEL_STYLE.VESSEL_STEP_AT)} + w, s);
  vec3 c = tint * vC;
  c *= 1.0 - ${F(CEL_STYLE.MICRO.SHADE)} * shadeT;
#ifdef GAPS
  c = mix(c, c * 0.35, gapCut());
#endif
  float wz = washA();
#ifdef STREAKS
  if (uProfile < 0.0) {
    vec2 ch = chevrons();
    c = mix(c, uStreakCol, uStreak * ch.x);
    c = mix(c, CHEV_RIM, uStreak * 0.75 * ch.y);
  } else {
    float sk = streaks() * (1.0 - 0.9 * wz);
    c = mix(c, streakTone(c, uStreakCol, gStreakK.x, gStreakK.y), uStreak * sk);   // (a streak's own tone between the surface's and the streak colour's)
    c = mix(c, uWashCol, 0.85 * wz);
  }
#endif
#ifdef FLOW
  vec2 hd = flowHeads();
  hd *= 1.0 - wz;   // (the wedged blood is still: its marks die away under the wash)
  c = mix(c, streakTone(c, uFlowCol, gStreakK.x, gStreakK.y), flowStreaks() * (1.0 - clamp(hd.x + hd.y, 0.0, 1.0)) * (1.0 - wz));   // (the streaks lie UNDER the chevrons: a head's pixel is never tinted by one)
  vec3 inkH = mix(uFlowInk, c * 0.3, 0.2), rimH = vec3(0.2314, 0.1725, 0.1333);   // (the Anatomy's: the head ink a touch of the lumen's own deep tone, the ring always the dark ink)
  float hk = uFlowDark > 0.5 ? clamp(uFlowK, 0.0, 1.0) : uFlowK * 1.6;   // (the blood's dark heads whole at uFlowK 1, and they dissolve with the view as everything else does)
  vec3 core = uFlowDark > 0.5 ? inkH : uFlowCol;
  float ac = clamp(hd.x * hk, 0.0, 1.0), ar = clamp(hd.y * 0.75 * hk, 0.0, 1.0);
  c = c * (1.0 - ac - ar * (1.0 - ac)) + core * ac + rimH * ar * (1.0 - ac);
#endif
#ifndef STREAKS
  c = mix(c, uWashCol, 0.85 * wz);
#endif
  if (uRim > 0.0) {
    float nv = abs(dot(normalize(vN), normalize(vVD)));
    float dpx = 0.5 * nv / max(length(vec2(dFdx(nv), dFdy(nv))), 1e-5);   // (the gradient's length, not fwidth: fwidth reads a diagonal edge up to 1.4 times steep, so a ring was thicker on its diagonals)
    float rp = uRim * uMicroDpr;
    c = mix(c, uRimCol, 1.0 - smoothstep(rp - 0.6, rp + 0.6, dpx));
  }
  c = mix(c, uHazeCol, hazeK());
  gl_FragColor = vec4(c * opacity, opacity);
}`;

/** How far behind its shape the ink hull sits, as a share of its distance from the eye. */
export const INK_BACK = 0.0015;
/** No line thinner than this (CSS px): the canvas has no multisampling, and a hull band under about 1.5 device px breaks into dashes as it crosses the pixel grid (the dotted
 *  hepatocytes, the stippled nucleus rings, eyes 20 Nov). Every micro part's line is held to it, so no part can ask for a line too thin to draw. */
export const MIN_LINE = 1.0;
/** The canvas's pixel ratio, for the lines drawn in the fill (uRim, device px). The scene writes it each frame; every micro part's rim width follows it. */
export const MICRO_DPR = { value: 2 };
export const MICRO_INK_VS = /* glsl */ `
uniform float px;
uniform vec2 res;
uniform vec3 tint;
uniform float inflate;
varying float vHy;
varying vec2 vXY;
varying vec3 vOwnC;
void main() {
  vOwnC = tint;
#ifdef USE_COLOR
  vOwnC *= color.rgb;
#endif
#ifdef USE_INSTANCING_COLOR
  vOwnC *= instanceColor;
#endif
  vec3 p = position;
  vec3 n = normal;
#ifdef USE_INSTANCING
  mat3 im = mat3(instanceMatrix);
  vec3 s2 = vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
  n = im * (n / max(s2, vec3(1e-12)));
  p = (instanceMatrix * vec4(p, 1.0)).xyz;
#endif
  p += normal * inflate;   // (as its shape swells or shrinks: a dilated sinusoid keeps its line)
  vHy = p.y; vXY = p.xy;
  // the hull's faces toward the viewer sit a hair behind the shape (0.15 % farther from the eye, which moves nothing on screen): drawn on both sides, they lie just under the shape's own and
  // never show, and everything pushed out past the outline shows whichever way its triangles ended up wound. (A back-face cull dropped the thin rim strips the push turned over, and a
  // cull by the normal dropped the hull at every rim vertex: the red cells' outline came out dotted, Mohammad 20 Nov: "the RBC outline is interrupted".)
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec3 vn = normalize(normalMatrix * n);
  // only what faces the viewer goes back (it must hide under the shape's own face); the rim and the far side stay at their true depth, so the line pushed out past the outline is never sunk
  // under a surface just behind the shape (Disse behind a microvillus, the plate under a lobule vessel: there a push of the whole hull hid the line, Mohammad 20 Nov: "the microvilli need a black outline")
  bool ortho = projectionMatrix[2][3] == 0.0;
  float back = ${F(INK_BACK)} * smoothstep(0.05, 0.35, dot(vn, ortho ? vec3(0.0, 0.0, 1.0) : normalize(-mv.xyz)));
  mv.xyz *= 1.0 + back;
  vec4 c = projectionMatrix * mv;
  if (ortho) c.z += back * c.w;
  vec2 nd = (projectionMatrix * vec4(vn, 0.0)).xy;
  float l = length(nd);
  nd = l > 1e-6 ? nd / l : vec2(0.0);
  // only a normal that faces sideways on screen pushes the line out: a face toward the viewer (a tile's top, the inner ring of a bevel) stays put, so the hull never folds
  // over the face and draws creases across it
  c.xy += nd * px * smoothstep(0.2, 0.6, length(vn.xy)) * 2.0 / res * c.w;
  gl_Position = c;
}`;

export const MICRO_INK_FS = /* glsl */ `
${FADE_GLSL}
uniform vec3 color;
uniform float opacity;
// a vessel's line is the Anatomy's (vessels/shaders.ts): the look's casing taken uOwn of the way to a deep tone (x ${F(CEL_STYLE.TUBE.INK_TONE)}) of the part's own colour (Mohammad 20 Nov: "lobule
// vessels should have black outlines just like other vessels"); uOwn 0: the flat ink colour (the tissue's)
uniform float uOwn;
varying vec3 vOwnC;
// the haze: what lies away from the scene's subject (|y| past uHaze.x, whole by uHaze.y, local units) melts toward uHazeCol by up to uHaze.z, its detail and line with it, as a lens's
// depth of field would soften it (the next sinusoids, their Disse and plates must not pull the eye from the one in focus, Mohammad 20 Nov 2026); uHaze.z 0: none
uniform vec4 uHaze;
uniform vec3 uHazeCol;
varying float vHy;
float hazeK() { return uHaze.z * smoothstep(uHaze.x, uHaze.y, abs(vHy)); }
uniform float uHole;
varying vec2 vXY;
void main() { if (fadedOut()) discard; if (uHole > 0.0 && length(vXY) < uHole) discard; vec3 c = mix(color, vOwnC * ${F(CEL_STYLE.TUBE.INK_TONE)}, uOwn); gl_FragColor = vec4(mix(c, uHazeCol, hazeK()) * opacity, opacity); }`;

export type RGB = readonly [number, number, number] | readonly number[];

/** A part's two materials: its toon pass and its ink. */
export interface MicroMats { toon: ShaderMaterial; ink: ShaderMaterial | null }
export interface MicroOptions {
  tint?: RGB; ink?: RGB | null; px?: number;
  /** The geometry carries a `color` attribute (vertex colours). */
  vertexColors?: boolean;
  /** Streaks carried by a flow (the geometry has an `aux` attribute: the place across the stream, -1 to 1): set uFlow, uHalf, uStreak, uProfile, uStreakCol. */
  streaks?: boolean;
  /** The haze's uniforms, shared by every part of a scene (hazeUniforms()); none by default. */
  haze?: HazeUniforms;
  /** Flow marks along a tube (the geometry has `aux`, the place along it, and `aux2`, across it): set them with MicroPart.setFlow. */
  flow?: boolean;
  /** Real gaps through the sheet along x (the geometry's local x and y): `gaps.tex` holds one texel per slot per side, `gaps.x` its layout (see MICRO_FS GAPS). */
  gaps?: { tex: Texture; x: Vector4 };
  /** Draw both sides (a thin sheet seen from either side). */
  doubleSide?: boolean;
  /** Drawn see-through (opacity below 1): sorted after the solid parts, no depth written. */
  transparent?: boolean;
  /** The shape's line drawn inside its fill, this many CSS px (the small solid shapes: red cells, nuclei, albumin, the cells of the lining); 0 or none: no such line. */
  rim?: number;
}

/** The gap table of a part without gaps: one closed texel. */
const NO_GAPS = new DataTexture(new Uint8Array(4), 1, 1);
NO_GAPS.needsUpdate = true;

/** Sets a three Color from raw sRGB numbers (no conversion: the shaders write them as they are). */
export const rawRGB = (c: Color, rgb: RGB): Color => c.setRGB(rgb[0]!, rgb[1]!, rgb[2]!, LinearSRGBColorSpace);

/** The toon and ink materials of a part. `fade` is the view's one dissolve uniform (the dive). */
/** A scene's haze uniforms (see MICRO_FS): x where it starts and y where it is whole (|y|, local units), z how far toward the colour; w unused. */
export interface HazeUniforms { uHaze: { value: Vector4 }; uHazeCol: { value: Color } }
export const hazeUniforms = (): HazeUniforms => ({ uHaze: { value: new Vector4(1e9, 2e9, 0, 0) }, uHazeCol: { value: new Color() } });

export function microMaterials(res: { value: Vector2 }, fade: { value: number }, o: MicroOptions = {}): MicroMats {
  const haze = o.haze ?? hazeUniforms();
  const toon = new ShaderMaterial({
    vertexShader: MICRO_VS, fragmentShader: MICRO_FS, vertexColors: !!o.vertexColors,
    defines: { ...(o.streaks ? { STREAKS: '' } : o.flow ? { FLOW: '' } : {}), ...(o.gaps ? { GAPS: '' } : {}) },
    uniforms: {
      tint: { value: rawRGB(new Color(), o.tint ?? [1, 1, 1]) }, opacity: { value: 1 }, inflate: { value: 0 }, fade,
      // (every toon carries the streaks' uniforms, so a program read without its define still finds each one it declares)
      uHole: { value: 0 }, uRim: { value: o.rim ?? 0 }, uMicroDpr: MICRO_DPR, uRimCol: { value: rawRGB(new Color(), o.ink ?? [0.1, 0.08, 0.1]) }, uWash: { value: new Vector4(0, 0, 0, 0) }, uWashCol: { value: new Color(1, 0.7, 0.2) }, uWashR: { value: 0 },
      uFlow: { value: 0 }, uHalf: { value: 5 }, uStreak: { value: 0.3 }, uProfile: { value: 1 }, uStreakDir: { value: 1 }, uStreakCol: { value: new Color(1, 1, 1) },
      uHaze: haze.uHaze, uHazeCol: haze.uHazeCol,
      uFlowT: { value: 0 }, uFlowPitch: { value: 0.12 }, uFlowK: { value: 0 }, uFlowStreak: { value: 0 }, uFlowHead: { value: 0 }, uFlowCol: { value: new Color(1, 1, 1) },
      uFlowR: { value: 0.02 }, uDpr: { value: 2 }, uFlowDark: { value: 0 }, uFlowInk: { value: rawRGB(new Color(), hexRGB(LENS_SHARED.chevron)) },
      // (every toon carries the gaps' uniforms too, a blank texture and no slots where it has none, so a program read without GAPS still finds each one)
      uGaps: { value: o.gaps?.tex ?? NO_GAPS }, uGapX: { value: o.gaps?.x ?? new Vector4(0, 0, 0, 0) },
    },
    side: o.doubleSide ? 2 : FrontSide, transparent: !!o.transparent, depthWrite: !o.transparent,
  });
  const ink = o.ink === null ? null : new ShaderMaterial({
    vertexShader: MICRO_INK_VS, fragmentShader: MICRO_INK_FS, vertexColors: !!o.vertexColors,
    uniforms: { color: { value: rawRGB(new Color(), o.ink ?? [0.1, 0.08, 0.1]) }, opacity: toon.uniforms.opacity!, tint: toon.uniforms.tint!, inflate: toon.uniforms.inflate!, uHole: toon.uniforms.uHole!, uOwn: { value: 0 }, px: { value: Math.max(MIN_LINE, o.px ?? CEL_STYLE.MICRO.LINE) }, res, fade, uHaze: haze.uHaze, uHazeCol: haze.uHazeCol },
    side: DoubleSide, transparent: !!o.transparent, depthWrite: !o.transparent,
  });
  return { toon, ink };
}

/** One shape drawn with its ink behind it. */
export class MicroPart {
  readonly group = new Group();
  readonly toonMesh: Mesh;
  readonly inkMesh: Mesh | null;
  readonly geometry: BufferGeometry;
  readonly mats: MicroMats;
  constructor(geometry: BufferGeometry, mats: MicroMats, name = 'micro') {
    this.geometry = geometry; this.mats = mats;
    this.toonMesh = new Mesh(geometry, mats.toon);
    this.inkMesh = mats.ink ? new Mesh(geometry, mats.ink) : null;
    this.toonMesh.name = name; if (this.inkMesh) this.inkMesh.name = `${name}/ink`;
    for (const m of [this.toonMesh, this.inkMesh]) if (m) { m.frustumCulled = false; this.group.add(m); }
  }
  setTint(rgb: RGB): void { rawRGB(this.mats.toon.uniforms.tint!.value as Color, rgb); }
  setInk(rgb: RGB): void { if (this.mats.ink) rawRGB(this.mats.ink.uniforms.color!.value as Color, rgb); rawRGB(this.mats.toon.uniforms.uRimCol!.value as Color, rgb); }
  /** A vessel's line: `rgb` (the look's casing) taken `own` of the way to a deep tone of the part's own colour, as the Anatomy's vessels are inked. */
  setVesselInk(rgb: RGB, own: number = CEL_STYLE.TUBE.INK_OWN): void { if (!this.mats.ink) return; this.setInk(rgb); this.mats.ink.uniforms.uOwn!.value = own; }
  /** Not drawn within r (local units) of the part's origin, its ink neither; 0: drawn whole. */
  setHole(r: number): void { this.mats.toon.uniforms.uHole!.value = r; }
  setOpacity(a: number): void { this.mats.toon.uniforms.opacity!.value = a; this.group.visible = a > 0.002; }
  /** A streaked part's flow (µm run), the stream's half width (µm), the streaks' tone and strength and whether the lanes have the blood's profile. */
  setStreaks(flow: number, half: number, rgb: RGB, strength: number, profile: number): void {
    const u = this.mats.toon.uniforms;
    u.uFlow.value = flow % 1e6; u.uHalf!.value = half; u.uStreak!.value = strength; u.uProfile!.value = profile; rawRGB(u.uStreakCol!.value as Color, rgb);
  }
  /** The wedged column's wash on a streaked stream: its strength, the portal and central ends (µm along) and how far it has come from the central end (0 to 1), in its colour. */
  setWash(k: number, portalX: number, centralX: number, progress: number, rgb: RGB): void {
    (this.mats.toon.uniforms.uWash!.value as Vector4).set(k, portalX, centralX, progress); rawRGB(this.mats.toon.uniforms.uWashCol!.value as Color, rgb);
  }
  /** The lobule's wash: strength k, its front `front` lobule radii from the centre (the part's local origin), `perR` local units to a lobule radius. */
  setRadialWash(k: number, front: number, perR: number, rgb: RGB): void {
    const u = this.mats.toon.uniforms;
    (u.uWash!.value as Vector4).set(k, 0, 0, front); u.uWashR!.value = perR; rawRGB(u.uWashCol!.value as Color, rgb);
  }
  /** A flowing part's marks: how far they have run, their pitch (local units), their tone and strength, the streaks' share, and filled heads (the bile) or open chevrons. */
  setFlow(t: number, pitch: number, rgb: RGB, k: number, streak = 0, head = 0, r = 0.02, dark = false, dpr = 2): void {
    const u = this.mats.toon.uniforms;
    u.uFlowT!.value = ((t % 1e4) + 1e4) % 1e4; u.uFlowPitch!.value = pitch; u.uFlowK!.value = k; u.uFlowStreak!.value = streak; u.uFlowHead!.value = head; rawRGB(u.uFlowCol!.value as Color, rgb);
    u.uFlowR!.value = r; u.uFlowDark!.value = dark ? 1 : 0;
    u.uDpr!.value = dpr;
  }
  set renderOrder(o: number) { this.toonMesh.renderOrder = o; if (this.inkMesh) this.inkMesh.renderOrder = o; }
  dispose(): void { this.geometry.dispose(); this.mats.toon.dispose(); this.mats.ink?.dispose(); }
}

/** Many copies of one shape (cells, pores, albumin): the toon and the ink are two instanced meshes that share the matrices and colours. */
export class MicroMany {
  readonly group = new Group();
  readonly toon: InstancedMesh;
  readonly ink: InstancedMesh | null;
  private readonly col = new Color();
  readonly geometry: BufferGeometry;
  readonly mats: MicroMats;
  readonly capacity: number;
  constructor(geometry: BufferGeometry, mats: MicroMats, capacity: number, name = 'micro-many') {
    this.geometry = geometry; this.mats = mats; this.capacity = capacity;
    this.toon = new InstancedMesh(geometry, mats.toon, capacity);
    this.ink = mats.ink ? new InstancedMesh(geometry, mats.ink, capacity) : null;
    this.toon.name = name; if (this.ink) this.ink.name = `${name}/ink`;
    for (const m of [this.toon, this.ink]) if (m) { m.frustumCulled = false; m.count = 0; this.group.add(m); }
  }
  /** Writes copy i (its matrix and, when given, its colour); call `commit(n)` once all are written. */
  setAt(i: number, m: Matrix4, rgb?: RGB): void {
    this.toon.setMatrixAt(i, m); this.ink?.setMatrixAt(i, m);
    if (rgb) this.toon.setColorAt(i, rawRGB(this.col, rgb));
  }
  commit(n: number): void {
    const c = Math.min(n, this.capacity);
    this.toon.count = c; this.toon.instanceMatrix.needsUpdate = true; if (this.toon.instanceColor) this.toon.instanceColor.needsUpdate = true;
    if (this.ink) { this.ink.count = c; this.ink.instanceMatrix.needsUpdate = true; }
    this.group.visible = c > 0;
  }
  setTint(rgb: RGB): void { rawRGB(this.mats.toon.uniforms.tint!.value as Color, rgb); }
  setInk(rgb: RGB): void { if (this.mats.ink) rawRGB(this.mats.ink.uniforms.color!.value as Color, rgb); rawRGB(this.mats.toon.uniforms.uRimCol!.value as Color, rgb); }
  set renderOrder(o: number) { this.toon.renderOrder = o; if (this.ink) this.ink.renderOrder = o; }
  dispose(): void { this.geometry.dispose(); this.mats.toon.dispose(); this.mats.ink?.dispose(); this.toon.dispose(); this.ink?.dispose(); }
}

// ---- geometry ----------------------------------------------------------------------------------------------------------------------

/** A growing indexed mesh: positions, normals, optional colours. */
export class MeshBuilder {
  p: number[] = []; n: number[] = []; c: number[] = []; idx: number[] = [];
  /** One number per vertex for a shader's own use (`aux`): push it right after each v(), for every vertex or none. */
  aux: number[] = [];
  /** A second number per vertex (`aux2`), the same rule. */
  aux2: number[] = [];
  get count(): number { return this.p.length / 3; }
  v(x: number, y: number, z: number, nx: number, ny: number, nz: number, col?: RGB): number {
    const l = Math.hypot(nx, ny, nz) || 1;
    this.p.push(x, y, z); this.n.push(nx / l, ny / l, nz / l);
    if (col) this.c.push(col[0]!, col[1]!, col[2]!);
    return this.count - 1;
  }
  tri(a: number, b: number, c: number): void { this.idx.push(a, b, c); }
  quad(a: number, b: number, c: number, d: number): void { this.idx.push(a, b, c, a, c, d); }
  /** A strip between two rows of the same length (row a then row b, counter-clockwise seen from the front when a runs left to right below b). */
  strip(a0: number, b0: number, len: number, closed = false): void {
    const m = closed ? len : len - 1;
    for (let i = 0; i < m; i++) { const i1 = (i + 1) % len; this.quad(a0 + i, a0 + i1, b0 + i1, b0 + i); }
  }
  build(into?: BufferGeometry): BufferGeometry {
    const g = into ?? new BufferGeometry();
    this.orient();
    const set = (name: string, arr: number[], k: number) => {
      const old = g.getAttribute(name) as BufferAttribute | undefined;
      if (old && old.array.length === arr.length) { (old.array as Float32Array).set(arr); old.needsUpdate = true; } else g.setAttribute(name, new BufferAttribute(new Float32Array(arr), k));
    };
    set('position', this.p, 3); set('normal', this.n, 3);
    if (this.c.length) set('color', this.c, 3);
    if (this.aux.length) set('aux', this.aux, 1);
    if (this.aux2.length) set('aux2', this.aux2, 1);
    const ix = g.getIndex();
    if (ix && ix.array.length === this.idx.length) { (ix.array as Uint32Array).set(this.idx); ix.needsUpdate = true; } else g.setIndex(new BufferAttribute(new Uint32Array(this.idx), 1));
    g.computeBoundingSphere();
    return g;
  }
  /** Every triangle wound to face the way its vertices' normals do. A triangle wound against its normals is culled by its toon (front faces only) and drawn by its ink (back faces),
   *  so it shows as a hole of ink colour: the dark red cells (a lathe wound inside out) and the X across every hepatocyte (the top's fan folding where the inset ring crosses itself at a
   *  rounded corner), 20 Nov 2026. Turning each one here fixes every shape built, whatever builds it. */
  private orient(): void {
    const p = this.p, n = this.n, ix = this.idx;
    for (let t = 0; t + 2 < ix.length; t += 3) {
      const a = ix[t]! * 3, b = ix[t + 1]! * 3, c = ix[t + 2]! * 3;
      const e1x = p[b]! - p[a]!, e1y = p[b + 1]! - p[a + 1]!, e1z = p[b + 2]! - p[a + 2]!;
      const e2x = p[c]! - p[a]!, e2y = p[c + 1]! - p[a + 1]!, e2z = p[c + 2]! - p[a + 2]!;
      const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
      const d = fx * (n[a]! + n[b]! + n[c]!) + fy * (n[a + 1]! + n[b + 1]! + n[c + 1]!) + fz * (n[a + 2]! + n[b + 2]! + n[c + 2]!);
      if (d < 0) { const k = ix[t + 1]!; ix[t + 1] = ix[t + 2]!; ix[t + 2] = k; }
    }
  }
}

export type P2 = [number, number];

/** The outward unit normal of a closed, counter-clockwise outline at each point (the average of its two edges'). */
export function outlineNormals(pts: readonly P2[]): P2[] {
  const n = pts.length, out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n]!, b = pts[i]!, c = pts[(i + 1) % n]!;
    let ex = c[0] - a[0], ey = c[1] - a[1];
    const l = Math.hypot(ex, ey) || 1; ex /= l; ey /= l;
    out.push([ey, -ex]);   // (counter-clockwise: the outside is to the right of the way round)
  }
  return out;
}

/** Signed area (positive: counter-clockwise). */
export const areaOf = (pts: readonly P2[]): number => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i]!, q = pts[(i + 1) % pts.length]!; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };

/** Corners rounded off a closed outline by Chaikin's cut, `iter` times. */
export function chaikin(pts: readonly P2[], iter = 2, k = 0.25): P2[] {
  let cur = pts.slice() as P2[];
  for (let t = 0; t < iter; t++) {
    const nxt: P2[] = [];
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i]!, b = cur[(i + 1) % cur.length]!;
      nxt.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], [a[0] + (b[0] - a[0]) * (1 - k), a[1] + (b[1] - a[1]) * (1 - k)]);
    }
    cur = nxt;
  }
  return cur;
}

/** A pillow: a closed outline (counter-clockwise, star-shaped about its centroid) raised into a slab with a flat top at `zTop`, a rounded bevel `bevel` wide and a wall down to `zBot`.
 *  The bevel's normals turn smoothly from up to out, so its tones fall in clean bands (lit on the upper left, shade on the lower right) and the ink runs round the outline. */
export function pillow(b: MeshBuilder, outline: readonly P2[], zTop: number, zBot: number, bevel: number, col?: RGB, rings = 4, centre?: P2): void {
  let pts = outline as P2[];
  if (areaOf(pts) < 0) pts = pts.slice().reverse();
  const nrm = outlineNormals(pts), n = pts.length;
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; }
  cx /= n; cy /= n;
  if (centre) { cx = centre[0]; cy = centre[1]; }   // (a shape not star-shaped about its centroid, an arrow, gives a point it is)
  // the inset ring the bevel starts from (never past the centre)
  const inset = pts.map((p, i) => {
    const d = Math.hypot(p[0] - cx, p[1] - cy), k = Math.min(bevel, d * 0.7);
    return [p[0] - nrm[i]![0] * k, p[1] - nrm[i]![1] * k, k] as const;
  });
  const c0 = b.v(cx, cy, zTop, 0, 0, 1, col);
  const rows: number[] = [];
  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI / 2, s = Math.sin(phi), cphi = Math.cos(phi);
    rows.push(b.count);
    for (let i = 0; i < n; i++) {
      const q = inset[i]!, k = q[2];
      b.v(q[0] + nrm[i]![0] * k * s, q[1] + nrm[i]![1] * k * s, zTop - k + k * cphi, nrm[i]![0] * s, nrm[i]![1] * s, cphi, col);
    }
  }
  // the wall
  const w0 = b.count;
  for (let i = 0; i < n; i++) b.v(pts[i]![0], pts[i]![1], zBot, nrm[i]![0], nrm[i]![1], 0, col);
  for (let i = 0; i < n; i++) b.tri(c0, rows[0]! + i, rows[0]! + ((i + 1) % n));
  for (let r = 0; r < rings; r++) b.strip(rows[r + 1]!, rows[r]!, n, true);
  b.strip(w0, rows[rings]!, n, true);
}

/** An ellipsoid (a sphere scaled by rx, ry, rz) at (x, y, z), its own axes turned by `a` about z. */
export function ellipsoid(b: MeshBuilder, x: number, y: number, z: number, rx: number, ry: number, rz: number, a = 0, col?: RGB, seg = 18, rings = 10, even = false): void {
  const ca = Math.cos(a), sa = Math.sin(a), base = b.count;
  for (let r = 0; r <= rings; r++) {
    // (even: the rings even in their width seen from above, not in angle, so a flat lens's outline falls off over a whole band and not one sliver of a ring at its edge: the line drawn in
    // the fill (uRim) reads its width from that fall-off, and a sliver gave a ring one device pixel wide and uneven, eyes 20 Nov)
    const th = even ? ellipsoidRingAngle(r, rings) : (r / rings) * Math.PI, st = Math.sin(th), ct = Math.cos(th);
    for (let i = 0; i <= seg; i++) {
      const ph = (i / seg) * Math.PI * 2, cp = Math.cos(ph), sp = Math.sin(ph);
      const ux = st * cp, uy = st * sp, uz = ct;
      const lx = ux * rx, ly = uy * ry, nx = ux / rx, ny = uy / ry;
      b.v(x + lx * ca - ly * sa, y + lx * sa + ly * ca, z + uz * rz, nx * ca - ny * sa, nx * sa + ny * ca, uz / rz, col);
    }
  }
  for (let r = 0; r < rings; r++) for (let i = 0; i < seg; i++) {
    const a0 = base + r * (seg + 1) + i, b0 = a0 + seg + 1;
    b.quad(a0, b0, b0 + 1, a0 + 1);
  }
}

/** Ring r of `rings` (even count) at even steps of its radius seen from above, the top half mirrored below: 0 and π at the poles, π/2 at the equator. */
export function ellipsoidRingAngle(r: number, rings: number): number {
  const h = rings / 2;
  return r <= h ? Math.asin(Math.min(1, r / h)) : Math.PI - Math.asin(Math.min(1, (rings - r) / h));
}

/** A round tube along a path (x, y, z points) with a radius per point and round ends, its normals smooth round the tube. */
export function tube(b: MeshBuilder, path: readonly (readonly [number, number, number])[], radius: (i: number) => number, col?: RGB | ((i: number) => RGB), seg = 12, caps = true): void {
  const m = path.length;
  if (m < 2) return;
  // a frame that turns as little as it can along the path (parallel transport), starting square to the first segment and to z where it can
  const T: [number, number, number][] = [], N: [number, number, number][] = [], Bn: [number, number, number][] = [];
  for (let i = 0; i < m; i++) {
    const a = path[Math.max(0, i - 1)]!, c = path[Math.min(m - 1, i + 1)]!;
    let tx = c[0] - a[0], ty = c[1] - a[1], tz = c[2] - a[2];
    const l = Math.hypot(tx, ty, tz) || 1; tx /= l; ty /= l; tz /= l;
    T.push([tx, ty, tz]);
  }
  const cross = (u: readonly number[], v: readonly number[]): [number, number, number] => [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
  const norm = (u: [number, number, number]): [number, number, number] => { const l = Math.hypot(u[0], u[1], u[2]) || 1; return [u[0] / l, u[1] / l, u[2] / l]; };
  let up: [number, number, number] = Math.abs(T[0]![2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
  for (let i = 0; i < m; i++) {
    const t = T[i]!;
    const bn = norm(cross(t, up)), nn = norm(cross(bn, t));
    N.push(nn); Bn.push(bn); up = nn;
  }
  const colAt = (i: number): RGB | undefined => (typeof col === 'function' ? col(i) : col);
  const rows: number[] = [];
  for (let i = 0; i < m; i++) {
    rows.push(b.count);
    const p = path[i]!, r = radius(i), nn = N[i]!, bn = Bn[i]!;
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const dx = nn[0] * ca + bn[0] * sa, dy = nn[1] * ca + bn[1] * sa, dz = nn[2] * ca + bn[2] * sa;
      b.v(p[0] + dx * r, p[1] + dy * r, p[2] + dz * r, dx, dy, dz, colAt(i));
    }
  }
  for (let i = 0; i < m - 1; i++) b.strip(rows[i]!, rows[i + 1]!, seg, true);
  if (!caps) return;
  // round ends: a half sphere at each end
  for (const end of [0, m - 1]) {
    const p = path[end]!, r = radius(end), t = T[end]!, s = end === 0 ? -1 : 1, nn = N[end]!, bn = Bn[end]!;
    const ringsE = 4, start: number[] = [rows[end]!];
    for (let q = 1; q <= ringsE; q++) {
      const ph = (q / ringsE) * Math.PI / 2, cr = Math.cos(ph), sr = Math.sin(ph);
      start.push(b.count);
      for (let k = 0; k < seg; k++) {
        const a = (k / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const dx = (nn[0] * ca + bn[0] * sa) * cr + t[0] * s * sr, dy = (nn[1] * ca + bn[1] * sa) * cr + t[1] * s * sr, dz = (nn[2] * ca + bn[2] * sa) * cr + t[2] * s * sr;
        b.v(p[0] + dx * r, p[1] + dy * r, p[2] + dz * r, dx, dy, dz, colAt(end));
      }
    }
    for (let q = 0; q < ringsE; q++) { if (s > 0) b.strip(start[q]!, start[q + 1]!, seg, true); else b.strip(start[q + 1]!, start[q]!, seg, true); }
  }
}

/** A unit sphere (radius 1), for instanced round things (albumin, pores, nuclei). */
export function unitSphere(seg = 14, rings = 8): BufferGeometry {
  const b = new MeshBuilder();
  ellipsoid(b, 0, 0, 0, 1, 1, 1, 0, undefined, seg, rings);
  return b.build();
}

/** A unit capsule along x (length 1 between the centres of its round ends, radius 1 before scaling): microvilli, collagen fibres. */
export function unitRod(seg = 8): BufferGeometry {
  const b = new MeshBuilder();
  tube(b, [[-0.5, 0, 0], [0.5, 0, 0]], () => 1, undefined, seg, true);
  return b.build();
}

/** A red cell: a biconcave disc of radius 1 lying in the xy plane (thickness about 0.32 at the rim, 0.14 in the dimple), as a lathe. */
export function unitRbc(seg = 24): BufferGeometry {
  // the classic profile (Evans and Fung), half thickness against radius
  const prof: [number, number][] = [];
  const K = 16;
  for (let i = 0; i <= K; i++) {
    const r = Math.sin((i / K) * Math.PI / 2);   // (denser at the rim)
    const r2 = r * r, h = 0.5 * Math.sqrt(Math.max(0, 1 - r2)) * (0.14 + 1.0 * r2 - 0.56 * r2 * r2);
    prof.push([r, Math.max(h, i === K ? 0 : 0.02)]);
  }
  const b = new MeshBuilder();
  // the top half, then the bottom half (mirror), each a lathe of the profile
  for (const s of [1, -1]) {
    const rows: number[] = [];
    for (let i = 0; i <= K; i++) {
      const [r, h] = prof[i]!;
      // the profile's slope gives the normal: d(h)/d(r)
      const [r0, h0] = prof[Math.max(0, i - 1)]!, [r1, h1] = prof[Math.min(K, i + 1)]!;
      let dr = r1 - r0, dh = h1 - h0;
      if (i === K) { dr = 0; dh = -1; }
      const l = Math.hypot(dr, dh) || 1, nr = -dh / l * s * (i === K ? -1 : 1), nz = (dr / l) * s;
      rows.push(b.count);
      for (let k = 0; k < seg; k++) {
        const a = (k / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        b.v(r * ca, r * sa, s * h, (i === K ? 1 : nr) * ca, (i === K ? 1 : nr) * sa, i === K ? 0 : nz, undefined);
      }
    }
    for (let i = 0; i < K; i++) { if (s > 0) b.strip(rows[i]!, rows[i + 1]!, seg, true); else b.strip(rows[i + 1]!, rows[i]!, seg, true); }
  }
  return b.build();
}

/** A matrix for an instance: at (x, y, z), turned by `a` about z, scaled (sx, sy, sz). */
export function placeAt(m: Matrix4, x: number, y: number, z: number, sx: number, sy: number, sz: number, a = 0, tiltX = 0): Matrix4 {
  const ca = Math.cos(a), sa = Math.sin(a), ct = Math.cos(tiltX), st = Math.sin(tiltX);
  // R = Rz(a) * Rx(tilt), then scale
  m.set(
    ca * sx, -sa * ct * sy, sa * st * sz, x,
    sa * sx, ca * ct * sy, -ca * st * sz, y,
    0, st * sy, ct * sz, z,
    0, 0, 0, 1,
  );
  return m;
}
