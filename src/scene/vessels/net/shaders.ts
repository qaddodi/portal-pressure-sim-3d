// The network shader (?geom=net, WP3): ONE vertex and ONE fragment program for a whole network's mesh, in place of ~55 tube programs and 33 skin programs with ~120 uniforms each.
//
// THE VERTEX STAGE deforms the bound mesh: every vertex carries up to four (bone, weight) pairs and its offset (and rest normal) in each bone's frame, divided by the bone's radius (net/types.ts NetMesh),
//     p = sum w_i (centre_i + frame_i * offset_i * lumen_i) + n * sum w_i pad_i,   n = the blended, renormalised bound rest normal
// (lumen_i is the live half width; pad_i the ink, the ring's sag and the inflate, pushed along the normal ONCE so the outline keeps its width across a fillet instead of adding up along each arm's own offset).
// The bone texture (net/bones.ts) gives each bone its place and radius in the body pose and the map pose and its frame; the edge-state texture (net/edge-state.ts) gives each bone's EDGE its state (the old per-vessel uniforms).
// For every bone the stage evaluates, with the vessel's OWN rules, the live radius R_i, the morph's share (the flow peel on the bone's rank), the fade and the highlight; the vertex then holds their blend.
// A junction's fillet vertices are bound to the arms' bones, so every one of those values is continuous through the junction by construction: no mate, no cut, no seam to match.
//
// JUNCTION VERTICES ARE PROJECTED (implicit skinning, review doc "Rulings on WP3"): the bone blend above is only their START (taken at the REST radii, blending the body and the map offset sets by the peel share); the stage then moves each onto the LIVE smooth union of its
// region's capsules (net/regions.ts: eight bones along each, live centre and live lumen with swell, width and presence; k = SKIN_K x the narrowest arm's live lumen) by three Newton steps, and takes the union's gradient at the shade width (eased to the nearest arm's own
// direction near a seam ring) for the shade normal; the ink, the ring's sag and the lift push along the union's gradient at the sharp width. Tube vertices stay on bones. tests/net-oracle.ts junctionPose is its twin; tests/net-implicit.test.ts holds the numbers.
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
import { FADE_FUNCS_GLSL, SCREEN_DITHER_GLSL } from '../../materials/shaders.ts';
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
import { SKIN_K } from '../skin/sdf.ts';
import { SKIN_RING_W_FROM, SKIN_SHADE_K } from '../skin/exact-normal.ts';
import { REGION_CAPS, REGION_HEAD, REGION_PTS } from './regions.ts';
import { PEEL_EASE_RADII } from './peel.ts';
import { SIDE_END_MIN, FLARE_K, FLARE_SPAN } from '../fork-joins.copied.js';
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
  'fadeMode', 'fadeA', 'fadeLine', 'mapFade', 'cavaEnd', 'stump', 'waist', 'noMap', 'presence', 'stentT0', 'lensUse', 'sewn', 'peelA',
];
export const NET_FS_COLUMNS: readonly string[] = [
  'tone', 'vindex', 'baseD', 'len', 'radius', 'lensIndex', 'lensUse', 'lensSpan', 'reveal', 'fade', 'flowAmount', 'smokeOn', 'dotted', 'hiColor', 'glowK', 'inkOn',
  'stump', 'seamA', 'seamB', 'stentU', 'wedge', 'wedgeD', 'circCap', 'solidK', 'veilK', 'quietK',
];

