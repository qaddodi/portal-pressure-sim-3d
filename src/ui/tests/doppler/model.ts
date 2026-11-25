// The Doppler's model (2D doppler.js): the record of the probe's velocity, the reading and its words (the copied `createReading`: the 3 s mean, the peak, the trough, the median beat, a stent's
// gates, the vessel's usual range, `interpret`), the tiles, the range gauge, and the spectrum as a chart frame. Nothing here touches the page: a pane feeds it the model's frames and draws
// the frame it returns through the shared chart GPU drawer.
//
// The spectrum. 2D draws each spectral line into a ring texture with its own shader (doppler-synth.js: the line's band, the speckle, the wall filter, the log compression, the colour maps).
// The 3D app has ONE chart context that draws shapes (src/ui/charts/gl.ts), so each spectral line (a 2 px column) is a short stack of shapes laid by the same numbers: the band's top P and low
// edge L from `lineBand` (the copied one), the power profile S the shader gives (brightest just under the outline, dimmer to the baseline), the wall filter's cubic fade at the baseline, the
// colour maps and shading (the copied dopplerColor), and a speckle that is a fixed hash of the line's number, so the grain scrolls with the trace and never flickers. What is not drawn: the log
// compression of the grain's real exponential statistics and the noise floor (the shapes' alpha stands for the first, the second is left out).
import { EDGES, dopplerK } from '../../../engine/hales/portal/topology.js';
import { clamp, fmt } from '../copied/num.copied.js';
import { windowIndexFor, scaleFor, fitScale } from '../copied/dopplerWindow.copied.js';
import { lineBand } from '../copied/doppler-synth.copied.js';
import { pulsatility, caliperFrame, caliperLevel, caliperX, CAL_FADE, pairOf, pairBand, pairScale, PAIR_GAP, riForms } from '../copied/doppler-marks.copied.js';
import { smooth01 } from '../copied/motion.copied.js';
import { D_SURFACE } from '../copied/motion.copied.js';
import { hvWaves, type WavePts } from './waves.ts';
import { createReading } from './copied/doppler-reading.copied.js';
import { EI, PROBES, SEGS, SETTINGS, SWEEP_SECONDS, STAT_TITLE, num, PAD_L, PAD_R } from './copied/doppler-tables.copied.js';
import { dopplerColor, shadeColor, THETA } from './copied/doppler-colours.copied.js';
import type { Frame, Shape } from '../../charts/scene.ts';
import type { Rgba } from '../../charts/colour.ts';
import { measure } from '../../charts/measure.ts';
import { feed, type SampleFeed } from '../feed.ts';
import { paramsNow } from '../frame.ts';
import { useDopplerProbe } from './probe-state.ts';
import { pinnedAt } from '../slide/pin.ts';
import { dopplerVel } from '../../../scene/lenses/vel-normal.copied.js';
import type { SpectrumDraw } from './spectrum-gl.ts';

import { clock } from '../../../clock/frame.ts';
export type DopMode = 'spectrum' | 'velocity' | 'variance';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
export const WINDOWS: readonly number[] = SWEEP_SECONDS;
const KEEP = 16, SETTLE_LAG = 0.16, COL = 2;
/** The longest stretch of whole beats a replay loops (s), and how long a join's leftover step takes to ease out (s): a replay never steps, it re-enters its template where the beat and the breath match and eases what is left. */
const BEAT_TEMPLATE_S = 6.5, MIN_PINNED_TEMPLATE_S = 3, JOIN_S = 0.5;
const MINUS = '−';

/** The hepatic artery's usual resistive index (Doppler of a native or transplanted liver; 0.55 to 0.80). */
export const HA_RI = [0.55, 0.8] as const;
export interface Tile { k: string; label: string; v: string; unit: string; show: boolean; out?: boolean; here?: boolean; seg?: string; title?: string }
export interface Gauge { p0: number; p1: number; pm: number; pz: number; n0: number; n1: number; open: boolean; out: boolean; model: boolean; title: string }
export interface Report {
  acquiring: boolean; text: string;
  dir: string; sev: string; vel: string; none: boolean; pattern: string; note: string;
  tiles: Tile[]; gauge: Gauge | null; kind: string; aria: string;
}

export class DopplerModel {
  readonly rd: Any = createReading({ params: () => paramsNow(), dopGate: () => useDopplerProbe.getState().gate });
  buf: number[][] = [];
  beatN = 0;
  private lastPh = NaN;
  private lastT = -Infinity;
  probe: string | null = null;
  private gateNow = '';
  frame: Any = null;
  gi = -1;
  heldTo: number | null = null;
  invert = false;
  mode: DopMode = 'spectrum';
  sweepIndex = 0;
  /** the learner has chosen a window by hand (until then a narrow trace takes 3 s, a wide one 6 s) */
  manualSweep = false;
  private pickNext = true;
  private scaleSt = { scale: null as number | null, baseF: null as number | null, settleAt: 0, refit: false };
  private tDisp: number | null = null;
  private wallLast = 0;
  /** a slide's own options (2D doppler.js configure): the velocity scale fixed at ± nyq cm/s with the baseline at base (0 top to 1 bottom), calipers, the paired trace, the hepatic vein's waves named */
  private opts = { fixed: null as { nyq: number; base: number } | null, calipers: false, pair: false, waves: false };
  private calMk = { hi: { on: false, from: 0, to: 0, at: 0 }, lo: { on: false, from: 0, to: 0, at: 0 } };
  private wl: { pts: WavePts; sgn: number; alpha: number; out: boolean } | null = null;
  private labAt = 0;
  private pairSc: { id: string; scale: number; base: number; at: number } | null = null;
  private motion = false;
  private ink: Rgba = [0.2431, 0.8784, 0.6471, 1];
  /** time lapse (2D doppler.js): the shift that makes the bedside samples follow the replay, the template of the last beats, the replay's own state, and where the next bedside sample is to land */
  /** whether the Speed tile is shown: a vessel with a usual range has it (2D showStat(Speed, !!normal)); kept while a new vessel acquires */
  private speedOn = false;
  private tOff = 0;
  private tpl: { t0: number; L: number; pts: number[][]; mean: number; pm: number; hasPair: boolean; mk: number[]; live: number } | null = null;
  /** t: the replay's own clock; x: where it stands in the template (null until it enters); o1, o2, age: the step left over at the last entry (main and paired trace), easing out over JOIN_S */
  private synth: { t: number; wall: number; mean: number; target: number; amp: number; still: boolean; flat?: boolean; x: number | null; o1: number; o2: number; age: number } | null = null;
  /** The step between a replay's last sample and the bedside's first, easing out over JOIN_S (a time lapse ending): t0 is the first bedside sample's time. */
  private join: { t0: number; o1: number; o2: number } | null = null;
  private joinWant = false;
  private carry: number | null = null;
  /** the replay is a slide's own velocity, not a time lapse's */
  private pinDriven = false;
  /** the GPU draws the spectrum's pixels under the shapes (spectrum-gl.ts, 2D's own shaders); false: the spectrum is laid from shapes (no WebGL2, or the program failed) */
  gpu = false;
  /** the chart canvas's device pixel ratio (a spectral line is one device pixel wide, as in 2D) */
  dpr = 1;
  /** the trace's numbers for the frame just built (read by the picture under the shapes) */
  spec: SpectrumDraw | null = null;
  private colA = new Float32Array(0);
  private colB = new Float32Array(0);

