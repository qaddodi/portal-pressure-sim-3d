// The keyboard walk over the figure (2D stage.js: Tab steps through every structure, the arrows follow the flow). Pure: which vessel is
// next, and what a screen reader hears. The component (VesselWalk.tsx) only turns these into buttons and focus.
import { VESSELS } from '../anatomy/vessels.ts';
import { stationOfVessel, stationById } from './stations.ts';

export interface WalkVessel { id: string; from: string; to: string; name: string }

/** Every drawn vessel in the engine's own order (the order Tab walks). */
export const WALK: readonly WalkVessel[] = VESSELS.map((v) => ({ id: v.id, from: v.from, to: v.to, name: nameOf(v.id, v.label) }));

function nameOf(edge: string, fallback: string): string {
  const st = stationOfVessel(edge);
  return (st && stationById(st)?.name) || fallback;
}

/** The vessel one step along the flow (`down`) or against it (`up`) from `id`, given the sign of its flow now (negative: reversed, so the
 *  steps swap, as the 2D app's ArrowRight does). The first drawn vessel that carries on from the node at that end, or null at the end of the line. */
export function step(id: string, dir: 'down' | 'up', flow: number, drawn: readonly WalkVessel[] = WALK): string | null {
  const v = drawn.find((x) => x.id === id);
  if (!v) return null;
  const along = (dir === 'down') === (flow >= 0);
  const node = along ? v.to : v.from;
  // the vessel that carries on from that node in the same sense (a vessel flowing into the same node is a sibling, not a way on),
  // so a line of flow ends where it ends and can never loop back
  return drawn.find((x) => x.id !== id && (along ? x.from === node : x.to === node))?.id ?? null;
}

/** What a screen reader hears on a vessel: its name, its pressure and, only when it is not the usual, that the flow is reversed. */
export function describe(v: WalkVessel, pressure: number | null, flow: number | null): string {
  const parts = [v.name];
  if (pressure != null && Number.isFinite(pressure)) parts.push(`${pressure.toFixed(1)} mmHg`);
  if (flow != null && flow < 0) parts.push('flow reversed');
  return parts.join(', ');
}

/** The next or previous vessel in Tab order (wraps nowhere: the ends let Tab leave the figure). */
export function neighbourInOrder(id: string, delta: 1 | -1, drawn: readonly WalkVessel[] = WALK): string | null {
  const i = drawn.findIndex((x) => x.id === id);
  return i < 0 ? null : drawn[i + delta]?.id ?? null;
}