/** What the network object must carry as plain uniforms (and the textures): one set for the whole network, never per vessel. WP4 builds the material's uniforms from this list; tests/net-shader.test.ts holds it to the shaders. */
export const NET_GLOBALS: Readonly<Record<string, string>> = {
  // both stages
  boneTex: 'sampler2D', regionTex: 'sampler2D', capTex: 'sampler2D', capRows: 'float', sewnTex: 'sampler2D', sewnRows: 'float', edgeTex: 'sampler2D', vdata: 'sampler2D', vdataSize: 'vec2', useData: 'float', res: 'vec2', circT: 'float',
  // vertex stage
  circRot: 'vec2', circM: 'vec3', circTrackSize: 'vec2', circTrack: 'sampler2D', circBoost: 'float', circPerPx: 'float', ringSag: 'float',
  // fragment stage
  toneColor: 'vec3[3]', tubeDark: 'float', inkColor: 'vec3', inkColorCirc: 'vec3', shadeK: 'float', light: 'vec3', bands: 'float', spec: 'float', time: 'float', projY: 'float', dpr: 'float',
  markDark: 'vec3', markLight: 'vec3', markRev: 'vec3', lensMix: 'float', lensTail: 'float', lensGradA: 'sampler2D', lensLaneA: 'sampler2D', lensGradB: 'sampler2D', lensLaneB: 'sampler2D',
  lensModeA: 'float', lensModeB: 'float', lensRawA: 'float', lensRawB: 'float', laneColA: 'vec3[5]', laneColB: 'vec3[5]', lensSmooth: 'float', stentWire: 'vec4', stentGoldC: 'vec4', streamTex: 'sampler2D', chainTex: 'sampler2D', streakAmt: 'float',
  wedgeCol: 'vec3', pageCol: 'vec3', dustP: 'vec4[]', routeTex: 'sampler2D',
  // the inspector's (VDBG), as the old program's
  dbgShade: 'float', dbgDust: 'float', dbgHeads: 'float', dbgInk: 'float', dbgTint: 'float', dbgCol: 'vec4',
};

const MAP_X0 = PEEL_X0;

