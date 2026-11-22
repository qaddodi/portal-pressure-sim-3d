// The model's samples, kept for the traces. The engine posts a frame's worth of samples with every frame (model time t, heart phase ph, the probe's velocity, the portal and
// hepatic vein velocities, the wedged pressure and the HVPG, and the pressure at nine nodes); a trace needs the last few minutes of them, so every adopted frame's samples are
// appended here, and a pane that opens on a steady state asks the engine for the past it would have recorded (a `history` request, worker-core.js).
//   t  model seconds           ph  cardiac phase 0..1
//   vel  the Doppler probe's velocity (cm/s)    pvVel, hvVel  the portal and right hepatic vein velocities
//   whvp, hvpg  the true wedged pressure and HVPG (the model's, whatever the catheter has measured)
//   RA IVCS RHV CONF SIN_R VAR AO SV SMV  node pressures (mmHg)
import { onFrame, engine } from '../../engine/index.ts';
import type { EngineFrame } from '../../engine/index.ts';
import { createBeatClock } from './copied/ekg.copied.js';
import { createFreewheel } from './copied/freewheel.copied.js';
import { recordDay, calmedDays } from '../../engine/hales/portal/trail-calm.js';
import { treatmentKey } from '../../engine/hales/portal/change-events.js';
import { TRACES } from './trace/model.ts';

import { clock } from '../../clock/frame.ts';
export const CHANNELS = ['ph', 'vel', 'pvVel', 'hvVel', 'whvp', 'hvpg', 'RA', 'IVCS', 'RHV', 'CONF', 'SIN_R', 'VAR', 'AO', 'SV', 'SMV'] as const;
export type Channel = (typeof CHANNELS)[number];
/** seconds of model time kept (the two-minute range plus slack) */
export const KEEP_S = 150;
/** a first sample this far ahead of the last kept one is a clock that was set, not the next frame (2D JUMP_S) */
export const JUMP_S = 0.5;
/** the width of a minutes-range bin, seconds (2D BIN) */
export const BIN_S = 0.25;

type Packed = Record<string, ArrayLike<number>>;
/** the columns the trace lines and the HVPG lane read (2D KEYS): what the freewheel replays */
export const KEYS = [...TRACES.map((t) => t.id), 'hvpg'] as const;
/** a time-lapse's newest sample's seconds the trace runs behind the model (2D LAG_S, trace/model.ts): the freewheel lays samples this far ahead of its head */
const FW_LAG_S = 0.12;
/** the frames' own fields the feed reads (the engine's frame, loosely: the params and the bands change the Days chart's steps) */
export type FeedFrame = Pick<EngineFrame, 'jump'> & {
  samples?: Packed | null; probe?: string; gen?: number; clock?: string; day?: number; metrics?: Record<string, unknown>; params?: unknown; bands?: unknown;
};
/** one point of the Days chart: a day's readings (start: a treatment began a new piece here, so a calmed line steps there) */
export interface DayPoint { day: number; v: Record<string, number>; start?: boolean }

export class SampleFeed {
  t: number[] = [];
  ch: Record<Channel, number[]> = Object.fromEntries(CHANNELS.map((k) => [k, [] as number[]])) as Record<Channel, number[]>;
  /** the probe the `vel` channel follows */
  probe = 'PV_TRUNK';
  /** counts every change of what is kept (a pane redraws when it moves) */
  version = 0;
  /** the quarter-second bins the two-minute range draws: start time, and per channel the trough, the peak and the mean of the bin */
  binT: number[] = [];
  bin: Record<Channel, { lo: number[]; hi: number[]; mean: number[]; sum: number[]; n: number[] }> = Object.fromEntries(CHANNELS.map((k) => [k, { lo: [], hi: [], mean: [], sum: [], n: [] }])) as never;
  /** when the cardiac phase wrapped: each wrap starts a beat on the EKG strip */
  readonly beat = createBeatClock();
  /** the freewheel (2D freewheel.js): while the model's own clock stands still under a running page it lays the last beat over the time that passes */
  readonly wheel = createFreewheel(KEYS);
  /** [the head as last drawn, the wall time it was drawn at]: the freewheel goes on from it */
  readonly head = new Float64Array(2);
  /** the model's time plus `off` is the trace's (the model's clock was set while the trace went on: a state restored, a time-lapse ended) */
  off = 0;
  /** the Days chart's points, one a day (2D days), and what changed them */
  days: DayPoint[] = [];
  daysVer = 0;
  private treatKey: string | null = null;
  private bandsNow: unknown = null;
  private stepNext = false;
  private calmKept = new Map<string, { ver: number; x: number[]; mid: number[] }>();
  private waiting = false;
  /** the record as the freewheel reads it ({ t, ph, ...keys }, each column the kept one) */
  readonly fine: Record<string, number[]> = {};
  constructor() {
    Object.defineProperty(this.fine, 't', { get: () => this.t, enumerable: true });
    for (const k of CHANNELS) Object.defineProperty(this.fine, k, { get: () => this.ch[k], enumerable: true });
  }

