// The cel style's GLSL for a TUBE (a vessel, a plexus strand, a varix), written once from CEL_STYLE and included by both programs that draw one (vessels/shaders.ts VESSEL_FS, materials/shaders.ts TOON_FS
// under TUBE_TONES), so a strand beside its vein is the same two tones, and there is no number typed in a shader. Across a tube the fill is exactly TWO FLAT tones (lit, shade),
// the edge between two of them EDGE_PX device px wide and nothing else: no gradient, no world-lit band, no rim, no highlight. The colour may change along the tube (the pressure lens), never across it.
import { CEL_STYLE } from './cel-style.ts';

/** A number as a GLSL float literal (always with a point; enough digits for the lean and the direction). */
export const glslNum = (x: number): string => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const F = glslNum;

/** THE light as a unit vector, in WORLD space (CEL_STYLE.LIGHT normalised): the one constant every lit 3D surface reads. */
export const CEL_LIGHT_UNIT: readonly [number, number, number] = (() => { const [x, y, z] = CEL_STYLE.LIGHT; const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; })();

/** The world light in a fragment shader of a three ShaderMaterial (which has `viewMatrix`): `celLightView()` is the light's direction in VIEW space, i.e. the world light turned by the camera, so n.L with a view-space
 *  normal is n.L in the world and does not change when the camera moves. Never put it in a raw (#version 300 es) program: it has no viewMatrix. */
export const CEL_LIGHT_GLSL = /* glsl */ `
const vec3 CEL_LIGHT = vec3(${CEL_LIGHT_UNIT.map(F).join(', ')});
vec3 celLightView() { return (viewMatrix * vec4(CEL_LIGHT, 0.0)).xyz; }
// THE LIGHT A TUBE IS SHADED BY (CEL_STYLE.TUBE_LIGHT_MIN): the world light with its part square to the tube's axis never shorter than the floor,
// so a tube running along the light still has a lit stripe and a shade side. The argument is the tube's axis in view space (either way along it);
// a tube already past the floor gets the world light as it is. The JS twin: tubeLightFor below.
vec3 celTubeLight(vec3 a) {
  vec3 L = celLightView();
  float al = length(a);
  if (al < 1.0e-4) return L;
  vec3 u = a / al;
  float d = dot(L, u);
  vec3 lp = L - d * u;
  return d * u + lp * max(1.0, ${F(CEL_STYLE.TUBE_LIGHT_MIN)} / max(length(lp), 1.0e-3));
}
`;

