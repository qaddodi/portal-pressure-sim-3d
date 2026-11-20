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
// the fill: three flat tones across the tube. across -1..1, k celTubeK, rDev the radius in device px
vec3 celTubeTone(vec3 base, float across, float k, float rDev) {
  float s = across * k, et = celTubeEt(k, rDev), hw = celTubeHw(rDev);
  float shadowT = 1.0 - smoothstep(${F(CEL_STYLE.SHADE_AT)} - et, ${F(CEL_STYLE.SHADE_AT)} + et, s);
  float litT = smoothstep(${F(CEL_STYLE.LIT_AT)} - et, ${F(CEL_STYLE.LIT_AT)} + et, s);
  vec3 c = base * (1.0 - hw * ${F(CEL_STYLE.SHADE)} * shadowT);
  return mix(c, vec3(1.0), ${F(CEL_STYLE.LIT)} * hw * litT);
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
