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
`;

export const CEL_TUBE_GLSL = /* glsl */ `
// the radius (device px) gate of the tones: 0 on a hairline, 1 from TONES_TO up; it follows the radius, never the position across
float celTubeHw(float rDev) { return smoothstep(${F(CEL_STYLE.TONES_FROM)}, ${F(CEL_STYLE.TONES_TO)}, rDev); }
// the lens colour made saturated and deep (a pale end of a ramp is darkened, its hue kept): the one flat base every tone is cut from
float celTubeLum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// (tubeDark: 1 on the dark looks (Dark, Navy, Black), the brighter caps; declared once by the program that includes this: vessels/shaders.ts, materials/shaders.ts)
// tubeRawK: how much of the colour about to be made is AUTHORED AS DRAWN (the pressure ramp, lenses/pressure-ramp.ts): 0 for every other colour (a lens's 2D ramp, an artery, the tone colours), 1 where the lens colour is the
// pressure ramp. Each program sets it where it mixes the lens colour into base (vessels/shaders.ts, skin/shaders.ts, blood/cells/shader.ts: la.a x lensRawA, lb.a x lensRawB, crossfaded by lensMix, so a lens switch eases
// from the transform to the raw colour with the colours themselves and nothing pops). celTubeBase reads it, so every consumer (tone, ink, dust, heads, streaks, glow) agrees.
float tubeRawK = 0.0;
vec3 celTubeBase(vec3 b) {
  float l = celTubeLum(b);
  vec3 c = clamp(mix(vec3(l), b, ${F(CEL_STYLE.TUBE.SAT)}), 0.0, 1.0);
  float lcap = mix(${F(CEL_STYLE.TUBE.LCAP)}, ${F(CEL_STYLE.TUBE.LCAP_DARK)}, tubeDark), vcap = mix(${F(CEL_STYLE.TUBE.VCAP)}, ${F(CEL_STYLE.TUBE.VCAP_DARK)}, tubeDark);
  return mix(c * min(min(1.0, lcap / max(celTubeLum(c), 1e-3)), vcap / max(max(c.r, max(c.g, c.b)), 1e-3)), b, tubeRawK);
}
// the fill: TWO flat tones across the tube, matte and opaque: the saturated base on the lit side, a hue-preserving darker step (a touch more saturated) on the other, one hard edge EDGE_PX device px across between them at
// VESSEL_STEP_AT. No highlight, no rim, no translucency. s the lit-side measure (n.L against the world light, celLightView), sw its change per device pixel (fwidth(s), taken
// outside any branch), rDev the radius in device px; a hairline (under TONES_FROM) is the base alone.
vec3 celTubeTone(vec3 base, float s, float sw, float rDev) {
  float et = max(0.5 * ${F(CEL_STYLE.EDGE_PX)} * sw, 1e-4), hw = celTubeHw(rDev);
  float shadowT = 1.0 - smoothstep(${F(CEL_STYLE.VESSEL_STEP_AT)} - et, ${F(CEL_STYLE.VESSEL_STEP_AT)} + et, s);
  vec3 b = celTubeBase(base);
  vec3 sh = b * (1.0 - ${F(CEL_STYLE.SHADE)});
  sh = clamp(mix(vec3(celTubeLum(sh)), sh, ${F(CEL_STYLE.TUBE.SHADE_SAT)}), 0.0, 1.0);
  return mix(b, sh, hw * shadowT);
}
`;