  clear() { this.beat.reset(); this.wheel.stop(); this.off = 0; this.t.length = 0; for (const k of CHANNELS) this.ch[k].length = 0; this.clearBins(); this.version++; }
  private clearBins() { this.binT.length = 0; for (const k of CHANNELS) { const b = this.bin[k]; b.lo.length = b.hi.length = b.mean.length = b.sum.length = b.n.length = 0; } }
  /** Lay samples i0..i1 of the kept arrays into the bins. */
  private binFrom(i0: number) {
    const T = this.binT;
    for (let i = i0; i < this.t.length; i++) {
      const b0 = Math.floor(this.t[i]! / BIN_S) * BIN_S;
      if (!T.length || T[T.length - 1] !== b0) {
        T.push(b0);
        for (const k of CHANNELS) { const b = this.bin[k]; b.lo.push(NaN); b.hi.push(NaN); b.mean.push(NaN); b.sum.push(0); b.n.push(0); }
      }
      const j = T.length - 1;
      for (const k of CHANNELS) {
        const v = this.ch[k][i]!;
        if (v !== v) continue;
        const b = this.bin[k];
        if (!b.n[j]) { b.lo[j] = v; b.hi[j] = v; }
        else { if (v < b.lo[j]!) b.lo[j] = v; if (v > b.hi[j]!) b.hi[j] = v; }
        b.sum[j]! += v; b.n[j]!++; b.mean[j] = b.sum[j]! / b.n[j]!;
      }
    }
  }
  private rebin() { this.clearBins(); this.binFrom(0); }
  get n() { return this.t.length; }
  get last() { return this.t.length ? this.t[this.t.length - 1]! : NaN; }

  /** Take in one frame: its samples into the record and its day into the Days list. A new patient (a jump) starts the record again; a clock that was set under
   *  a trace that went on (a state restored, a time-lapse ended, the freewheel's sweep) moves the trace's time on to start where it left off (2D ingest). */
  adopt(f: FeedFrame) {
    const s = f.samples;
    if (f.probe && f.probe !== this.probe) { this.probe = f.probe; }
    const was = this.wheel.laid;
    if (f.jump) { this.clear(); this.days.length = 0; this.treatKey = null; this.bandsNow = null; this.calmKept.clear(); this.daysVer++; }
    if (s && s.t && s.t.length && f.clock !== 'disease') {
      const n = s.t.length, last = this.last, t0 = s.t[0]! + this.off;
      if (this.t.length && (t0 < last - 1e-9 || t0 > last + JUMP_S)) {
        // (After a freewheel the newest sample is put the lag ahead of the head as it has moved on, so the trace keeps its pace through the landing.)
        this.off = was ? Math.max(last, this.head[0]! + Math.min(0.25, (clock.now() - this.head[1]!) / 1000) + FW_LAG_S) - s.t[n - 1]!
          : last + (n > 1 ? s.t[1]! - s.t[0]! : 0.004) - s.t[0]!;
      }
      this.wheel.land();
      this.push(s, this.off);
    }
    if (f.clock && f.day != null && f.metrics) this.noteDay(f);
  }

  /** Samples (a frame's, the freewheel's) into the kept arrays, the bins and the beat clock; a sample not after the newest is skipped. */
  private push(s: Packed, o = 0) {
    const i0 = this.t.length;
    let lt = this.t.length ? this.last : -Infinity;
    const keep: number[] = [];
    for (let i = 0; i < s.t!.length; i++) { const t = s.t![i]! + o; if (t <= lt) continue; lt = t; keep.push(i); }
    if (!keep.length) return;
    for (const i of keep) this.t.push(s.t![i]! + o);
    if (s.ph) for (const i of keep) this.beat.push(s.t![i]! + o, s.ph[i]!);
    for (const k of CHANNELS) { const a = s[k]; const dst = this.ch[k]; if (a) for (const i of keep) dst.push(a[i] ?? NaN); else for (let q = 0; q < keep.length; q++) dst.push(NaN); }
    this.binFrom(i0);
    this.trim();
    this.version++;
  }

