// The network shader (?geom=net, WP3): ONE vertex and ONE fragment program for a whole network's mesh, in place of ~55 tube programs and 33 skin programs with ~120 uniforms each.
//
// THE VERTEX STAGE deforms the bound mesh: every vertex carries up to four (bone, weight) pairs and its offset (and rest normal) in each bone's frame, divided by the bone's radius (net/types.ts NetMesh),
//     p = sum w_i (centre_i + frame_i * offset_i * lumen_i) + n * sum w_i pad_i,   n = the blended, renormalised bound rest normal
// (lumen_i is the live half width; pad_i the ink, the ring's sag and the inflate, pushed along the normal ONCE so the outline keeps its width across a fillet instead of adding up along each arm's own offset).
// The bone texture (net/bones.ts) gives each bone its place and radius in the body pose and the map pose and its frame; the edge-state texture (net/edge-state.ts) gives each bone's EDGE its state (the old per-vessel uniforms).
// For every bone the stage evaluates, with the vessel's OWN rules, the live radius R_i, the morph's share (the flow peel on the bone's rank), the fade and the highlight; the vertex then holds their blend.
// A junction's fillet vertices are bound to the arms' bones, so every one of those values is continuous through the junction by construction: no mate, no cut, no seam to match.
//
// THE RULES ARE THE OLD SHADER'S, NOT COPIES: the live width (swellOf, circWidthOf, stumpK), the free ends' fade (FADE_ALPHA_GLSL), the highlight (HIGHLIGHT_ALONG_GLSL), the morph's peel and turn (CIRC_PEEL_GLSL), the flow marks
// (FLOW_MARKS_GLSL, CHEV_ONE_GLSL, DUST_GLSL), the cel tones, the lens (LENS_OF_AT_GLSL) and the procedure marks (PROCEDURE_MARKS_GLSL) are the very GLSL vessels/shaders.ts splices, taken from vessels/glsl-shared.ts, circuit/shader.ts and
// materials/shaders.ts. They read per-vessel names (`len`, `stump`, `fadeA`, `lensSpan`, ...): here those names are GLOBAL VARIABLES that `loadEdgeVS` / `loadEdgeFS` fill from the edge's row of the texture, where the old shader
// had uniforms. net/uniform-map.ts is the table of which uniform became which column.
//
// WHAT IS NOT HERE, because the skeleton makes it true: mate, nbrMate, bury, cmate, cease, the skin uniforms, cavaCut/cavaA/cavaRef. The cava's junctions are the fillet's blend (see CAVA below).
//
// CAVA. A hepatic vein (alpha 1) opens into the cava (alpha 0.45, fades.ts CAVA_RECEDE). The old shader cut the vein at the cava's wall, ramped its alpha and swapped its colour for the cava's over 1.6 to 2.5 cava radii (cavaCut, wA, wB).
// Here the fillet's vertices are bound to both arms, so `vFade` (the bone-weighted fade) goes from the vein's alpha to the cava's across the fillet, and the colour is the blend of the two arms' lens colours by the same weights (`vBlend`),
// with nothing cut. The ramp is as long as the fillet is, which the mesher sets (junction zone), not 2.5 radii: NOT YET TESTED beyond the design (the blend is continuous by construction); the length is a look to judge on the device.
//
// LIMITS, said plainly: (1) a pixel in a fillet takes its flow marks, tone and dust from its triangle's dominant edge (a `flat` edge id) and blends only the colour and the alpha, so the marks of the two arms do not cross the fillet;
// (2) tubes are drawn in one mesh, so two same-network surfaces that cross while one of them is faded are not sorted against each other (tests/net-crossings.test.ts lists them); (3) normals are the bound rest normals turned by the bone blend.
import { CIRC_PEEL_GLSL } from '../../circuit/shader.ts';
import { CIRC_C, MAP_CENTRE } from '../../circuit/map.ts';
import { PEEL_SPAN, PEEL_X0 } from '../../circuit/peel.ts';
import { FADE_FUNCS_GLSL } from '../../materials/shaders.ts';
import { WEDGE_GLSL } from '../wedge-glsl.ts';
import { CHEVRON_GLSL } from '../../blood/chevron-glsl.ts';
import { DUST_GLSL } from '../../blood/dust-glsl.ts';
import { QUIET_BACK } from '../../camera/quiet.ts';
import { CEL_STYLE } from '../../cel-style.ts';
import { CEL_LIGHT_GLSL, CEL_TUBE_GLSL, glslNum as F } from '../../cel-glsl.ts';
import { CAP_CARVED_GLSL, CHEV_CREAM_GLSL, CHEV_ONE_GLSL, CIRC_WIDTH_OF_GLSL, FADE_ALPHA_GLSL, FLOW_MARKS_GLSL, HIGHLIGHT_ALONG_GLSL, LENS_OF_AT_GLSL, PROCEDURE_MARKS_GLSL, STUMP_K_GLSL, SWELL_OF_GLSL, glowToneGlsl, glowWeightGlsl, inkColourGlsl, inkPxGlsl, wpcGlsl } from '../glsl-shared.ts';
import { CIRC_INK_K, CIRC_INNER } from '../cel-ink.ts';
import { VDBG_GLSL } from '../debug-view.ts';
import { TUBE_DEPTH_SHARE, TUBE_SAG } from '../shaders.ts';
import { BONE_TEXELS, BONES_PER_ROW } from './bones.ts';
import { EDGE_LAYOUT } from './edge-state.ts';

