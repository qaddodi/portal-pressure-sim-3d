// The custom-shunt pager of the inspector (`?inspect`; Mohammad 20 Nov: "show all the possible shunts at once"): the engine has a closed shunt for every portal vein to every systemic vein and for every pair of portal veins that no vessel already joins
// (topology.js: X_<from>_<to>, about 119 of them), and a learner opens one at a time with the stent tool. The Circuit has room to route only 12 (scene/circuit/tubes.ts routeOpen), so all of them cannot be open at once: this pages through them, a page
// at a time, the same way the learner opens one (params.customShunts[id] = the diameter), and gives the patient's own back when it is cleared. No DOM, no scene: a Node test runs it.
import { EDGES } from '../../../engine/hales/portal/topology.js';

interface Edge { id: string; kind: string; shunt?: string; portal?: boolean; from: string; to: string; label?: string }
const edges = EDGES as Edge[];

export interface CustomShunt { id: string; from: string; to: string; portal: boolean; label: string }
/** Every custom shunt, in the engine's order (the portal-to-systemic ones first, then the portal-to-portal ones). */
export const CUSTOM_SHUNTS: readonly CustomShunt[] = edges.filter((e) => e.shunt === 'custom').map((e) => ({ id: e.id, from: e.from, to: e.to, portal: !!e.portal, label: e.label ?? e.id }));
/** The most the Circuit routes at once (scene/circuit/tubes.ts routeOpen): a page bigger than this shows the rest in the body only. */
export const CIRCUIT_ROOM = 12;
export const PAGE_SIZES: readonly number[] = [1, 3, 6, 12];
/** The diameter the stent tool gives a new custom shunt, mm (ui/action/shunt-model.ts). */
export const CUSTOM_DIAMETER = 10;

export type ShuntGroup = 'all' | 'systemic' | 'portal' | 'liver';
export const GROUPS: readonly { id: ShuntGroup; label: string }[] = [
  { id: 'all', label: 'All custom shunts' }, { id: 'systemic', label: 'Portal vein to systemic vein' }, { id: 'portal', label: 'Portal vein to portal vein' }, { id: 'liver', label: 'Portal branch to hepatic vein (the Viatorr-looking stent)' },
];
const LIVER_FROM = ['PVH', 'RPV', 'LPV'], LIVER_TO = ['RHV', 'MHV', 'LHV'];
/** The shunts of a group. */
export function inGroup(g: ShuntGroup): readonly CustomShunt[] {
  if (g === 'all') return CUSTOM_SHUNTS;
  if (g === 'portal') return CUSTOM_SHUNTS.filter((s) => s.portal);
  if (g === 'liver') return CUSTOM_SHUNTS.filter((s) => LIVER_FROM.includes(s.from) && LIVER_TO.includes(s.to));
  return CUSTOM_SHUNTS.filter((s) => !s.portal);
}

export const pageCount = (n: number, size: number): number => Math.max(1, Math.ceil(n / Math.max(1, size)));
/** Page `page` (from 0, wrapped round) of `list`, `size` at a time. */
export function pageOf<T>(list: readonly T[], size: number, page: number): T[] {
  const n = pageCount(list.length, size), p = ((page % n) + n) % n;
  return list.slice(p * size, p * size + size);
}

/** The patient's custom shunts with `shown` open at `d` mm over what `base` already had (the patient's own, kept as they were): the record to give the engine. Pure. */
export function customRecord(base: Readonly<Record<string, number>>, shown: readonly string[], d: number = CUSTOM_DIAMETER): Record<string, number> {
  const out: Record<string, number> = { ...base };
  for (const id of shown) if (!(id in out)) out[id] = d;
  return out;
}
