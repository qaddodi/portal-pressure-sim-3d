// Where every uniform of the per-vessel shader goes under ?geom=net (WP1). vessels/shaders.ts VESSEL_VS and VESSEL_FS declare ~110 uniforms that each vessel object sets for itself; the network shader has ONE object, so each uniform is:
//   edge     a column of the edge-state texture (edge-state.ts EDGE_COLUMNS names it in `uniform`: that is the table, there is no second list to drift)
//   bone     read from the bone texture (bones.ts)
//   global   stays a plain uniform or texture, shared by the whole network object (its value is the same for every vessel, or a palette the shader indexes by the edge's `tone`)
//   dropped  not needed: the skeleton makes it true by construction (tests/net-uniform-map.test.ts holds the list to the review's)
// tests/net-uniform-map.test.ts reads the uniforms out of the real shader strings and fails on any that no entry covers, and on any entry the shaders no longer declare.
import { EDGE_COLUMNS } from './edge-state.ts';

export type UniformFate =
  | { kind: 'edge'; column: string }
  | { kind: 'bone'; from: string }
  | { kind: 'global'; why: string }
  | { kind: 'dropped'; why: string };

/** The uniform names a GLSL source declares (`uniform float a;`, `uniform vec3 b[5];`, `uniform float a, b;`). */
export function shaderUniforms(src: string): string[] {
  const names = new Set<string>();
  for (const m of src.matchAll(/^[ \t]*uniform\s+(?:(?:highp|mediump|lowp)\s+)?\w+\s+([^;]+);/gm)) {
    for (const part of m[1]!.split(',')) { const n = /^\s*(\w+)/.exec(part); if (n) names.add(n[1]!); }
  }
  return [...names];
}

const DBG = 'the inspector\'s debug view (debug-view.ts)';
const STENT = 'the Anatomy stent\'s own look (stent-look.ts), one for every vessel';
const SHARED = 'the same for every vessel: a scene-wide uniform or texture';
const g = (why: string = SHARED): UniformFate => ({ kind: 'global', why });
const joint = (why: string): UniformFate => ({ kind: 'dropped', why });
const SKIN = 'junction skin machinery (skin/): the skeleton\'s one mesh has no seam to cut, hole or weld (WP6 deletes skin/)';
const MATE = 'a continuing vessel is the next bone of the same mesh: the width, the fade and the ink are continuous through the node (the one live-radius function and the blended edge state), so no mate has to be named';

/** Everything that is not an edge column. */
const OTHER: Record<string, UniformFate> = {
  // the vessel's rest radius is the bone's
  radius: { kind: 'bone', from: 'texel 0 and 1 radius (r[0] body, r[1] map)' },
  // shared by the whole object
  vdata: g('the engine data texture'), vdataSize: g(), useData: g(), res: g(), dpr: g(), projY: g(), time: g(), light: g(), bands: g('2 on every vessel'), spec: g('1 on every vessel'),
  circT: g(), circRot: g(), circM: g(), circTrack: g(), circTrackSize: g(), circBoost: g(), circPerPx: g(),
  tubeDark: g(), shadeK: g(), inkColor: g('the look\'s casing ink'), inkColorCirc: g(), casingA: g(), casingCircA: g(), pageCol: g(), rimInk: g(), wedgeCol: g(),
  color: g('the look\'s palette, one colour per tone: the shader picks by the edge\'s `tone` column'),
  markDark: g(), markLight: g(), markRev: g(),
  lensMix: g(), lensTail: g(), lensGradA: g(), lensLaneA: g(), lensModeA: g(), lensRawA: g(), lensGradB: g(), lensLaneB: g(), lensModeB: g(), lensRawB: g(), laneColA: g(), laneColB: g(), lensSmooth: g('the Smooth joins setting'),
  stentWire: g(STENT), stentGoldC: g(STENT),
  streamTex: g(), chainTex: g(), routeTex: g(), streakAmt: g(), dustP: g(),
  dbgShade: g(DBG), dbgDust: g(DBG), dbgHeads: g(DBG), dbgInk: g(DBG), dbgTint: g(DBG), dbgCol: g(DBG),
  // dropped because the skeleton is continuous by construction (the review's list first: mate0, mate1, nbrMate, bury, cmate0, cmate1, cease)
  mate0: joint(MATE), mate1: joint(MATE), nbrMate: joint('a fork\'s other tube is the same mesh: the union outline comes from the one hull'), bury: joint('the ink held back inside a trunk: the junction is one surface, its outline is the union\'s'),
  cmate0: joint(MATE), cmate1: joint(MATE), cease: joint('the taper over a map join: the map\'s node is one point, the radius is one function of u across it'),
  // the skin machinery the same review removes in WP6
  skinCut: joint(SKIN), skinCutC: joint(SKIN), skinHole: joint(SKIN), skinHole2: joint(SKIN), skinWeld: joint(SKIN), skinWeldC: joint(SKIN), nbrOn: joint(SKIN),
  // a vein's end in the cava: the fillet blends the alpha and the lens colour between the bones (review point 4). WP3 confirms this at the cava junctions before the old path goes.
  cavaCut: joint('a vein entering the cava takes the cava\'s colour and alpha as it nears the wall: the bone-weighted blend across the fillet does it'),
  cavaA: joint('the same (the cava\'s alpha at the junction is the dominant neighbour bone\'s fade)'),
  cavaRef: joint('the same (the cava\'s lens position at the junction is the neighbour bone\'s)'),
};

const EDGE = new Map(EDGE_COLUMNS.filter((c) => c.uniform).map((c) => [c.uniform!, c.name]));

/** The fate of a uniform, or undefined when nothing covers it. */
export function uniformFate(name: string): UniformFate | undefined {
  const column = EDGE.get(name);
  return column ? { kind: 'edge', column } : OTHER[name];
}

/** The names of every uniform that has a fate here (for the test that finds stale entries). */
export const MAPPED_UNIFORMS: readonly string[] = [...new Set([...EDGE.keys(), ...Object.keys(OTHER)])];
/** Names that appear in both an edge column and the other table (a mistake: the test fails on it). */
export const DOUBLE_MAPPED: readonly string[] = Object.keys(OTHER).filter((n) => EDGE.has(n));