  /** a slide's data card (2D `--dop-ov`): the reading is the slide's own steady one, not the beat-to-beat live mean (set by the pane) */
  slide = false;
  /** On a slide's data card the report sits over the monitor's top strip (2D --dop-ov): the strip's height in px, the trace starting under it and the vessel and settings along the foot (doppler.js ovTop, yLab). Null: the Tests card's own, the words above the trace. */
  ovTop: number | null = null;
  private steadySt = { probe: null as string | null, v: 0, t: 0, n: 0 };
  /** The running mean behind a slide's reading: eases toward the 3 s mean over about six seconds (about a second and a half after a clear change), and starts again on a new vessel or after a gap (2D steadyMean). */
  private steadyMean(x: number, now = clock.now()): number {
    const st = this.steadySt, dt = (now - st.t) / 1000;
    if (st.probe !== this.probe || dt > 1.5 || !Number.isFinite(st.v)) { st.probe = this.probe; st.v = x; st.n = 1; }
    else if (dt > 0) {
      const far = Math.abs(x - st.v) > 0.25 * Math.max(Math.abs(x), 4);
      st.n++;
      st.v += (x - st.v) * (far ? 1 - Math.exp(-dt / 1.5) : Math.max(1 / st.n, 1 - Math.exp(-dt / 6)));
    }
    st.t = now;
    return st.v;
  }
  /** The slide's own velocity in the probed vessel as the scanner reads it (2D pinnedVel: the settled state's flows and widths), NaN when the slide pins none. */
  private pinnedVel(): number { return Math.abs(this.pinnedSigned()); }
  /** The same with its sign (the scanner's way: toward or away from the probe), NaN off a slide or when the slide pins none. */
  private pinnedSigned(): number {
    if (!this.slide) return NaN;
    const at = pinnedAt(), k = this.probe ? EI[this.probe] : null;
    if (!at || k == null || !at.Q || !at.D) return NaN;
    const v = dopplerVel({ Q: at.Q, D: at.D }, k) as number;
    return Number.isFinite(v) ? v : NaN;
  }
  /** The slide's velocity as the RECORD holds it: the record is the mean across the lumen, the scanner reads the peak of the spectrum (dopplerK, doppler-reading.copied.js), and the pin is what the scanner reads. */
  private pinnedRecord(): number { const v = this.pinnedSigned(), k = this.probe ? dopplerK(EDGES[EI[this.probe]!]) : NaN; return v / k; }
  /** True while a slide's own patient drives the record (see ingest). */
  get pinned(): boolean { return Number.isFinite(this.pinnedSigned()); }

  get sweep(): number { return SWEEP_SECONDS[this.sweepIndex]!; }
  /** True while a mark or a letter is easing (the pane asks for frames until it is still, even with the model paused). */
  get busy(): boolean { return this.motion; }

  /** A slide's own options (2D `configure`): the display mode (the next slide returns to Spectrum unless it names one), calipers, the paired trace, a fixed velocity scale (scale: ± cm/s, the Nyquist limit,
   *  so faster flow aliases; baseline: 0 at the top of the trace to 1 at the bottom, 0.5 when not given) and the hepatic vein's waves. */
  configure(t: { mode?: string; calipers?: boolean; pair?: boolean; scale?: number; baseline?: number; waves?: boolean } | null | undefined): void {
    const m: DopMode = t?.mode === 'color' || t?.mode === 'colour' || t?.mode === 'velocity' ? 'velocity' : t?.mode === 'variance' ? 'variance' : 'spectrum';
    this.mode = m;
    this.opts.calipers = !!t?.calipers; this.calMk.hi.on = this.calMk.lo.on = false;
    if (this.opts.pair !== !!t?.pair) { this.opts.pair = !!t?.pair; this.pairSc = null; }
    const nyq = Number(t?.scale), b = Number(t?.baseline);
    const next = nyq > 0 ? { nyq: clamp(nyq, 5, 400), base: Math.round(clamp(Number.isFinite(b) ? b : 0.5, 0.15, 0.85) * 100) / 100 } : null;
    if (next?.nyq !== this.opts.fixed?.nyq || next?.base !== this.opts.fixed?.base) { this.opts.fixed = next; this.scaleSt.scale = null; this.scaleSt.baseF = null; }
    if (this.opts.waves !== !!t?.waves) { this.opts.waves = !!t?.waves; this.wl = null; }
  }

  private sync() { this.rd.sync({ buf: this.buf, beatN: this.beatN, probe: this.probe, frame: this.frame, gi: this.gi, heldTo: this.heldTo, invert: this.invert }); }
  private clearBuf() {
    this.buf.length = 0; this.beatN = 0; this.lastPh = NaN; this.rd.facs.clear(); this.heldTo = null; this.wl = null; this.pairSc = null; this.calMk.hi.on = this.calMk.lo.on = false; this.scaleSt.scale = null; this.scaleSt.baseF = null; this.scaleSt.refit = false; this.tDisp = null; this.tOff = 0; this.synth = null; this.tpl = null; this.carry = null; this.join = null; this.joinWant = false;
  }

  /** Forget the record (the page's own began again, or its past was filled in in front): the next ingest reads it afresh. */
  reset(): void { this.clearBuf(); this.probe = null; this.lastT = -Infinity; this.gateNow = ''; }