// ---- the edge-state texture, as GLSL ----
const TYPE = ['', 'float', 'vec2', 'vec3', 'vec4'] as const;
const SW = 'xyzw';
const slotOf = (name: string) => { const s = EDGE_LAYOUT.get(name); if (!s) throw new Error(`net shader: no edge column "${name}"`); return s; };
/** The global variable a column becomes (`float len;`, `vec4 seamA[2];`): what the old shader declared as a uniform. */
const declare = (names: readonly string[]): string => names.map((n) => { const s = slotOf(n); return s.size === 8 ? `vec4 ${n}[2];` : `${TYPE[s.size]} ${n};`; }).join('\n');
/** `void <fn>(int row)`: fetches each texel the columns lie in ONCE and fills the globals. */
const loader = (fn: string, names: readonly string[]): string => {
  const texels = new Set<number>();
  for (const n of names) { const s = slotOf(n); texels.add(s.texel); if (s.size === 8) texels.add(s.texel + 1); }
  const fetch = [...texels].sort((a, b) => a - b).map((t) => `  vec4 t${t} = texelFetch(edgeTex, ivec2(${t}, row), 0);`);
  const set = names.map((n) => { const s = slotOf(n); return s.size === 8 ? `  ${n}[0] = t${s.texel}; ${n}[1] = t${s.texel + 1};` : `  ${n} = t${s.texel}${s.size === 4 ? '' : '.' + SW.slice(s.comp, s.comp + s.size)};`; });
  return `void ${fn}(int row) {\n${fetch.join('\n')}\n${set.join('\n')}\n}`;
};
/** One column of one row as an expression (`texelFetch(edgeTex, ivec2(2, row), 0).y`), for the few values the fragment stage reads of a SECOND edge. */
const fetchOf = (name: string, row: string): string => { const s = slotOf(name); return `texelFetch(edgeTex, ivec2(${s.texel}, ${row}), 0)${s.size === 4 ? '' : '.' + SW.slice(s.comp, s.comp + s.size)}`; };

/** The columns each stage reads (net/edge-state.ts names them; every one is a uniform the old shader had, or a column the skeleton added). */
export const NET_VS_COLUMNS: readonly string[] = [
  'vindex', 'baseD', 'widthKind', 'len', 'lenMap', 'radius', 'circW', 'circRow', 'circFlat', 'circAnchA', 'circAnchC', 'inflate', 'liveW', 'inkOn',
  'hiOn', 'hiDir', 'hiOffset', 'hiAhead', 'hiBehind', 'hiFade', 'hiPx', 'hiEnds',
  'fadeMode', 'fadeA', 'fadeLine', 'mapFade', 'cavaEnd', 'stump', 'waist', 'noMap', 'presence', 'stentT0',
];
export const NET_FS_COLUMNS: readonly string[] = [
  'tone', 'vindex', 'baseD', 'len', 'radius', 'lensIndex', 'lensUse', 'lensSpan', 'reveal', 'fade', 'flowAmount', 'smokeOn', 'dotted', 'hiColor', 'glowK', 'inkOn',
  'stump', 'seamA', 'seamB', 'stentU', 'wedge', 'wedgeD', 'circCap', 'solidK', 'veilK', 'quietK',
];

/** What the network object must carry as plain uniforms (and the textures): one set for the whole network, never per vessel. WP4 builds the material's uniforms from this list; tests/net-shader.test.ts holds it to the shaders. */
export const NET_GLOBALS: Readonly<Record<string, string>> = {
  // both stages
  boneTex: 'sampler2D', edgeTex: 'sampler2D', vdata: 'sampler2D', vdataSize: 'vec2', useData: 'float', res: 'vec2', circT: 'float',
  // vertex stage
  circRot: 'vec2', circM: 'vec3', circTrackSize: 'vec2', circTrack: 'sampler2D', circBoost: 'float', circPerPx: 'float', ringSag: 'float',
  // fragment stage
  toneColor: 'vec3[3]', tubeDark: 'float', inkColor: 'vec3', inkColorCirc: 'vec3', shadeK: 'float', light: 'vec3', bands: 'float', spec: 'float', time: 'float', projY: 'float', dpr: 'float',
  markDark: 'vec3', markLight: 'vec3', markRev: 'vec3', lensMix: 'float', lensTail: 'float', lensGradA: 'sampler2D', lensLaneA: 'sampler2D', lensGradB: 'sampler2D', lensLaneB: 'sampler2D',
  lensModeA: 'float', lensModeB: 'float', laneColA: 'vec3[5]', laneColB: 'vec3[5]', lensSmooth: 'float', stentWire: 'vec4', stentGoldC: 'vec4', streamTex: 'sampler2D', chainTex: 'sampler2D', streakAmt: 'float',
  wedgeCol: 'vec3', pageCol: 'vec3', dustP: 'vec4[]', routeTex: 'sampler2D',
  // the inspector's (VDBG), as the old program's
  dbgShade: 'float', dbgDust: 'float', dbgHeads: 'float', dbgInk: 'float', dbgTint: 'float', dbgCol: 'vec4',
};

const MAP_X0 = PEEL_X0;

