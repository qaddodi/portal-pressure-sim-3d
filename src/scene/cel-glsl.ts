// The cel style's GLSL for a TUBE (a vessel, a plexus strand, a varix), written once from CEL_STYLE and included by both programs that draw one (vessels/shaders.ts VESSEL_FS, materials/shaders.ts TOON_FS
// under TUBE_TONES), so a strand beside its vein is the same three tones and the same hard highlight, and there is no number typed in a shader. Across a tube the fill is exactly three FLAT tones (shade, base, lit),
// the edge between two of them EDGE_PX device px wide and nothing else: no gradient, no world-lit band, no rim. The colour may change along the tube (the pressure lens), never across it.
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
// the fill: three flat tones across the tube, hue-preserving lightness steps (the shade a little more saturated, the lit the base lifted, never a mix to white). across -1..1, k celTubeK, rDev the radius in device px
vec3 celTubeTone(vec3 base, float across, float k, float rDev) {
  float s = across * k, et = celTubeEt(k, rDev), hw = celTubeHw(rDev);
  float shadowT = 1.0 - smoothstep(${F(CEL_STYLE.SHADE_AT)} - et, ${F(CEL_STYLE.SHADE_AT)} + et, s);
  float litT = smoothstep(${F(CEL_STYLE.LIT_AT)} - et, ${F(CEL_STYLE.LIT_AT)} + et, s);
  vec3 b = celTubeBase(base);
  vec3 sh = b * (1.0 - ${F(CEL_STYLE.SHADE)});
  sh = clamp(mix(vec3(celTubeLum(sh)), sh, ${F(CEL_STYLE.TUBE.SHADE_SAT)}), 0.0, 1.0);
  vec3 li = b * (1.0 + ${F(CEL_STYLE.TUBE.LIT_K)});
  li /= max(1.0, max(li.r, max(li.g, li.b)));   // (over 1 the whole colour is scaled, so its hue never slides)
  vec3 wall = mix(mix(b, sh, hw * shadowT), li, hw * litT);
  // the lumen seen through the wall: one flat darker step inside LUMEN_W of the tube's half width (the far wall), a hard edge, none on a hairline
  float window = 1.0 - smoothstep(${F(CEL_STYLE.TUBE.LUMEN_W)} - 0.5 * ${F(CEL_STYLE.EDGE_PX)} / max(rDev, 1e-3), ${F(CEL_STYLE.TUBE.LUMEN_W)} + 0.5 * ${F(CEL_STYLE.EDGE_PX)} / max(rDev, 1e-3), abs(across));
  return wall * (1.0 - hw * ${F(CEL_STYLE.TUBE.LUMEN_DARK)} * window);
}
// the hard highlight: a flat pale streak (a capsule, round ends) on the lit side, none on a hairline. alongR: the distance along the tube from the streak's centre, in radii
float celTubeSpec(float across, float k, float rDev, float alongR) {
  float s = across * k;
  float hl = ${F(CEL_STYLE.SPEC.LEN)}, th = max(${F(CEL_STYLE.SPEC.SIZE)}, ${F(CEL_STYLE.SPEC.MIN_THICK_PX)} / max(rDev, 1e-3));
  vec2 p = vec2(max(abs(alongR) - hl, 0.0), s - ${F(CEL_STYLE.SPEC.AT)});
  float dPx = (length(p) - th) * rDev, e = 0.5 * ${F(CEL_STYLE.EDGE_PX)};
  return (1.0 - smoothstep(-e, e, dPx)) * smoothstep(${F(CEL_STYLE.SPEC.MIN_PX)}, ${F(CEL_STYLE.SPEC.MIN_PX + 1)}, rDev) * ${F(CEL_STYLE.SPEC.ALPHA)};
}
`;
