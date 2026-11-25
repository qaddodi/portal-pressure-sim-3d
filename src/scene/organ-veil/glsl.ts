// The organ veil's shader chunks (config.ts says what the effect is). Each is a pure function of the PIXEL and of the fragment's own depth, so a tube, its junction skin and the cells in it, which all call it, agree at every
// junction by construction: no per-vessel number takes part, and the vessel stays one opaque, depth-tested draw (nothing is blended, nothing stacks where two pieces overlap).

/** Declarations and the function the vessels call (highp: the fragment's depth is compared with the organs'). `veilAmount(zFrag, fragXY)`: 0 where no organ lies in front of the fragment, up to the veil's strength where it lies deep behind one. */
export const VEIL_DECL = /* glsl */ `
uniform sampler2D tOrgCol;
uniform sampler2D tOrgDep;
uniform vec4 veilP;   // x strength now (0: off), y gap where it starts, z gap where it is whole
uniform vec4 veilC;   // x camera near, y camera far, z and w one over the target's size in device px
float veilLin(float d) { return 2.0 * veilC.x * veilC.y / (veilC.y + veilC.x - (d * 2.0 - 1.0) * (veilC.y - veilC.x)); }
float veilAmount(float zFrag, vec2 fragXY) {
  if (veilP.x <= 0.0) return 0.0;
  vec2 uv = fragXY * veilC.zw;
  float dO = texture2D(tOrgDep, uv).r;
  if (dO >= 0.99999) return 0.0;
  float gap = veilLin(zFrag) - veilLin(dO);
  return veilP.x * smoothstep(veilP.y, veilP.z, gap) * smoothstep(0.1, 0.45, texture2D(tOrgCol, uv).a);
}
vec3 veilMix(vec3 c, float v, vec2 fragXY) { return v > 0.0 ? mix(c, texture2D(tOrgCol, fragXY * veilC.zw).rgb, v) : c; }
`;

/** The organs' side: how much of the organ behind this pixel's mask is there. `seeAmount(fragXY)` is 0 with no organ behind. */
export const SEE_DECL = /* glsl */ `
uniform sampler2D tSeeMask;
uniform vec4 seeP;    // x strength now (0: off), y the largest share of the fill taken, z and w one over the target's size in device px
uniform float seeOn;  // 1 for an organ that lets the ones behind it show
float seeAmount(vec2 fragXY) {
  if (seeP.x <= 0.0 || seeOn <= 0.0) return 0.0;
  return seeP.x * seeP.y * texture2D(tSeeMask, fragXY * seeP.zw).r;
}
`;
