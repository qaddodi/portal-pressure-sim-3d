// The Anatomy-to-Circuit morph, in the vessel's vertex shader: every tube vertex stands where its body course puts it, and flies to where its map course puts it. The
// vertex carries its map course's centre (cC) and direction (tC), its place round the tube in a frame that is fixed by the direction (fr), and its flow rank and its place
// along the course (pk). The morph is the 2D app's flow peel (peel.ts) on each vertex's own rank; the tube is rebuilt round the morphed centre, so it never thins or
// folds as it turns from one plane to the other. The vessels the plain peel cannot carry (those that reverse, those with a pinned end) add their track (morph.ts).
// At circT 0 nothing here runs: the body is drawn exactly as it was. At circT 1 the vertex is exactly the map course's.
import { PEEL_DL } from './data.copied.ts';
import { MAP_K } from './map.ts';
import { PEEL_SPAN } from './peel.ts';

/** Attribute and uniform declarations, put before `void main` of the vessel's vertex shader, after its own (`radius`, `rk`, `tang` and `position` are the vessel's: declaring one here is a redefinition, which a real GPU refuses and the whole vessel then draws nothing). */
const CIRC_DECL_GLSL = /* glsl */ `
attribute vec3 cC;
attribute vec3 tC;
attribute vec3 fr;
attribute vec2 pk;
// the lengths of the vessel's two courses (body, map), scene units: the speed of each along the vessel's own 0 to 1
attribute vec2 cl;
// the map course's heading turned so far (rad, counter-clockwise, from the vessel's start): the stent's cells keep their size round a corner (vessels/shaders.ts vSkew)
attribute float turn;
uniform float circT;
// 1 on a vertex that stays where it is through the change, fading with 2D's clamp(1 - 2 * T0) (see circuitMorph), read by the fragment stage as a dither (vessels/shaders.ts)
varying float circStay;
float circShare = 0.0;   // this vertex's share of the change (the peel on its rank), kept for the width and the units the shader reads after the morph
uniform vec2 circRot;
uniform vec3 circM;
uniform float circRow;
// a liver branch growing with the change is drawn squeezed toward its own start (circFlat, 0 whole): its two courses' first points, body and map (grow.ts)
uniform float circFlat;
uniform vec3 circAnchA;
uniform vec3 circAnchC;
uniform vec2 circTrackSize;
uniform sampler2D circTrack;
`;
/** The peel and the turn, as functions of a rank and a point: the morph's rule written once. The vessel's per-vertex morph (above) and ?geom=net's per-bone morph (vessels/net/shaders.ts) both use it. Reads: circRot, circM (declared by the program). */
export const CIRC_PEEL_GLSL = /* glsl */ `const float CIRC_DL = ${PEEL_DL.toFixed(4)};
const float CIRC_MAPK = ${MAP_K.toFixed(6)};
const float CIRC_SPAN = ${PEEL_SPAN.toFixed(1)};
float circPeel(float t, float r) {
  if (t <= 0.0) return 0.0;
  if (t >= 1.0) return 1.0;
  float x = (t - CIRC_DL * r) / (1.0 - CIRC_DL);
  if (x <= 0.0) return 0.0;
  if (x >= 1.0) return 1.0;
  return x * x * (3.0 - 2.0 * x);
}
// how fast the share of the change moves with the rank (peel.ts peelSlope)
float circPeelSlope(float t, float r) {
  if (t <= 0.0 || t >= 1.0) return 0.0;
  float x = (t - CIRC_DL * r) / (1.0 - CIRC_DL);
  if (x <= 0.0 || x >= 1.0) return 0.0;
  return 6.0 * x * (1.0 - x) * (-CIRC_DL / (1.0 - CIRC_DL));
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
`;
const CIRC_MORPH_GLSL = /* glsl */ `void circuitMorph(inout vec3 P, inout vec3 Nn, inout vec3 Tn) {
  circStay = 1.0;
  if (circT <= 0.0) return;
  // A vertex with no map course (cl.y 0: the fans of tributaries, the liver's branching veins, a collateral's strands, which VesselObject gives zero course attributes: circuit/geometry.ts withCircuitAttributes) never
  // morphs: it stays on its anatomy point and fades by 2D's own clamp(1 - 2 * T0, 0, 1) (stage-vessels.js: gone by the change's half-way point, back over its second half), T0 being circT (eased as 2D's is).
  // Before, its missing course flew every vertex to the map's origin and it grew back out of a point on the way to the body.
  if (cl.y <= 0.0) { circStay = clamp(1.0 - 2.0 * circT, 0.0, 1.0); return; }
  // the body course's centre at this vertex, from the vertex's own offset (so w = 0 gives back the body's vertex exactly)
  vec3 N0 = circFrameN(tang);
  vec3 cA = position - radius * rk * (fr.x * N0 + fr.y * cross(tang, N0) + fr.z * tang);
  float w = circPeel(circT, pk.x);
  circShare = w;
  vec3 cT = circTurnPt(cC);
  vec3 cen = mix(cA, cT, w);
  if (circFlat > 0.0) { vec3 o0 = mix(circAnchA, circTurnPt(circAnchC), w); cen = o0 + (cen - o0) * (1.0 - circFlat); }
  // the direction of the moving centreline is its derivative along the vessel: (1 - w) A' + w C' + w' (C - A), the last term the flow peel's own gradient (the rank changes along the
  // vessel, so the share of the change does too); a plain blend of the two directions is up to a quarter off mid-change, this is exact (it is 'tang' and 'tC' at either end)
  float rs = (pk.x > 0.0 && pk.x < 1.0) ? cl.y * tC.x / CIRC_MAPK / CIRC_SPAN : 0.0;
  vec3 Tm = (1.0 - w) * (tang * cl.x) + w * (circTurnDir(tC) * cl.y) + circPeelSlope(circT, pk.x) * rs * (cT - cA);
  vec3 T = dot(Tm, Tm) > 1e-9 ? normalize(Tm) : tang;
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
  P = cen + radius * mix(rk, rkc, w) * off;
  Nn = normalize(off);
  Tn = T;
}
`;
export const CIRCUIT_VS_HEAD = CIRC_DECL_GLSL + CIRC_PEEL_GLSL + CIRC_MORPH_GLSL;
/** The call at the top of main(): the body's own position, normal and tangent, morphed. */
export const CIRCUIT_VS_CALL = /* glsl */ `
  vec3 aPos = position;
  vec3 aNor = normal;
  vec3 aTan = tang;
  circuitMorph(aPos, aNor, aTan);
`;
