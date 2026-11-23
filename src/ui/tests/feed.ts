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
import { TRACES, LAG_S } from './trace/model.ts';
import { dayExtras } from '../bigtime/day-keys.ts';

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
  samples?: Packed | null; probe?: string; gen?: number; clock?: string; day?: number; metrics?: Record<string, unknown>; params?: unknown; bands?: unknown; morphing?: boolean; Pf?: ArrayLike<number>;
};
/** the bands on (the engine's count wears off a little each day): a whole number, or what a frame without one holds */
export const bandsOn = (b: unknown): unknown => (typeof b === 'number' ? Math.max(0, Math.ceil(b - 1e-3)) : b);
/** what the paper's clock reads of a frame */
export type HeadFrame = { running?: boolean; clock?: string; morphing?: boolean; speed?: number } | null | undefined;

/** The head of a trace: the newest sample's time less the lag, plus the wall time since the frame came (never past the lag), at the model's speed. */
export function headOf(last: number, wallMs: number, nowMs: number, running: boolean, speed: number): number {
  if (!Number.isFinite(last)) return 0;
  if (!running) return last;
  const rate = speed || 1;
  return last - LAG_S * rate + Math.min(Math.max(0, nowMs - wallMs) / 1000, LAG_S) * rate;
}
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
  /** a patient that comes with its past: these days are laid in when the frame that replaced the model's state arrives (seedDays) */
  private seed: DayPoint[] | null = null;
  private treatKey: string | null = null;
  private bandsNow: unknown = null;
  private stepNext = false;
  /** the worker's generation the day record belongs to, and the day History is going back to (the next state change keeps the points up to it) */
  private daysGen = -1;
  private keepTo: number | null = null;
  private calmKept = new Map<string, { ver: number; x: number[]; mid: number[] }>();
  private waiting = false;
  /** this record's generation (a new one each time the record is emptied), and the one that has asked the engine for its past */
  private gen = 0;
  private askedGen = -1;
  /** the whole record shares `off` (set where it began): its past, asked for later, can be shifted by it and joined with no seam */
  private offAll = true;
  /** the pasts the instruments on screen want (seconds), by tag, and what each does when the past has landed */
  private wants = new Map<string, { secs: number; landed?: () => void }>();
  /** the record as the freewheel reads it ({ t, ph, ...keys }, each column the kept one) */
  readonly fine: Record<string, number[]> = {};
  constructor() {
    Object.defineProperty(this.fine, 't', { get: () => this.t, enumerable: true });
    for (const k of CHANNELS) Object.defineProperty(this.fine, k, { get: () => this.ch[k], enumerable: true });
  }

  clear() { this.beat.reset(); this.wheel.stop(); this.off = 0; this.offAll = true; this.gen++; this.t.length = 0; for (const k of CHANNELS) this.ch[k].length = 0; this.clearBins(); this.version++; }
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

  /** The days of the patient who is going to be loaded (a model patient's history), laid in when the model's new state arrives; null for a patient who comes with none (a new patient clears any that were waiting). */
  seedDays(days: readonly DayPoint[] | null): Promise<void> {
    this.landed?.();
    this.seed = days ? structuredClone(days) as DayPoint[] : null;
    return days ? new Promise<void>((done) => { this.landed = done; }) : Promise.resolve();
  }
  /** resolves the promise seedDays gave, when the days are in (or when they were let go) */
  private landed: (() => void) | null = null;
  /** A replaced state came in: a history's days that were waiting are its record now. */
  private layInSeed() {
    if (this.seed) { this.days.push(...this.seed); this.seed = null; }
    this.landed?.(); this.landed = null;
  }

  /** Take in one frame: its samples into the record and its day into the Days list. A new patient (a jump) starts the record again; a clock that was set under
   *  a trace that went on (a state restored, a time-lapse ended, the freewheel's sweep) moves the trace's time on to start where it left off (2D ingest). */
  adopt(f: FeedFrame, nowMs = clock.now()) {
    const s = f.samples;
    if (f.probe && f.probe !== this.probe) { this.probe = f.probe; }
    const was = this.wheel.laid;
    if (f.jump) {
      this.clear();
      // The day record lives as long as the patient does: a jump of the clock (+1 month, run to the next event) is the same patient some days on, so its points stay. It starts over
      // only for a new patient, a reset or a morph (the worker's `gen` counts those), and goes back to the day of the entry History restored (keepDaysTo).
      const g = f.gen ?? 0, keep = this.keepTo; this.keepTo = null;
      if (g !== this.daysGen) {
        this.daysGen = g;
        if (keep != null) { const kept = this.days.filter((d) => d.day <= keep); this.days.length = 0; this.days.push(...kept); } else this.days.length = 0;
        this.treatKey = null; this.bandsNow = null; this.calmKept.clear(); this.daysVer++;
        this.layInSeed();
      }
    }
    if (s && s.t && s.t.length && f.clock !== 'disease') {
      const n = s.t.length, last = this.last, t0 = s.t[0]! + this.off;
      if (!this.t.length && this.head[1]) {
        // (A record that begins after the paper has been drawn (a slide's eased change of patient, a new patient) goes on from the head: the paper only ever moves on, whatever the model's clock now says.)
        this.off = this.head[0]! + Math.min(0.25, Math.max(0, nowMs - this.head[1]!) / 1000) + FW_LAG_S - s.t[n - 1]!;
      } else if (this.t.length && (t0 < last - 1e-9 || t0 > last + JUMP_S)) {
        // (After a freewheel the newest sample is put the lag ahead of the head as it has moved on, so the trace keeps its pace through the landing.)
        this.off = was ? Math.max(last, this.head[0]! + Math.min(0.25, (nowMs - this.head[1]!) / 1000) + FW_LAG_S) - s.t[n - 1]!
          : last + (n > 1 ? s.t[1]! - s.t[0]! : 0.004) - s.t[0]!;
        this.offAll = false;
      }
      this.wheel.land();
      this.push(s, this.off);
      this.wantPast(f);
    }
    if (f.clock && f.day != null && f.metrics) this.noteDay(f);
  }

  /** The trace's own clock, forward only (never the model's: while a slide eases in, the model's clock runs from the old moment to the slide's, here backwards, and the paper slid with it).
   *  A record that is there and live: a little behind its newest sample, glided by the wall time since the frame came. No record, or the model easing: the head goes on from where it was, at the model's pace.
   *  Never less than the last head given: a late frame that brought fewer samples than the wall time that passed holds the paper still instead of drawing it back. */
  headNow(f: HeadFrame, wallMs: number, nowMs: number): number {
    const running = !!f?.running, rate = f?.speed || 1;
    const drawn = this.head[1] !== 0;
    let h: number;
    if (this.t.length && !f?.morphing) h = headOf(this.last, wallMs, nowMs, running && f?.clock !== 'disease', rate);
    else if (drawn) h = this.head[0]! + (running ? Math.min(0.25, Math.max(0, nowMs - this.head[1]!) / 1000) * rate : 0);   // (a page that was hidden does not run the paper on by the minutes it was away)
    else if (Number.isFinite(this.last)) h = this.last;
    else return 0;   // (nothing drawn, nothing recorded: no paper has been laid, so no head is kept for a record to go on from)
    if (drawn && h < this.head[0]!) h = this.head[0]!;
    this.head[0] = h; this.head[1] = nowMs;
    return h;
  }

  /** An instrument wants this many seconds of past under its trace while it is on screen; the release is what it calls when it goes. `landed` redraws it once the past is in. */
  want(tag: string, secs: number, landed?: () => void): () => void {
    this.wants.set(tag, { secs, landed });
    return () => { this.wants.delete(tag); };
  }
  private wanted(): number { let m = 0; for (const w of this.wants.values()) if (w.secs > m) m = w.secs; return m; }
  /** A record that has just begun on a landed state (the slide's easing is over) holds none of the past the instruments show: ask the engine for it once. (It answers empty while the model eases,
   *  and a past asked for at mount was refused then; nothing asked again, so the plot stood empty for the seconds it took the live samples to fill it.) */
  private wantPast(f: FeedFrame) {
    const need = this.wanted();
    if (!need || f.clock !== 'hemo' || f.morphing || this.waiting || this.askedGen === this.gen) return;
    if (this.t.length && this.last - this.t[0]! >= need - 1) return;
    this.askedGen = this.gen;
    void this.backfill(need).then((ok) => { if (ok) for (const w of this.wants.values()) w.landed?.(); });
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
    // (How many bands are on, not how much of the last is left: a band wears off by a fiftieth of a day, and each day's new fraction was a step in the list for the weeks after a banding.)
    const bands = bandsOn(f.bands);
    if (bands !== this.bandsNow) { this.stepNext = this.stepNext || this.bandsNow != null; this.bandsNow = bands; }
    const v: Record<string, number> = { hvpg: m.hvpg! };
    for (const t of TRACES) if (t.day) v[t.id] = m[t.day]!;
    Object.assign(v, dayExtras(f));   // (the timeline chart's own lanes: ascites, the shunt, the cardiac output, the varix: bigtime/day-keys.ts)
    const grew = recordDay(this.days, f.day!, v, this.stepNext);
    this.stepNext = false;
    if (grew) { this.daysVer++; if (!this.days.length) this.calmKept.clear(); }
  }
  /** History is restoring the entry of this day: the record keeps its points up to it, not the later ones. */
  keepDaysTo(day: number) { this.keepTo = day; }
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
    if (this.waiting || !this.offAll || this.wheel.laid) return false;   // (a strip that went on by itself keeps its beats; so does a record whose time was set part way)
    this.waiting = true;
    const gen = this.gen;
    try {
      const m = await engine().request({ type: 'history', secs }) as unknown as { samples: Packed | null; t?: number };
      const s = m.samples;
      if (!s || !s.t || !s.t.length || gen !== this.gen || !this.offAll || this.wheel.laid) return false;
      const o = this.off, firstLive = this.t.length ? this.t[0]! : Infinity;
      const keep: number[] = [];
      for (let i = 0; i < s.t.length; i++) if (s.t[i]! + o < firstLive - 1e-9) keep.push(i);
      if (!keep.length) return false;
      const t = keep.map((i) => s.t![i]! + o);
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
  get days() { return feed.days; }, get daysVer() { return feed.daysVer; }, keepDaysTo: (day: number) => feed.keepDaysTo(day), calm: (key: string) => feed.calmOf(key),
};
