// The Details face of a tap-anything card (2D: the inspector's selection panel, opened by tapping the card's name): for a vessel its direction word, pressures in and out, drop, flow, velocity,
// diameter, resistance and recruitment (or the healthy flow), Doppler here and Why; for an organ its readings and About; for a compartment its pressures and the vessels that meet there.
// The words are lifted from the 2D app by scripts/gen-details.mjs (details.generated.ts); the readings are worked out from a frame here and held to the 2D formulas' answers by
// tests/action-details.test.ts (tests/fixtures/details-2d.json). Pure: nothing here draws.
import { EDGES, NODES, dMinOf } from '../../engine/hales/portal/topology.js';
import { dopplerVel } from '../../scene/lenses/vel-normal.copied.js';
import { fmt } from '../charts/fmt.ts';
import { ABOUT_EDGE, EDGE_STATS, NODE_STATS, ORGAN_ABOUT, WORDS } from './details.generated.ts';
import { EI, NI, clamp, fmtFlow, type Edge, type Env } from './read.ts';
import { normalizeSel } from './cards.ts';
import type { Sel } from './selection.ts';

export interface DetailStat { k: string; wide?: boolean; read(env: Env): string }
export interface Details {
  key: string; kicker: string; title: string;
  /** a vessel's direction word [tone, words] (Stagnant, Reversed flow, Physiological direction) */
  dir?(env: Env): readonly [string, string];
  stats: DetailStat[];
  /** the Why? metric (the worker's `explain`), or null */
  why: string | null;
  /** the vessel the Doppler is pointed at, for a vessel's panel */
  probe?: string;
  /** the vessel's own line under the stats */
  note?: string;
  about: { title: string; text: string } | null;
  /** a compartment's connected vessels */
  connections?: { id: string; label: string }[];
}

const pf = (f: Env['f']) => f.Pf || f.P, qf = (f: Env['f']) => f.Qf || f.Q;
const mmHg = (v: number) => `${fmt(v, 1)} mmHg`;
const num = (v: number, d: number, suffix: string) => `${fmt(v, d)}${suffix}`;
const lpm = (v: number) => `${fmtFlow(v)} L/min`;
const edges = EDGES as Edge[];
const nodes = NODES as { id: string; label: string }[];
type M = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const m = (env: Env): M => env.f.metrics as unknown as M;

const PV_WHY = new Set(['PV_TRUNK', 'SMV_CONF', 'SV_CONF', 'PVH_R', 'PVH_L']);
const aboutEdge = (e: Edge): string => ABOUT_EDGE[e.id] || ABOUT_EDGE[e.id.replace(/_L$|L$/, '')]
  || `${e.label}. Connects ${nodes[NI[e.from]!]!.label} → ${nodes[NI[e.to]!]!.label} (physiological flow direction).`;

function edgeDetails(id: string): Details | null {
  const k = EI[id];
  if (k === undefined) return null;
  const e = edges[k]!, iFrom = NI[e.from]!, iTo = NI[e.to]!, fromN = nodes[iFrom]!, toN = nodes[iTo]!;
  const isColl = e.kind === 'collateral', isArt = e.kind === 'arteriole' || e.kind === 'artery';
  const kicker = isColl ? `Collateral · ${e.code}` : isArt ? 'Artery' : e.kind === 'liver' ? 'Liver microcirculation' : e.kind === 'shunt' ? 'Shunt' : 'Vein';
  const S = EDGE_STATS;
  const stats: DetailStat[] = [
    { k: `In · ${fromN.label}`, wide: true, read: ({ f }) => mmHg(pf(f)[iFrom]!) },
    { k: `Out · ${toN.label}`, wide: true, read: ({ f }) => mmHg(pf(f)[iTo]!) },
    { k: S[0], read: ({ f }) => num(pf(f)[iFrom]! - pf(f)[iTo]!, 1, ' mmHg') },
    { k: S[1], read: ({ f }) => lpm(qf(f)[k]! * 0.06) },
    { k: S[2], read: ({ f }) => num(Math.abs(dopplerVel(f, k)), 1, ' cm/s') },
    { k: S[3], read: ({ f }) => num(f.D[k]!, 1, ' mm') },
    { k: S[4], read: ({ f }) => { const q = qf(f)[k]!; return Math.abs(q) > 1e-3 ? num((pf(f)[iFrom]! - pf(f)[iTo]!) / (q * 0.06), 2, ' WU') : '∞'; } },
    isColl
      ? { k: S[5], read: ({ f }) => { const s = (f as unknown as { slow: unknown }).slow as { dEff?: Record<string, number>; d: Record<string, number> }; return num(clamp(((s.dEff?.[id] ?? s.d[id]!) - dMinOf(e)) / (e.dMax - dMinOf(e)), 0, 1) * 100, 0, '%'); } }
      : { k: S[6], read: ({ ref }) => { const q = ref?.Q?.[k]; return q != null ? lpm(q * 0.06) : '—'; } },
  ];
  return {
    key: `d:e:${id}`, kicker, title: e.label, stats, probe: id, note: WORDS.change,
    dir: ({ f, ref }) => {
      const q = qf(f)[k]!, r = ref?.Q?.[k] ?? 1;
      return Math.abs(q) < 0.05 ? ['warn', WORDS.dirWarn] : q < -Math.max(0.12, 0.02 * Math.abs(r)) ? ['rev', WORDS.dirRev] : ['ok', WORDS.dirOk];
    },
    why: PV_WHY.has(id) ? 'pvFlow' : isColl ? 'shunt' : 'pv',
    about: { title: WORDS.aboutEdge, text: aboutEdge(e) },
  };
}

