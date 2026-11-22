// The real range of each permanent arm's swell (live width over built width) over the 20 presets, unrounded: WP3's table (/mnt/project-files/recs-22nov/net-arm-ranges.md, 22 Nov), keyed by the vessel's id
// (an edge cut into pieces, `PVH_R#1`, has its vessel's range). The keys of a region (net/keys.ts) are its arms' states of this table's range. A vessel not listed (the arteries, the fixed-width ones) has no swell: 1.
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
 * There is NO bake-radius rule (plan owner, 22 Nov, "Ruling on the bake radius"): every region carries keys from its own real states (net/keys.ts), so the radius the fillet's fixed triangles are built at is the skeleton's own, factor 1, and the shader's start is the blend of the keys.
 * (`max / 1.2`, the geometric mean and the 'narrow' hybrid are gone: each baked an arm at a radius it never has, and a start at the rest radii folds a fillet from about 1.1 of it up. The mesh keeps the `bakeScale` array, all ones, for the bake file's layout.)
 */
export function bakeScaleOf(_edgeId: string): number { return 1; }
