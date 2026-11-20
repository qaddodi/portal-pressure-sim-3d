// How a vessel fades at a free end, as the 2D figure does it (tables copied by scripts/copy-b3-data.mjs): the veins that end in the organ they drain (the splenic hilum, the bowel, the
// colon, the kidney) fade in from nothing over the first part of their length; the hepatic artery fades in at its start and its branches out at their ends, where they turn into
// sinusoids; the veins that run on out of the plate fade out down it. A fading tip is solid to its end while a collateral attaches there (TIP_CONNECT).
import { EDGES } from '../../engine/hales/portal/topology.js';
import { x3, y3 } from '../frame2d.ts';
import { ART_FADE_2D, FADE_DOWN_Y_2D, FADE_IN_2D, FEEDER_FADE_Y_2D, SIN_EDGES_2D, SIN_FADE_C9_2D, SIN_FADE_ROW_2D, TIP_CONNECT_2D, TIP_FADE_2D } from './fades.copied.ts';
import { EDGE_PATH_2D, IVC_EDGES, NODE_POS_2D } from './paths.copied.ts';
import { startInOrganShare } from './starts.ts';
import { END_JOIN, LIVER_BRANCH_HOSTS, splitShare } from './liver-branches.ts';

/** stage-geo.js IVC_NODES, IVC_JOIN_LEN, HEPATIC_VEINS: a vein that ends on the faint cava fades into it over its last 60 units (12 for the portocaval and mesocaval shunts), so the join is seamless. */
const IVC_NODES: ReadonlySet<string> = new Set(['IVCS', 'IVCI', 'RA', 'IVC_D', 'ILI_R']);
export const HEPATIC_VEINS: ReadonlySet<string> = new Set(['RHV_IVC', 'RHV_IVC_1', 'MHV_IVC', 'LHV_IVC', 'LRV_IVC', 'RRV_IVC']);
const IVC_JOIN_LEN = 60;
/** A hepatic vein that opens into the cava: one of the hepatic veins whose END is on the cava's node. The right hepatic vein is two pieces (RHV_IVC_1 from the liver to the TIPS junction, RHV_IVC from there to the cava), and only the second one opens into
 *  the cava: the rules for "a vein into the cava" (the end eased to the cava's alpha, the ink held back inside the cava, the part inside the lumen cut away) are keyed by where the vein ENDS, never by its name (root cause of the broken outline and the light line
 *  at the join of the two pieces in the Circuit, 20 Nov). */
export function opensIntoCava(id: string): boolean {
  const e = edgeById.get(id);
  return HEPATIC_VEINS.has(id) && !!e && IVC_NODES.has(e.to);
}
/** The cava's piece a vein that opens into it meets: the inferior cava below the hepatic veins' node (the renal veins' side) or above it. */
export const cavaPieceOf = (id: string): string => (edgeById.get(id)?.to === 'IVCI' ? 'IVC_IS_1' : 'IVC_IS');
/** The superior cava's two stretches are the cava itself, not a vein that joins it: they run on into the right atrium solid, as the inferior cava does (Mohammad, 20 Nov: "a hard colour step in the IVC at the right atrium": the SVC faded to 0.3 at the atrium where the IVC meets it whole). */
const SVC_STRETCH: ReadonlySet<string> = new Set(['SVC_RA', 'SVC_RA_1']);
/** Its alpha at the cava's wall (stage-geo.js IVC_JOIN: 0.3). */
export const IVC_JOIN_ALPHA = 0.3;
/** A branching portal vein and its side branch stay whole until the side branch has cleared the vein (a share of the run past the split): fading both over the overlap stacked their alphas into a dark ghost stub at every fork (Mohammad, 20 Nov). */
export const FORK_CLEAR = 0.5;
const edgeById = new Map((EDGES as { id: string; from: string; to: string; kind: string }[]).map((e) => [e.id, e]));
const lenOfPath = (p: readonly (readonly [number, number])[]): number => { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]); return l; };
/** The share of its length over which vessel `id` fades into the faint cava, or 0 for a vessel that does not end on it. */
export function ivcJoinSpan(id: string): number {
  const e = edgeById.get(id), path = EDGE_PATH_2D[id];
  if (!e || !path || IVC_EDGES.has(id) || SVC_STRETCH.has(id) || HEPATIC_VEINS.has(id) || !IVC_NODES.has(e.to) || !NODE_POS_2D[e.to] || !NODE_POS_2D[e.from]) return 0;
  if (e.kind === 'shunt' && id !== 'S_PC' && id !== 'S_MC') return 0;   // (the stents' ends stand as strong as their middle: JOIN_F_NOFADE)
  const l = lenOfPath(path);
  return l > 0 ? Math.min(id === 'S_PC' || id === 'S_MC' ? 12 : IVC_JOIN_LEN, l) / l : 0;
}

