// The figure's vessel widths (stage-tubes.js widthAt), a leaf module so the edited plan (src/editor/vessel-plan.ts) can size an arm's easing without importing network.ts.
import { EDGES, PART_OF } from '../../engine/hales/portal/topology.js';
import { IVC_EDGES } from './paths.copied.ts';

export interface Edge { id: string; from: string; to: string; kind: string; code?: string; d?: number; dMax?: number; share?: number; label?: string; zone?: string; shunt?: string; spontaneous?: boolean }
const CALIBER = 1.3;
/** stage.js vesselPx: a vein's width in the figure's units from its diameter in mm. */
export const vesselPx = (dmm: number): number => CALIBER * Math.max(2.6, 2.0 * Math.pow(Math.max(0.1, dmm), 0.72));
export const AP_FINE = 0.6;
export const isArteryEdge = (e: Edge): boolean => e.kind === 'artery' || e.kind === 'arteriole' || (e.kind === 'shunt' && e.shunt === 'ap');
const IVC_ONE_D = () => (EDGES as Edge[]).find((e) => e.id === 'IVC_IS')!.d!;

/** The figure's width of edge `e` at diameter `dmm`, before the per-vessel exceptions. */
export function widthPx(e: Edge, dmm: number): number {
  if (e.kind === 'liver') return e.zone === 'sin' || e.zone === 'inter' || e.zone === 'post' ? 3.6 : 5.2;
  if (isArteryEdge(e)) return Math.max(1.8, vesselPx(dmm) * 0.5 * (e.shunt === 'ap' ? AP_FINE : 1));
  // (a vein the engine cuts in pieces where a shunt or a collateral joins it is ONE vein: every exception is keyed by the whole vein's id, not the piece's, or its pieces are drawn at different calibres and the vein steps
  //  where they meet: the superior cava's upper piece was 1.39 times as wide as its lower one, 2D's own step (stage-tubes.js keys the 0.72 by the piece), which the smooth joins could only soften into a bulge. Mohammad, 20 Nov: "smooth calibres across the entirety of the app")
  const whole = (PART_OF as Record<string, string | undefined>)[e.id] ?? e.id;
  let w = vesselPx(IVC_EDGES.has(e.id) ? IVC_ONE_D() : dmm) * (IVC_EDGES.has(e.id) || whole === 'SVC_RA' || whole === 'V_UP' ? 0.72 : 1);
  if (e.id === 'C8') w *= 0.6;
  if (e.id === 'C3') w *= 0.6;   // the paraumbilical vein is a branch of the left portal vein, not as wide as it: it leaves it as a filleted Y (the fork rule), not a blunt stack of equal tubes (Mohammad, 20 Nov)
  if (whole === 'LGV_CONF') w *= 0.85;
  return w;
}
