// How a vessel fades at a free end, as the 2D figure does it (tables copied by scripts/copy-b3-data.mjs): the veins that end in the organ they drain (the splenic hilum, the bowel, the
// colon, the kidney) fade in from nothing over the first part of their length; the hepatic artery fades in at its start and its branches out at their ends, where they turn into
// sinusoids; the veins that run on out of the plate fade out down it. A fading tip is solid to its end while a collateral attaches there (TIP_CONNECT).
import { EDGES } from '../../engine/hales/portal/topology.js';
import { y3 } from '../frame2d.ts';
import { ART_FADE_2D, FADE_DOWN_Y_2D, TIP_CONNECT_2D, TIP_FADE_2D } from './fades.copied.ts';
import { EDGE_PATH_2D, IVC_EDGES, NODE_POS_2D } from './paths.copied.ts';

/** stage-geo.js IVC_NODES, IVC_JOIN_LEN, HEPATIC_VEINS: a vein that ends on the faint cava fades into it over its last 60 units (12 for the portocaval and mesocaval shunts), so the join is seamless. */
const IVC_NODES: ReadonlySet<string> = new Set(['IVCS', 'IVCI', 'RA', 'IVC_D', 'ILI_R']);
const HEPATIC_VEINS: ReadonlySet<string> = new Set(['RHV_IVC', 'RHV_IVC_1', 'MHV_IVC', 'LHV_IVC', 'LRV_IVC', 'RRV_IVC']);
const IVC_JOIN_LEN = 60;
/** Its alpha at the cava's wall (stage-geo.js IVC_JOIN: 0.3). */
export const IVC_JOIN_ALPHA = 0.3;
const edgeById = new Map((EDGES as { id: string; from: string; to: string; kind: string }[]).map((e) => [e.id, e]));
const lenOfPath = (p: readonly (readonly [number, number])[]): number => { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]); return l; };
/** The share of its length over which vessel `id` fades into the faint cava, or 0 for a vessel that does not end on it. */
export function ivcJoinSpan(id: string): number {
  const e = edgeById.get(id), path = EDGE_PATH_2D[id];
  if (!e || !path || IVC_EDGES.has(id) || HEPATIC_VEINS.has(id) || !IVC_NODES.has(e.to) || !NODE_POS_2D[e.to] || !NODE_POS_2D[e.from]) return 0;
  if (e.kind === 'shunt' && id !== 'S_PC' && id !== 'S_MC') return 0;   // (the stents' ends stand as strong as their middle: JOIN_F_NOFADE)
  const l = lenOfPath(path);
  return l > 0 ? Math.min(id === 'S_PC' || id === 'S_MC' ? 12 : IVC_JOIN_LEN, l) / l : 0;
}

export interface TipFade {
  /** 1: along the vessel (0 to 1), 2: down the figure (scene y) */
  mode: 1 | 2;
  from: number; to: number;
  /** alpha at `from` and at `to` */
  a0: number; a1: number;
  /** the Circuit does not let go of it (the artery's fades hold in both views) */
  keep: boolean;
  /** the collaterals whose being open makes the tip solid */
  connect: readonly string[];
  /** a fade into the faint cava: it goes while the cava is drawn whole (selected or named) */
  ivcJoin?: boolean;
}

/** The fade of a vessel, or null for one that has none. */
export function fadeOf(id: string, isArtery: boolean): TipFade | null {
  const art = ART_FADE_2D[id];
  if (art?.in) return { mode: 1, from: 0, to: art.in, a0: 0, a1: 1, keep: true, connect: [] };
  if (art?.out) return { mode: 1, from: 1 - art.out, to: 1, a0: 1, a1: 0, keep: true, connect: [] };
  const tip = TIP_FADE_2D[id];
  if (tip && !isArtery) return { mode: 1, from: 0, to: tip, a0: 0, a1: 1, keep: false, connect: TIP_CONNECT_2D[id] ?? [] };
  const join = isArtery ? 0 : ivcJoinSpan(id);
  if (join > 0) return { mode: 1, from: 1 - join, to: 1, a0: 1, a1: IVC_JOIN_ALPHA, keep: false, connect: [], ivcJoin: true };
  const down = FADE_DOWN_Y_2D[id];
  if (down) return { mode: 2, from: y3(down[0]), to: y3(down[1]), a0: 1, a1: 0, keep: false, connect: [] };
  return null;
}
