// What a tap-anything card prints, worked out from a frame: the 2D app's actions.js readings (edgeValue, bedStats, the span bar, a pressure and its change from the reference)
// without its allocation tricks (a card is one component, drawn when a number changes, not a hand-managed cell). Pure: the frame, the patient's parameters and the healthy
// reference go in, texts come out; tests/action-cards.test.ts holds every reading to the 2D app's own answers.
import { EDGES, NODES, JUNCTION_HOST_ENDS, JUNCTION_PIECES, JUNCTIONS, partOf } from '../../engine/hales/portal/topology.js';
import { hvBlocked } from '../../engine/hales/portal/pressure-cuts.js';
import { dopplerVel, flowReversed } from '../../scene/lenses/vel-normal.copied.js';
import { oxygenSat, FLOW_FLOOR, LIVER_EXTRACTION } from '../../scene/lenses/blood-model.ts';
import { lobuleModel, type LobuleModel } from '../../scene/lobule/model.ts';
import { fmt } from '../charts/fmt.ts';
import type { EngineFrame } from '../../engine/hales/host/protocol.d.ts';
import type { HealthyRef } from '../../engine/store.ts';
import type { Params } from './params.ts';

export interface Env { f: EngineFrame; p: Params; ref: HealthyRef | null; lens?: string }
export interface Reading { v: string; u: string; d?: string | null; up?: boolean }
export type Status = readonly [string, string] | null;

export const EI: Record<string, number> = Object.fromEntries((EDGES as { id: string }[]).map((e, i) => [e.id, i]));
export const NI: Record<string, number> = Object.fromEntries((NODES as { id: string }[]).map((n, i) => [n.id, i]));
export const edgeAt = (id: string) => (EDGES as Edge[])[EI[id]!]!;
export interface Edge { id: string; from: string; to: string; kind: string; label: string; code?: string; portal?: boolean; zone?: string; lobe?: string; shunt?: string; spontaneous?: boolean; variant?: boolean; dMax: number }

// ── the words a number is printed in ──
export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const mult = (v: number) => `×${v.toFixed(v < 10 ? 1 : 0)}`;
export const weeks = (v: number) => (v > 0 ? `${Math.round(v)} wk` : 'None');
export const signed = (d: number, txt: string) => `${d > 0 ? '+' : '−'}${txt}`;
/** A flow in L/min: a trickle prints as "< 0.1". */
export function fmtFlow(v: number): string {
  if (v == null || !Number.isFinite(v)) return fmt(v);
  const a = Math.abs(v);
  if (a > 0.0005 && a < 0.05) return v < 0 ? '−< 0.1' : '< 0.1';
  return fmt(v, 1);
}
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const mm = (x: number) => fmt(x, x >= 9.95 ? 0 : 1);

// ── a vessel's station: the portal vein names the confluence (labels read the same) ──
export const LABEL_VESSEL: Record<string, string> = {
  HA: 'A_HEP', CONF: 'PV_TRUNK', SMV: 'SMV_CONF', SV: 'V_SPL', IMV: 'V_IMV', LGV: 'LGV_CONF', RPV: 'PVH_R', LPV: 'PVH_L', SIN_R: 'SIN_RR', SIN_L: 'SIN_LL',
  RHV: 'RHV_IVC', MHV: 'MHV_IVC', LHV: 'LHV_IVC', IVCS: 'IVCS_RA', IVCI: 'IVC_IS', SVC: 'SVC_RA', AZY: 'AZY_SVC', LRV: 'LRV_IVC', ILI: 'ILI_IVC', VAR: 'C1a', TIPS: 'TIPS', DIPS: 'DIPS',
};
// (A vein a shunt joins part-way is several pieces: its station's label hangs on the piece the vein's middle falls in.)
for (const [n, v] of Object.entries(LABEL_VESSEL)) {
  const ids = (JUNCTION_PIECES as Record<string, string[]>)[v];
  if (!(ids && ids.length > 1)) continue;
  const cuts = (JUNCTIONS as unknown as [string, string, number][]).filter((j) => j[1] === v).map((j) => j[2]).sort((a, b) => a - b);
  LABEL_VESSEL[n] = ids[cuts.filter((c) => c <= 0.5).length]!;
}
export const STATION_OF: Record<string, string> = Object.fromEntries(Object.entries(LABEL_VESSEL).map(([n, e]) => [e, n]));
export const SIN_EDGES = new Set(['SIN_RR', 'SIN_LL']);
const BAR_KEY: Record<string, string> = { CONF: 'pv', SIN_R: 'whvp', RHV: 'fhvp', IVCS: 'ivc', RA: 'ra' };
const pf = (f: EngineFrame) => f.Pf || f.P;
const qf = (f: EngineFrame) => f.Qf || f.Q;
/** The pressure a station prints: the bottom bar's reading where the bar has one (a card and the bar never disagree), else the node's. */
export function stationP(f: EngineFrame, id: string, PF: ArrayLike<number>): number {
  const mk = BAR_KEY[id], m = f.metrics as unknown as Record<string, unknown> & { vitals?: { ra?: number } };
  const v = mk && (mk === 'ra' ? m?.vitals?.ra ?? m?.ra : m?.[mk]);
  return typeof v === 'number' && Number.isFinite(v) ? v : PF[NI[id]!]!;
}