// ---- the vertex stage ----
/** Everything of the vertex stage the capsule pass shares with it: the attributes, the edge-state loaders and netBone with its radius rule (one source). */
const NET_VS_PRELUDE = /* glsl */ `
attribute vec4 bone;      // the four bones this vertex is bound to (indices into the bone texture, as floats)
attribute vec4 weight;
attribute vec4 off0;      // the offset in each bone's frame over the bone's radius: 4 x vec3 as 12 floats, (o0.xyz, o1.x) (o1.yz, o2.xy) (o2.z, o3.xyz)
attribute vec4 off1;
attribute vec4 off2;
attribute vec4 offM0;     // the MAP-pose offsets, the same layout (net/types.ts NetMesh.offsetMap; = off for a tube vertex): blended in by the vertex's peel share
attribute vec4 offM1;
attribute vec4 offM2;
attribute float region;   // the junction region this vertex belongs to (a row of regionTex, net/regions.ts), -1 for a tube vertex: bones only
attribute vec4 nrm0;      // the rest normal in each bone's frame, the same layout (net/types.ts NetMesh.normal)
attribute vec4 nrm1;
attribute vec4 nrm2;
uniform sampler2D boneTex;
uniform sampler2D regionTex;
uniform sampler2D sewnTex;     // the live lumen of each sewn end's host: (end 0, end 1) across, one row per edge (the sewn pass, NET_SEWN_VS)
uniform sampler2D capTex;      // the live capsule points of every region: (centre, lumen), one texel per point, REGION_CAPS x REGION_PTS across, one row per region (the capsule pass, NET_CAP_VS)
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
varying float vDraw;   // a junction region's two meshes: the body mesh's share of the pixels (variant 0), or 2 + it (the map mesh, which keeps the rest); 1 for everything else
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
// THE JUNCTION PEEL (net/peel.ts): inside a junction region every bone takes the region's node's peel share; outside it each arm eases from that share to its own flow-peel share over ${PEEL_EASE_RADII} arm radii with a smoothstep. peelA is
// (anchor bone at end 0, the u of the region's boundary from end 0, the same at end 1): an edge with no region has anchor -1 and its own share, circPeel(circT, mapRank(M)), exactly as before.
float peelShareAt(vec3 Mq, float uq, float rr) {
  float own = circPeel(circT, mapRank(Mq));
  float w = own;
  bool both = peelA.x > -0.5 && peelA.z > -0.5;
  // the free stretch between two regions' boundaries (an edge that joins two junctions) is shared: each end eases over at most half of it, so the two eases never meet inside a region
  float span = both ? (peelA.w - peelA.y) * len : 1.0e9;
  float inside = -1.0;
  for (int e = 0; e < 2; e++) {
    float anchor = e == 0 ? peelA.x : peelA.z;
    if (anchor < -0.5) continue;
    float seam = e == 0 ? peelA.y : peelA.w;
    float wn = circPeel(circT, mapRank(texelFetch(boneTex, boneTexel(int(anchor + 0.5), 0) + ivec2(1, 0), 0).xyz));
    float dd = e == 0 ? uq - seam : seam - uq;   // (u past the boundary: not positive inside)
    if (dd <= 0.0) { if (inside < 0.0) inside = wn; continue; }
    float Le = min(${F(PEEL_EASE_RADII)} * max(rr, 1e-6), 0.5 * max(span, 0.0));
    float s = Le > 0.0 ? smoothstep(0.0, 1.0, min(dd * len / Le, 1.0)) : 1.0;
    w += (wn - own) * (1.0 - s);
  }
  return inside >= 0.0 ? inside : clamp(w, 0.0, 1.0);
}
// A SEWN END (net/sewn.ts, 2D's sideEndScale / flareScale in fork-joins.copied.js): the tube runs on into its host, narrows to SIDE_END_MIN past the wall and flares at the heel, sized from the host's LIVE lumen (sewnTex, written once per frame by the same netBone).
// The scale of the radius at distance d (the edge's own units) from the end, for a host of radius hostR; flags: 1 inside, 2 sink, 4 flare, 8 capped (a generated end's flare never takes the tube wider than its host: tubes.ts).
float sewnNarrow(float d, float hostR) {
  float sd = 0.6 * hostR;
  if (!(sd > 0.0) || d >= sd) return 1.0;
  float t = max(0.0, d) / sd;
  return ${F(SIDE_END_MIN)} + (1.0 - ${F(SIDE_END_MIN)}) * t * t * (3.0 - 2.0 * t);
}
float sewnFlare(float d, float hostR) {
  if (!(hostR > 0.0)) return 1.0;
  float wall = 0.6 * hostR, t = clamp(1.0 - (d - wall) / (${F(FLARE_SPAN)} * hostR), 0.0, 1.0);
  return 1.0 + ${F(FLARE_K)} * t * t * (3.0 - 2.0 * t);
}
float sewnCollar(float u, float arc, float lumen, int row) {
  if (sewn.z < 0.5 && sewn.w < 0.5) return 1.0;
  if (lumen < 1e-9) return 1.0;
  float a = 1.0, n = 1.0, cap = 0.0;
  for (int e = 0; e < 2; e++) {
    int f = int((e == 0 ? sewn.z : sewn.w) + 0.5);
    if (f == 0) continue;
    float hostR = texelFetch(sewnTex, ivec2(e, row), 0).x, d = (e == 0 ? u : 1.0 - u) * arc;
    float nar = ((f & 1) != 0 && (f & 2) == 0) ? sewnNarrow(d, hostR) : 1.0, fl = (f & 4) != 0 ? sewnFlare(d, hostR) : 1.0;
    a *= nar * fl; n *= nar;
    if ((f & 8) != 0 && (f & 4) != 0 && fl > 1.0) cap = max(cap, hostR);
  }
  float k = a;
  if (cap > 0.0) k = min(a, max(n, cap / lumen));
  return k;
}
struct NetBone { vec3 cen; mat3 F; float lumen; float pad; float share; float fa; float hi; float pres; float u; int row; float stay; float unit; float arc; float lumen0; float dturn; float lumenRest; };
int netRowLoaded = -1;   // (the edge row the globals hold now: a junction's capsules read their bones edge by edge, so most reads reuse it)
// lite: only the bone's live centre and live lumen (the junction projection's capsules); the rest of the struct is not set
NetBone netBone(int bi, bool lite) {
  NetBone o;
  ivec2 t0 = boneTexel(bi, 0);
  vec4 A = texelFetch(boneTex, t0, 0), M = texelFetch(boneTex, t0 + ivec2(1, 0), 0), Q = texelFetch(boneTex, t0 + ivec2(2, 0), 0);
  int row = int(floor(Q.w));
  float u = clamp((Q.w - float(row)) * 2.0, 0.0, 1.0);
  if (row != netRowLoaded) { loadEdgeVS(row); netRowLoaded = row; }
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
      bool peeled = peelA.x > -0.5 || peelA.z > -0.5;
      w = peeled ? peelShareAt(M.xyz, u, A.w) : circPeel(circT, rank);
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
      // the share's gradient along the vessel: the flow peel's own (2D), or, where the edge belongs to a region, its change along this edge from the neighbours' shares (flat inside the region)
      float dwdu = circPeelSlope(circT, rank) * rs;
      if (peeled) dwdu = (peelShareAt(Mn.xyz, un, A.w) - peelShareAt(Mp.xyz, up, A.w)) / du;
      vec3 Tm = (1.0 - w) * dA + w * circTurnDir(dM) + dwdu * (cT - cA);
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
  swell *= sewnCollar(u, mix(len, lenMap, circShare), rest * swell * presence, row);   // (a sewn end: the collar, sized from the host's live lumen)
  float narrowK = 1.0 - clamp(waistNarrow(waist, u), 0.0, 0.97);
  float lumen0W = rest * swell * presence;   // (before a stenosis or the stent's waist pinches it: the stent's cells are sized from it)
  float lumenW = lumen0W * narrowK;
  if (lite) { o.cen = cen; o.lumen = lumenW; return o; }
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
  float inkPx = ${inkPxGlsl('rCssV', 'rCssV / narrowK', '1.0 - lensUse')};
  inkPx *= mix(1.0, ${F(CIRC_INK_K)}, circT);
  float inkW = (inkPx + hiPx * vHi) * inkOn * wpcV / vU;
  o.cen = cen; o.F = F; o.lumen = lumenW; o.share = circShare; o.fa = fa * presence; o.hi = vHi; o.pres = presence; o.u = u; o.row = row; o.stay = stay; o.unit = vU; o.arc = mix(len, lenMap, circShare); o.lumen0 = lumen0W; o.dturn = dturn;
  // The outline's ink, the ring polygon's sag and the lift push the surface along its NORMAL (the vertex stage adds them once, along the blended bound normal): in a tube that is the ring direction, as the old shader's, and in a fillet it
  // is the shade normal, so the outline keeps its width across a junction (an offset pushed along each arm's own direction would thin it where the arms diverge). The ring's flats sit at the lumen + ink, its corners ringSag farther out.
  o.pad = inkW + (lumenW + inkW) * ringSag + inflate;
  o.lumenRest = rest;
  return o;
}`;

