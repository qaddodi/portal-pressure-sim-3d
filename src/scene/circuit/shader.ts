// The Anatomy-to-Circuit morph, in the vessel's vertex shader: every tube vertex stands where its body course puts it, and flies to where its map course puts it. The
// vertex carries its map course's centre (cC) and direction (tC), its place round the tube in a frame that is fixed by the direction (fr), and its flow rank and its place
// along the course (pk). The morph is the 2D app's flow peel (peel.ts) on each vertex's own rank; the tube is rebuilt round the morphed centre, so it never thins or
// folds as it turns from one plane to the other. The vessels the plain peel cannot carry (those that reverse, those with a pinned end) add their track (morph.ts).
// At circT 0 nothing here runs: the body is drawn exactly as it was. At circT 1 the vertex is exactly the map course's.
import { PEEL_DL } from './data.copied.ts';

/** Attribute and uniform declarations, put before `void main` of the vessel's vertex shader. */
export const CIRCUIT_VS_HEAD = /* glsl */ `
attribute vec3 cC;
attribute vec3 tC;
attribute vec3 fr;
attribute vec2 pk;
attribute float rk;   // the tube's own radius as a share of the vessel's (also declared by the vessel's vertex shader, which puts this block after it)
uniform float circT;
uniform vec2 circRot;
uniform vec3 circM;
uniform float circRow;
uniform vec2 circTrackSize;
uniform sampler2D circTrack;
const float CIRC_DL = ${PEEL_DL.toFixed(4)};
float circPeel(float t, float r) {
  if (t <= 0.0) return 0.0;
  if (t >= 1.0) return 1.0;
  float x = (t - CIRC_DL * r) / (1.0 - CIRC_DL);
  if (x <= 0.0) return 0.0;
  if (x >= 1.0) return 1.0;
  return x * x * (3.0 - 2.0 * x);
}
vec3 circTurnPt(vec3 p) {
  vec2 d = p.xy - circM.xy;
  return vec3(circM.xy + vec2(circRot.x * d.x - circRot.y * d.y, circRot.y * d.x + circRot.x * d.y), p.z);
}
vec3 circTurnDir(vec3 v) { return vec3(circRot.x * v.x - circRot.y * v.y, circRot.y * v.x + circRot.x * v.y, v.z); }
vec3 circFrameN(vec3 T) {
  vec3 ref = abs(T.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
  return normalize(ref - T * dot(ref, T));
}
void circuitMorph(inout vec3 P, inout vec3 Nn, inout vec3 Tn) {
  if (circT <= 0.0) return;
  // the body course's centre at this vertex, from the vertex's own offset (so w = 0 gives back the body's vertex exactly)
  vec3 N0 = circFrameN(tang);
  vec3 cA = position - radius * rk * (fr.x * N0 + fr.y * cross(tang, N0) + fr.z * tang);
  float w = circPeel(circT, pk.x);
  vec3 cen = mix(cA, circTurnPt(cC), w);
  vec3 Tm = mix(tang, circTurnDir(tC), w);
  vec3 T = dot(Tm, Tm) > 1e-6 ? normalize(Tm) : tang;
  if (circRow >= 0.0) {
    float f = pk.y * (circTrackSize.x - 1.0);
    float i0 = floor(f);
    float u = f - i0;
    float i1 = min(i0 + 1.0, circTrackSize.x - 1.0);
    int row = int(circRow);
    cen += mix(texelFetch(circTrack, ivec2(int(i0), row), 0).xyz, texelFetch(circTrack, ivec2(int(i1), row), 0).xyz, u);
    vec3 Tt = mix(texelFetch(circTrack, ivec2(int(i0), row + 1), 0).xyz, texelFetch(circTrack, ivec2(int(i1), row + 1), 0).xyz, u);
    if (dot(Tt, Tt) > 1e-6) T = normalize(Tt);
  }
  vec3 N = circFrameN(T);
  vec3 B = cross(T, N);
  vec3 off = fr.x * N + fr.y * B + fr.z * T;
  P = cen + radius * rk * off;
  Nn = normalize(off);
  Tn = T;
}
`;
/** The call at the top of main(): the body's own position, normal and tangent, morphed. */
export const CIRCUIT_VS_CALL = /* glsl */ `
  vec3 aPos = position;
  vec3 aNor = normal;
  vec3 aTan = tang;
  circuitMorph(aPos, aNor, aTan);
`;