// ── a pressure and its change from the reference: the change shows from 1 mmHg and goes below 0.8 (a pressure that beats about 1 does not make it come and go) ──
export interface PCell { on: boolean }
export function pressureReading(cell: PCell, P: number, r: number | null | undefined, u: string): Reading {
  const dd = P - (r as number), ad = Math.abs(dd);
  const on = r != null && (ad >= 1 || (cell.on && ad >= 0.8));
  cell.on = on;
  return { v: fmt(P, 1), u, d: on ? signed(dd, fmt(ad, 1)) : null, up: r != null && P > r };
}
const cells = new Map<string, PCell>();
export const cellOf = (key: string): PCell => { let c = cells.get(key); if (!c) cells.set(key, (c = { on: false })); return c; };

// ── a vessel ──
/** The three readings of a vessel: its flow (L/min), its peak velocity as Doppler reads it (cm/s) and its diameter (mm). */
export function vesselReads(k: number, f: EngineFrame): [string, string, string] {
  return [flowNum(qf(f)[k]! * 0.06), fmt(Math.round(Math.abs(dopplerVel(f, k))), 0), mm(f.D[k]!)];
}
export const flowNum = (x: number) => fmtFlow(Math.abs(x));

export interface Span { a: number; b: number; d: number; ok: boolean }
export interface SpanDef { el: readonly [string, string] | null; dn: string | null; cut: string | null; at(env: Env): Span }
/** The pressure where the blood comes in and where it leaves a vessel, and the drop between (the card's bar). A vein a shunt's junction splits reads its whole course. */
export function spanOfEdge(e: Edge): SpanDef {
  const k = EI[e.id]!, ends = (JUNCTION_HOST_ENDS as Record<string, [string, string]>)[partOf(e.id)], i1 = NI[ends ? ends[0] : e.from]!, i2 = NI[ends ? ends[1] : e.to]!;
  return { el: null, dn: null, cut: null, at: ({ f }) => {
    const PF = pf(f), q = qf(f)[k]!;
    const a = q >= -0.01 ? PF[i1]! : PF[i2]!, b = q >= -0.01 ? PF[i2]! : PF[i1]!;
    return { a, b, d: a - b, ok: true };
  } };
}
/** Across the liver: wedged to free hepatic venous pressure, the HVPG (not shown where the case has not measured it). */
export const SPAN_HVPG: SpanDef = { el: ['WHVP', 'FHVP'], dn: 'HVPG', cut: 'hvpg', at: ({ f, p }) => { const m = f.metrics; return { a: m.whvp, b: m.fhvp, d: m.hvpg, ok: !(p && hvBlocked(p)) }; } };