export const NET_VS = /* glsl */ `${NET_VS_PRELUDE}
// ---- THE JUNCTION PROJECTION (implicit skinning, review doc "Rulings on WP3"): the live smooth union of a region's capsules and its gradient, sdf.ts sdUnionGrad in GLSL.
// Each capsule is ${REGION_PTS} bones: the axis runs through their live centres, the radius is their live lumen (swell, width, presence). capP = (centre, lumen) of every point, capMate the mate's index or -1 (the two halves of a run-on: a plain minimum).
vec4 capP[${REGION_CAPS * REGION_PTS}];
float capMate[${REGION_CAPS}];
float netArmSd(int c, vec3 p, out vec3 g, out vec3 cpt) {
  float best = 1.0e20, bt = 0.0;
  int bi = 0;
  for (int s = 0; s < ${REGION_PTS - 1}; s++) {
    vec3 a = capP[c * ${REGION_PTS} + s].xyz, b = capP[c * ${REGION_PTS} + s + 1].xyz - a, q = p - a;
    float bb = dot(b, b), t = bb > 1.0e-12 ? clamp(dot(q, b) / bb, 0.0, 1.0) : 0.0;
    vec3 dv = q - t * b;
    float d2 = dot(dv, dv);
    if (d2 < best) { best = d2; bt = t; bi = s; }
  }
  vec4 P0 = capP[c * ${REGION_PTS} + bi], P1 = capP[c * ${REGION_PTS} + bi + 1];
  vec3 bv = P1.xyz - P0.xyz;
  float d = sqrt(best), inv = d > 1.0e-12 ? 1.0 / d : 0.0, bb = dot(bv, bv);
  cpt = P0.xyz + bv * bt;
  g = (p - cpt) * inv;
  if (bt > 0.0 && bt < 1.0 && bb > 1.0e-12) g -= (P1.w - P0.w) / bb * bv;
  return d - mix(P0.w, P1.w, bt);
}
float netUnion(vec3 p, float k, int nc, out vec3 g) {
  float acc = 0.0;
  vec3 gacc = vec3(0.0);
  bool first = true;
  for (int i = 0; i < ${REGION_CAPS}; i++) {
    if (i >= nc) break;
    int m = int(floor(capMate[i] + 0.5));
    if (m >= 0 && m < i) continue;
    vec3 ug, cp;
    float b = netArmSd(i, p, ug, cp);
    if (m > i) { vec3 mg; float o = netArmSd(m, p, mg, cp); if (o < b) { b = o; ug = mg; } }
    if (first) { acc = b; gacc = ug; first = false; continue; }
    float a = acc, raw = 0.5 + 0.5 * (b - a) / max(k, 1.0e-6), h = clamp(raw, 0.0, 1.0);
    bool inside = raw > 0.0 && raw < 1.0;
    float dfdh = a - b - k + 2.0 * k * h, dha = inside ? -0.5 / max(k, 1.0e-6) : 0.0, dhb = inside ? 0.5 / max(k, 1.0e-6) : 0.0;
    gacc = (h + dfdh * dha) * gacc + (1.0 - h + dfdh * dhb) * ug;
    acc = b + (a - b) * h - k * h * (1.0 - h);
  }
  g = gacc;
  return acc;
}
void main() {
  // A JUNCTION REGION HAS TWO MESHES (body-built and map-built, regions.ts), both projected onto the one live union; the screen dither hands over from one to the other over [b, a] of t, and the one not drawn is a point (no work, no fragments)
  vDraw = 1.0;
  if (region > -0.5) {
    int r0 = int(region + 0.5);
    float variantM = texelFetch(regionTex, ivec2(0, r0), 0).z;
    vec2 win = texelFetch(regionTex, ivec2(3, r0), 0).xy;
    float wb = win.y > win.x ? 1.0 - smoothstep(win.x, win.y, circT) : (circT < win.y ? 1.0 : 0.0);
    if (variantM < 0.5 ? wb <= 0.0 : wb >= 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vDraw = variantM < 0.5 ? wb : 2.0 + wb;
  }
  vec3 pAcc = vec3(0.0), pMapAcc = vec3(0.0), nAcc = vec3(0.0), tAcc = vec3(0.0), cenAcc = vec3(0.0);
  float padAcc = 0.0, lumen0Acc = 0.0, dturnAcc = 0.0, arcAcc = 0.0, fadeAcc = 0.0, hiAcc = 0.0, shareAcc = 0.0, lumenAcc = 0.0, presAcc = 0.0, unitAcc = 0.0, stayAcc = 1.0;
  int rowOf[4] = int[4](-1, -1, -1, -1);
  float rowA = 0.0, rowB = 0.0, uA = 0.0, uB = 0.0, wA = -1.0, wB = -1.0;
  for (int k = 0; k < 4; k++) {
    float wk = weight[k];
    if (wk <= 0.0) continue;
    NetBone b = netBone(int(bone[k] + 0.5), false);
    rowOf[k] = b.row;
    float sc = region > -0.5 ? b.lumenRest : b.lumen;   // (a junction vertex STARTS from the rest arrangement, the projection below follows the live radii)
    vec3 o = k == 0 ? off0.xyz : (k == 1 ? vec3(off0.w, off1.xy) : (k == 2 ? vec3(off1.zw, off2.x) : off2.yzw));
    vec3 nr = k == 0 ? nrm0.xyz : (k == 1 ? vec3(nrm0.w, nrm1.xy) : (k == 2 ? vec3(nrm1.zw, nrm2.x) : nrm2.yzw));
    vec3 om = k == 0 ? offM0.xyz : (k == 1 ? vec3(offM0.w, offM1.xy) : (k == 2 ? vec3(offM1.zw, offM2.x) : offM2.yzw));
    pAcc += wk * (b.F * (o * sc));
    pMapAcc += wk * (b.F * (om * sc));
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
  vec3 nPush = nUnit;   // (the direction the ink, the ring's sag and the lift push along: a tube's is its normal; a junction vertex's is the union's gradient at the sharp width, below)
  // the body set and the map set, blended by the vertex's peel share (a tube vertex has the same offsets in both, so it is unchanged; a junction vertex moves from its body shape to its shrink-wrap on the map)
  pAcc = cenAcc + mix(pAcc, pMapAcc, clamp(shareAcc, 0.0, 1.0));
  if (region > -0.5) {
    // THE PROJECTION: the capsules from their bones (live centre and lumen), k from the narrowest ARM's live lumen at the junction, three Newton steps onto the live union, the normal the union's gradient at the shade width
    int rr = int(region + 0.5);
    vec4 hd = texelFetch(regionTex, ivec2(0, rr), 0);
    int nc = int(hd.x + 0.5), na = int(hd.y + 0.5);
    float kMin = 1.0e9;
    for (int c = 0; c < ${REGION_CAPS}; c++) {
      if (c >= nc) break;
      vec4 mt = texelFetch(regionTex, ivec2(1 + c / 4, rr), 0);
      int mc = c - (c / 4) * 4;
      capMate[c] = mc == 0 ? mt.x : (mc == 1 ? mt.y : (mc == 2 ? mt.z : mt.w));
      // the live capsule points, evaluated once per frame by the capsule pass (NET_CAP_VS, the same netBone): centre and lumen
      for (int q = 0; q < ${REGION_PTS}; q++) {
        vec4 cpq = texelFetch(capTex, ivec2(c * ${REGION_PTS} + q, rr), 0);
        capP[c * ${REGION_PTS} + q] = cpq;
        if (q == 0 && c < na) kMin = min(kMin, cpq.w);
      }
    }
    float kU = ${F(SKIN_K)} * kMin;
    vec3 gU = vec3(0.0, 0.0, 1.0);
    for (int s = 0; s < 3; s++) {
      float f = netUnion(pAcc, kU, nc, gU);
      float l2 = dot(gU, gU);
      if (l2 > 1.0e-12) pAcc -= f * gU / l2;
    }
    nPush = gU / max(length(gU), 1.0e-9);
    // the normal: the union's gradient at the SHADE width, eased to the nearest arm's own radial direction where one arm is nearly all there is (exact-normal.ts: a seam ring is the tube's)
    float wmax = 0.0;
    for (int a = 0; a < 4; a++) { float sw = 0.0; for (int b2 = 0; b2 < 4; b2++) if (rowOf[b2] == rowOf[a] && rowOf[a] >= 0) sw += weight[b2]; wmax = max(wmax, sw); }
    vec3 gS;
    netUnion(pAcc, ${F(SKIN_SHADE_K)} * kU, nc, gS);
    float bestSd = 1.0e20;
    vec3 bestC = pAcc;
    for (int c = 0; c < ${REGION_CAPS}; c++) {
      if (c >= nc) break;
      vec3 ug, cp;
      float sd = netArmSd(c, pAcc, ug, cp);
      if (sd < bestSd) { bestSd = sd; bestC = cp; }
    }
    vec3 gn = gS / max(length(gS), 1.0e-9), rad = (pAcc - bestC) / max(length(pAcc - bestC), 1.0e-9);
    nUnit = normalize(mix(gn, rad, smoothstep(0.6, ${F(SKIN_RING_W_FROM)}, wmax)));
  }
  pAcc += nPush * padAcc;
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
uniform float lensRawA;
uniform float lensRawB;
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
varying float vDraw;
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
  if (circStay < 0.999 && ${SCREEN_DITHER_GLSL} >= circStay) discard;
  // a junction region's two meshes hand over in the same pattern: the body mesh keeps the pixels below its share, the map mesh the others, so every pixel is drawn by exactly one of them
  if (vDraw < 0.999 || vDraw > 1.001) { bool mapMesh = vDraw > 1.5; float wbS = mapMesh ? vDraw - 2.0 : vDraw; float nzS = ${SCREEN_DITHER_GLSL}; if (mapMesh ? nzS < wbS : nzS >= wbS) discard; }
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
  tubeRawK = mix(la.a * lensRawA, lb.a * lensRawB, lensMix);   // (the pressure ramp is authored as drawn: cel-glsl.ts tubeRawK)
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
    tubeRawK = mix(tubeRawK, mix(la2.a * lensRawA, lb2.a * lensRawB, lensMix), vBlend);
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
    float lineG = ${inkPxGlsl('rCssG', 'rCssG', '1.0 - lensUse')} * mix(1.0, ${F(CIRC_INK_K)}, circT) * inkOn;
    float sG = dLat / dpr - rCssG - lineG;   // CSS px past the line's outer edge
    float wG = ${glowWeightGlsl('vHi')} * glowK * fadeHere * (1.0 - smoothstep(-0.5, 0.5, sG * dpr));
    gl_FragColor = vec4(${glowToneGlsl('base')} * wG, wG);
    return;
  }
#endif
  if (fadeHere < 0.004) discard;
  float sT = dot(n, celLightView());   // n.L against the WORLD light (cel-glsl.ts), so the camera never changes a shade
  float rDevAx = vR / max(${wpcGlsl('vCen.z', 'projY', 'vU')}, 1e-6) * dpr;   // the same radius at the AXIS's depth: what the vertex stage built the ink band from
  vec3 c = celTubeToneArt(base, sT, fwSt, rDev, 1.0 - lensUse);   // two flat tones, matte and opaque: no highlight, no rim light
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

// ---- THE CAPSULE PASS: once per drawn frame, one point per (region, capsule, point) writes that bone's live centre and lumen into capTex (RGBA32F, REGION_CAPS x REGION_PTS across, one row per region), by the same netBone (lite) the vertex stage's
// radius rule lives in. Draw `capPointIds(regions)` as gl_POINTS into a render target of that size. The junction vertices then read their capsules from the texture instead of evaluating the bones themselves.
export const NET_CAP_VS = /* glsl */ `${NET_VS_PRELUDE}
attribute float capId;   // region * ${REGION_CAPS * REGION_PTS} + capsule * ${REGION_PTS} + point
uniform float capRows;   // the render target's height: the number of regions
varying vec4 vCapOut;
void main() {
  float W = ${F(REGION_CAPS * REGION_PTS)};
  float rid = floor(capId / W + 0.001);
  float within = capId - rid * W;
  int rr = int(rid + 0.5), slot = int(within + 0.5);   // the bones of a region are packed four to a texel from texel 3, capsule after capsule
  vec4 bi4 = texelFetch(regionTex, ivec2(${REGION_HEAD} + slot / 4, rr), 0);
  NetBone nb = netBone(int(bi4[slot - (slot / 4) * 4] + 0.5), true);
  vCapOut = vec4(nb.cen, nb.lumen);
  gl_PointSize = 1.0;
  gl_Position = vec4((within + 0.5) / W * 2.0 - 1.0, (rid + 0.5) / capRows * 2.0 - 1.0, 0.0, 1.0);
}`;
export const NET_CAP_FS = /* glsl */ `
varying vec4 vCapOut;
void main() { gl_FragColor = vCapOut; }`;
/** The point ids of the capsule pass: every (region, capsule, point) slot of `regions` regions, in texel order. */
export const capPointIds = (regions: number): Float32Array => Float32Array.from({ length: regions * REGION_CAPS * REGION_PTS }, (_, i) => i);

// ---- THE SEWN PASS: once per drawn frame, one point per (edge, end) writes the live lumen of that end's host (the host's bone read by the same netBone, lite) into sewnTex (RGBA32F, 2 wide, one row per edge). The sewn tube's collar reads it
// (sewnCollar above), so the collar follows the host's live radius with one source for the radius rule and no read of a second edge's row in the middle of the first's.
export const NET_SEWN_VS = /* glsl */ `${NET_VS_PRELUDE}
attribute float sewnId;   // edge * 2 + end
uniform float sewnRows;   // the render target's height: the number of edges
varying float vHostLumen;
void main() {
  int id = int(sewnId + 0.5), row = id / 2, end = id - row * 2;
  loadEdgeVS(row); netRowLoaded = row;
  float hb = end == 0 ? sewn.x : sewn.y;
  vHostLumen = hb >= 0.0 ? netBone(int(hb + 0.5), true).lumen : 0.0;
  gl_PointSize = 1.0;
  gl_Position = vec4((float(end) + 0.5) - 1.0, (float(row) + 0.5) / sewnRows * 2.0 - 1.0, 0.0, 1.0);
}`;
export const NET_SEWN_FS = /* glsl */ `
varying float vHostLumen;
void main() { gl_FragColor = vec4(vHostLumen, 0.0, 0.0, 1.0); }`;
/** The point ids of the sewn pass: every (edge, end), in texel order. */
export const sewnPointIds = (edges: number): Float32Array => Float32Array.from({ length: edges * 2 }, (_, i) => i);

/** The programs this file gives the compile test (src/debug/gl-auto.ts): the figure's, its veil over the organs, the glow's mask and the inspector's. */
export const GL_PROGRAMS = [
  { name: 'net vessel', vs: NET_VS, fs: NET_FS },
  { name: 'net vessel VEIL', vs: NET_VS, fs: NET_FS, defines: { VEIL: 1 } },
  { name: 'net vessel GLOW', vs: NET_VS, fs: NET_FS, defines: { GLOW: 1 } },
  { name: 'net vessel (inspector)', vs: NET_VS, fs: NET_FS, defines: { VDBG: 1 } },
  { name: 'net capsules', vs: NET_CAP_VS, fs: NET_CAP_FS },
  { name: 'net sewn hosts', vs: NET_SEWN_VS, fs: NET_SEWN_FS },
] as const;

/** shaders.ts's sag for the mesher's ring (the uniform `ringSag`'s default): the mesher's RADIAL decides it, net/mesh.ts. */
export const NET_RING_SAG = TUBE_SAG;
