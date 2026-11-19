// What the lobule and the sinusoid show, read from one engine frame: a port of the 2D app's lobule-model.js (lobuleStateInto) and
// sinusoid-model.js (sinusoidTargets), trimmed to what the 3D views draw. Pure numbers: the same inputs give the 2D app's targets, so
// the two apps agree (tests/scene-lobule-model.test.ts). One representative lobule stands for the whole liver, read from the right lobe.
import { EDGES, NODES } from '../../engine/hales/portal/topology.js';
import { LYMPH, sinusoidPull, tissueP } from '../../engine/hales/portal/lymph.js';
import { oxygenSat } from '../lenses/blood-model.ts';

const NI: Record<string, number> = Object.fromEntries((NODES as { id: string }[]).map((n, i) => [n.id, i]));
const EI: Record<string, number> = Object.fromEntries((EDGES as { id: string }[]).map((e, i) => [e.id, i]));
/** The right lobe's nodes and edges the lobule is read at (lobule-model.js LOBE). */
export const LOBE = { pv: 'RPV', sin: 'SIN_R', cv: 'CV_R', hv: 'RHV', q: 'SIN_RR', a: 'A_HR', pre: 'PRE_R', post: 'POST_R_RHV' } as const;

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const smooth = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** The healthy patient's reference (the engine's `healthyProfile`): node pressures and edge flows, and the healthy hepatic lymph (mL/min). */
export interface HealthyRef { P: ArrayLike<number>; Q: ArrayLike<number>; hepLymph?: number }

interface FrameParams { fibrosis?: { R?: { pre?: number; sin?: number; post?: number } }; cirrhosis?: number; albumin?: number }
interface FrameMetrics { ascites?: { iap?: number; hepLymph?: number; lymphProt?: number; lymphSigma?: number } }

/** The parts of an engine frame the lobule reads. `params` is the frame's parameter set (fibrosis resistances, cirrhosis 0..1, albumin). */
export interface LobuleFrame {
  P: ArrayLike<number>;
  Q: ArrayLike<number>;
  params?: unknown;
  metrics?: unknown;
}

export interface LobuleModel {
  /** zone resistances against healthy (1 = healthy) */
  zone: { pre: number; sin: number; post: number };
  /** pressures at the portal venule, the sinusoids, the central vein and the hepatic vein, mmHg */
  P1: number; P2: number; P3: number; P4: number;
  /** flows of the three beds (portal inflow, sinusoids, hepatic outflow: edges PRE_R, SIN_RR, POST_R_RHV; mL/s) and the healthy patient's, for the lenses that colour by them */
  Qs: { pre: number; sin: number; post: number }; Q0: { pre: number; sin: number; post: number };
  /** oxygen saturation 0..1 at the portal venule, the sinusoids' inlet and the central vein (the oxygen lens) */
  oxy: [number, number, number];
  /** flows against the healthy patient (1 = normal) */
  flow: number; portal: number; art: number;
  /** which zone's flow runs backwards */
  rev: { pre: boolean; sin: boolean; post: boolean };
  /** hepatic lymph (mL/min), its healthy rate, its protein (fraction of plasma), the wall's reflection coefficient, intra-abdominal pressure, albumin */
  lymph: number; lymph0: number; lyProt: number; sigma: number; iap: number; alb: number;
  /** cirrhosis 0..1 and what the lobule makes of it (all 0..1) */
  s: number; cong: number; fibSin: number; fibPre: number; fibPost: number; congU: number; shuntU: number; septU: number; act: number;
}

const revOf = (q: number, q0: number | undefined) => q < -Math.max(0.12, 0.02 * Math.abs(q0 ?? 1));

/** The lobule's state for a frame against the healthy reference. With no reference the flows read 1 (as healthy) and congestion 0.
 *  `params`: the patient's parameter set (the worker's `presetLoaded` and `setParams`); a frame carries them only when they changed, so the caller keeps the newest. */