  /** The samples the freewheel laid over a wait (they follow the record's newest; the live ones that come next land it). */
  layWheel(smp: Packed) { this.push(smp, 0); }

  /** Today's readings into the Days list (2D ingest): a treatment or a procedure is a step, so the list cuts its trend there. */
  private noteDay(f: FeedFrame) {
    const m = f.metrics as Record<string, number>;
    if (f.params) { const k = treatmentKey(f.params); if (k !== this.treatKey) { this.stepNext = this.treatKey != null; this.treatKey = k; } }
    if (f.bands !== this.bandsNow) { this.stepNext = this.stepNext || this.bandsNow != null; this.bandsNow = f.bands; }
    const v: Record<string, number> = { hvpg: m.hvpg! };
    for (const t of TRACES) if (t.day) v[t.id] = m[t.day]!;
    const grew = recordDay(this.days, f.day!, v, this.stepNext);
    this.stepNext = false;
    if (grew) { this.daysVer++; if (!this.days.length) this.calmKept.clear(); }
  }
  /** The Days list's trace, calmed (2D calmOf): made once for each change of the days, never for a frame that drew the same ones. */
  calmOf(key: string): { x: number[]; mid: number[] } | null {
    const c = this.calmKept.get(key);
    if (c && c.ver === this.daysVer) return c;
    const d = this.days;
    if (!d.length || !(key in d[d.length - 1]!.v)) { this.calmKept.delete(key); return null; }
    const e = { ...(calmedDays(d, key) as { x: number[]; mid: number[] }), ver: this.daysVer };
    this.calmKept.set(key, e);
    return e;
  }

  private trim() {
    const n = this.t.length;
    if (n < 2) return;
    const cut = this.last - KEEP_S;
    if (this.t[0]! >= cut) return;
    let i = 0; while (i < n && this.t[i]! < cut) i++;
    if (i < 512 && n < 60000) return;   // (trimmed in chunks: splicing every frame would copy the whole record)
    this.t.splice(0, i); for (const k of CHANNELS) this.ch[k].splice(0, i);
    this.beat.dropBefore(this.t[0]!);
    let b = 0; while (b < this.binT.length && this.binT[b]! < cut - BIN_S) b++;
    if (b) { this.binT.splice(0, b); for (const k of CHANNELS) { const q = this.bin[k]; q.lo.splice(0, b); q.hi.splice(0, b); q.mean.splice(0, b); q.sum.splice(0, b); q.n.splice(0, b); } }
  }

  /** The record before what is kept: the model's own history of the last `secs` seconds (the engine runs a scratch copy; null when it is not a steady state). */
  async backfill(secs: number): Promise<boolean> {
    if (this.waiting || this.off || this.wheel.laid) return false;   // (a strip that went on by itself keeps its beats)
    this.waiting = true;
    try {
      const m = await engine().request({ type: 'history', secs }) as unknown as { samples: Packed | null; t?: number };
      const s = m.samples;
      if (!s || !s.t || !s.t.length) return false;
      const firstLive = this.t.length ? this.t[0]! : Infinity;
      const keep: number[] = [];
      for (let i = 0; i < s.t.length; i++) if (s.t[i]! < firstLive - 1e-9) keep.push(i);
      if (!keep.length) return false;
      const t = keep.map((i) => s.t![i]!);
      const chs = Object.fromEntries(CHANNELS.map((k) => [k, keep.map((i) => (s[k] ? s[k]![i]! : NaN))])) as Record<Channel, number[]>;
      this.t = t.concat(this.t);
      for (const k of CHANNELS) this.ch[k] = chs[k].concat(this.ch[k]);
      this.rebin();
      this.beat.reset(); for (let i = 0; i < this.t.length; i++) this.beat.push(this.t[i]!, this.ch.ph[i]!);
      this.version++;
      return true;
    } catch { return false; } finally { this.waiting = false; }
  }
}

/** The one feed of the page, fed by every adopted frame once the app has started. */
export const feed = new SampleFeed();
let started = false;
export function startFeed(): void {
  if (started) return;
  started = true;
  onFrame((f) => feed.adopt(f as unknown as FeedFrame)); // (lives for the page)
}

/** The record as a trace reads it (arrays read when asked: a backfill replaces them). */
export const record = {
  get t() { return feed.t; }, get ch() { return feed.ch; }, get binT() { return feed.binT; }, get bin() { return feed.bin; }, get beats() { return feed.beat.times; },
  get days() { return feed.days; }, get daysVer() { return feed.daysVer; }, calm: (key: string) => feed.calmOf(key),
};