export interface TipFade {
  /** 1: along the vessel (0 to 1), 2: down the figure (scene y), 3: along a line across the figure (2D's linear mask: solid from `from` = its offset), 4: along a line, with a dip (faintest at `from`, solid at the end) */
  mode: 1 | 2 | 3 | 4;
  from: number; to: number;
  /** modes 3 and 4: the line, scene (x1, y1, x2, y2) */
  line?: readonly [number, number, number, number];
  /** alpha at `from` and at `to` */
  a0: number; a1: number;
  /** the Circuit does not let go of it (the artery's fades hold in both views) */
  keep: boolean;
  /** the collaterals whose being open makes the tip solid */
  connect: readonly string[];
  /** a fade into the faint cava: it goes while the cava is drawn whole (selected or named) */
  ivcJoin?: boolean;
}

const sceneLine = (x1: number, y1: number, x2: number, y2: number): readonly [number, number, number, number] => [x3(x1), y3(y1), x3(x2), y3(y2)];
const SIN_SET: ReadonlySet<string> = new Set(SIN_EDGES_2D);
/** stage-geo.js SIN_FADE: a liver bed is faded along its course (the line from its portal node to its venous one), faintest mid-lobe, solid at its end; the ascending lumbar collateral dips behind the liver the same way, down the figure. */
function sinFade(id: string): TipFade | null {
  if (id === 'C9') { const r = SIN_FADE_C9_2D; return { mode: 4, from: r[4]!, to: 1, a0: r[5]!, a1: r[6]!, line: sceneLine(r[0]!, r[1]!, r[2]!, r[3]!), keep: false, connect: [] }; }
  const e = edgeById.get(id), a = e && NODE_POS_2D[e.from], b = e && NODE_POS_2D[e.to];
  if (!SIN_SET.has(id) || !a || !b) return null;
  const r = SIN_FADE_ROW_2D;
  return { mode: 4, from: r[0]!, to: 1, a0: r[1]!, a1: r[2]!, line: sceneLine(a[0], a[1], b[0], b[1]), keep: false, connect: [] };
}
/** stage-geo.js FADE_IN: a vein fades into the vessel it sinks into (the hepatic veins and the renal veins into the cava, the caudate vein, C5 into the renal vein). */
function fadeIn(id: string): TipFade | null {
  const r = FADE_IN_2D[id];
  if (!r) return null;
  return { mode: 3, from: r[4]!, to: 1, a0: 1, a1: r[5] ?? 0.3, line: sceneLine(r[0]!, r[1]!, r[2]!, r[3]!), keep: false, connect: [] };
}

/** The share of the hepatic artery's drawn length it fades in over (2D: 0.28 of its whole run, most of which is not drawn now). */
export const HEP_FADE_IN = 0.85;

