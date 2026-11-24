// What a station's label says besides its name: the unit, the change badge, the lens's own reading and its alerts. A copy of the 2D app's pressureRuns and layerRuns (stage-label-items.js 91-162),
// the one rule in one place, pure: node judges it with a frame and a few flags (tests/labels-readings.test.ts), the label layer feeds it the engine's newest frame.
//   pressure lens (and every lens that reads pressure): the number, then the unit ("mmHg") only on a slide or on the selected station, then the change badge "+7.9" where it is asked for;
//   flow lens: blood entering the station, L/min, and its change as a share ("+31%");
//   velocity lens: the fastest Doppler velocity in a vessel at the station, cm/s, with "no flow" or "stasis" after it, or "microcirculation" / "collaterals closed" where there is no single velocity;
//   oxygen lens: the saturation the lens colours by, % O2.
import { EDGES, NODES, dopplerK, tiedOff } from '../../engine/hales/portal/topology.js';
import { STATION_VESSEL, judgeFlow, dopplerVel } from '../lenses/vel-normal.copied.js';
import { oxygenSat, type OxygenResult } from '../lenses/blood-model.ts';

type Edge = { id: string; from: string; to: string; kind: string };
const edges = EDGES as Edge[];
const NI = new Map((NODES as { id: string }[]).map((n, i) => [n.id, i]));
const EI = new Map(edges.map((e, i) => [e.id, i]));

/** The change badge appears at `on` and goes only below `off` (2D change-badge.js): a value hovering at the threshold would otherwise add and drop it every beat. Next to the healthy reference it is 5 mmHg (off at 4);
 *  while comparing with a pinned moment every change from it (1, off at 0.7). */
export const DELTA_MIN = 5;
export const badgeOn = (cmp: boolean): number => (cmp ? 1 : DELTA_MIN);
export const badgeOff = (cmp: boolean): number => (cmp ? 0.7 : DELTA_MIN - 1);

/** The lenses that give a station a reading of their own (the rest read pressure). */
export type ReadingLens = 'pressure' | 'flow' | 'velocity' | 'oxygen';
export const readingLensOf = (lens: string): ReadingLens => (lens === 'flow' || lens === 'velocity' || lens === 'oxygen' ? lens : 'pressure');

export interface FrameIn { P: ArrayLike<number>; Pf?: ArrayLike<number>; Q: ArrayLike<number>; Qf?: ArrayLike<number>; D: ArrayLike<number> }
export interface ReadEnv {
  f: FrameIn;
  /** The healthy patient (its flows give the flow lens's change). */
  healthy: { Q: ArrayLike<number> } | null;
  /** The node pressures a change counts from (2D REF(): a pinned moment's, a slide's, else the healthy patient's). */
  refP: ArrayLike<number> | null;
  /** The lens the figure wears ('delta' too: the Change lens, or Compare's Change view). */
  lens: string;
  /** Comparing with a pinned moment (2D compareSnap). */
  cmp: boolean;
  /** A talk is on (2D presenting). */
  presenting: boolean;
  /** This station is the selected one. */
  selected: boolean;
  /** The slide's words light this station (2D termTone). */
  lit: boolean;
  /** Whether a vessel (a topology edge id) is drawn and is a vein, not an artery or a hidden piece (2D `x.vis && !x.isArt && !x.ghost`). */
  veinShown(edge: string): boolean;
  /** The patient's params (the Warren shunt's tied-off coronary vein reads a dash). */
  params?: unknown;
}

export interface Extras {
  /** The lens the reading is of (its widest number sets the box). */
  lens: ReadingLens;
  /** The number in place of the pressure (flow, velocity, saturation, or the dash of a tied-off vein); null: the station's own pressure stands. */
  number: string | null;
  /** The unit, said only where the label carries it (a slide, or the selected station; a pressure's "mmHg"). */
  unit: string;
  /** The change badge, "+7.9" / "−12%" ("" none) and which way. */
  delta: string; up: boolean;
  /** "no flow" or "stasis" (velocity lens). */
  alert: string;
  /** Words standing in place of the number: "microcirculation" (a bed has no single velocity) or "collaterals closed" (a station whose only vessels are closed collaterals). */
  note: string;
  /** A stent point's number colour and whether the Doppler samples it (stent-labels.ts). */
  tint?: string; gate?: boolean;
}
export const NO_EXTRAS: Extras = Object.freeze({ lens: 'pressure' as ReadingLens, number: null, unit: '', delta: '', up: false, alert: '', note: '' });