// ---- the vertex stage ----
export const NET_VS = /* glsl */ `
attribute vec4 bone;      // the four bones this vertex is bound to (indices into the bone texture, as floats)
attribute vec4 weight;
attribute vec4 off0;      // the offset in each bone's frame over the bone's radius: 4 x vec3 as 12 floats, (o0.xyz, o1.x) (o1.yz, o2.xy) (o2.z, o3.xyz)
attribute vec4 off1;
attribute vec4 off2;
attribute vec4 nrm0;      // the rest normal in each bone's frame, the same layout (net/types.ts NetMesh.normal)
attribute vec4 nrm1;
attribute vec4 nrm2;
uniform sampler2D boneTex;
uniform sampler2D edgeTex;
uniform sampler2D vdata;
uniform vec2 vdataSize;
uniform float useData;
uniform vec2 res;
uniform float circT;
uniform vec2 circRot;
uniform vec3 circM;
uniform vec2 circTrackSize;
uniform sampler2D circTrack;
uniform float circBoost;   // 2D's circBoost: the map's lines are drawn up to 1.75 times wide when it is zoomed out
uniform float circPerPx;   // map units under one CSS pixel here
uniform float ringSag;     // the sweep ring's polygon corners stand this share of the radius outside its flats (shaders.ts TUBE_SAG for the mesher's RADIAL)
// the edge's row, as the old shader's per-vessel uniforms (the shared GLSL below reads these names)
${declare(NET_VS_COLUMNS)}
${loader('loadEdgeVS', NET_VS_COLUMNS)}
// the varyings are packed (a phone has 15 vectors: tests/glsl-compile.test.ts holds every program to that floor); the fragment stage unpacks them into the names the shared GLSL reads
varying vec3 vCen;
varying vec3 vN;
varying vec3 vV;
varying vec3 vT;
varying vec3 vZf;
varying vec4 vPackA;   // vW, vR, vU, vArcLen: the clip depth, the lumen's half width and the figure's units in a scene unit here, and the length along the course drawn now (shaders.ts vArcLen)
varying vec4 vPackB;   // vFade, vCircShare, circStay, vHi
varying vec2 vPackD;   // vR0 (the lumen's half width before a stenosis or the stent's waist pinches it) and vSkew (the stent wires' shift, shaders.ts)
varying vec4 vPackC;   // vUv.x, vUv.y, the second bone's place along its own edge (vUvB), the second bone's share (vBlend: 0 in a tube, up to 0.5 in a fillet)
flat varying vec2 vEdge;   // the edge of the bone that holds the vertex most, and the second's: the fragment stage's discrete state (flat: one per triangle)
${SWELL_OF_GLSL}
const float MAP_X0 = ${F(MAP_X0)};
const vec2 MAP_C = vec2(${F(CIRC_C[0])}, ${F(CIRC_C[1])});
const vec2 MAP_O = vec2(${F(MAP_CENTRE.x)}, ${F(MAP_CENTRE.y)});
${CIRC_PEEL_GLSL}
${CIRC_WIDTH_OF_GLSL}
${STUMP_K_GLSL}
// a point of the map pose in the 2D circuit's own units, its x: the flow peel's rank (peel.ts peelRank)
float mapRank(vec3 m) { return clamp((MAP_C.x + (m.x - MAP_O.x) / CIRC_MAPK - MAP_X0) / CIRC_SPAN, 0.0, 1.0); }
// the stenosis's waist (disease/clamps.ts waistNarrow, with waistSigma's cap WAIST_MAX_SIG and the bell's reach WAIST_REACH)
float waistNarrow(vec3 wv, float u) {
  if (wv.x <= 0.003) return 0.0;
  float d = abs(u - wv.z) / max(1e-6, min(wv.y, ${F(0.5 / 2.4)})), t = d / 2.4;
  if (t >= 1.0) return 0.0;
  float w = 1.0 - smoothstep(0.5, 1.0, t);
  return wv.x * exp(-d * d) * w;
}
// the vessel's width on the map against the width its tube was built at: 2D's widthAt on the map (shaders.ts circSwell without the mates: a vessel carries on into the next bone of the same mesh)
float circSwellNet() {
  float wc;
  if (circW.x >= 0.0) wc = max(circW.z, circW.x * mix(1.0, circBoost, circW.y));
  else {
    float d = baseD;
    if (useData > 0.5) { ivec2 tc = ivec2(int(mod(vindex, vdataSize.x)), int(floor(vindex / vdataSize.x))); d = texelFetch(vdata, tc, 0).b; }
    wc = circWidthOf(d, 0.0);
  }
  wc = max(wc, circW.w * circPerPx);
  return 0.5 * wc * CIRC_MAPK / max(radius, 1e-6);
}
ivec2 boneTexel(int i, int k) { return ivec2((i % ${BONES_PER_ROW}) * ${BONE_TEXELS} + k, i / ${BONES_PER_ROW}); }
// the frame (t, n, b as columns) of a unit quaternion given by x, y, z (w >= 0 rebuilt: net/bones.ts)
mat3 quatFrame(vec3 q) {
  float x = q.x, y = q.y, z = q.z, w = sqrt(max(0.0, 1.0 - dot(q, q)));
  return mat3(vec3(1.0 - 2.0 * (y * y + z * z), 2.0 * (x * y + z * w), 2.0 * (x * z - y * w)),
              vec3(2.0 * (x * y - z * w), 1.0 - 2.0 * (x * x + z * z), 2.0 * (y * z + x * w)),
              vec3(2.0 * (x * z + y * w), 2.0 * (y * z - x * w), 1.0 - 2.0 * (x * x + y * y)));
}
// the frame turned by the smallest rotation that takes its tangent to T (the oracle's poseFrames): exactly F where T is its own tangent
mat3 frameTo(mat3 F, vec3 T) {
  vec3 t0 = F[0];
  float c = dot(t0, T);
  if (c > 0.99999) return mat3(T, F[1], F[2]);
  if (c < -0.9999) return mat3(-F[0], -F[1], F[2]);   // (turned all the way round: half a turn about the third axis)
  vec3 ax = cross(t0, T);
  float k = 1.0 / (1.0 + c);
  return mat3(T, F[1] * c + cross(ax, F[1]) + ax * (dot(ax, F[1]) * k), F[2] * c + cross(ax, F[2]) + ax * (dot(ax, F[2]) * k));
}
struct NetBone { vec3 cen; mat3 F; float lumen; float pad; float share; float fa; float hi; float pres; float u; int row; float stay; float unit; float arc; float lumen0; float dturn; };
NetBone netBone(int bi) {
  NetBone o;
  ivec2 t0 = boneTexel(bi, 0);
  vec4 A = texelFetch(boneTex, t0, 0), M = texelFetch(boneTex, t0 + ivec2(1, 0), 0), Q = texelFetch(boneTex, t0 + ivec2(2, 0), 0);
  int row = int(floor(Q.w));
  float u = clamp((Q.w - float(row)) * 2.0, 0.0, 1.0);
  loadEdgeVS(row);
  mat3 Fb = quatFrame(Q.xyz);
  float w = 0.0, stay = 1.0, dturn = 0.0;
  vec3 cen = A.xyz;
  mat3 F = Fb;
  if (circT > 0.0) {
    if (noMap > 0.5) {
      // a part with no map course never morphs and dissolves by 2D's own clamp(1 - 2 T0) (circuit/shader.ts)
      stay = clamp(1.0 - 2.0 * circT, 0.0, 1.0);
    } else {
      float rank = mapRank(M.xyz);
      w = circPeel(circT, rank);
      vec3 cA = A.xyz, cT = circTurnPt(M.xyz);
      cen = mix(cA, cT, w);
      if (circFlat > 0.0) { vec3 o0 = mix(circAnchA, circTurnPt(circAnchC), w); cen = o0 + (cen - o0) * (1.0 - circFlat); }
      // the neighbours along the edge (the bones of an edge are consecutive): the centreline's derivative along it, both poses
      vec4 Ap = A, Mp = M, An = A, Mn = M;
      float up = u, un = u;
      if (bi > 0) { ivec2 tp = boneTexel(bi - 1, 0); vec4 Qp = texelFetch(boneTex, tp + ivec2(2, 0), 0); if (int(floor(Qp.w)) == row) { Ap = texelFetch(boneTex, tp, 0); Mp = texelFetch(boneTex, tp + ivec2(1, 0), 0); up = (Qp.w - float(row)) * 2.0; } }
      { ivec2 tn = boneTexel(bi + 1, 0); vec4 Qn = texelFetch(boneTex, tn + ivec2(2, 0), 0); if (int(floor(Qn.w)) == row && Qn.w > Q.w) { An = texelFetch(boneTex, tn, 0); Mn = texelFetch(boneTex, tn + ivec2(1, 0), 0); un = (Qn.w - float(row)) * 2.0; } }
      float du = max(un - up, 1e-6);
      vec3 dA = (An.xyz - Ap.xyz) / du, dM = (Mn.xyz - Mp.xyz) / du;
      // the moving centreline's derivative along the vessel: (1 - w) A' + w C' + w' (C - A), the last term the flow peel's own gradient (circuit/shader.ts circuitMorph)
      float rs = (rank > 0.0 && rank < 1.0) ? dM.x / CIRC_MAPK / CIRC_SPAN : 0.0;
      vec3 Tm = (1.0 - w) * dA + w * circTurnDir(dM) + circPeelSlope(circT, rank) * rs * (cT - cA);
      vec3 T = dot(Tm, Tm) > 1e-9 ? normalize(Tm) : Fb[0];
      // the map course's heading turned since the stent's start (the old shader's turn minus stentT0: the heading is the unturned map tangent's angle, taken near the stent's start heading)
      if (dot(dM.xy, dM.xy) > 1e-12) dturn = mod(atan(dM.y, dM.x) - stentT0 + 3.14159265, 6.2831853) - 3.14159265;
      if (circRow >= 0.0) {
        float f = u * (circTrackSize.x - 1.0), i0 = floor(f), uu = f - i0, i1 = min(i0 + 1.0, circTrackSize.x - 1.0);
        int rw = int(circRow);
        cen += mix(texelFetch(circTrack, ivec2(int(i0), rw), 0).xyz, texelFetch(circTrack, ivec2(int(i1), rw), 0).xyz, uu);
        vec3 Tt = mix(texelFetch(circTrack, ivec2(int(i0), rw + 1), 0).xyz, texelFetch(circTrack, ivec2(int(i1), rw + 1), 0).xyz, uu);
        if (dot(Tt, Tt) > 1e-6) T = normalize(Tt);
      }
      F = frameTo(Fb, T);
    }
  }
  // THE LIVE RADIUS, the one rule (swellOf, circWidthOf and stumpK are shaders.ts's own; circShare's mix is circuitMorph's): the width follows the engine's diameter, eases to the map's, takes the tributary group's share, the stump
  // and the stenosis's waist, and the presence (nothing is created or destroyed at runtime: a vessel that is not there has no radius)
  float circShare = w;
  float vU = mix(300.0, 1.0 / CIRC_MAPK, circShare);
  float swell = swellOf(vindex, baseD, widthKind);
  if (circShare > 0.0) swell = mix(swell, circSwellNet(), circShare);
  swell *= liveW;
  vec2 uv = vec2(u, 0.0);
  vec3 position = A.xyz;
  float rest = mix(A.w, M.w, circShare);   // (the course's own radius share: on the map not the body's tapers: rk and rkc)
  if (stump.x > 0.0 && circShare < 0.001) swell *= stumpK(uv.x * len * vU, A.w * swell * vU);
  float narrowK = 1.0 - clamp(waistNarrow(waist, u), 0.0, 0.97);
  float lumen0W = rest * swell * presence;   // (before a stenosis or the stent's waist pinches it: the stent's cells are sized from it)
  float lumenW = lumen0W * narrowK;
  // the free ends' fade and the cava end's ease (FADE_ALPHA_GLSL), on this bone's own place along its edge
  float fa = 1.0;
  float mapFa = mapFade.z > 0.5 ? 1.0 - smoothstep(mapFade.x, mapFade.y, uv.x) : 1.0;
${FADE_ALPHA_GLSL}
  // THE OUTLINE is part of the tube: built INK wider than its lumen, painted by the fragment stage (shaders.ts: the line's width is the figure's, in CSS px)
  float vHi;
${HIGHLIGHT_ALONG_GLSL}
  vec4 cc = projectionMatrix * (modelViewMatrix * vec4(cen, 1.0));
  float wpcV = ${wpcGlsl('cc.w', 'projectionMatrix[1][1]', 'vU')};
  float vR = lumenW * vU;
  float rCssV = vR / max(wpcV, 1e-6);
  float inkPx = ${inkPxGlsl('rCssV', 'rCssV / narrowK')};
  inkPx *= mix(1.0, ${F(CIRC_INK_K)}, circT);
  float inkW = (inkPx + hiPx * vHi) * inkOn * wpcV / vU;
  o.cen = cen; o.F = F; o.lumen = lumenW; o.share = circShare; o.fa = fa * presence; o.hi = vHi; o.pres = presence; o.u = u; o.row = row; o.stay = stay; o.unit = vU; o.arc = mix(len, lenMap, circShare); o.lumen0 = lumen0W; o.dturn = dturn;
  // The outline's ink, the ring polygon's sag and the lift push the surface along its NORMAL (the vertex stage adds them once, along the blended bound normal): in a tube that is the ring direction, as the old shader's, and in a fillet it
  // is the shade normal, so the outline keeps its width across a junction (an offset pushed along each arm's own direction would thin it where the arms diverge). The ring's flats sit at the lumen + ink, its corners ringSag farther out.
  o.pad = inkW + (lumenW + inkW) * ringSag + inflate;
  return o;
}
void main() {
  vec3 pAcc = vec3(0.0), nAcc = vec3(0.0), tAcc = vec3(0.0), cenAcc = vec3(0.0);
  float padAcc = 0.0, lumen0Acc = 0.0, dturnAcc = 0.0, arcAcc = 0.0, fadeAcc = 0.0, hiAcc = 0.0, shareAcc = 0.0, lumenAcc = 0.0, presAcc = 0.0, unitAcc = 0.0, stayAcc = 1.0;
  float rowA = 0.0, rowB = 0.0, uA = 0.0, uB = 0.0, wA = -1.0, wB = -1.0;
  for (int k = 0; k < 4; k++) {
    float wk = weight[k];
    if (wk <= 0.0) continue;
    NetBone b = netBone(int(bone[k] + 0.5));
    vec3 o = k == 0 ? off0.xyz : (k == 1 ? vec3(off0.w, off1.xy) : (k == 2 ? vec3(off1.zw, off2.x) : off2.yzw));
    vec3 nr = k == 0 ? nrm0.xyz : (k == 1 ? vec3(nrm0.w, nrm1.xy) : (k == 2 ? vec3(nrm1.zw, nrm2.x) : nrm2.yzw));
    pAcc += wk * (b.cen + b.F * (o * b.lumen));
    padAcc += wk * b.pad;
    nAcc += wk * (b.F * nr);
    tAcc += wk * b.F[0];
    cenAcc += wk * b.cen;
    fadeAcc += wk * b.fa; hiAcc += wk * b.hi; shareAcc += wk * b.share; lumenAcc += wk * b.lumen * b.unit; presAcc += wk * b.pres; unitAcc += wk * b.unit; arcAcc += wk * b.arc; lumen0Acc += wk * b.lumen0 * b.unit; dturnAcc += wk * b.dturn;
    stayAcc = min(stayAcc, b.stay);
    if (wk > wA) { wB = wA; rowB = rowA; uB = uA; wA = wk; rowA = float(b.row); uA = b.u; }
    else if (wk > wB) { wB = wk; rowB = float(b.row); uB = b.u; }
  }
  float nl = length(nAcc), tl = length(tAcc);
  vec3 nUnit = nl > 1e-6 ? nAcc / nl : vec3(0.0, 0.0, 1.0);
  pAcc += nUnit * padAcc;
  vec4 cc = projectionMatrix * (modelViewMatrix * vec4(cenAcc, 1.0));
  vCen = vec3(cc.x, cc.y, cc.w);
  vec4 mv = modelViewMatrix * vec4(pAcc, 1.0);
  vN = normalize(normalMatrix * nUnit);
  vT = normalize(normalMatrix * (tl > 1e-6 ? tAcc / tl : vec3(1.0, 0.0, 0.0)));
  vZf = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));
  vV = normalize(-mv.xyz);
  // the stent's wires' shift along the tube here: the lateral offset in the map's plane times the bend turned since the stent began, so a cell keeps its length round a corner (shaders.ts vSkew)
  float vSkewV = 0.0;
  { float tn2 = length(tAcc.xy); if (shareAcc > 0.0 && tn2 > 1e-5) { vec2 tl = tAcc.xy / tn2; vSkewV = shareAcc * dot(nUnit.xy, vec2(-tl.y, tl.x)) * lumenAcc * dturnAcc; } }
  vPackD = vec2(lumen0Acc, vSkewV);
  vPackC = vec4(uA, 0.0, uB, wB > 0.0 ? wB / (wA + wB) : 0.0);
  vEdge = vec2(rowA, wB > 0.0 ? rowB : rowA);
  vec4 c = projectionMatrix * mv;
  c.z = mix(cc.z / cc.w, c.z / c.w, ${F(TUBE_DEPTH_SHARE)}) * c.w;   // depth by the tier of the axis (shaders.ts TUBE_DEPTH_SHARE)
  vPackA = vec4(c.w, lumenAcc, unitAcc, arcAcc);
  vPackB = vec4(fadeAcc, shareAcc, stayAcc, hiAcc);
  gl_Position = c;
  // a vertex whose bones have no radius (a vessel that is not there, a strand a band has closed) is not drawn: not even its ink, which has a width of its own on screen
  if (lumenAcc <= 1e-7 || presAcc < 1e-4) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;

// ---- the fragment stage ----
export const NET_FS = /* glsl */ `
uniform sampler2D edgeTex;
// the edge's row, as the old shader's per-vessel uniforms (the shared GLSL below reads these names)
${declare(NET_FS_COLUMNS)}
${loader('loadEdgeFS', NET_FS_COLUMNS)}
${FADE_FUNCS_GLSL}
${WEDGE_GLSL}
uniform float tubeDark;   // 1 on the dark looks: brighter tube caps (cel-glsl.ts celTubeBase)
${CEL_TUBE_GLSL}
${CEL_LIGHT_GLSL}
${VDBG_GLSL}
uniform vec3 toneColor[3];   // the look's palette, one colour per tone (the edge's \`tone\` column picks): the old shader's \`color\`
uniform vec3 inkColor;
uniform float shadeK;
uniform vec3 light;
uniform float bands;
uniform float spec;
uniform float time;
uniform sampler2D vdata;
uniform vec2 vdataSize;
uniform float useData;
uniform vec3 markDark;
uniform vec3 markLight;
uniform vec3 markRev;
uniform float lensMix;
uniform float lensTail;
uniform sampler2D lensGradA;
uniform sampler2D lensLaneA;
uniform sampler2D lensGradB;
uniform sampler2D lensLaneB;
uniform float lensModeA;
uniform float lensModeB;
uniform vec3 laneColA[5];
uniform vec3 laneColB[5];
uniform float lensSmooth;   // the lens colour runs through the colours a third and two thirds along (grad rows 2 and 3)
uniform vec4 stentWire;
uniform vec4 stentGoldC;
uniform sampler2D streamTex;
uniform sampler2D chainTex;
uniform float streakAmt;
uniform float projY;
uniform vec2 res;
uniform float dpr;
uniform vec3 inkColorCirc;
uniform float circT;
uniform vec3 wedgeCol;
uniform vec3 pageCol;
varying vec3 vCen;
varying vec3 vN;
varying vec3 vV;
varying vec3 vT;
varying vec3 vZf;
varying vec4 vPackA;
varying vec4 vPackB;
varying vec4 vPackC;
varying vec2 vPackD;
flat varying vec2 vEdge;
// (plain globals the shared GLSL reads, unpacked at the top of main)
float vW, vR, vR0, vSkew, vU, vArcLen, vFade, vCircShare, circStay, vHi, vUvB, vBlend;
vec2 vUv;

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// Doppler-style mean velocity (cm/s, signed) from the engine's flow (mL/s) and diameter (mm): the lumen's area is pi r^2
float meanVelocity(float q, float dmm) {
  float r = max(dmm, 0.5) * 0.05;
  return q / (3.14159265 * r * r);
}
${CHEVRON_GLSL}
${DUST_GLSL}
${CHEV_ONE_GLSL}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