/** The portal branches end, and the hepatic veins begin, in the liver's tissue (the sinusoids between are not drawn): the share of each one's length it fades over. */
export const LIVER_FADE_OUT: Readonly<Record<string, number>> = { PVH_R_2: 0.6, PVH_L_1: 0.6 };
export const LIVER_FADE_IN: Readonly<Record<string, number>> = { RHV_IVC_1: 0.6, MHV_IVC: 0.6, LHV_IVC: 0.6 };

/** A vein whose start joins only a collateral (closed in health) would end blunt: the azygos arch's left end, over the top of the right atrium (Mohammad, 20 Nov: "this guy should also fade out on the left"). The share of its length it fades in over. */
export const FREE_START_FADE: Readonly<Record<string, number>> = { AZY_SVC: 0.55 };

/** The rectal varices run on further down (starts.ts END_ON): they fade out over the new stretch instead of the 2D one. */
const FADE_DOWN_ON: Readonly<Record<string, readonly [number, number]>> = { C4: [940, 1005] };
const ART_OUT_SHARE: Readonly<Record<string, number>> = { A_HR: 0.6, A_HL: 0.5 };

/** The fade of a vessel, or null for one that has none. A tributary fan (`feederHost`, the vein it feeds) fades as its host's FEEDER_FADE_Y says (the azygos's runs out down the figure, never ends in a cap). */
/** The veins that lie deep behind the main plane, not directly in view: they are drawn receded, at this share of their opacity everywhere, blended with whatever fade they already have (Mohammad, 20 Nov: "IVC and renal veins ... faded cuz they're
 *  not directly in view"). The cava itself is already drawn as the organs' veil (vessel-object.ts setBehindOrgans). */
export const RECEDE: Readonly<Record<string, number>> = { V_KID_L: 0.55, V_KID_L_1: 0.55, V_KID_R: 0.55, LRV_IVC: 0.55, RRV_IVC: 0.55 };
/** The cava is a background vessel too (Mohammad, 20 Nov: "IVC should be faded not prominent"): drawn at this share of its opacity, body, outline and chevrons together, lens colour kept. It rises to whole (1) when the cava is
 *  selected or named (the HVPG catheter, a slide about it: scene.ts stepCava eases it), and its end at the right atrium climbs back to full over its last stretch, where the superior cava arrives whole. */