/** What a change is a change from: the state the compare card holds, or a healthy patient (a bare "+12.9" next to a reading said neither: Where is the resistance 4, reviewer 24 Nov 2026). */
const versus = (env: { cmp: boolean }): string => (env.cmp ? 'vs before' : 'vs healthy');
/** A signed change as the 2D labels write it: a true plus or minus. */
export const signed = (d: number, txt: string): string => `${d > 0 ? '+' : '−'}${txt}`;
const fmt1 = (v: number): string => (Math.round(Math.abs(v) * 10) / 10).toFixed(1);
/** 2D fmtFlow: a flow under 0.05 L/min but above nothing reads "< 0.1". */
export function fmtFlow(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a > 0.0005 && a < 0.05) return v < 0 ? '−< 0.1' : '< 0.1';
  return (v < 0 && Number(a.toFixed(1)) !== 0 ? '−' : '') + a.toFixed(1);
}

/** Blood entering a node per minute (L/min), from every model vessel (2D throughput). The portal vein's station reads the portal vein's own flow, as the tile does. */
export function throughput(Q: ArrayLike<number>, id: string): number {
  if (id === 'CONF') return (Q[EI.get('PV_TRUNK')!] ?? 0) * 0.06;
  let sum = 0;
  for (let k = 0; k < edges.length; k++) {
    const e = edges[k]!;
    if (e.kind === 'wedge') continue;
    const q = Q[k] ?? 0;
    if (e.to === id && q > 0) sum += q;
    else if (e.from === id && q < 0) sum -= q;
  }
  return sum * 0.06;
}

/** The one reading rule. Keeps the badges' on/off state between calls (a station's key), so a value at a threshold does not flicker its badge. */
export class StationExtras {
  private readonly badges = new Map<string, boolean>();
  private oxy: { Q: ArrayLike<number>; res: OxygenResult } | null = null;

  private badge(key: string, v: number, on: number, off: number): boolean {
    const shown = v >= on || (!!this.badges.get(key) && v >= off);
    this.badges.set(key, shown);
    return shown;
  }
  /** 2D deltaHere: on a slide only the stations its words point at; else the selected station, the Change lens, and while comparing. */
  static deltaHere(env: Pick<ReadEnv, 'presenting' | 'lit' | 'selected' | 'lens' | 'cmp'>): boolean {
    return env.presenting ? env.lit : env.selected || env.lens === 'delta' || env.cmp;
  }

