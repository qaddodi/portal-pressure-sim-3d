// The real range of each permanent arm's swell (live width over built width) over the 20 presets, unrounded: WP3's table (/mnt/project-files/recs-22nov/net-arm-ranges.md, 22 Nov), keyed by the vessel's id
// (an edge cut into pieces, `PVH_R#1`, has its vessel's range). A fillet is baked with each arm at the GEOMETRIC MEAN of its range (review doc, "Rulings on WP3's sewn-end proposal" 3), so the radius the fixed triangles
// are built at is within the least ratio of every state the arm can be in. A vessel not listed (the arteries, the fixed-width ones) has no swell: 1.
export const ARM_RANGE: Readonly<Record<string, readonly [number, number]>> = {
  A_HEP: [1.0, 1.0],
  A_HR: [1.0, 1.0],
  A_HL: [1.0, 1.0],
  V_INT: [0.99, 1.15],
  V_INT_1: [0.99, 1.15],
  SMV_CONF: [0.99, 1.17],
  V_COL: [1.0, 1.15],
  V_IMV: [1.0, 1.16],
  SV_MID: [1.0, 1.17],
  SV_CONF: [0.45, 1.17],
  V_SPL: [1.0, 1.15],
  PV_TRUNK_1: [0.46, 1.11],
  LGV_CONF: [0.99, 1.17],
  PV_TRUNK: [0.46, 1.11],
  PVH_R_1: [0.99, 1.11],
  PVH_R_2: [0.99, 1.11],
  SIN_RR: [1.0, 1.0],
  POST_R_RHV: [1.0, 1.0],
  POST_R_MHV: [1.0, 1.0],
  RHV_IVC_1: [0.36, 1.08],
  RHV_IVC: [0.36, 1.08],
  IVC_IS_1: [0.72, 1.07],
  LRV_IVC: [0.95, 1.07],
  ILI_IVC_1: [0.95, 1.07],
  V_KID_L: [0.98, 1.05],
  V_KID_L_1: [0.98, 1.05],
  ILI_IVC: [0.95, 1.07],
  EPI_ILI: [1.0, 1.12],
  EPI_SVC: [1.0, 1.13],
  SVC_RA_1: [1.0, 1.15],
  SVC_RA: [1.0, 1.15],
  V_UP: [1.0, 1.12],
  AZY_SVC: [1.0, 1.13],
  PVH_R: [0.99, 1.11],
  PVH_L: [0.99, 1.11],
  PRE_R: [1.0, 1.0],
  PVH_L_1: [0.99, 1.11],
  PRE_L: [1.0, 1.0],
  LHV_IVC: [0.36, 1.08],
  POST_L_LHV: [1.0, 1.0],
  IVC_IS: [0.72, 1.07],
  MHV_IVC: [0.36, 1.08],
};

/**
 * How the bake picks each arm's radius: 'rest' (the skeleton's own radii, factor 1), 'geomean' (the geometric mean of the swell range, the 22 Nov ruling WP3's sweep found makes folds worse) or 'max12' (the range's maximum over 1.2, WP3's recommendation).
 * The plan owner's 22 Nov ruling: 'max12' (geometric mean withdrawn). Wide junctions add fitted keys on top (net/keys.ts).
 */
export type BakeRadii = 'rest' | 'geomean' | 'max12' | 'narrow';
export const BAKE_RADII: BakeRadii = 'narrow';
/** 'narrow' (WP3, 22 Nov, from the acceptance on the real figure): an arm whose range spans at most NARROW_SPAN is baked at the geometric mean of it (an arm that never swells, [1, 1], then sits at ratio 1: baked at max / 1.2 it sat at 1.2 in EVERY state, and 1.1 is where a rest-radii start begins to fold a fillet: 1 to 25 triangles at 1.2 to 1.3 on 9 of 17 regions); a wider range at max / WIDE_TOP (its keys carry the low side). */
export const NARROW_SPAN = 1.2, WIDE_TOP = 1.1;

/** The factor the bake scales an edge's radii by (1 when it has no swell range or the mode is 'rest'). */
export function bakeScaleOf(edgeId: string, mode: BakeRadii = BAKE_RADII): number {
  const r = mode === 'rest' ? undefined : ARM_RANGE[edgeId.split('#')[0]!];
  return r ? (mode === 'geomean' || (mode === 'narrow' && r[1] <= NARROW_SPAN * r[0]) ? Math.sqrt(r[0] * r[1]) : r[1] / (mode === 'narrow' ? WIDE_TOP : 1.2)) : 1;
}
