// Where the portal blood goes, as numbers (ported from the 2D app's tool-flows.js): the shares of the one bar, from the model's flows.
// @ts-ignore the pinned engine copy is plain JS
import { EDGES, PORTOSYSTEMIC_EDGES, SPLANCHNIC_ARTERIES } from '../../../engine/hales/portal/topology.js';

type Edge = { id: string; shunt?: string; portal?: boolean };
const EDGE_LIST = EDGES as Edge[];
const EI: Record<string, number> = Object.fromEntries(EDGE_LIST.map((e, i) => [e.id, i]));

export type PartId = string;
/** [id, name, colour token] */
export type PartDef = readonly [PartId, string, string];

// Where the shunted blood goes: route id → [name, colour token, vessel ids]. On the bar largest first, ties in this order.
export const ROUTES: readonly (readonly [string, string, string, readonly string[]])[] = [
  ['var', 'Gastroesophageal collaterals', 'tr-var', ['C1b']],
  ['grs', 'Gastrorenal', 's7', ['C5']],
  ['srs', 'Splenorenal', 's5', ['C6']],
  ['pum', 'Paraumbilical', 's4', ['C3']],
  ['rec', 'Rectal', 'tr-sin', ['C4']],
  ['ret', 'Retroperitoneal', 'tr-cav', ['C7']],
  ['tips', 'TIPS', 's1', ['TIPS']],
  ['dips', 'DIPS', 's1', ['DIPS']],
  ['surg', 'Surgical shunt', 's6', ['S_PC', 'S_DSR', 'S_MC']],
];
export const LIVER: PartDef = ['liver', 'Liver', 'flow-normal'];
export const OTHER: PartDef = ['other', 'Other', 'text-3'];
export const INFLOW: readonly PartDef[] = [['portal', 'Portal vein', 'vein-portal'], ['artery', 'Hepatic artery', 'artery']];
export const MAX_ROUTES = 4;
const STENTS = new Set(['TIPS', 'DIPS']);

export interface Part { id: PartId; name: string; tone: string; pct: number }

/** Whole percents that keep their sum (largest remainder): shares (≥ 0) → integers adding up to total. */
export function wholeShares(shares: readonly number[], total: number): number[] {
  const sum = shares.reduce((a, b) => a + b, 0);
  if (!(sum > 0) || total <= 0) return shares.map(() => 0);
  const raw = shares.map((s) => (s / sum) * total), out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (left > 0) { out[i]!++; left--; } });
  return out;
}

/** The model's numbers the bar reads: the flow of every edge in topology order (mL/s, the engine frame's Q) and the shunt fraction (0..1). */
export interface FlowsInput { Q: ArrayLike<number>; shunt: number; customShunts?: Record<string, unknown> | null }

/** The share of the portal blood the liver keeps and the share that bypasses it, in whole percents. */
export const portalSplit = (sh: number) => { const s = Math.round(Math.min(1, Math.max(0, +sh || 0)) * 100); return { shunt: s, liver: 100 - s }; };

/** The shunted portal blood by route, counted as the shunt fraction is: each collateral and surgical shunt's forward flow, and a stent's only as far as
 *  it takes portal-trunk blood that no longer reaches the sinusoids. */
export function routeFlows(Q: ArrayLike<number>, customShunts: Record<string, unknown> | null = null) {
  const q = (id: string) => Q[EI[id]!] || 0;
  const by: Record<string, number> = Object.fromEntries(ROUTES.map(([k]) => [k, 0]));
  const of: Record<string, string> = Object.fromEntries(ROUTES.flatMap(([k, , , ids]) => ids.map((id) => [id, k])));
  let stentQ = 0;
  const stent: Record<string, number> = {};
  for (const id of PORTOSYSTEMIC_EDGES as string[]) {
    const v = Math.max(0, q(id));
    if (STENTS.has(id)) { stentQ += v; stent[id] = v; } else by[of[id]!]! += v;
  }
  const portalIn = Math.max(0, q('PRE_R')) + Math.max(0, q('PRE_L'));
  const stented = Math.min(stentQ, Math.max(0, Math.max(0, q('PV_TRUNK')) - portalIn - Math.max(0, q('C3'))));
  for (const id of STENTS) if (stentQ > 0) by[of[id]!]! += (stented * (stent[id] || 0)) / stentQ;
  let custom = 0;
  for (const e of EDGE_LIST) if (e.shunt === 'custom' && !e.portal && customShunts?.[e.id]) custom += Math.max(0, q(e.id));
  return { by, custom };
}

// A route the bar names already keeps its name against one that is only a little larger (KEEP_NAMED ×): two routes of about the same flow on either side
// of the fourth place never trade places with Other as the model wobbles.
export const KEEP_NAMED = 1.25;

/** The bar's parts: [{ id, name, tone, pct }] in whole percents adding up to 100, the liver's part 100 less the shunt; at most MAX_ROUTES routes by name, the
 *  rest (and any custom shunt) as Other; a part that rounds to 0 is left out. of 'inflow': the liver's inflow, portal and arterial. null without the flows.
 *  keep: the route ids the bar names now, which hold their place in the four by KEEP_NAMED. */
