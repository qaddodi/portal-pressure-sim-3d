// The stents' readings for the label layer: whether a stent is drawn and settled, its geometry, and what each of its three Doppler points reads (2D velItem, stage-label-items.js 308-335).
// One reading rule, pure but for the stores it is handed (tests/labels-stent.test.ts judges it with a frame and a few flags).
import { EDGES, stentReadsOf } from '../../engine/hales/portal/topology.js';
import { stentOpen } from '../../engine/hales/portal/stent-ease.js';
import { stentFacts } from '../procedures/copied/stent-waist.js';
import { dopplerVel, judgeFlow, velNormal, velPos } from '../lenses/vel-normal.copied.js';
import { samplerFor } from '../lenses/model.ts';
import { latest, patient, shownParams } from '../../engine/index.ts';
import { useProbes } from '../devices/probes/state.ts';
import type { LookId } from '../../looks/looks.ts';
import type { GeoFacts, PointRead, StentId, StentPoint, StentView } from './stent-labels.ts';

import { clock } from '../../clock/frame.ts';
type Edge = { id: string };
const EI = new Map((EDGES as Edge[]).map((e, i) => [e.id, i]));
const PI: Record<StentPoint, number> = { proximal: 0, mid: 1, distal: 2 };

/** A stent's labels wait this long after it is drawn and open (2D STENT_CALM_MS): the model settles, and the numbers with it. */
export const STENT_CALM_MS = 1200;
/** A number that pulses with each beat, read as its mean over the last few seconds (2D beatMean): a plain average until tau has passed. */
export class BeatMean {
  private readonly m = new Map<string, { v: number; t: number; n: number }>();
  mean(key: string, x: number, now: number, tau = 6): number {
    if (!Number.isFinite(x)) return x;
    const e = this.m.get(key);
    if (!e || now - e.t > 3000) { this.m.set(key, { v: x, t: now, n: 1 }); return x; }
    e.n++; e.v += (x - e.v) * Math.max(1 / e.n, 1 - Math.exp(-(now - e.t) / 1000 / tau)); e.t = now;
    return e.v;
  }
}

/** Where a point's velocity stands against the stent's own normal, as a colour drawn toward the text colour (2D: `color-mix(in srgb, <colour> var(--vel-ink), var(--text))`), the lens's own ramp. */
export function pointTint(vel: number, normal: readonly number[] | null, look: LookId): string {
  if (!normal) return '';
  const c = samplerFor(look, 'velocity').at((velPos as (v: number, n: readonly number[]) => number)(vel, normal), [0, 0, 0]);
  const hex = '#' + c.map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')).join('');
  return `color-mix(in srgb, ${hex} var(--vel-ink, 55%), var(--lb-val))`;
}

/** The velocity a stent's point reads (cm/s): the stent's own Doppler velocity, a mean over a few beats, times how much faster that third runs (its narrowing: stentReadsOf). */
export function pointVelocity(params: unknown, sid: StentId, pt: StentPoint, open: number): number {
  const factors = (stentReadsOf as unknown as (p: unknown, id: string, v: number, out: number[]) => ArrayLike<number>)(params, sid, 1, [1, 1, 1]);
  return open * (factors[PI[pt]] ?? 1);
}

/** The label layer's view of the stents. `look` is the figure's look now (the velocity colours follow it). */
export function stentReads(look: () => LookId, now: () => number = () => clock.now()): StentView {
  const calm = new Map<string, number>();
  const beats = new BeatMean();
  const frame = () => latest.frame as unknown as { D: ArrayLike<number>; Q: ArrayLike<number>; Qf?: ArrayLike<number>; Pf?: ArrayLike<number>; P: ArrayLike<number>; morphing?: boolean } | null;
  const probes = () => useProbes.getState();
  /** The Doppler is on this stent. */
  const dopOn = (sid: StentId) => { const p = probes(); return (p.doppler.on || p.slide.doppler) && p.doppler.edge === sid; };
  return {
    ready(sid) {
      const f = frame(), k = EI.get(sid);
      // (a state easing in: the parameters it carries are the glide's, so the label read "TIPS 8 mm" beside a 10 mm stent while the diameter eased up from the default 8: tips-complete 20, 23 Nov review)
      if (!f || k === undefined || !stentOpen(f, k) || f.morphing) { calm.delete(sid); return false; }
      const t = now(), c = calm.get(sid);
      if (c === undefined) { calm.set(sid, t); return false; }
      return t - c >= STENT_CALM_MS;
    },
    all: (sid) => probes().dopplerPoints && dopOn(sid),
    sampled: (sid) => (dopOn(sid) ? probes().doppler.seg : null),
    facts(sid): GeoFacts | null {
      const e = (EDGES as Edge[]).find((x) => x.id === sid);
      const g = e ? stentFacts(e, shownParams()) : null;
      return g ? { d: g.d, waist: g.waist, wLen: g.wLen, sten: g.sten, end: g.end } : null;
    },
    read(sid, pt): PointRead | null {
      const f = frame(), k = EI.get(sid);
      if (!f || k === undefined) return null;
      const t = now();
      const open = beats.mean('v:' + sid, Math.abs(dopplerVel(f, k) as number), t);
      const vel = pointVelocity(shownParams(), sid, pt, open);
      // (an occluded stent reads "No flow", as the Doppler's strip does: under 2 cm/s a stent is occluded)
      const none = (judgeFlow(vel, null, null, { stent: true }) as { none: boolean }).none;
      const nv = velNormal(k, f, patient.reference) as readonly number[] | null;
      return { number: none ? 'No flow' : String(Math.round(vel)), none, tint: none ? '' : pointTint(vel, nv, look()) };
    },
  };
}