  /** Take in the model's newest frame and whatever the page's record gained since the last call (2D `ingest`). */
  ingest(f: Any, rec: SampleFeed = feed): void {
    this.frame = f;
    const probe = useDopplerProbe.getState().probe || rec.probe;
    if (EI[probe] == null) return;
    if (probe !== this.probe) { const was = this.probe; this.clearBuf(); this.probe = probe; this.lastT = was != null && rec.t.length ? rec.last : -Infinity; this.gateNow = ''; }   // (a first vessel reads the whole record; a vessel changed to starts after it)
    this.sync();
    // a new spot along a stent is a new recording, as a new vessel is
    const g = this.rd.isStentProbe() ? this.rd.gateOf() as string : '';
    if (g !== this.gateNow) { this.gateNow = g; this.clearBuf(); }   // (from the first sample the record has not yet given: the trace starts over at the new spot)
    this.gi = g ? this.rd.gateIndex() : -1;
    this.sync();
    // (the gates' factors the samples coming in are read under, from the first of them on; a stopped stent reads 0 at every gate)
    if (g) { const r = this.rd.stentReads(1, true), z = this.rd.stentStopped() ? 0 : 1, tIn = this.buf.length ? this.buf[this.buf.length - 1]![0]! + 1e-6 : -Infinity; this.rd.facs.note(tIn, r[0] * z, r[1] * z, r[2] * z); }
    // A slide's own patient (Plan 42, Mohammad 23 Nov: the acute clot slide read "31 cm/s Hepatopetal" in a portal vein the slide has occluded): the live model is part-way through its eased change to the
    // slide's state, so its samples are some in-between patient's. On a slide with a pinned velocity the record is the replay (below) scaled to the pin from the first frame, as a lapse's is to its vessel's mean.
    const pin = f.clock === 'disease' ? NaN : this.pinnedRecord();
    if (f.clock === 'disease' || (Number.isFinite(pin) && this.synth)) {
      // (A time lapse has no bedside samples: the model jumps a day at a time. The trace keeps scrolling at bedside speed by replaying the last recorded beats, scaled so their mean eases to the
      // vessel's current mean velocity, 2D doppler.js startSynth / runSynth.)
      if (!this.synth && this.buf.length) this.synth = this.startSynth();
      if (!this.synth) { this.sync(); return; }
      const s = f.samples as { vel?: ArrayLike<number> } | null | undefined;
      if (Number.isFinite(pin)) this.synth.target = pin;
      else if (s?.vel?.length) this.synth.target = s.vel[s.vel.length - 1]!;
      this.synth.still = f.resp === false;
      // A lapse without respiration shows none from its first frame: the replay and the trace already drawn go flat at once.
      if (this.synth.still && !this.synth.flat) {
        const sy = this.synth, tp = this.tpl!;
        sy.flat = true; sy.amp = 0;
        for (const q of this.buf) { q[1] = sy.mean; if (tp.hasPair) q[2] = tp.pm; }
        for (const q of tp.pts) { q[1] = sy.mean; if (tp.hasPair) q[2] = tp.pm; }
      }
      if (f.running) this.runSynth();
    } else {
      // (the bedside clock is back: its samples follow on from where the replay ended, shifted by tOff)
      if (this.synth) { this.carry = this.synth.t + 0.02; this.synth = null; if (this.pinDriven) { this.pinDriven = false; this.lastT = rec.t.length ? rec.t[rec.t.length - 1]! : this.lastT; } }   // (a slide's replay ran beside the page's record: only what is taken from now on is new)
      // (the record the page keeps, from the first sample after the last one taken: the record is trimmed from the front, so places are found by time)
      const T = rec.t;
      if (T.length && T[T.length - 1]! < this.lastT - 1e-9) {   // (the page's record began again)
        if (this.carry != null) this.lastT = -Infinity;   // (a state loaded at the end of a lapse: the trace carries on from where it is)
        else { this.clearBuf(); this.lastT = -Infinity; }
      }
      let lo = 0, hi = T.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (T[m]! <= this.lastT) lo = m + 1; else hi = m; }
      if (this.carry != null && lo < T.length) { this.tOff = this.carry - T[lo]!; this.carry = null; this.joinWant = true; }
      else if (this.tOff && this.buf.length && lo < T.length && T[lo]! + this.tOff < this.buf[this.buf.length - 1]![0]! - 1e-9) this.tOff = this.buf[this.buf.length - 1]![0]! + 0.02 - T[lo]!;
      const vel = rec.ch.vel, ph = rec.ch.ph, pair = rec.ch[pairOf(this.rd.meta().kind) === 'PV_TRUNK' ? 'pvVel' : 'hvVel'];
      for (let i = lo; i < T.length; i++) {
        const t = T[i]! + this.tOff;
        let v = vel[i]!, v2 = pair[i] ?? NaN;
        // (A sample with no velocity is of another vessel, from before the probe moved: it draws no line, so it is not recorded; its beat still counts.)
        if (Number.isFinite(v)) {
          // (the bedside follows a replay: its first sample is not where the replay ended, so the difference eases out, never a step)
          if (this.joinWant && this.buf.length) {
            const e = this.buf[this.buf.length - 1]!;
            this.join = { t0: t, o1: e[1]! - v, o2: Number.isFinite(e[2]) && Number.isFinite(v2) ? e[2]! - v2 : 0 };
          }
          this.joinWant = false;
          const jn = this.join;
          if (jn) { const a = (t - jn.t0) / JOIN_S; if (a >= 1) this.join = null; else { const e = 1 - smooth01(Math.max(0, a)); v += jn.o1 * e; if (Number.isFinite(v2)) v2 += jn.o2 * e; } }
          this.buf.push([t, v, v2]);
        }
        const p = ph[i];
        if (p != null && Number.isFinite(p)) { if (p < this.lastPh - 0.5) this.rd.beatT[this.beatN++ % 16] = t; this.lastPh = p; }
        this.lastT = T[i]!;
      }
    }
    // (a slide with its own velocity: from the live beats just taken the replay starts, and the whole record is that patient's from this frame on)
    if (Number.isFinite(pin) && !this.synth && this.buf.length) { this.synth = this.startSynth(); if (this.synth) this.adoptPin(pin); }
    if (!this.buf.length) { this.sync(); return; }
    const tNow = this.buf[this.buf.length - 1]![0]!;
    if (f.settling) this.heldTo = tNow;
    let cut = 0; while (cut < this.buf.length && this.buf[cut]![0]! < tNow - KEEP) cut++;
    if (cut && (cut >= 256 || cut * 4 >= this.buf.length)) { this.buf.splice(0, cut); this.rd.facs.prune(this.buf[0]![0]!); }
    this.sync();
  }

  /** The last whole beats of the record (up to about 6 s of them, a breath's worth: the atrial reversal comes and goes with the breath), kept as the beats a time lapse or a slide's own patient replays (2D startSynth); null when too little is recorded.
   *  The template starts and ends where the cardiac phase wraps (the record's own beat marks), so its loop joins the end of a beat to the start of the next and every wave (a, S, v, D) is kept whole:
   *  a cut at 1 s or 3 s of clock time ends part-way through a beat, and the join blended the late diastole, where the atrial reversal is, into the start of the template (23 Nov: the hepatic vein
   *  read "Biphasic", V-shaped dips with nothing above the baseline). Without beat marks (a non-pulsatile record) the cut stays the last 3 s. */
  private startSynth() {
    const buf = this.buf, tEnd = buf[buf.length - 1]![0]!, t0Buf = buf[0]![0]!;
    const marks: number[] = [];
    for (let j = Math.max(0, this.beatN - 16); j < this.beatN; j++) { const b = this.rd.beatT[j % 16] as number; if (b >= t0Buf && b <= tEnd) marks.push(b); }
    marks.sort((a, b) => a - b);
    let from = tEnd - 3, to = tEnd, mk: number[] = [], live = 0;
    if (marks.length >= 2) {
      const last = marks[marks.length - 1]!;
      // (the template starts at the beat start, within BEAT_TEMPLATE_S of the last, whose value and slope are nearest the last's: where the replay loops, the end then meets the start, the breath included)
      const at = (t: number) => { let j = 0; while (j < buf.length - 1 && buf[j + 1]![0]! <= t) j++; const a = buf[j]!, b = buf[Math.min(buf.length - 1, j + 1)]!; return b[0]! > a[0]! ? a[1]! + (b[1]! - a[1]!) * clamp((t - a[0]!) / (b[0]! - a[0]!), 0, 1) : a[1]!; };
      const v1 = at(last), s1 = at(last + 0.1) - v1, lowest = marks.length - 2;
      let i = lowest; while (i > 0 && last - marks[i - 1]! <= BEAT_TEMPLATE_S) i--;
      let bi = lowest, bs = Infinity;
      for (let q = i; q <= lowest; q++) {
        if (this.pinned && last - marks[q]! < MIN_PINNED_TEMPLATE_S && q > i) continue;
        const sc = Math.abs(at(marks[q]!) - v1) + 0.5 * Math.abs((at(marks[q]! + 0.1) - at(marks[q]!)) - s1) - 0.02 * (last - marks[q]!);
        if (sc < bs) { bs = sc; bi = q; }
      }
      i = bi;
      from = marks[i]!; to = last;
      mk = marks.slice(i).map((b) => b - from);   // (the template's beat starts, from 0 to L)
      live = clamp((tEnd - last) / ((last - from) / (mk.length - 1)), 0, 0.999);   // (how far into its beat the record has run at its end)
    } else if (this.pinned && tEnd - t0Buf < 4) return null;
    let i = 0; while (i < buf.length - 1 && buf[i]![0]! < from) i++;
    let e = buf.length - 1; while (e > i && buf[e]![0]! > to) e--;
    const pts: number[][] = [];   // (the template's own copies)
    for (let j = i; j <= e; j++) pts.push([buf[j]![0]!, buf[j]![1]!, buf[j]![2]!]);
    const L = pts.length ? pts[pts.length - 1]![0]! - pts[0]![0]! : 0;
    if (pts.length < 8 || L < 0.4 || (this.pinned && L < MIN_PINNED_TEMPLATE_S)) return null;   // (a slide's patient waits for 3 s of whole beats: one beat can lack the reversal the breath takes away)
    const mean = pts.reduce((a, q) => a + q[1]!, 0) / pts.length;
    // (and the paired vessel's record beside it, a slide's pair: replayed unscaled, its swings eased out with the main one's)
    const pm = pts.reduce((a, q) => a + (q[2] || 0), 0) / pts.length;
    this.tpl = { t0: pts[0]![0]!, L, pts, mean, pm, hasPair: pts.every((q) => Number.isFinite(q[2])), mk: mk.length >= 2 && mk[mk.length - 1]! < L + 0.05 ? mk : [], live };
    return { t: tEnd, wall: clock.now(), mean, target: mean, amp: 1, still: false, x: null, o1: 0, o2: 0, age: 1 };
  }
  /** The replay starts on a slide's own velocity: the record already drawn is that patient's too (its beats scaled so their mean is the pin), never the in-between patient's the live model was at. */
  private adoptPin(pin: number): void {
    const sy = this.synth!, tp = this.tpl!, m0 = tp.mean, ratio = Math.abs(m0) > 2;
    this.pinDriven = true;
    sy.target = sy.mean = pin;
    for (const q of this.buf) q[1] = ratio ? q[1]! * pin / m0 : q[1]! - m0 + pin;
  }
  /** The template at position x (s from its start, 0 to L), channel j (1 the main trace, 2 the paired one), straight between its samples. */
  private tplRaw(x: number, j = 1): number {
    const pts = this.tpl!.pts;
    let lo = 0, hi = pts.length - 1;
    if (x <= pts[0]![0]! - this.tpl!.t0) return pts[0]![j]!;
    const xa = x + this.tpl!.t0;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m]![0]! <= xa) lo = m; else hi = m; }
    const ta = pts[lo]![0]!, tb = pts[hi]![0]!;
    return tb > ta ? pts[lo]![j]! + (pts[hi]![j]! - pts[lo]![j]!) * clamp((xa - ta) / (tb - ta), 0, 1) : pts[lo]![j]!;
  }
  /** The replay's output sample at its position x with the step left over from the last entry, as the card draws it (the template's swings scaled by amp, its mean the slide's now). */
  private replayAt(x: number, j: number): number {
    const sy = this.synth!, tp = this.tpl!, ease = 1 - smooth01(clamp(sy.age / JOIN_S, 0, 1));
    const raw = this.tplRaw(x, j) + (j === 1 ? sy.o1 : sy.o2) * ease;
    if (j === 2) return tp.pm + (raw - tp.pm) * sy.amp;
    const v = tp.mean + (raw - tp.mean) * sy.amp;
    return Math.abs(tp.mean) > 2 ? v * sy.mean / tp.mean : v - tp.mean + sy.mean;
  }
  /** Where the replay enters its template: at the same point of the beat as it is now (`phase`, 0 to 1; the template's beat starts are tp.mk), at the position whose value and slope are nearest the sample just drawn
   *  (`last`, `prev` 0.1 s before it, both from the card's buffer; NaN when there is nothing to match). The step left over is kept in o1 and o2 and eases out over JOIN_S: the trace is level where the replay
   *  loops or begins, never a step, whatever part of the breath the end of the template is at. */
  private enter(phase: number, last: number, prev: number): number {
    const sy = this.synth!, tp = this.tpl!, L = tp.L;
    const unit = (o: number) => (Math.abs(tp.mean) > 2 ? o * tp.mean / sy.mean : o - sy.mean + tp.mean);   // (the output back to the template's own scale)
    const can = Number.isFinite(last) && Math.abs(sy.mean) > 1e-6 && sy.amp > 0.05;
    const back = (o: number) => tp.mean + (unit(o) - tp.mean) / sy.amp;
    const u0 = can ? back(last) : NaN, du = can && Number.isFinite(prev) ? u0 - back(prev) : NaN;
    // (candidates: each beat's own point of the beat, and a little either side of it: a beat starts a few hundredths of a second early or late with the breath, nothing in its waves)
    const at: { x: number; pen: number }[] = [];
    if (tp.mk.length >= 2) {
      for (let i = 0; i < tp.mk.length - 1; i++) {
        const x0 = tp.mk[i]! + phase * (tp.mk[i + 1]! - tp.mk[i]!);
        for (let d = -0.06; d <= 0.0601; d += 0.01) if (x0 + d >= 0) at.push({ x: x0 + d, pen: 8 * Math.abs(d) });
      }
    } else for (let x = 0; x <= L - 0.5; x += 0.02) at.push({ x, pen: 0 });
    let best = at[0]!.x, bs = Infinity;
    for (const { x, pen } of at) {
      if (x > L - 0.5 && at.length > 1) continue;
      const v = this.tplRaw(x), sc = pen + (Number.isFinite(u0) ? Math.abs(v - u0) + (Number.isFinite(du) ? 0.5 * Math.abs((this.tplRaw(x + 0.1) - v) - du) : 0) : 0);
      if (sc < bs) { bs = sc; best = x; }
    }
    sy.o1 = Number.isFinite(u0) ? u0 - this.tplRaw(best) : 0;
    const l2 = this.buf[this.buf.length - 1]![2]!;
    sy.o2 = tp.hasPair && sy.amp > 0.05 && Number.isFinite(l2) ? tp.pm + (l2 - tp.pm) / sy.amp - this.tplRaw(best, 2) : 0;
    sy.age = 0;
    return best;
  }
  /** One frame of the replay: samples at bedside speed from the template, its mean easing to the vessel's now (2D runSynth). The template loops by entering itself again where the beat and the breath match (`enter`). */
  private runSynth(): void {
    const sy = this.synth!, tp = this.tpl!;
    const now = clock.now();
    const dt = Math.min(0.25, (now - sy.wall) / 1000);
    sy.wall = now;
    for (let k = 0, n = Math.ceil(dt / 0.02); k < n; k++) {
      const h = dt / n;
      sy.t += h;
      sy.mean += (sy.target - sy.mean) * Math.min(1, h * 3);
      // (The template was recorded with breathing; a lapse run without respiration eases its swings out.)
      sy.amp = clamp(sy.amp + (sy.still ? -1.5 : 1.5) * h, 0, 1);
      if (sy.x == null || sy.x >= tp.L) {
        // (the first entry carries on from the live record's end; a later one from the template's own end, which is the start of a beat)
        const b = this.buf, e = b[b.length - 1]!;
        let j = b.length - 1; while (j > 0 && e[0]! - b[j]![0]! < 0.1) j--;
        const over = sy.x == null ? 0 : sy.x - tp.L;
        sy.x = this.enter(sy.x == null ? tp.live : 0, e[1]!, b[j]![1]!) + over;
      }
      sy.x += h; sy.age += h;
      this.buf.push([sy.t, this.replayAt(sy.x, 1), tp.hasPair ? this.replayAt(sy.x, 2) : NaN]);
    }
  }

  /** The vessel's row in the PROBES table. */
  meta(): Any { this.sync(); return this.rd.meta(); }
  /** The window in use: a narrow trace starts on 3 s, a wide one on 6 s, once for each showing; a tap picks by hand. */
  pickWindow(plotW: number): void {
    if (!this.pickNext || this.manualSweep) return;
    this.pickNext = false;
    this.sweepIndex = windowIndexFor(plotW);
  }
  cycleSweep(): void { this.manualSweep = true; this.sweepIndex = (this.sweepIndex + 1) % SWEEP_SECONDS.length; this.scaleSt.scale = null; }

  // ── the report ──
  /** The words and numbers beside the trace (2D `updateReport`). */
  report(): Report {
    this.sync();
    const rd = this.rd, f = this.frame;
    const kind = this.probe ? rd.meta().kind as string : 'portal';
    const base = { kind, tiles: this.tilesFor(null), gauge: null, aria: '' };
    const r = this.probe ? rd.reading() : null;
    if (!r || (this.pinned && !this.synth)) {   // (a slide with its own velocity reads it only once the replay stands on it: never the live patient's)
      return { ...base, acquiring: true, text: f?.clock === 'disease' ? 'Not available during time lapse' : 'Acquiring…', dir: f?.clock === 'disease' ? 'Not available during time lapse' : 'Acquiring…', sev: '', vel: '—', none: false, pattern: '', note: '' };
    }
    const p = rd.meta();
    const gf = rd.gateFactor() as number;
    // (On a slide the reading is steady, and while it agrees with the slide's own velocity in this vessel it is that one: one number on every screen.)
    let rm = this.slide ? this.steadyMean(r.mean * gf) / gf : r.mean;
    const fixed = this.slide ? this.pinnedVel() : NaN;
    if (Number.isFinite(fixed) && Math.abs(Math.abs(rm) - fixed) < Math.max(4, fixed * 0.12)) rm = (rm < 0 ? -1 : 1) * fixed;
    const open = Math.abs(rm);
    const mean = rm * gf;
    rd.SEEN.gated = mean; rd.SEEN.open = open;
    const it = rd.interpret(r, gf, rd.SEEN);
    // (In a slide's strip the reading is signed as the trace is drawn, the scanner's way: a hepatic vein's forward flow runs away from the probe, so it reads "−18 · Toward the heart".)
    const drawn = this.slide ? mean * (rd.pol() as number) : mean;
    const dp = Math.abs(drawn) < 10 ? 1 : 0;
    const tiles: Tile[] = this.tilesFor(r);
    const T = (k: string) => tiles.find((t) => t.k === k)!;
    T('Speed').v = num(drawn, dp); T('Speed').unit = 'cm/s';
    // peak: the extreme farthest from zero, whichever the direction; a portal vein's Max and Trough are the median beat's
    const beatwise = p.kind === 'portal' && r.beatPi >= 0, hiV = beatwise ? r.beatHi : r.vmax, loV = beatwise ? r.beatLo : r.vmin;
    const sp = Math.abs(r.mean) * Math.sign(r.mean || 1), hiB = beatwise ? Math.max(hiV, sp) : hiV, loB = beatwise ? Math.min(loV, sp) : loV;
    const big = Math.abs(hiB) >= Math.abs(loB), pk = big ? hiB : loB, tr = big ? loB : hiB;
    T('Peak').v = num(pk * gf); T('Peak').unit = 'cm/s';
    T('Trough').v = num(tr * gf); T('Trough').unit = 'cm/s';
    const shownV = (v: number) => Math.sign(v) * Number(fmt(Math.abs(v * gf), 0));
    const piV = p.kind === 'artery' ? (Math.abs(r.mean) > 0.5 ? (r.vmax - r.vmin) / Math.abs(r.mean) : 0) : pulsatility(shownV(hiB), shownV(loB));
    T('Pulsatility').v = fmt(piV, 2);
    if (p.kind === 'artery') {
      // the hepatic artery's resistive index, RI = (PSV − EDV) / PSV: the one number the pattern line prints ("Resistive index 0.62", doppler-reading.copied.js) read from the same window,
      // judged against the usual 0.55 to 0.80 (a buffer-dilated artery falls under it; a stiff or obstructed one runs over it)
      const ri = r.vmax > 0.5 ? (r.vmax - Math.max(0, r.vmin)) / r.vmax : 0, tr = T('RI');
      tr.v = it.dir === 'No flow' || !(ri > 0) ? '—' : fmt(ri, 2);
      tr.out = tr.v !== '—' && (ri < HA_RI[0] || ri > HA_RI[1]);
      tr.title = `Resistive index = (peak systolic − end-diastolic velocity) / peak systolic. Usual ${HA_RI[0].toFixed(2)} to ${HA_RI[1].toFixed(2)} in the hepatic artery. Lower: the artery is dilated (the arterial buffer after a fall in portal flow, or an arteriovenous shunt); higher: a stiff graft, a narrowed or obstructed artery.`;
    }
    if (this.probe === 'PV_TRUNK' && f?.D) {
      const D = Math.max(0.5, f.D[EI[this.probe]!]) / 10, area = Math.PI * D * D / 4;
      const vm = Math.abs(r.mean) / dopplerK(EDGES[EI[this.probe]!]);   // Moriyasu's index uses the mean across the lumen
      T('CI').v = vm > 0.3 ? fmt(area / vm, 2) : '—';
    }
    if (p.kind === 'tips') {
      const at = rd.gateOf(), reads = rd.shownReads(open), sn = rd.normalOf(p), kinds = rd.gateKinds();
      for (let i = 0; i < SEGS.length; i++) {
        const seg = SEGS[i]![0], name = SEGS[i]![1], v = reads[i];
        const t = T(name);
        t.v = num(v); t.unit = 'cm/s'; t.here = seg === at; t.seg = seg;
        t.out = sn === p.normal && (v < sn[0] || (v > sn[1] && kinds[i] !== 'reduction'));
      }
    }
    // the usual range as the Speed tile's own small scale
    const normal = rd.normalOf(p) as number[] | null;
    this.speedOn = !!normal; T('Speed').show = !!normal;
    let gauge: Gauge | null = null;
    if (normal) {
      const n0 = normal[0]!, n1 = normal[1]!, openEnd = !Number.isFinite(n1);
      const hi = Math.max(Math.round((openEnd ? 2 * n0 : n1) * 1.7), Math.ceil(mean * 1.1)), lo = Math.min(0, Math.floor(mean * 1.1));
      const pos = (v: number) => Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100));
      const model = p.kind === 'tips' && normal !== p.normal;
      const out = !it.expected && !(p.kind === 'tips' && model) && (mean < n0 || mean > n1);
      gauge = { p0: pos(n0), p1: pos(n1), pm: pos(mean), pz: pos(0), n0, n1, open: openEnd, out, model,
        title: model ? `Model band ${n0}–${n1} cm/s (provisional: scaled from the reported 8 to 10 mm range)` : openEnd ? `Usual ≥${n0} cm/s` : `Usual ${n0}–${n1} cm/s` };
      T('Speed').out = out;
      T('Speed').title = gauge.title;
    }
    const none = it.dir === 'No flow';
    return {
      acquiring: false, text: '', dir: it.dir, sev: it.sev, vel: num(drawn, dp), none, pattern: it.pattern, note: it.note, tiles, gauge, kind,
      aria: `Spectral Doppler, ${EDGES[EI[this.probe!]!].label}, ${this.sweep}-second sweep: ${it.dir}, ${num(r.mean, 0)} centimeters per second, ${it.pattern}.`,
    };
  }

  /** The tiles a vessel has: a stent its three segments in place of trough and pulsatility; the main portal vein its congestion index; the hepatic veins and the IVC no pulsatility. */
  private tilesFor(r: unknown): Tile[] {
    const kind = this.probe ? this.rd.meta().kind as string : 'portal';
    const stent = kind === 'tips';
    const mk = (k: string, label: string, show: boolean): Tile => ({ k, label, v: '—', unit: '', show, title: STAT_TITLE[k as keyof typeof STAT_TITLE] });
    void r;
    return [
      mk('Speed', 'Speed', this.speedOn), mk('Peak', 'Max', true), mk('Trough', 'Trough', !stent), mk('Pulsatility', 'Pulsatility', !stent && kind !== 'hepatic' && kind !== 'ivc' && kind !== 'artery'), mk('RI', 'RI', kind === 'artery'),
      mk('CI', 'CI', this.probe === 'PV_TRUNK'), ...(SEGS as string[][]).map(([seg, name]) => ({ ...mk(name, name, stent), seg })),
    ];
  }

  // ── the spectrum ──
  /** Model time at the right edge: ~0.16 s of wall time behind the newest sample so there is always data to draw, eased back to that lag, not jumped (2D clockNow). */
  private clockNow(nowMs: number): number {
    const last = this.buf[this.buf.length - 1]![0]!, f = this.frame;
    const dt = this.wallLast ? Math.min(0.1, (nowMs - this.wallLast) / 1000) : 0;
    this.wallLast = nowMs;
    const speed = f?.clock === 'disease' ? 1 : (f?.speed || 1);
    const target = last - SETTLE_LAG * speed, live = !!f?.running;
    if (this.tDisp == null || Math.abs(target - this.tDisp) > 1.2 * speed) this.tDisp = live ? target : last;
    else if (live) { this.tDisp += dt * speed; this.tDisp += (target - this.tDisp) * Math.min(1, dt * 2.5); }
    return this.tDisp = Math.min(this.tDisp, last);
  }
  /** True while the trace is moving by itself (the model runs, on the seconds clock or in a time lapse's replay): the pane holds the clock. */
  get live(): boolean { return !!this.frame?.running; }

  /** The mean velocity at time t, signed for the display (NaN outside the record); binary search, the record is sorted (2D velAt). */
  private velAt(t: number, pol: number, gf: number): number {
    const b = this.buf, n = b.length;
    if (!n || t < b[0]![0]! || t > b[n - 1]![0]!) return NaN;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (b[m]![0]! <= t) lo = m; else hi = m; }
    const [ta, va] = b[lo] as [number, number], [tb, vb] = b[hi] as [number, number];
    const g = this.gi >= 0 ? this.rd.facs.at(t, this.gi) : gf;
    return pol * g * (tb > ta ? va + (vb - va) * clamp((t - ta) / (tb - ta), 0, 1) : va);
  }

  /** The chart frame for a box w × h (CSS px) at wall time `nowMs`. `ink` is the box's own colours (the monitor is black in every look, as the 2D one is). */
  frameFor(w: number, h: number, nowMs: number, label: string, ink?: Rgba): Frame {
    if (ink) this.ink = ink;
    const shapes: Shape[] = [];
    const out: Frame = { w, h, shapes, label, scrolls: true };
    const white = (a: number): Rgba => [1, 1, 1, a];
    this.spec = null;
    if (!this.gpu) shapes.push({ k: 'rect', x: 0, y: 0, w, h, r: 12, fill: [0, 0, 0, 1], key: 'plate' });   // (with the GPU's picture under the shapes the box's own black shows)
    if (w < 60 || h < 60) return out;
    this.sync();
    const rd = this.rd, f = this.frame;
    const padL = PAD_L as number, padR = PAD_R as number, ov = this.ovTop != null, padT = ov ? this.ovTop! : 26, padB = ov ? 34 : 20, yLab = ov ? h - 11 : 13;
    // (A slide's paired trace takes a band at the foot of the trace area: the main trace is shorter by it, the card the same size.)
    const W = Math.max(1, Math.round(w - padL - padR)), Hall = Math.max(1, Math.round(h - padT - padB)), PB = this.opts.pair ? pairBand(Hall) as number : 0, H = PB ? Hall - PB - PAIR_GAP : Hall;
    this.motion = false;
    // (this frame's time, and the calipers' pick from it, before the strip: the index there is the marks' own, this frame)
    const tNow0 = this.buf.length >= 2 ? this.clockNow(nowMs) : null;
    const kind0: string = this.probe ? rd.meta().kind : 'portal';
    const cal = this.opts.calipers && tNow0 != null && this.probe ? this.caliperNow(tNow0, W, rd, kind0) : null;
    const text = (x: number, y: number, s: string, o: Partial<Extract<Shape, { k: 'text' }>> = {}) => { shapes.push({ k: 'text', x, y, s, size: 12, weight: 500, color: white(0.5), baseline: 'middle', ...o }); };
    const pm: Any = this.probe ? rd.meta() : (PROBES as Any[])[0];
    const gate = this.probe && rd.isStentProbe() ? rd.gateOf() as string : '';
    const name = pm ? (gate ? pm.byGate[gate] : pm.name) : '';
    text(padL, yLab, name, { weight: 600, color: white(0.86), key: 'name' });
    const lw = measure(name, 12, 600);
    const mm = this.probe ? rd.svMm() as number : 4;
    const settings = (SETTINGS as string[][][][])[this.mode === 'spectrum' ? 0 : 1]![mm]![this.sweepIndex]!;
    let x0 = padL + lw + 12;
    // (the calipers' index in the marks' colour, first after the probe's name: the pulsatility on a vein, the resistive index written out on an artery)
    const doppler = this.dopplerInk();
    if (cal && kind0 !== 'artery') {
      const pi = `PI ${fmt(Math.max(0, Math.min(3, cal.pi)), 2)}`;
      text(x0, yLab, pi, { weight: 600, color: doppler, key: 'cal-pi' });
      x0 += measure(pi, 12, 700) + 12;
    } else if (cal) {
      const ri = this.riOf(cal, rd);
      if (ri) {
        const spare = w - padR - x0 - 6 - measure(settings[0]!, 12, 500) - 12;
        let fi = 0; while (fi < 3 && measure(ri[fi]!, 12, 700) > spare) fi++;
        text(x0, yLab, ri[fi]!, { weight: 600, color: doppler, key: 'cal-ri' });
        x0 += measure(ri[fi]!, 12, 700) + 12;
      }
    }
    const room = w - padR - x0 - 6;
    let np = settings.length;
    while (np > 1 && measure(settings[np - 1]!, 12, 500) > room) np--;
    if (measure(settings[np - 1]!, 12, 500) <= room) text(x0, yLab, settings[np - 1]!, { key: 'settings' });
    if (this.buf.length < 2) {
      this.tDisp = null;
      text(w / 2, h / 2, f?.clock === 'disease' ? 'Doppler sampling needs real time: return to the seconds clock.' : 'Acquiring…', { anchor: 'middle', color: white(0.55), key: 'acq' });
      return out;
    }
    const tNow = tNow0!, sweep = this.sweep;
    // Scale: the peak fills about 85% of its side, on the scanner's own velocity steps. Like a sonographer, the display changes scale or baseline only when the signal would clip or has
    // stayed small for a few seconds, never continuously.
    let pos = 0, neg = 0;
    const sgn = rd.pol() as number;
    const since = this.heldTo != null && tNow - this.heldTo < sweep ? this.heldTo : -Infinity;
    const HOLD = rd.HOLD_AFTER as number;
    const holding = this.scaleSt.scale != null && this.heldTo != null && tNow - this.heldTo < HOLD;
    for (const [t, v0] of this.buf as [number, number][]) if (t >= Math.max(tNow - sweep, since) && t <= tNow) { const v = sgn * v0 * (this.gi >= 0 ? rd.facs.at(t, this.gi) : 1); if (v > pos) pos = v; if (-v > neg) neg = -v; }
    const gf = this.probe ? rd.gateFactor() as number : 1;
    const k = this.probe ? dopplerK(EDGES[EI[this.probe]!]) as number : 1;
    pos *= k; neg *= k;
    // (the scale always holds the peak the reading beside it reports)
    const r = this.probe ? rd.reading() : null;
    if (r) {
      const hi = r.vmax * gf * sgn, lo = r.vmin * gf * sgn;
      if (hi > pos) pos = hi; if (-hi > neg) neg = -hi;
      if (lo > pos) pos = lo; if (-lo > neg) neg = -lo;
    }
    const st = this.scaleSt;
    const need = Math.max(pos, neg, 8) / 0.85;
    const target = scaleFor(Math.max(pos, neg));
    const tbRaw = pos + neg < 1 ? 0.5 : pos > 0 && neg < pos * 0.08 ? 0.88 : neg > 0 && pos < neg * 0.08 ? 0.12 : clamp(0.1 + 0.8 * (pos / (pos + neg)), 0.12, 0.88);
    const tbF = Math.round(tbRaw * 10) / 10;
    const fits = st.scale != null && need <= st.scale && (pos >= neg) === (st.baseF == null || st.baseF >= 0.5);
    fitScale(st, { fixed: this.opts.fixed, holding, fits, target, tbF, tNow });
    const scale = st.scale as number, baseF = st.baseF as number;
    const baseY = Math.round(H * baseF);
    const pxPerV = (baseF >= 0.5 ? baseY : H - baseY) / scale;
    const yB = padT + baseY;
    // the spectrum, one line to a device pixel, the newest at the right edge; a line's number is its place in time, so its grain scrolls with the trace (2D: g.cps = RW / sweep)
    const dpr = this.dpr, RW = Math.max(1, Math.round(W * dpr)), RH = Math.max(1, Math.round(H * dpr));
    const cps = RW / sweep, cNow = Math.floor(tNow * cps);
    const wfV = Math.max(1.2, 0.025 * scale), uK = 1 / (0.7 * scale);
    if (this.gpu) this.spec = this.lines(RW, RH, cps, cNow, { sgn, gf, k, scale, baseY, pxPerV, H, dpr, padL, padT, wfV, uK });
    else this.shapeLines(shapes, { W, H, padL, padT, yB, pxPerV, sgn, gf, k, scale, sweep, tNow, wfV, uK });
    // baseline
    shapes.push({ k: 'line', x1: padL, y1: yB + 0.5, x2: padL + W, y2: yB + 0.5, pen: { color: white(0.8), w: 1 } });
    // the velocity scale on the right: a labelled tick every 1, 2, 5, 10, 20, 50... cm/s (the first that gives at most five a side), a half tick between
    const LAB = [1, 2, 5, 10, 20, 50, 100, 200, 500];
    let lab = 500;
    for (let i = 0; i < LAB.length; i++) if (scale / LAB[i]! <= 5 && LAB[i]! * pxPerV >= 18) { lab = LAB[i]!; break; }
    const minor = lab / 2;
    for (let q = -Math.ceil(scale / minor); q <= Math.ceil(scale / minor); q++) {
      const v = q * minor, y = padT + baseY - v * pxPerV;
      if (y < padT - 1 || y > padT + H + 1) continue;
      const major = q % 2 === 0;
      shapes.push({ k: 'line', x1: padL + W + 3, y1: Math.round(y) + 0.5, x2: padL + W + 3 + (major ? 6 : 3), y2: Math.round(y) + 0.5, pen: { color: white(0.55), w: 1 } });
      if (major && y > padT + 5 && y < padT + H - 5) text(padL + W + 13, y, v === 0 ? '0' : num(v), { color: white(0.78), key: `tick${q}` });
    }
    text(w - 6, yLab, 'cm/s', { anchor: 'end', key: 'unit' });
    const xAt = (t: number) => padL + (RW - 1 - (cNow - Math.floor(t * cps))) / dpr;
    this.waveLetters(shapes, pm, tNow, sweep, sgn, k, pxPerV, padT, baseY, H, W, padL, xAt, nowMs);
    if (cal) this.calipersDraw(shapes, cal, nowMs, sgn, k, gf, pxPerV, padT, baseY, H, W, padL);
    if (PB) this.pairDraw(shapes, kind0, tNow, sweep, padT + H + PAIR_GAP, PB, padL, W, xAt, text);
    // one tick a second along the bottom, scrolling with the trace
    for (let sec = Math.ceil(tNow - sweep); sec <= tNow; sec++) {
      const x = Math.round(padL + ((sec - (tNow - sweep)) / sweep) * W);
      shapes.push({ k: 'line', x1: x + 0.5, y1: padT + H + 5, x2: x + 0.5, y2: padT + H + 9, pen: { color: white(0.4), w: 1 } });
    }
    void THETA;
    return out;
  }


  private dopplerInk(): Rgba { return this.ink; }

  /** The calipers' pick for this frame (2D calNow): on a portal vein they stand on the beat the reading's pulsatility and pattern come from. */
  private caliperNow(tNow: number, W: number, rd: Any, kind: string) {
    const r = rd.reading(), beat = kind === 'portal' && r && r.beatPi >= 0;
    const c = caliperFrame(this.buf, tNow, this.sweep, W, 2, beat ? r.beatB0 : NaN, beat ? r.beatB1 : NaN) as { hi: number[]; lo: number[]; pi: number; gf?: number } | null;
    if (c) c.gf = rd.gateFactor();
    else { this.calMk.hi.on = this.calMk.lo.on = false; }
    return c;
  }

  /** The artery's working, "RI = (PSV − EDV) / PSV = (62 − 20) / 62 = 0.68", the four forms longest first, from the marks as they print. */
  private riOf(cal: { hi: number[]; lo: number[]; pi: number; gf?: number }, rd: Any): string[] | null {
    if (!this.probe) return null;
    const sg0 = rd.pol() as number, k0 = dopplerK(EDGES[EI[this.probe]!]) as number, gf = cal.gf ?? 1;
    const a = Math.round(sg0 * cal.hi[1]! * k0 * gf), b = Math.round(sg0 * cal.lo[1]! * k0 * gf);
    const flip = Math.abs(a) >= Math.abs(b) ? 1 : -1, psv = Math.abs(flip === 1 ? a : b), edv = flip === 1 ? b : a, sg = (flip === 1 ? a : b) < 0 ? -1 : 1;
    return riForms(psv, sg * edv, Math.round(Math.max(0, cal.pi) * 100) / 100) as string[];
  }

  /** The GPU's trace for this frame (2D `lineParams`, doppler.js): every line's numbers by screen column, and the shaders' geometry. A line's jitter and gain follow the lines before it
   *  (jit = 0.45 jit + rn, gain = 0.5 gain + rn: the outline's jag and the band's shimmer), here from a hash of the line's number, started a dozen lines early so the first columns carry no start-up. */
  private lines(RW: number, RH: number, cps: number, cNow: number, g: { sgn: number; gf: number; k: number; scale: number; baseY: number; pxPerV: number; H: number; dpr: number; padL: number; padT: number; wfV: number; uK: number }): SpectrumDraw {
    if (this.colA.length < RW * 4) { this.colA = new Float32Array(RW * 4); this.colB = new Float32Array(RW * 4); }
    const A = this.colA, B = this.colB, BAND = { P: 0, L: 0, sigHi: 0, sigLo: 0 };
    const fixed = this.opts.fixed, span = fixed ? g.H / g.pxPerV : 0, topV = g.baseY / g.pxPerV, botV = (g.H - g.baseY) / g.pxPerV;
    let jit = 0, lg = 0;
    for (let c = cNow - RW + 1 - 12; c <= cNow; c++) {
      jit = 0.45 * jit + rnHash(c, 1); lg = 0.5 * lg + rnHash(c, 2);
      const j = c - (cNow - RW + 1);
      if (j < 0) continue;
      const q = j * 4, cn = c & 0xFFFFF;
      const v = this.velAt(c / cps, g.sgn, g.gf), av = Math.abs(v), s = v < 0 ? -1 : 1;
      if (Number.isNaN(v) || av <= 0.3) { A[q] = 0; A[q + 1] = 0; A[q + 2] = 1; A[q + 3] = 1; B[q] = 1; B[q + 1] = 0; B[q + 2] = 0; B[q + 3] = cn; continue; }
      const b = lineBand(av, g.k, jit, BAND);
      let lineS = 0;
      if (this.mode !== 'spectrum') {
        const vp = this.velAt(c / cps - 0.3, g.sgn, g.gf);
        lineS = (Number.isNaN(vp) ? 0 : Math.abs(v - vp) / (0.45 * g.scale)) + 0.5 * clamp((av - 80) / 120, 0, 1);
      }
      const wraps = span > 0 && b.P > (s > 0 ? topV : botV);
      A[q] = b.P; A[q + 1] = b.L; A[q + 2] = b.sigHi; A[q + 3] = b.sigLo;
      B[q] = 10 ** (0.12 * lg); B[q + 1] = lineS; B[q + 2] = 1 + (wraps ? 2 : 0) + (s < 0 ? 4 : 0); B[q + 3] = cn;
    }
    const rPxPerV = g.pxPerV * g.dpr;
    return {
      dx: Math.round(g.padL * g.dpr), dy: Math.round(g.padT * g.dpr), RW, RH,
      rBase: g.baseY * g.dpr, rPxPerV, fade: 7 / rPxPerV, wfV: g.wfV, spkPx: Math.max(2, RH / 110), spkMix: clamp(1 - 1 / g.dpr, 0.3, 0.65), span, uK: g.uK,
      mode: this.mode === 'spectrum' ? 0 : this.mode === 'velocity' ? 1 : 2,
      noiseA: this.mode === 'spectrum' ? 1 : 0.3, wallBase: g.baseY * g.dpr, wallHalf: g.wfV * rPxPerV * 1.6, nBin: Math.max(1.5, RH / 200) * 2, nRun: Math.max(1, Math.round((1 + Math.max(1, g.dpr)) / 2)),
      colA: A, colB: B,
    };
  }

  /** The spectrum laid from shapes, one 2 px line at a time: the stand-in where the GPU's own picture cannot be made (no WebGL2 on the chart drawer, or its program failed). */
  private shapeLines(shapes: Shape[], g: { W: number; H: number; padL: number; padT: number; yB: number; pxPerV: number; sgn: number; gf: number; k: number; scale: number; sweep: number; tNow: number; wfV: number; uK: number }): void {
    const { W, H, padL, padT, yB, pxPerV, sgn, gf, k, scale, wfV, uK } = g;
    const NC = Math.max(1, Math.floor(W / COL)), cps = NC / g.sweep, cNow = Math.floor(g.tNow * cps);
    const BAND = { P: 0, L: 0, sigHi: 0, sigLo: 0 };
    shapes.push({ k: 'clip', x: padL, y: padT, w: W, h: H });
    for (let j = 0; j < NC; j++) {
      const c = cNow - (NC - 1 - j), t = c / cps;
      const v = this.velAt(t, sgn, gf);
      if (Number.isNaN(v)) continue;
      const av = Math.abs(v), s = v < 0 ? -1 : 1;
      if (av <= 0.3) continue;
      const jit = rnHash(c, 1), gain = 10 ** (0.12 * rnHash(c, 2));
      const b = lineBand(av, k, jit, BAND), P = b.P;
      const lo = Math.max(b.L, wfV * 0.8);   // (the wall filter takes the slow signal at the baseline)
      if (P <= lo) continue;
      const x = padL + j * COL;
      let lineS = 0;
      if (this.mode !== 'spectrum') {
        const vp = this.velAt(t - 0.3, sgn, gf);
        lineS = (Number.isNaN(vp) ? 0 : Math.abs(v - vp) / (0.45 * scale)) + 0.5 * clamp((av - 80) / 120, 0, 1);
      }
      // the band in five stretches from the baseline to the outline: the shader's power profile S, brightest just under the outline (0.88 of the way), dimmer to the baseline
      const edges = [0, 0.4, 0.7, 0.86, 0.95, 1];
      for (let q = 0; q < edges.length - 1; q++) {
        const fa = edges[q]!, fb = edges[q + 1]!, fm = (fa + fb) / 2;
        const Sq = Math.min(1, 0.05 + 0.1 * fm + 0.9 * Math.exp(-(((0.88 - fm) / 0.16) ** 2)));
        const sp = 0.55 + 0.9 * unit(c, 10 + q);
        const I = clamp(Sq * gain * sp, 0, 1) ** 1.2;
        if (I < 0.02) continue;
        const va = lo + (P - lo) * fa, vb = lo + (P - lo) * fb;
        const ya = yB - s * va * pxPerV, yb = yB - s * vb * pxPerV;
        shapes.push({ k: 'rect', x, y: Math.min(ya, yb), w: COL, h: Math.max(0.5, Math.abs(yb - ya)), fill: this.shade(I, s * Math.min(1, ((va + vb) / 2) * uK), lineS) });
      }
    }
    shapes.push({ k: 'unclip' });
  }

  /** The hepatic vein's a, S, v and D named on the newest settled whole beat (2D drawWaves): the letters are pinned to that beat's own moments so they scroll with it; when the beat is about to leave
   *  the screen they fade out and the next whole beat gets them, fading in. */
  private waveLetters(shapes: Shape[], pm: Any, tNow: number, sweep: number, sgn: number, k: number, pxPerV: number, padT: number, baseY: number, H: number, W: number, padL: number, xAt: (t: number) => number, nowMs: number): void {
    if (!(this.opts.waves && pm?.kind === 'hepatic')) { this.wl = null; return; }
    const dtL = this.labAt ? Math.min(0.1, (nowMs - this.labAt) / 1000) : 0; this.labAt = nowMs;
    const edge = tNow - sweep + 0.7;   // a beat starting before this is about to leave
    let wl = this.wl;
    if (wl && (wl.sgn !== sgn || wl.pts[0][0] < edge)) wl.out = true;
    if (!wl || (wl.out && wl.alpha <= 0)) {
      wl = this.wl = null;
      const pts = hvWaves(this.buf, tNow - sweep, tNow, sgn);
      if (pts && pts[0][0] >= edge) wl = this.wl = { pts, sgn, alpha: 0, out: false };
    }
    if (!wl) return;
    wl.alpha = clamp(wl.alpha + (wl.out ? -1 : 1) * dtL / (D_SURFACE / 1000), 0, 1);
    if (wl.out ? wl.alpha > 0 : wl.alpha < 1) this.motion = true;
    const A = smooth01(wl.alpha), PX = 20;
    for (const [t, lv, name] of wl.pts) {
      const up = name === 'a', x = xAt(t), y0 = padT + baseY - lv * k * pxPerV, y = up ? Math.min(y0, padT + baseY) : y0;
      if (x < padL + 2 || x > padL + W - 2) continue;
      const ty = clamp(y + (up ? -5 : 5), padT + (up ? PX + 1 : 0), padT + H - (up ? 0 : PX + 1));
      shapes.push({ k: 'text', x, y: ty, s: name, size: PX, weight: 600, color: [1, 1, 1, A], anchor: 'middle', baseline: up ? 'alphabetic' : 'top', halo: { color: [0, 0, 0, 0.9 * A], w: 5 }, key: `wave-${name}` });
    }
  }

  /** A slide's calipers: a dashed line at the highest and at the lowest velocity of the last 3 s across the trace, an upright caliper with end ticks between them at its left end and the two speeds
   *  beside its ends. When a new extreme arrives or the old one leaves, its line eases to the new level (CAL_FADE). */
  private calipersDraw(shapes: Shape[], cal: { hi: number[]; lo: number[]; gf?: number }, nowMs: number, sgn: number, k: number, gf: number, pxPerV: number, padT: number, baseY: number, H: number, W: number, padL: number): void {
    const dop = this.ink, dark: Rgba = [0, 0, 0, 0.85], gfc = cal.gf ?? gf;
    const calY = (v: number) => clamp(padT + baseY - sgn * v * k * gfc * pxPerV, padT + 2, padT + H - 2);
    const level = (m: { on: boolean; from: number; to: number; at: number }, v: number) => {
      if (!m.on) { m.on = true; m.from = v; m.to = v; m.at = nowMs; }
      else if (m.to !== v) { m.from = caliperLevel(m.from, m.to, (nowMs - m.at) / 1000); m.to = v; m.at = nowMs; }
      if ((nowMs - m.at) / 1000 < CAL_FADE) this.motion = true;
      return Math.round(calY(caliperLevel(m.from, m.to, (nowMs - m.at) / 1000))) + 0.5;
    };
    const xc = caliperX(padL, 4) as number, x1 = padL + W, T = 4;
    const lvHi = level(this.calMk.hi, cal.hi[1]!), lvLo = level(this.calMk.lo, cal.lo[1]!);
    const pen = (c: Rgba, w: number, dash?: number[]) => ({ color: c, w, ...(dash ? { dash } : {}) });
    const lines: [number, number, number, number][] = [[xc, lvHi, x1, lvHi], [xc, lvLo, x1, lvLo]];
    const ends: [number, number, number, number][] = [[xc, lvHi, xc, lvLo], [xc - T, lvHi, xc + T, lvHi], [xc - T, lvLo, xc + T, lvLo]];
    for (const [a, b, c, d] of lines) shapes.push({ k: 'line', x1: a, y1: b, x2: c, y2: d, pen: pen(dark, 3.5, [4, 3]) });
    for (const [a, b, c, d] of lines) shapes.push({ k: 'line', x1: a, y1: b, x2: c, y2: d, pen: pen([dop[0], dop[1], dop[2], 0.95], 1.5, [4, 3]) });
    for (const [a, b, c, d] of ends) shapes.push({ k: 'line', x1: a, y1: b, x2: c, y2: d, pen: pen(dark, 3.5) });
    for (const [a, b, c, d] of ends) shapes.push({ k: 'line', x1: a, y1: b, x2: c, y2: d, pen: pen(dop, 1.5) });
    // the two speeds beside the upright's ends: numbers only, in the bracket's colour, outside their lines (the other side where there is no room)
    const hiTop = lvHi <= lvLo, room = 11 / 2 + 3, top = padT + 11 / 2, bot = padT + H - 11 / 2;
    const num1 = (v: number, y: number, want: number, key: string) => {
      const fits = (sd: number) => (sd < 0 ? y - room >= top : y + room <= bot), side = fits(want) ? want : fits(-want) ? -want : want;
      shapes.push({ k: 'text', x: xc + 4 + 3, y: clamp(y + side * room, top, bot), s: num(Math.round(sgn * v * k * gfc)), size: 11, weight: 600, color: dop, baseline: 'middle', halo: { color: dark, w: 3.5 }, key });
    };
    num1(cal.hi[1]!, lvHi, hiTop ? -1 : 1, 'cal-hi'); num1(cal.lo[1]!, lvLo, hiTop ? 1 : -1, 'cal-lo');
  }

  /** A slide's paired trace: the paired vessel's velocity over the same seconds, beat for beat, slim, in a band of its own under the main trace with its own scale, named above its band. */
  private pairDraw(shapes: Shape[], kind: string, tNow: number, sweep: number, y0: number, PB: number, padL: number, W: number, xAt: (t: number) => number, text: (x: number, y: number, s: string, o?: Partial<Extract<Shape, { k: 'text' }>>) => void): void {
    const id = pairOf(kind) as string, pm = (PROBES as Any[]).find((q) => q.id === id)!, kp = dopplerK(EDGES[EI[id]!]) as number;
    const sg = (pm.away ? -1 : 1) * (this.invert ? -1 : 1) * kp;
    let pos = 0, neg = 0;
    for (const p of this.buf) { if (p[0]! < tNow - sweep || p[0]! > tNow || !Number.isFinite(p[2]!)) continue; const v = sg * p[2]!; if (v > pos) pos = v; if (-v > neg) neg = -v; }
    // (its scale holds still as the main one does: it grows at once when the trace would clip, and shrinks only after 3 s)
    const want = pairScale(pos, neg) as { scale: number; base: number }, need = Math.max(pos, neg, 8) / 0.85;
    let ps = this.pairSc;
    const set = () => { ps = this.pairSc = { id, scale: want.scale, base: want.base, at: tNow }; };
    if (!ps || ps.id !== id || need > ps.scale || (want.base >= 0.5) !== (ps.base >= 0.5)) set();
    else if (want.scale < ps.scale || Math.abs(want.base - ps.base) > 0.15) { if (tNow - ps.at > 3) set(); }
    else ps.at = tNow;
    const sc = this.pairSc!, by = y0 + Math.round(PB * sc.base), ppv = (sc.base >= 0.5 ? by - y0 : y0 + PB - by) / sc.scale;
    shapes.push({ k: 'rect', x: padL, y: y0, w: W, h: PB, fill: [1, 1, 1, 0.06], key: 'pair-plate' });
    shapes.push({ k: 'rect', x: padL, y: by, w: W, h: 1, fill: [1, 1, 1, 0.5], key: 'pair-base' });
    const pts: number[] = [];
    for (const p of this.buf) { if (p[0]! < tNow - sweep || p[0]! > tNow || !Number.isFinite(p[2]!)) continue; pts.push(xAt(p[0]!), clamp(by - sg * p[2]! * ppv, y0, y0 + PB)); }
    if (pts.length > 3) shapes.push({ k: 'clip', x: padL, y: y0, w: W, h: PB }, { k: 'path', pts, pen: { color: [1, 1, 1, 0.9], w: 1.5, join: 'round' }, key: 'pair-line' }, { k: 'unclip' });
    text(padL, y0 - PAIR_GAP + 7, pm.short, { weight: 600, color: [1, 1, 1, 0.86], key: 'pair-name' });
    const up = sc.base >= 0.5, ey = up ? y0 + 6 : y0 + PB - 6;
    text(padL + W + 13, ey, num(up ? sc.scale : -sc.scale), { color: [1, 1, 1, 0.78], key: 'pair-top' });
    if (Math.abs(by - ey) >= 14) text(padL + W + 13, by, '0', { color: [1, 1, 1, 0.78], key: 'pair-zero' });
  }

  /** One band stretch's colour: the grey spectrum, or the colour map's own (2D doppler-synth.js shade, dopplerColor.js). */
  private shade(I: number, u: number, lineS: number): Rgba {
    if (this.mode === 'spectrum') { const a = Math.min(1, I); return [236 / 255, 240 / 255, 250 / 255, a]; }
    const col = dopplerColor(this.mode, { u, s: lineS }) as number[];
    const al = col[3]!;
    const t = Math.min(1, I), cover = al * clamp((I - 0.02) / 0.2, 0, 1);
    const c = shadeColor(col, t, 1) as number[];
    return [c[0]! / 255, c[1]! / 255, c[2]! / 255, Math.min(1, cover * (0.3 + 0.7 * t))];
  }
}

/** A fixed hash of (line, channel) in [0, 1): the spectrum's grain is the line's own, so it scrolls with the trace and never flickers. */
function unit(c: number, n: number): number {
  let h = Math.imul(c | 0, 747796405) + Math.imul(n | 0, 2891336453) + 1013904223;
  h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; h = Math.imul(h, 3266489917); h ^= h >>> 16;
  return (h >>> 8) / 16777216;
}
/** A line's own jitter, a sum of three draws centred on 0 (2D `rn`). */
const rnHash = (c: number, n: number) => unit(c, n * 7) + unit(c, n * 7 + 1) + unit(c, n * 7 + 2) - 1.5;
export { PROBES, MINUS };