const oxy = new WeakMap<object, Float32Array>();
/** The saturation at a vessel's two ends, as the blood passes through it (the 2D app's oxygenFor().edge): a liver sinusoid takes its extraction, an artery stays arterial. */
function edgeSat(e: Edge, k: number, f: EngineFrame): [number, number] {
  const Q = qf(f);
  let node = oxy.get(Q);
  if (!node) { node = oxygenSat(Q, pf(f)).node; oxy.set(Q, node); }
  const fwd = Q[k]! > -FLOW_FLOOR, u = NI[fwd ? e.from : e.to]!, a = node[u]!, b = a * (e.kind === 'liver' && e.zone === 'sin' ? 1 - LIVER_EXTRACTION : 1);
  const lo = e.kind === 'artery' || e.kind === 'arteriole' ? a : b;
  return fwd ? [Math.fround(a), Math.fround(lo)] : [Math.fround(lo), Math.fround(a)];
}
function edgeReading(e: Edge, env: Env, lens: string, range: boolean): Reading {
  const { f, p, ref } = env, k = EI[e.id]!, PF = pf(f), st = STATION_OF[e.id];
  const P1 = PF[NI[e.from]!]!, P2 = PF[NI[e.to]!]!, P = st ? stationP(f, st, PF) : (P1 + P2) / 2;
  const q = qf(f)[k]! * 0.06;
  if (lens === 'flow') {
    const r = ref?.Q?.[k];
    const d = r != null && Math.abs(r) > 0.3 ? ((Math.abs(q) - Math.abs(r * 0.06)) / Math.abs(r * 0.06)) * 100 : null;
    return { v: fmtFlow(Math.abs(q)), u: 'L/min', d: d != null && Math.abs(d) >= 5 ? signed(d, `${Math.round(Math.abs(d))}%`) : null, up: d != null && d > 0 };
  }
  if (lens === 'velocity' && e.kind === 'liver') return { v: '—', u: 'cm/s', d: null, up: false };
  // Velocity reads as Doppler does (peak), so it matches the figure callouts and the Doppler monitor.
  if (lens === 'velocity') return { v: fmt(Math.abs(dopplerVel(f, k)), 0), u: 'cm/s', d: null, up: false };
  if (lens === 'drop') return { v: fmt(P1 - P2, 1), u: 'mmHg drop', d: null, up: false };
  // Oxygen saturation of the blood leaving the vessel (an artery's as it enters its bed); the sinusoids read in → out.
  if (lens === 'oxygen') {
    const [from, to] = edgeSat(e, k, f);
    const a = q >= 0 ? from : to, b = e.kind === 'artery' || e.kind === 'arteriole' ? a : q >= 0 ? to : from;
    const sat = (s: number) => String(Math.round(s * 100));
    return { v: Math.abs(a - b) >= 0.005 ? `${sat(a)} → ${sat(b)}` : sat(b), u: '% O₂ saturation', d: null, up: false };
  }
  // A vein split by a shunt's junction is one vein: a clot or narrowing is on all its pieces, and its card reads the whole vein, in at its first end and out at its last.
  const host = partOf(e.id);
  if (range && (p?.thrombus?.[host] > 0 || p?.stenosis?.[host] > 0)) {
    const ends = (JUNCTION_HOST_ENDS as Record<string, [string, string]>)[host], H1 = ends ? stationP(f, ends[0], PF) : P1, H2 = ends ? stationP(f, ends[1], PF) : P2;
    return { v: `${fmt(H1, 1)} → ${fmt(H2, 1)}`, u: 'mmHg' };
  }
  // The change from the reference reads as the figure's callouts do: signed, one decimal, in the reading's colour.
  const r = ref ? (st ? ref.P[NI[st]!]! : (ref.P[NI[e.from]!]! + ref.P[NI[e.to]!]!) / 2) : null;
  return pressureReading(cellOf(`e:${e.id}`), P, r, 'mmHg');
}
/** A vessel's reading { v, u, d, up } under the lens. On the vessel card (range) a clotted or narrowed vessel reads in → out. */
export const edgeValue = (e: Edge, env: Env, range = false): Reading => edgeReading(e, env, env.lens ?? 'pressure', range);

/** A capillary bed (each side's sinusoids) is lumped: its flow, the pressure it drops from the portal venules' end to the central vein, and its resistance. */
export function bedStats(e: Edge, f: EngineFrame): { q: number; dp: number; r: number | null } {
  const k = EI[e.id]!, PF = pf(f), q = Math.abs(qf(f)[k]!) * 0.06, dp = PF[NI[e.from]!]! - PF[NI[e.to]!]!;
  return { q, dp, r: q > 0.005 ? dp / q : null };
}

// ── the direction word at a card's corner ──
export const ST = {
  STASIS: ['warn', 'Stasis'], REVERSED: ['rev', 'Reversed flow'], PETAL: ['ok', 'Hepatopetal'], FUGAL: ['rev', 'Hepatofugal'], PATENT: ['ok', 'Patent'],
  BLEEDING: ['bad', 'Bleeding'], WALE: ['warn', 'Red wale signs'], CONGESTED: ['warn', 'Congested'],
} as const satisfies Record<string, readonly [string, string]>;

// ── the lobule ──
export interface LobuleState extends LobuleModel { portalQ: number; portalRef: number; lymphRef: number }
const LOBE_PRE = 'PRE_R';
export function lobuleOf({ f, p, ref }: Env): LobuleState {
  const m = lobuleModel({ P: pf(f), Q: qf(f), params: p, metrics: f.metrics }, ref, p);
  return { ...m, portalQ: qf(f)[EI[LOBE_PRE]!]!, portalRef: ref?.Q?.[EI[LOBE_PRE]!] ?? 0, lymphRef: m.lymph0 };
}
export const portalBack = (m: LobuleState) => flowReversed(m.portalQ, m.portalRef);

/** Every piece of the vein a vessel id belongs to (the id alone for a vein that is whole), in order along the vein. */
export function piecesOf(id: string): string[] {
  for (const ids of Object.values(JUNCTION_PIECES as Record<string, string[]>)) if (ids.includes(id)) return ids;
  return [id];
}