export const CEL_TUBE_GLSL = /* glsl */ `
// the radius (device px) gate of the tones: 0 on a hairline, 1 from TONES_TO up; it follows the radius, never the position across
float celTubeHw(float rDev) { return smoothstep(${F(CEL_STYLE.TONES_FROM)}, ${F(CEL_STYLE.TONES_TO)}, rDev); }
// the lens colour made saturated and deep (a pale end of a ramp is darkened, its hue kept): the one flat base every tone is cut from
float celTubeLum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// (tubeDark: 1 on the dark looks (Dark, Navy, Black), the brighter caps; declared once by the program that includes this: vessels/shaders.ts, materials/shaders.ts)
// tubeRawK: how much of the colour about to be made is AUTHORED AS DRAWN (the pressure ramp, lenses/pressure-ramp.ts): 0 for every other colour (a lens's 2D ramp, an artery, the tone colours), 1 where the lens colour is the
// pressure ramp. Each program sets it where it mixes the lens colour into base (vessels/shaders.ts, skin/shaders.ts, blood/cells/shader.ts: la.a x lensRawA, lb.a x lensRawB, crossfaded by lensMix, so a lens switch eases
// from the transform to the raw colour with the colours themselves and nothing pops). celTubeBase reads it, so every consumer (tone, ink, heads, glow) agrees.
float tubeRawK = 0.0;
vec3 celTubeBase(vec3 b) {
  float l = celTubeLum(b);
  vec3 c = clamp(mix(vec3(l), b, ${F(CEL_STYLE.TUBE.SAT)}), 0.0, 1.0);
  float lcap = mix(${F(CEL_STYLE.TUBE.LCAP)}, ${F(CEL_STYLE.TUBE.LCAP_DARK)}, tubeDark), vcap = mix(${F(CEL_STYLE.TUBE.VCAP)}, ${F(CEL_STYLE.TUBE.VCAP_DARK)}, tubeDark);
  return mix(c * min(min(1.0, lcap / max(celTubeLum(c), 1e-3)), vcap / max(max(c.r, max(c.g, c.b)), 1e-3)), b, tubeRawK);
}
// OKLab lightness lift (the JS twin: cel-ink.ts celTubeLift): sRGB in and out as the scene writes it, hue and chroma kept, clamped to the gamut
vec3 celTubeLift(vec3 c, float dL) {
  vec3 q = mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
  vec3 lms = pow(max(vec3(dot(vec3(0.4122214708, 0.5363325363, 0.0514459929), q), dot(vec3(0.2119034982, 0.6806995451, 0.1073969566), q), dot(vec3(0.0883024619, 0.2817188376, 0.6299787005), q)), vec3(0.0)), vec3(1.0 / 3.0));
  vec3 lab = vec3(dot(vec3(0.2104542553, 0.793617785, -0.0040720468), lms), dot(vec3(1.9779984951, -2.428592205, 0.4505937099), lms), dot(vec3(0.0259040371, 0.7827717662, -0.808675766), lms));
  lab.x += dL;
  vec3 k = vec3(lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z, lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z, lab.x - 0.0894841775 * lab.y - 1.291485548 * lab.z);
  k = k * k * k;
  vec3 o = vec3(dot(vec3(4.0767416621, -3.3077115913, 0.2309699292), k), dot(vec3(-1.2684380046, 2.6097574011, -0.3413193965), k), dot(vec3(-0.0041960863, -0.7034186147, 1.707614701), k));
  o = clamp(o, 0.0, 1.0);
  return clamp(mix(12.92 * o, 1.055 * pow(o, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), o)), 0.0, 1.0);
}
// the fill: TWO flat tones across the tube, matte and opaque: the saturated base on the lit side, a hue-preserving darker step (a touch more saturated) on the other, one hard edge EDGE_PX device px across between them at
// VESSEL_STEP_AT. No highlight, no rim, no translucency. s the lit-side measure (n.L against the world light, celLightView), sw its change per device pixel (fwidth(s), taken
// outside any branch), rDev the radius in device px; a hairline (under TONES_FROM) is the base alone.
vec3 celTubeToneArt(vec3 base, float s, float sw, float rDev, float art) {
  float et = max(0.5 * ${F(CEL_STYLE.EDGE_PX)} * sw, 1e-4), hw = celTubeHw(rDev);
  float shadowT = 1.0 - smoothstep(${F(CEL_STYLE.VESSEL_STEP_AT)} - et, ${F(CEL_STYLE.VESSEL_STEP_AT)} + et, s);
  vec3 b = celTubeBase(base);
  vec3 sh = b * (1.0 - ${F(CEL_STYLE.SHADE)});
  sh = clamp(mix(vec3(celTubeLum(sh)), sh, ${F(CEL_STYLE.TUBE.SHADE_SAT)}), 0.0, 1.0);
  vec3 c = mix(b, sh, hw * shadowT);
  // an ARTERY's lumen is one tone step lighter (CEL_STYLE.ARTERY.LIFT_L in OKLab lightness, hue and chroma kept), both tones, easing in with the tones' own radius gate: a hairline is the base alone, and art 0 (a vein) takes no part
  float lift = art * hw * ${F(CEL_STYLE.ARTERY.LIFT_L)};
  return lift > 0.0 ? celTubeLift(c, lift) : c;
}
vec3 celTubeTone(vec3 base, float s, float sw, float rDev) { return celTubeToneArt(base, s, sw, rDev, 0.0); }
`;

/** The JS twin of the shader's celTubeLight: the light `L` (any frame) with its part square to `axis` brought up to CEL_STYLE.TUBE_LIGHT_MIN when shorter, the part along the axis untouched. */
export function tubeLightFor(axis: readonly [number, number, number], L: readonly [number, number, number] = CEL_LIGHT_UNIT): [number, number, number] {
  const al = Math.hypot(axis[0], axis[1], axis[2]);
  if (al < 1e-4) return [L[0], L[1], L[2]];
  const u = [axis[0] / al, axis[1] / al, axis[2] / al] as const;
  const d = L[0] * u[0] + L[1] * u[1] + L[2] * u[2];
  const lp = [L[0] - d * u[0], L[1] - d * u[1], L[2] - d * u[2]] as const;
  const k = Math.max(1, CEL_STYLE.TUBE_LIGHT_MIN / Math.max(Math.hypot(lp[0], lp[1], lp[2]), 1e-3));
  return [d * u[0] + lp[0] * k, d * u[1] + lp[1] * k, d * u[2] + lp[2] * k];
}
