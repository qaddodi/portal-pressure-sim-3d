// The keyboard walk over the figure (2D stage.js: Tab steps through every structure, the arrows follow the flow). Pure: which vessel is
// next, and what a screen reader hears. The component (VesselWalk.tsx) only turns these into buttons and focus.
import { MAPPED } from '../vessels/network.ts';
import { PART_OF } from '../../engine/hales/portal/topology.js';
import { stationOfVessel, stationById } from './stations.ts';

export interface WalkVessel { id: string; from: string; to: string; name: string }

/** Every drawn vessel in the engine's own order (the order Tab walks). */
export const WALK: readonly WalkVessel[] = MAPPED.map((v) => ({ id: v.id, from: v.from, to: v.to, name: nameOf(v.id, v.label) }));

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

/** The figure's stations (2D fig-stations.js, the order the blood meets them, gut to heart): the arrows step through these, Shift + arrow follows the vessel along the flow. */
export const STATIONS: readonly { name: string; ids: readonly string[] }[] = [
  { name: 'Superior mesenteric vein', ids: ['SMV_CONF'] },
  { name: 'Splenic vein', ids: ['SV_CONF'] },
  { name: 'Portal vein', ids: ['PV_TRUNK'] },
  { name: 'Sinusoids', ids: ['SIN_RR', 'SIN_LL'] },
  { name: 'Hepatic veins', ids: ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'] },
  { name: 'Inferior vena cava', ids: ['IVCS_RA'] },
  { name: 'Right atrium', ids: ['organ:heart', 'node:RA'] },
];
const wholeOf = (id: string): string => (PART_OF as Record<string, string>)[id] ?? id;   // (a vein drawn in pieces is one station)

/** The stations the keyboard can reach among `items` (the walk's stops), in flow order; an undrawn station is skipped. */
export function stationsOf(items: readonly string[]): { item: string; name: string }[] {
  const out: { item: string; name: string }[] = [];
  for (const s of STATIONS) {
    const item = s.ids.find((id) => items.includes(id)) ?? items.find((i) => s.ids.includes(wholeOf(i)));
    if (item) out.push({ item, name: s.name });
  }
  return out;
}

/** Where a step of the arrows lands (2D stationStep): `dir` +1 toward the heart, -1 toward the gut. From a stop that is no station the walk starts at the first (going on) or the last (going back); it never wraps. */
export function stationStep(items: readonly string[], cur: string | null, dir: 1 | -1): { item: string; name: string; n: number; of: number } | null {
  const list = stationsOf(items);
  if (!list.length) return null;
  const at = cur == null ? -1 : list.findIndex((s) => s.item === cur || STATIONS.some((t) => t.name === s.name && (t.ids.includes(cur) || t.ids.includes(wholeOf(cur)))));
  const to = at < 0 ? (dir > 0 ? 0 : list.length - 1) : Math.max(0, Math.min(list.length - 1, at + dir));
  return { item: list[to]!.item, name: list[to]!.name, n: to + 1, of: list.length };
}
