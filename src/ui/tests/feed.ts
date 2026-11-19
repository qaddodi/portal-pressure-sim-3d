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

export const CHANNELS = ['ph', 'vel', 'pvVel', 'hvVel', 'whvp', 'hvpg', 'RA', 'IVCS', 'RHV', 'CONF', 'SIN_R', 'VAR', 'AO', 'SV', 'SMV'] as const;
export type Channel = (typeof CHANNELS)[number];
/** seconds of model time kept (the two-minute range plus slack) */
export const KEEP_S = 150;
/** a first sample this far ahead of the last kept one is a clock that was set, not the next frame (2D JUMP_S) */
export const JUMP_S = 0.5;
/** the width of a minutes-range bin, seconds (2D BIN) */
export const BIN_S = 0.25;

type Packed = Record<string, ArrayLike<number>>;

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
  private waiting = false;

  clear() { this.beat.reset(); this.t.length = 0; for (const k of CHANNELS) this.ch[k].length = 0; this.clearBins(); this.version++; }
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

  /** Take in one frame's samples. A frame that is a jump (a new patient, a restore) or whose samples go back in time starts the record again. */
  adopt(f: Pick<EngineFrame, 'jump'> & { samples?: Packed | null; probe?: string; gen?: number }) {
    const s = f.samples;
    if (f.probe && f.probe !== this.probe) { this.probe = f.probe; }
    if (f.jump) this.clear();
    if (!s || !s.t || !s.t.length) return;
    if (this.t.length && (s.t[0]! < this.last - 1e-9 || s.t[0]! > this.last + JUMP_S)) this.clear();
    const i0 = this.t.length;
    for (let i = 0; i < s.t.length; i++) this.t.push(s.t[i]!);
    if (s.ph) for (let i = 0; i < s.t.length; i++) this.beat.push(s.t[i]!, s.ph[i]!);
    for (const k of CHANNELS) { const a = s[k]; const dst = this.ch[k]; if (a) for (let i = 0; i < s.t.length; i++) dst.push(a[i] ?? NaN); else for (let i = 0; i < s.t.length; i++) dst.push(NaN); }
    this.binFrom(i0);
    this.trim();
    this.version++;
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
    if (this.waiting) return false;
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
  onFrame((f) => feed.adopt(f as unknown as Parameters<SampleFeed['adopt']>[0]));
}

/** The record as a trace reads it (arrays read when asked: a backfill replaces them). */
export const record = {
  get t() { return feed.t; }, get ch() { return feed.ch; }, get binT() { return feed.binT; }, get bin() { return feed.bin; }, get beats() { return feed.beat.times; },
};