export function lobuleModel(f: LobuleFrame, healthy?: HealthyRef | null, params?: unknown): LobuleModel {
  const p = (params ?? f.params ?? {}) as FrameParams;
  const asc = ((f.metrics ?? {}) as FrameMetrics).ascites;
  const fib = { pre: p.fibrosis?.R?.pre ?? 1, sin: p.fibrosis?.R?.sin ?? 1, post: p.fibrosis?.R?.post ?? 1 };
  const sc = p.cirrhosis ?? 0;
  const zone = { pre: (1 + 2 * sc) * fib.pre, sin: (1 + 20 * sc ** 2.5) * fib.sin, post: (1 + 2 * sc) * fib.post };
  const P = f.P, Q = f.Q, HP = healthy?.P, HQ = healthy?.Q;
  const P1 = P[NI[LOBE.pv]!]!, P2 = P[NI[LOBE.sin]!]!, P3 = P[NI[LOBE.cv]!]!, P4 = P[NI[LOBE.hv]!]!;
  const cong = Math.max(0, P3 - (HP?.[NI[LOBE.cv]!] ?? P3));
  const ratio = (id: string) => { const e = EI[id]!, q = Q[e]!, q0 = HQ?.[e] || Math.abs(q) || 1; return q / q0; };
  const rev = {
    pre: revOf(Q[EI[LOBE.pre]!]!, HQ?.[EI[LOBE.pre]!]),
    sin: revOf(Q[EI[LOBE.q]!]!, HQ?.[EI[LOBE.q]!]),
    post: revOf(Q[EI[LOBE.post]!]!, HQ?.[EI[LOBE.post]!]),
  };
  const fibSin = clamp(Math.log(zone.sin) / 3.2, 0, 1);
  const bed = (id: string) => Q[EI[id]!]!, bed0 = (id: string) => HQ?.[EI[id]!] ?? bed(id);
  const ox = oxygenSat(Q, P).node;
  return {
    zone, P1, P2, P3, P4,
    Qs: { pre: bed(LOBE.pre), sin: bed(LOBE.q), post: bed(LOBE.post) }, Q0: { pre: bed0(LOBE.pre), sin: bed0(LOBE.q), post: bed0(LOBE.post) },
    oxy: [ox[NI[LOBE.pv]!]!, ox[NI[LOBE.sin]!]!, ox[NI[LOBE.cv]!]!],
    flow: ratio(LOBE.q), portal: ratio(LOBE.pre), art: ratio(LOBE.a), rev,
    lymph: asc?.hepLymph ?? 0, lymph0: healthy?.hepLymph || 0.8, lyProt: asc?.lymphProt ?? 0.88, sigma: asc?.lymphSigma ?? 0.15, iap: asc?.iap ?? 5, alb: p.albumin ?? 4,
    s: sc, cong, fibSin,
    fibPre: clamp(Math.log(zone.pre) / 5.4, 0, 1) ** 0.6,
    fibPost: clamp(Math.log(zone.post) / 4.8, 0, 1) ** 0.6,
    congU: clamp(cong / 12, 0, 1), shuntU: clamp((sc - 0.45) / 0.35, 0, 1), septU: clamp((sc - 0.3) / 0.5, 0, 1),
    act: clamp(Math.max(fibSin, sc * 0.9), 0, 1),
  };
}

/** Hepatic lymph as a multiple of the healthy rate. */
export const lymphRate = (m: Pick<LobuleModel, 'lymph' | 'lymph0'>): number => m.lymph / (m.lymph0 || 0.8);

/** The lymph's protein as the lobule shades it: 0 (cirrhotic) to 1 (as plasma) (2D lyProt). */
export const lymphProtein = (m: Pick<LobuleModel, 'lyProt'>): number => clamp((m.lyProt - 0.42) / 0.42, 0, 1);

/** How sealed the space of Disse's collagen lining is, 0 open to 1 sealed (2D lySeal: low protein = sealed). */
export const lymphSeal = (m: Pick<LobuleModel, 'lyProt'>): number => 1 - smooth(0.15, 0.6, lymphProtein(m));