function nodeDetails(id: string): Details | null {
  const iN = NI[id], n = nodes[iN!];
  if (iN === undefined || !n) return null;
  const S = NODE_STATS;
  return {
    key: `d:n:${id}`, kicker: WORDS.compartment, title: n.label, why: id === 'RA' ? 'ra' : id === 'AO' ? 'map' : id === 'VAR' ? 'varix' : 'pv', about: null,
    stats: [
      { k: S[0], read: ({ f }) => mmHg(pf(f)[iN]!) },
      { k: S[1], read: ({ ref }) => { const v = ref?.P?.[iN]; return v != null ? num(v, 1, ' mmHg') : '—'; } },
      { k: S[2], read: ({ f }) => num(f.ext[iN]!, 1, ' mmHg') },
      { k: S[3], read: ({ f }) => num(f.P[iN]! - f.ext[iN]!, 1, ' mmHg') },
    ],
    connections: edges.filter((e) => (e.from === id || e.to === id) && e.kind !== 'wedge').map((e) => ({ id: e.id, label: e.label || e.id })),
  };
}

// each organ's readings, in the order (and under the names) the 2D panel lists them
const ORGAN_READ: Record<string, ((env: Env) => string)[]> = {
  liver: [({ f }) => mmHg(pf(f)[NI.SIN_R!]!), (e) => num(m(e).hvpg, 1, ' mmHg'), (e) => num(m(e).liverPerfPct, 0, '%'), (e) => lpm(m(e).arterialIn)],
  heart: [({ f }) => mmHg(pf(f)[NI.RA!]!), (e) => lpm(m(e).co), (e) => num(m(e).map, 0, ' mmHg'), (e) => num(m(e).hr, 0, ' /min')],
  varices: [({ f }) => mmHg(pf(f)[NI.VAR!]!), (e) => num(m(e).varix.d, 1, ' mm'), (e) => num(m(e).varix.ratioShown * 100, 0, '% of rupture'), (e) => String(m(e).varix.grade.label)],
  gastric: [({ f }) => mmHg(pf(f)[NI.GV!]!), (e) => num(m(e).gastricVarix.d, 1, ' mm'), (e) => num(m(e).gastricVarix.ratioShown * 100, 0, '% of rupture')],
  spleen: [(e) => num(m(e).spleen.length, 1, ' cm'), (e) => `${(Math.round(m(e).spleen.platelets) * 1000).toLocaleString('en-US')}/µL`],
  abdomen: [(e) => num(m(e).ascites.volume / 1000, 2, ' L'), (e) => num(Math.round(m(e).ascites.ratePerDay / 100) * 100 || 0, 0, ' mL/day'), (e) => num(m(e).ascites.iap, 1, ' mmHg'), (e) => num(m(e).ascites.hepLymph, 1, ' mL/min')],
};
function organDetails(id: string): Details | null {
  const o = ORGAN_ABOUT[id], reads = ORGAN_READ[id];
  if (!o || !reads) return null;
  return { key: `d:o:${id}`, kicker: o.kicker, title: o.title, why: o.why, stats: o.stats.map((k, i) => ({ k, read: reads[i]! })), about: { title: WORDS.about, text: o.about } };
}

/** The Details face for a selection (a station stands for its structure, as for the card), or null where 2D has none (a lobule part: its card has no Details). */
export function detailsFor(selIn: Sel | null): Details | null {
  if (!selIn) return null;
  const sel = normalizeSel(selIn) ?? selIn;   // (2D: normalizeSel(sel) || sel)
  if (sel.type === 'edge') return edgeDetails(sel.id);
  if (sel.type === 'node') return nodeDetails(sel.id);
  if (sel.type === 'organ') return organDetails(sel.id);
  return null;
}
