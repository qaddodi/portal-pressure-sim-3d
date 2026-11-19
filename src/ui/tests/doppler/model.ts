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
import { pulsatility } from '../copied/doppler-marks.copied.js';
import { createReading } from './copied/doppler-reading.copied.js';
import { EI, PROBES, SEGS, SETTINGS, SWEEP_SECONDS, STAT_TITLE, num, PAD_L, PAD_R } from './copied/doppler-tables.copied.js';
import { dopplerColor, shadeColor, THETA } from './copied/doppler-colours.copied.js';
import type { Frame, Shape } from '../../charts/scene.ts';
import type { Rgba } from '../../charts/colour.ts';
import { measure } from '../../charts/measure.ts';
import { feed, type SampleFeed } from '../feed.ts';
import { paramsNow } from '../frame.ts';
import { useDopplerProbe } from './probe-state.ts';

export type DopMode = 'spectrum' | 'velocity' | 'variance';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
export const WINDOWS: readonly number[] = SWEEP_SECONDS;
const KEEP = 16, SETTLE_LAG = 0.16, COL = 2;
const MINUS = '−';

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

  get sweep(): number { return SWEEP_SECONDS[this.sweepIndex]!; }

  private sync() { this.rd.sync({ buf: this.buf, beatN: this.beatN, probe: this.probe, frame: this.frame, gi: this.gi, heldTo: this.heldTo, invert: this.invert }); }
  private clearBuf() {
    this.buf.length = 0; this.beatN = 0; this.lastPh = NaN; this.rd.facs.clear(); this.heldTo = null; this.scaleSt.scale = null; this.scaleSt.baseF = null; this.scaleSt.refit = false; this.tDisp = null;
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
    // (the record the page keeps, from the first sample after the last one taken: the record is trimmed from the front, so places are found by time)
    const T = rec.t;
    if (T.length && T[T.length - 1]! < this.lastT - 1e-9) { this.clearBuf(); this.lastT = -Infinity; }   // (the page's record began again)
    let lo = 0, hi = T.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (T[m]! <= this.lastT) lo = m + 1; else hi = m; }
    const vel = rec.ch.vel, ph = rec.ch.ph;
    if (f.clock === 'disease') { this.sync(); return; }   // (a time lapse has no bedside samples: the trace holds the last seconds it has)
    for (let i = lo; i < T.length; i++) {
      const t = T[i]!, v = vel[i]!;
      // (A sample with no velocity is of another vessel, from before the probe moved: it draws no line, so it is not recorded; its beat still counts.)
      if (Number.isFinite(v)) this.buf.push([t, v, NaN]);
      const p = ph[i];
      if (p != null && Number.isFinite(p)) { if (p < this.lastPh - 0.5) this.rd.beatT[this.beatN++ % 16] = t; this.lastPh = p; }
      this.lastT = t;
    }
    if (!this.buf.length) { this.sync(); return; }
    const tNow = this.buf[this.buf.length - 1]![0]!;
    if (f.settling) this.heldTo = tNow;
    let cut = 0; while (cut < this.buf.length && this.buf[cut]![0]! < tNow - KEEP) cut++;
    if (cut && (cut >= 256 || cut * 4 >= this.buf.length)) { this.buf.splice(0, cut); this.rd.facs.prune(this.buf[0]![0]!); }
    this.sync();
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
    if (!r) {
      return { ...base, acquiring: true, text: f?.clock === 'disease' ? 'Not available during time lapse' : 'Acquiring…', dir: f?.clock === 'disease' ? 'Not available during time lapse' : 'Acquiring…', sev: '', vel: '—', none: false, pattern: '', note: '' };
    }
    const p = rd.meta();
    const gf = rd.gateFactor() as number;
    const open = Math.abs(r.mean);
    const mean = r.mean * gf;
    rd.SEEN.gated = mean; rd.SEEN.open = open;
    const it = rd.interpret(r, gf, rd.SEEN);
    const drawn = mean;
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
      mk('Speed', 'Speed', true), mk('Peak', 'Max', true), mk('Trough', 'Trough', !stent), mk('Pulsatility', 'Pulsatility', !stent && kind !== 'hepatic' && kind !== 'ivc'),
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
  /** True while the trace is moving by itself (the model runs on the seconds clock): the pane holds the clock. */
  get live(): boolean { return !!this.frame?.running && this.frame?.clock !== 'disease'; }

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
  frameFor(w: number, h: number, nowMs: number, label: string): Frame {
    const shapes: Shape[] = [];
    const out: Frame = { w, h, shapes, label };
    const white = (a: number): Rgba => [1, 1, 1, a];
    shapes.push({ k: 'rect', x: 0, y: 0, w, h, r: 12, fill: [0, 0, 0, 1], key: 'plate' });
    if (w < 60 || h < 60) return out;
    this.sync();
    const rd = this.rd, f = this.frame;
    const padL = PAD_L as number, padR = PAD_R as number, padT = 26, padB = 20, yLab = 13;
    const W = Math.max(1, Math.round(w - padL - padR)), H = Math.max(1, Math.round(h - padT - padB));
    const text = (x: number, y: number, s: string, o: Partial<Extract<Shape, { k: 'text' }>> = {}) => { shapes.push({ k: 'text', x, y, s, size: 12, weight: 500, color: white(0.5), baseline: 'middle', ...o }); };
    const pm: Any = this.probe ? rd.meta() : (PROBES as Any[])[0];
    const gate = this.probe && rd.isStentProbe() ? rd.gateOf() as string : '';
    const name = pm ? (gate ? pm.byGate[gate] : pm.name) : '';
    text(padL, yLab, name, { weight: 600, color: white(0.86), key: 'name' });
    const lw = measure(name, 12, 600);
    const mm = this.probe ? rd.svMm() as number : 4;
    const settings = (SETTINGS as string[][][][])[this.mode === 'spectrum' ? 0 : 1]![mm]![this.sweepIndex]!;
    const x0 = padL + lw + 12, room = w - padR - x0 - 6;
    let np = settings.length;
    while (np > 1 && measure(settings[np - 1]!, 12, 500) > room) np--;
    if (measure(settings[np - 1]!, 12, 500) <= room) text(x0, yLab, settings[np - 1]!, { key: 'settings' });
    if (this.buf.length < 2) {
      this.tDisp = null;
      text(w / 2, h / 2, f?.clock === 'disease' ? 'Doppler sampling needs real time: return to the seconds clock.' : 'Acquiring…', { anchor: 'middle', color: white(0.55), key: 'acq' });
      return out;
    }
    const tNow = this.clockNow(nowMs), sweep = this.sweep;
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
    fitScale(st, { fixed: null, holding, fits, target, tbF, tNow });
    const scale = st.scale as number, baseF = st.baseF as number;
    const baseY = Math.round(H * baseF);
    const pxPerV = (baseF >= 0.5 ? baseY : H - baseY) / scale;
    const yB = padT + baseY;
    // the spectrum, one 2 px line at a time, the newest at the right edge; a line's number is its place in time, so its grain scrolls with the trace
    const NC = Math.max(1, Math.floor(W / COL)), cps = NC / sweep, cNow = Math.floor(tNow * cps);
    const wfV = Math.max(1.2, 0.025 * scale), uK = 1 / (0.7 * scale);
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
    text(w - 6, 13, 'cm/s', { anchor: 'end', key: 'unit' });
    // one tick a second along the bottom, scrolling with the trace
    for (let sec = Math.ceil(tNow - sweep); sec <= tNow; sec++) {
      const x = Math.round(padL + ((sec - (tNow - sweep)) / sweep) * W);
      shapes.push({ k: 'line', x1: x + 0.5, y1: padT + H + 5, x2: x + 0.5, y2: padT + H + 9, pen: { color: white(0.4), w: 1 } });
    }
    void THETA;
    return out;
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