  /** The extras of station `id` (a topology node id), whose own pressure is `P` (mmHg, null when unknown). */
  read(id: string, P: number | null, env: ReadEnv): Extras {
    if (id === 'HA') return NO_EXTRAS;   // (the hepatic artery's label is its name only)
    if (tiedOff(env.params as never, id)) return { ...NO_EXTRAS, number: '—' };
    const lens = readingLensOf(env.lens);
    // the unit is said once, in the lens legend; a label carries it only on a slide or when selected (a pressure's too: the legend may be out of sight or another lens's on a slide)
    const sayUnit = env.selected || env.presenting;
    const dHere = StationExtras.deltaHere(env);
    if (lens === 'pressure') {
      let delta = '', up = false;
      const ref = env.refP ? env.refP[NI.get(id) ?? -1] : undefined;
      if (P != null && ref != null && Number.isFinite(ref) && dHere && this.badge((env.cmp ? 'pc:' : 'p:') + id, Math.abs(P - ref), badgeOn(env.cmp), badgeOff(env.cmp))) { delta = signed(P - ref, sayUnit ? `${fmt1(P - ref)} mmHg ${versus(env)}` : fmt1(P - ref)); up = P > ref; }
      return { ...NO_EXTRAS, unit: sayUnit ? 'mmHg' : '', delta, up };
    }
    const Q = env.f.Qf ?? env.f.Q;
    if (lens === 'oxygen') {
      if (!this.oxy || this.oxy.Q !== Q) this.oxy = { Q, res: oxygenSat(Q, env.f.Pf ?? env.f.P) };
      const sat = this.oxy.res.node[NI.get(id) ?? -1] ?? NaN;
      return { ...NO_EXTRAS, lens: 'oxygen', number: Number.isFinite(sat) ? String(Math.round(sat * 100)) : '—', unit: sayUnit ? '% O₂' : '' };
    }
    if (lens === 'flow') {
      const v = throughput(Q, id);
      let delta = '', up = false;
      if (env.healthy && !env.cmp) {
        const r = throughput(env.healthy.Q, id);
        if (r > 0.02 && dHere && this.badge('q:' + id, Math.abs(v - r) / r, 0.3, 0.25)) { delta = signed(v - r, `${Math.round((Math.abs(v - r) / r) * 100)}%${sayUnit ? ` ${versus(env)}` : ''}`); up = v > r; }
      }
      return { ...NO_EXTRAS, lens: 'flow', number: fmtFlow(v), unit: sayUnit ? 'L/min' : '', delta, up };
    }
    // velocity: the fastest the Doppler would read in a vessel at the station (a station named for a vessel reads that vessel)
    let best = 0, bestK = -1, tubes = 0, bed = false;
    for (let k = 0; k < edges.length; k++) {
      const e = edges[k]!;
      if (e.from !== id && e.to !== id) continue;
      if (e.kind === 'liver') { if (env.veinShown(e.id)) bed = true; continue; }
      if (!env.veinShown(e.id) || e.id === 'TIPS' || e.id === 'DIPS') continue;   // (the stents have their own labels)
      tubes++;
      const v = Math.abs(dopplerVel(env.f, k) as number);
      if (bestK < 0 || v > best) { best = v; bestK = k; }
    }
    const own = (STATION_VESSEL as Record<string, string>)[id], ok = own ? EI.get(own) : undefined;
    if (ok !== undefined && env.veinShown(own!)) { bestK = ok; best = Math.abs(dopplerVel(env.f, ok) as number); }
    if (!tubes) return { ...NO_EXTRAS, lens: 'velocity', note: bed ? 'microcirculation' : 'collaterals closed' };
    const jf = judgeFlow(best, null, null);
    return { ...NO_EXTRAS, lens: 'velocity', number: String(Math.round(best)), unit: sayUnit ? 'cm/s' : '', alert: jf.none ? 'no flow' : jf.stasis ? 'stasis' : '' };
  }
}

/** The widest a number of this lens ever sets (the box is laid out at it: 2D `pad: 3` on a velocity or saturation, so "9" and "112" keep one box). */
export const WIDEST: Record<ReadingLens, string> = { pressure: '00.0', flow: '0.0', velocity: '000', oxygen: '000' };
/** The widest change badge a lens ever sets (laid out once the badge may appear). */
export const WIDEST_DELTA: Record<ReadingLens, string> = { pressure: '+00.0', flow: '+000%', velocity: '', oxygen: '' };
/** The change badge as the layout reserves it: the widest number the lens sets, then whatever words follow the number in the badge now. On a slide (or a selected station) the badge says its unit and what it is
 *  against ("+8.3 mmHg vs healthy"); the number alone was reserved, so those words ran past the label's box and off the screen's edge (Next bleed 9 on an iPhone, capture 2c00c0ce). */
export function reservedDelta(lens: ReadingLens, actual: string): string {
  const w = WIDEST_DELTA[lens];
  if (!w) return actual;
  const tail = /^[+−-]?[\d.,]+%?(.*)$/.exec(actual)?.[1] ?? '';
  return w + tail;
}