${LENS_OF_AT_GLSL}
${CHEV_CREAM_GLSL}
${FLOW_MARKS_GLSL}
${CAP_CARVED_GLSL}

void main() {
  vW = vPackA.x; vR = vPackA.y; vU = vPackA.z; vArcLen = vPackA.w;
  vFade = vPackB.x; vCircShare = vPackB.y; circStay = vPackB.z; vHi = vPackB.w;
  vUv = vPackC.xy; vUvB = vPackC.z; vBlend = vPackC.w; vR0 = vPackD.x; vSkew = vPackD.y;
  loadEdgeFS(int(vEdge.x + 0.5));   // the dominant edge's state: the old shader's uniforms
  vec3 color = toneColor[int(tone + 0.5)];
  float streakCover = 0.0;   // (how much a streak covers this pixel: a chevron's pixel is never tinted by one)
  // THE DERIVATIVES, before any discard (see shaders.ts: a derivative after a discard is garbage on a device that drops the lane)
  vec3 nD = normalize(vN);
  vec3 sideD = cross(normalize(vT), normalize(vV));
  float sideDL = length(sideD);
  sideD = sideDL > 1e-4 ? sideD / sideDL : vec3(1.0, 0.0, 0.0);
  float fwSt = fwidth(dot(nD, celLightView())), fwPx = fwidth(vUv.x * vArcLen * vU), fwAw = max(fwidth(dot(nD, sideD)), 0.03);
  lensAcrossFw = fwidth(dot(nD, sideD) * 0.5 + 0.5);
  float acrossD = dot(nD, sideD), fwAcr = fwidth(acrossD), fwTh = fwidth(asin(clamp(acrossD, -0.999, 0.999)));
  float nzD = 0.0, fwNz = 0.0;
  if (smokeOn > 0.5) {
    float driftD = time * 0.04;
    nzD = vnoise(vec2(vUv.x * len * 5.0 + driftD * 6.0, acrossD * 3.0 + driftD)) * 0.65 + vnoise(vec2(vUv.x * len * 11.0 - driftD * 4.0, acrossD * 6.0)) * 0.35;
    fwNz = fwidth(nzD);
  }
  vec3 cBody = vec3(0.0);
  if (frontOut(vUv.x, reveal)) discard;
  if (fadedOut()) discard;
  // a part with no map course fades out over the first half of the Circuit's change in the same screen pattern as the dive's dissolve
  if (circStay < 0.999 && fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= circStay) discard;
  if (vFade < 0.004) discard;
  vec3 n = normalize(vN);
  vec3 sideX = cross(normalize(vT), normalize(vV));
  float sideL = length(sideX);
  vec3 side = sideL > 1e-4 ? sideX / sideL : vec3(1.0, 0.0, 0.0);
  float across = dot(n, side);
  if (capCarved(across)) discard;
  if (!gl_FrontFacing) discard;
  if (dotted > 0.5) {
    // a closed potential collateral: a dotted thread along the tube's axis, nothing round it
    float dash = fract(vUv.x * len / 0.09);
    if (dash > 0.45) discard;
  }

  // THE COLOUR: the lens of this edge at this place along it; in a fillet the second edge's too, blended by the bones' weights (vBlend), so a vein takes the colour of the vessel it joins through the fillet, with nothing cut
  vec4 la = lensOfAt(lensIndex, mix(lensSpan.x, lensSpan.y, vUv.x), lensGradA, lensLaneA, lensModeA, laneColA, across);
  vec4 lb = lensOfAt(lensIndex, mix(lensSpan.x, lensSpan.y, vUv.x), lensGradB, lensLaneB, lensModeB, laneColB, across);
  vec3 base = mix(mix(color, la.rgb, la.a), mix(color, lb.rgb, lb.a), lensMix);
  if (vBlend > 0.002 && vEdge.y != vEdge.x) {
    int r2 = int(vEdge.y + 0.5);
    float lensIndex2 = ${fetchOf('lensIndex', 'r2')}, lensUse2 = ${fetchOf('lensUse', 'r2')};
    vec2 span2 = ${fetchOf('lensSpan', 'r2')};
    vec3 color2 = toneColor[int(${fetchOf('tone', 'r2')} + 0.5)];
    float lensUse1 = lensUse;
    lensUse = lensUse2;   // (lensOfAt reads this edge's lensUse)
    float u2 = mix(span2.x, span2.y, vUvB);
    vec4 la2 = lensOfAt(lensIndex2, u2, lensGradA, lensLaneA, lensModeA, laneColA, across), lb2 = lensOfAt(lensIndex2, u2, lensGradB, lensLaneB, lensModeB, laneColB, across);
    lensUse = lensUse1;
    base = mix(base, mix(mix(color2, la2.rgb, la2.a), mix(color2, lb2.rgb, lb2.a), lensMix), vBlend);
  }

  // the fill: exactly TWO flat tones, lit by the one world light (cel-glsl.ts), no rim, no highlight. rDev: the tube's radius in device px
  float wpc0 = ${wpcGlsl('vW', 'projY', 'vU')};
  float rDev = vR / max(wpc0, 1e-6) * dpr;
  // the screen's own frame at this pixel: the tube's heading on screen, the pixel's offset from its axis, and its distance from it (device px)
  vec2 tS = vT.xy;
  float tl = length(tS);
  vec2 dvPx = gl_FragCoord.xy - (vCen.xy / vCen.z * 0.5 + 0.5) * res * dpr;
  float dLat = tl > 1e-3 ? abs(dot(dvPx, vec2(-tS.y, tS.x) / tl)) : length(dvPx);
  // the alpha is the bone-weighted blend (vFade): through a fillet it goes from one arm's to the other's with no step (the junction fade rule, by construction)
  float fadeHere = vFade;
#ifdef VEIL
  fadeHere *= veilK;
#else
  fadeHere *= solidK;
#endif
#ifdef GLOW
  // THE GLOW'S MASK (glow.ts, glow-fx.ts): the picked vessel as it is drawn, in its colour as drawn, weighted by the pick's weight vHi and by its fades: premultiplied, painted into the mask texture
  {
    float rCssG = vR / max(${wpcGlsl('vCen.z', 'projY', 'vU')}, 1e-6);
    float lineG = ${inkPxGlsl('rCssG', 'rCssG')} * mix(1.0, ${F(CIRC_INK_K)}, circT) * inkOn;
    float sG = dLat / dpr - rCssG - lineG;   // CSS px past the line's outer edge
    float wG = ${glowWeightGlsl('vHi')} * glowK * fadeHere * (1.0 - smoothstep(-0.5, 0.5, sG * dpr));
    gl_FragColor = vec4(${glowToneGlsl('base')} * wG, wG);
    return;
  }
#endif
  if (fadeHere < 0.004) discard;
  float sT = dot(n, celLightView());   // n.L against the WORLD light (cel-glsl.ts), so the camera never changes a shade
  float rDevAx = vR / max(${wpcGlsl('vCen.z', 'projY', 'vU')}, 1e-6) * dpr;   // the same radius at the AXIS's depth: what the vertex stage built the ink band from
  vec3 c = celTubeTone(base, sT, fwSt, rDev);   // two flat tones, matte and opaque: no highlight, no rim light
  c = mix(c, pageCol, ${QUIET_BACK.toFixed(3)} * quietK);   // (0 for every tier but the back one)
#ifdef VDBG
  c = dbgBody(c, base, n);
#endif
  // THE DUST (blood/dust-glsl.ts) is part of the tube: inside the lumen, following its alpha, under the chevrons
  float sD = vUv.x * len * vU;
  vec4 fd = flowDust(across, dustFrame(vT, vZf, normalize(vV), side), sD, len * vU, max(radius * vU, 1e-3), vR, vR / max(${wpcGlsl('vW', 'projY', 'vU')}, 1e-6), lensIndex, vindex, baseD, celTubeBase(base), vU);
  fd = clamp(fd, 0.0, 1.0) * dHold(fadeHere);
#ifdef VDBG
  if (dbgDust < 0.5) fd = vec4(0.0);
#endif
  cBody = c;
  streakCover = fd.a;
  c = c * (1.0 - fd.a) + fd.rgb;

  float vel = 0.0;
  float dmm = 8.0;
  if (useData > 0.5) {
    ivec2 tc = ivec2(int(mod(vindex, vdataSize.x)), int(floor(vindex / vdataSize.x)));
    vec4 td = texelFetch(vdata, tc, 0);
    dmm = td.b;
    vel = meanVelocity(td.g, dmm);
  }
  // stagnant blood in a big vein: slow, but not none, drifts as smoke (OFF unless a slide asks for stasis): flat patches of one tone with a hard edge
  if (smokeOn > 0.5 && useData > 0.5 && dmm > 5.0 && abs(vel) > 1.0 && abs(vel) < 9.0) {
    float nz = nzD;
    float amt = (1.0 - smoothstep(1.0, 9.0, abs(vel))) * 0.5 + 0.12;
    float nzW = max(fwNz * 0.75, 1e-3);
    c = mix(c, mix(base, vec3(lum(base) > 0.5 ? 0.15 : 0.92), 0.5), smoothstep(0.62 - amt - nzW, 0.62 - amt + nzW, nz) * 0.3);
  }

  // the flow heads, on the tube's surface as the 2D composite lays them
  float pxArc = fwPx;
  float acrossW = fwAw;
  vec4 hd = flowHeads(across, acrossW, vUv.x * len * vU, len * vU, vR, ${wpcGlsl('vW', 'projY', 'vU')}, pxArc, lensIndex, flowAmount, 1.0, la, lb, color, base);
  hd = clamp(hd, 0.0, 1.0);
#ifdef VDBG
  if (dbgHeads < 0.5) hd = vec4(0.0);
#endif
  if (hd.a > 0.0) {
    if (streakCover > 0.0) c = mix(c, cBody, hd.a);   // the streaks lie UNDER the chevrons
    c = c * (1.0 - hd.a) + hd.rgb;
  }
  // THE OUTLINE: the band between the lumen's edge and the tube's: the exact lateral distance from the pixel to the tube's axis, in device pixels, against the lumen's radius. Continuous through every junction: the line is one surface's
  float inkT = smoothstep(rDevAx - 0.5, rDevAx + 0.5, dLat) * inkOn;
#ifdef VDBG
  if (dbgInk < 0.5) inkT = 0.0;
#endif
  // in the Circuit the outline also sits a little inside the vessel and fades inward, so on a dark map the edge still reads
  float inDepth = clamp(${F(CIRC_INNER.R)} * rDevAx, ${F(CIRC_INNER.MIN_PX)} * dpr, ${F(CIRC_INNER.MAX_PX)} * dpr);
  c = mix(c, inkColorCirc, circT * ${F(CIRC_INNER.K)} * smoothstep(rDevAx - inDepth, rDevAx, dLat) * inkOn);
  if (inkT > 0.0) {
    vec3 inkH = ${inkColourGlsl('base')};
    c = mix(c, mix(inkH, inkColorCirc, circT), inkT);
  }
${PROCEDURE_MARKS_GLSL}
#ifdef VDBG
  c = dbgEnd(c, vindex);
#endif
  gl_FragColor = vec4(c, fadeHere);
}`;

/** The programs this file gives the compile test (src/debug/gl-auto.ts): the figure's, its veil over the organs, the glow's mask and the inspector's. */
export const GL_PROGRAMS = [
  { name: 'net vessel', vs: NET_VS, fs: NET_FS },
  { name: 'net vessel VEIL', vs: NET_VS, fs: NET_FS, defines: { VEIL: 1 } },
  { name: 'net vessel GLOW', vs: NET_VS, fs: NET_FS, defines: { GLOW: 1 } },
  { name: 'net vessel (inspector)', vs: NET_VS, fs: NET_FS, defines: { VDBG: 1 } },
] as const;

/** shaders.ts's sag for the mesher's ring (the uniform `ringSag`'s default): the mesher's RADIAL decides it, net/mesh.ts. */
export const NET_RING_SAG = TUBE_SAG;
