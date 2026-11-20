// The cel style's GLSL for a TUBE (a vessel, a plexus strand, a varix), written once from CEL_STYLE and included by both programs that draw one (vessels/shaders.ts VESSEL_FS, materials/shaders.ts TOON_FS
// under TUBE_TONES), so a strand beside its vein is the same two tones, and there is no number typed in a shader. Across a tube the fill is exactly TWO FLAT tones (lit, shade),
// the edge between two of them EDGE_PX device px wide and nothing else: no gradient, no world-lit band, no rim, no highlight. The colour may change along the tube (the pressure lens), never across it.
import { CEL_STYLE } from './cel-style.ts';

/** A number as a GLSL float literal (always with a point; enough digits for the lean and the direction). */
export const glslNum = (x: number): string => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const F = glslNum;

export const CEL_TUBE_GLSL = /* glsl */ `
// the lit-side measure's slope: how far the tube's cross axis (screen unit vector sideS, y up) points toward the top left light, leaned and held to -1..1 (cel-style.ts TUBE_LEAN)
float celTubeK(vec2 sideS) { return clamp(dot(sideS, vec2(${F(CEL_STYLE.DIR[0])}, ${F(CEL_STYLE.DIR[1])})) * ${F(CEL_STYLE.TUBE_LEAN)}, -1.0, 1.0); }
// the radius (device px) gate of the tones: 0 on a hairline, 1 from TONES_TO up; it follows the radius, never the position across
float celTubeHw(float rDev) { return smoothstep(${F(CEL_STYLE.TONES_FROM)}, ${F(CEL_STYLE.TONES_TO)}, rDev); }
// the half width of a band edge in the lit-side measure: EDGE_PX device px across in all, never wider (k scales the measure's change per pixel)
float celTubeEt(float k, float rDev) { return 0.5 * ${F(CEL_STYLE.EDGE_PX)} * max(abs(k), 0.05) / max(rDev, 1e-3); }
// the lens colour made saturated and deep (a pale end of a ramp is darkened, its hue kept): the one flat base every tone is cut from
float celTubeLum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 celTubeBase(vec3 b) {
  float l = celTubeLum(b);
  vec3 c = clamp(mix(vec3(l), b, ${F(CEL_STYLE.TUBE.SAT)}), 0.0, 1.0);
  return c * min(min(1.0, ${F(CEL_STYLE.TUBE.LCAP)} / max(celTubeLum(c), 1e-3)), ${F(CEL_STYLE.TUBE.VCAP)} / max(max(c.r, max(c.g, c.b)), 1e-3));
}
// the fill: TWO flat tones across the tube, matte and opaque: the saturated base on the lit side, a hue-preserving darker step (a touch more saturated) on the other, one hard edge EDGE_PX device px across between them at
// VESSEL_STEP_AT. No highlight, no rim, no translucency. across -1..1, k celTubeK, rDev the radius in device px; a hairline (under TONES_FROM) is the base alone.
vec3 celTubeTone(vec3 base, float across, float k, float rDev) {
  float s = across * k, et = celTubeEt(k, rDev), hw = celTubeHw(rDev);
  float shadowT = 1.0 - smoothstep(${F(CEL_STYLE.VESSEL_STEP_AT)} - et, ${F(CEL_STYLE.VESSEL_STEP_AT)} + et, s);
  vec3 b = celTubeBase(base);
  vec3 sh = b * (1.0 - ${F(CEL_STYLE.SHADE)});
  sh = clamp(mix(vec3(celTubeLum(sh)), sh, ${F(CEL_STYLE.TUBE.SHADE_SAT)}), 0.0, 1.0);
  return mix(b, sh, hw * shadowT);
}
`;