export const CAVA_RECEDE = 0.45;
const CAVA_RA_RAMP = 0.5;
/** The hepatic veins open into the cava at full strength; their last stretch (as a share of their length) eases to the cava's alpha, so no solid vein end lies in a faint cava. */
export const CAVA_END_LEN = 40;
export function cavaEndSpan(id: string): number {
  const path = EDGE_PATH_2D[id];
  if (!path || !opensIntoCava(id) || id === 'LRV_IVC' || id === 'RRV_IVC') return 0;   // (the renal veins are receded to the cava's tone already)
  const l = lenOfPath(path);
  return l > 0 ? Math.min(CAVA_END_LEN, l) / l : 0;
}
export function fadeOf(id: string, isArtery: boolean, feederHost?: string): TipFade | null {
  const f = fadeOf0(id, isArtery, feederHost);
  if (IVC_EDGES.has(id)) {
    if (id === 'IVCS_RA') return { mode: 1, from: 1 - CAVA_RA_RAMP, to: 1, a0: CAVA_RECEDE, a1: 1, keep: false, connect: [] };
    return f ? { ...f, a0: f.a0 * CAVA_RECEDE, a1: f.a1 * CAVA_RECEDE } : { mode: 1, from: 0, to: 1, a0: CAVA_RECEDE, a1: CAVA_RECEDE, keep: false, connect: [] };
  }
  const k = RECEDE[id];
  if (k == null) return f;
  return f ? { ...f, a0: f.a0 * k, a1: f.a1 * k } : { mode: 1, from: 0, to: 1, a0: k, a1: k, keep: false, connect: [] };
}
function fadeOf0(id: string, isArtery: boolean, feederHost?: string): TipFade | null {
  // the children that branch off these ends in the liver (liver-branches.ts) fade the way their host does, along each one's own length, to nothing a little before their tip so no cut end is ever seen (a 3x look at the live build saw a flat pale end)
  if (feederHost && LIVER_FADE_OUT[feederHost]) return { mode: 1, from: FORK_CLEAR, to: 0.92, a0: 1, a1: 0, keep: false, connect: [] };
  if (feederHost && LIVER_FADE_IN[feederHost]) return { mode: 1, from: 0.08, to: 0.75, a0: 0, a1: 1, keep: false, connect: [] };
  if (feederHost === 'C3' && id.endsWith('~F:b')) return { mode: 1, from: 0.25, to: 1, a0: 1, a1: 0, keep: false, connect: [] };
  if (feederHost) { const yy = FEEDER_FADE_Y_2D[feederHost]; return yy ? { mode: 2, from: y3(yy[0]), to: y3(yy[1]), a0: 1, a1: 0, keep: false, connect: [] } : null; }
  const art = ART_FADE_2D[id];
  // (a vein that branches is one tube to its tip: it fades out of / in from the liver along its through branch, over the same stretch of the course as its side branch does)
  const sp = isArtery ? null : splitShare(id);
  if (sp != null) return (LIVER_BRANCH_HOSTS.out as readonly string[]).includes(id) ? { mode: 1, from: sp + FORK_CLEAR * (1 - sp), to: sp + 0.92 * (1 - sp), a0: 1, a1: 0, keep: false, connect: [] } : { mode: 1, from: 0.08 * sp, to: 0.75 * sp, a0: 0, a1: 1, keep: false, connect: [] };
  if (!isArtery && LIVER_FADE_OUT[id] && !END_JOIN.has(id)) return { mode: 1, from: 1 - LIVER_FADE_OUT[id]!, to: 1, a0: 1, a1: 0, keep: false, connect: [] };
  if (!isArtery && LIVER_FADE_IN[id]) return { mode: 1, from: 0, to: LIVER_FADE_IN[id]!, a0: 0, a1: 1, keep: false, connect: [] };
  // (the hepatic artery is cut short beside the portal trunk, starts/stub-free: it grows out of nothing over nearly all of what is drawn: starts.ts TRIM)
  if (art?.in) return { mode: 1, from: 0, to: id === 'A_HEP' ? HEP_FADE_IN : art.in, a0: 0, a1: 1, keep: true, connect: [] };
  // (the lobar arteries fade out with the portal branch they run beside, over the same share of their length: Mohammad, 20 Nov, "the right branch doesn't fade at the end")
  if (art?.out) return { mode: 1, from: 1 - (ART_OUT_SHARE[id] ?? art.out), to: 1, a0: 1, a1: 0, keep: false, connect: [] };
  const inOrgan = startInOrganShare(id, EDGE_PATH_2D[id] ?? []);
  if (inOrgan > 0 && !isArtery) return { mode: 1, from: 0, to: inOrgan, a0: 0, a1: 1, keep: false, connect: TIP_CONNECT_2D[id] ?? [] };
  const tip = TIP_FADE_2D[id] ?? FREE_START_FADE[id];
  if (tip && !isArtery) return { mode: 1, from: 0, to: tip, a0: 0, a1: 1, keep: false, connect: TIP_CONNECT_2D[id] ?? [] };
  const join = isArtery ? 0 : ivcJoinSpan(id);
  if (join > 0) return { mode: 1, from: 1 - join, to: 1, a0: 1, a1: IVC_JOIN_ALPHA, keep: false, connect: [], ivcJoin: true };
  const down = FADE_DOWN_ON[id] ?? FADE_DOWN_Y_2D[id];
  if (down) return { mode: 2, from: y3(down[0]), to: y3(down[1]), a0: 1, a1: 0, keep: false, connect: [] };
  return sinFade(id) ?? fadeIn(id);
}