export function flowParts(input: FlowsInput | null | undefined, of: 'portal' | 'inflow' = 'portal', keep: ReadonlySet<string> | null = null): Part[] | null {
  const Q = input?.Q;
  if (!Q || !Q.length) return null;
  if (of === 'inflow') {
    const q = (id: string) => Math.max(0, Q[EI[id]!] || 0);
    const pv = q('PRE_R') + q('PRE_L'), ha = q('A_HR') + q('A_HL');
    const pct = wholeShares([pv, ha], 100);
    return INFLOW.map(([id, name, tone], i) => ({ id, name, tone, pct: pct[i]! })).filter((p) => p.pct > 0);
  }
  const { liver, shunt } = portalSplit(input!.shunt);
  const { by, custom } = routeFlows(Q, input!.customShunts ?? null);
  const rank = (k: string) => by[k]! * (keep?.has(k) ? KEEP_NAMED : 1);
  const ranked = ROUTES.filter(([k]) => by[k]! > 0).sort((a, b) => rank(b[0]) - rank(a[0]));
  const named = ranked.slice(0, MAX_ROUTES), rest = ranked.slice(MAX_ROUTES).reduce((s, [k]) => s + by[k]!, 0) + custom;
  const order = ROUTES.filter((r) => named.includes(r));
  const pct = wholeShares([...order.map(([k]) => by[k]!), rest], shunt);
  const parts: Part[] = [{ id: LIVER[0], name: LIVER[1], tone: LIVER[2], pct: liver }, ...order.map(([id, name, tone], i) => ({ id, name, tone, pct: pct[i]! }))];
  if (pct.at(-1)! > 0) parts.push({ id: OTHER[0], name: OTHER[1], tone: OTHER[2], pct: pct.at(-1)! });
  // (a shunt fraction with no forward route left, a rounding the routes cannot carry, still sums: it goes to Other)
  const sum = parts.reduce((s, p) => s + p.pct, 0);
  if (sum < 100) { const o = parts.find((p) => p.id === 'other'); if (o) o.pct += 100 - sum; else parts.push({ id: OTHER[0], name: OTHER[1], tone: OTHER[2], pct: 100 - sum }); }
  return parts.filter((p) => p.pct > 0);
}

/** The bar's order: the liver first, then the routes largest first, Other last; for the inflow the portal vein, then the hepatic artery. */
export function barOrder(parts: readonly Part[], of: 'portal' | 'inflow' = 'portal'): Part[] {
  if (of === 'inflow') return INFLOW.map(([id]) => parts.find((p) => p.id === id)).filter((p): p is Part => !!p);
  const at = (id: string) => ROUTES.findIndex(([k]) => k === id);
  const routes = parts.filter((p) => p.id !== 'liver' && p.id !== 'other').sort((a, b) => b.pct - a.pct || at(a.id) - at(b.id));
  return [...parts.filter((p) => p.id === 'liver'), ...routes, ...parts.filter((p) => p.id === 'other')];
}

/** What the card says in words: every part and its share, and the share bypassing the liver. */
export function flowsSummary(parts: readonly Part[], healthy: readonly Part[] | null, of: 'portal' | 'inflow'): string {
  const say = (ps: readonly Part[]) => barOrder(ps, of).map((p) => `${p.name} ${p.pct}%`).join(', ');
  const by = of === 'inflow' ? '' : `; bypassing the liver ${100 - (parts.find((p) => p.id === 'liver')?.pct ?? 0)}%`;
  return `${of === 'inflow' ? 'Hepatic inflow' : 'Distribution of portal venous flow'}, now: ${say(parts)}${by}${healthy ? `; healthy: ${say(healthy)}` : ''}`;
}

/** Whether split b moves no part of split a (by id; a part missing counts 0) by more than pp whole percents. */
export function smallMove(a: readonly Part[] | null, b: readonly Part[] | null, pp = 1): boolean {
  if (!a || !b) return false;
  const m = new Map<string, number>();
  for (const p of a) m.set(p.id, p.pct);
  for (const p of b) { if (Math.abs(p.pct - (m.get(p.id) || 0)) > pp) return false; m.delete(p.id); }
  for (const v of m.values()) if (v > pp) return false;
  return true;
}
/** Whether two splits read the same: the same parts with the same whole percents, in any order. */
export const sameShares = (a: readonly Part[] | null, b: readonly Part[] | null) => {
  const key = (ps: readonly Part[] | null) => (ps || []).filter((p) => p.pct > 0).map((p) => `${p.id}:${p.pct}`).sort().join(',');
  return !!a && !!b && key(a) === key(b);
};
/** How long a split that moved little is held back before the bar takes it (the readings come every 150 ms; a flip of one percent never shows). */
export const HOLD_MS = 600;

/** The bar's input from a model fingerprint (the engine's metrics: `at.Q` the flows, `shunt` the fraction). A flows table that arrives as an object keyed by edge index is read as the array it is. */
export function flowsInputOf(fp: { at?: { Q?: ArrayLike<number> | Record<string, number> } | null; shunt?: number | null; customShunts?: Record<string, unknown> | null } | null | undefined): FlowsInput | null {
  const Q = fp?.at?.Q;
  if (!Q) return null;
  const arr = typeof (Q as ArrayLike<number>).length === 'number' ? (Q as ArrayLike<number>) : Array.from({ length: EDGE_LIST.length }, (_, i) => (Q as Record<string, number>)[i] ?? 0);
  return { Q: arr, shunt: fp?.shunt ?? 0, customShunts: fp?.customShunts ?? null };
}