/**
 * The fluid filtered into the space of Disse at a point of the sinusoid, as a multiple of the healthy liver's mean, over n points from the
 * central vein (rho 0) to the portal edge (rho 1): the 2D app's `disseJ` (Wet Disse, 16 Nov 2026). Flat before the sinusoid (a clot), heavy at
 * the portal edge in cirrhosis, heavy to the central vein behind it. The profile's mean is the engine's rate `lr` (× healthy).
 */
export function disseProfile(m: Pick<LobuleModel, 'P1' | 'P3' | 'iap' | 'alb' | 'sigma'>, lr: number, n = 32): Float32Array {
  const out = new Float32Array(n);
  const shut = clamp((m.sigma - 0.15) / 0.45, 0, 1), sigH = 0.1 + 0.5 * shut, onc = sinusoidPull(m.alb, sigH), pT = tissueP(m.iap);
  const floor = LYMPH.hepBase / LYMPH.kfHep;
  let sum = 0;
  for (let k = 0; k < n; k++) {
    const x = 0.06 + (k / (n - 1)) * 0.94, P = m.P3 + (m.P1 - m.P3) * Math.min(1, Math.max(0, (x - 0.075) / 0.845)) ** 0.8;
    out[k] = floor + Math.max(0, P - pT - onc - LYMPH.hepOffset); sum += out[k]!;
  }
  const sc = Math.max(0.05, lr) / (sum / n);
  for (let k = 0; k < n; k++) out[k] = out[k]! * sc;
  return out;
}

// ---- the sinusoid's targets (sinusoid-model.js) -----------------------------------------------------------------------------------

export interface SinusoidTargets {
  /** porosity of the wall: 1 open, 0 sealed */ por: number;
  /** collagen in the space of Disse 0..1 */ col: number;
  /** basement membrane under the endothelium 0..1 */ bm: number;
  /** microvilli 1 full .. 0.25 flattened */ mv: number;
  /** stellate cell activation 0..1 */ act: number;
  /** lumen width, 1 = healthy */ lum: number;
  /** the activated stellate cell's squeeze */ pinch: number;
  /** blood speed against healthy, signed (negative: reversed) */ v: number;
  /** plasma filtered into Disse, × healthy */ filt: number;
  /** the lymph's protein 0..1 */ prot: number;
}

/** Targets for the sinusoid view's drawing, from a lobule model (the 2D sinusoidTargets). */
export function sinusoidTargets(m: LobuleModel): SinusoidTargets {
  const por = clamp(1 - (m.sigma - 0.15) / 0.45, 0, 1);
  const cap = clamp(Math.max(m.fibSin, 1 - por), 0, 1);
  const lymph = (m.lymph || 0.6) / (m.lymph0 || 0.6);
  return {
    por,
    col: m.fibSin,
    bm: smooth(0.12, 0.7, cap),
    mv: 1 - 0.75 * smooth(0.1, 0.85, cap),
    act: m.act,
    lum: m.zone.sin ** -0.12 * (1 + 0.5 * m.congU),
    pinch: 0.22 * m.act,
    v: (m.rev.sin ? -1 : 1) * clamp(Math.abs(m.flow) / Math.max(0.35, m.zone.sin ** -0.24), 0.08, 3),
    filt: clamp(lymph, 0, 6),
    prot: lymphProtein(m),
  };
}

/** Steps `cur` toward `goal` by an exponential ease (time constant tauMs), in place; returns true while any value is still moving.
 *  Nothing jumps: a model change eases in over about a second. */
export function easeToward<T extends Record<string, number>>(cur: T, goal: T, dtMs: number, tauMs = 320): boolean {
  const k = 1 - Math.exp(-Math.max(0, dtMs) / tauMs);
  let moving = false;
  for (const key of Object.keys(goal) as (keyof T & string)[]) {
    const g = goal[key]!, c = cur[key]!;
    const d = g - c;
    if (Math.abs(d) < 1e-4) { if (d !== 0) (cur as Record<string, number>)[key] = g; continue; }
    (cur as Record<string, number>)[key] = c + d * k;
    moving = true;
  }
  return moving;
}
