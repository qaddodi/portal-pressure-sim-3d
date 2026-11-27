// What the Readouts tiles SHOW between the model's frames, as 2D's readouts-pane.js update() works it out (the rules, ported line for line; the DOM writes become an `Out` per tile that the pane draws):
//   - a running mean (about 1.2 s) keeps a number steady through the beat; a real step or a paused model shows at once;
//   - the page's one shown state (display-state.js createShownState, copied) glides the number and the bar after each model frame, so they move with the figure instead of stepping ten times a second;
//   - a number that is not carried by the glide (a paused edit, a treatment) rolls to its new value, each changed digit in its own column (countTo, odo.ts);
//   - a reading's band (its colour and its word) changes once its number has landed (band-settle.js, copied: bandStepFor), a reading that crosses into a worse band flashes once;
//   - a trend arrow marks a change sustained over five seconds, larger than 3 % of the scale.
// Pure of the page: the clock, the shown state and Reduce Motion come in as `deps`, so a node test steps it by hand. The pane subscribes per tile and draws `Out`s; only the bar's length is
// written straight to its element (a transform: translate and scale), never through React.
import { TILES, GROUPS } from '../copied/dock-tiles.copied.js';
import { VITALS, vitalReading, bpText } from '../copied/vital-read.copied.js';
import { SCALE, RATE } from '../copied/table-marks.copied.js';
import { fmt, clamp } from '../copied/num.copied.js';
import { bandStepFor, BAND_RECHECK_MS, BAND_LONG_MS } from '../copied/band-settle.copied.js';
import { COUNT_MS } from '../copied/motion.copied.js';
import { FILL_SMALL, fillQ } from './copied/display-state.copied.js';
import { SEV_OF_RATE, NOT_MEASURABLE, NOT_SHOWN } from '../../../engine/hales/portal/pressure-cuts.js';
import { hvpgBlockedBy } from '../../../engine/hv-flag.ts';
import { readoutValue, changeFrom, SYSTEMIC, type Band, type Row } from '../readouts-model.ts';
import { odoPlan, ROLL_TAIL_MS, type Piece } from './odo.ts';
import type { M } from '../frame.ts';

import { clock } from '../../../clock/frame.ts';
const TREND_S = 5, TREND_FRAC = 0.03, MEAN_MS = 1200;
const RANKS: Record<string, number> = { none: -1, ok: 0, caution: 1, danger: 2, critical: 3 };
const shownOf = (v: number, d: number) => (Number.isFinite(v) ? +v.toFixed(d) + 0 : v);
const fmtG = fmt;

export interface Roll { n: number; plan: Piece[]; ms: number }
/** What one tile draws. A new object whenever any of it changes (the pane re-renders that tile only). */
export interface Out {
  id: string;
  /** the number's text ("11.1", "?", "—") */
  text: string;
  /** the roll under way, if any (a new `n` starts one) */
  roll: Roll | null;
  /** a counter: it rose, so the number fades in (it came back from "?", or "?" came where it was) */
  fade: number;
  /** a number being worked out again: the last number stays, dimmed */
  stale: boolean;
  /** the band as painted (it follows the number's landing), the word beside it, and whether the word is "Not measured" */
  sev: Band; word: string; unmeas: boolean;
  /** the band's colour changes between two real bands: the number fades out and back under it (bandSwap) */
  bandFade: boolean;
  /** the change from the pinned moment, in place of the word */
  cmp: Row['cmp'] | null;
  trend: '' | 'up' | 'down';
  flash: '' | 'flash' | 'flash2';
  aria: string;
  hiddenVal: boolean;
  /** a blood pressure's systolic/diastolic ("120/80") before the mean, or '' */
  pre: string;
}

interface ShownLike {
  set(key: string, T: number, o?: { snap?: boolean; small?: number; eps?: number; across?: boolean }): number;
  or(key: string, fallback: number): number;
  get(key: string): number | undefined;
  isMoving(key: string): boolean;
  delete(key: string): void;
}
export interface LiveDeps { shown: ShownLike; reduce(): boolean; later(fn: () => void, ms: number): unknown; unlater(h: unknown): void }
export interface FeedCtx { running: boolean; hidden: ReadonlySet<string> | null; then: M | null; params: unknown; now: number }

interface X {
  id: string; t: Record<string, any> | null; vit: Record<string, any> | null; S: [number, number, number[]] | null; // eslint-disable-line @typescript-eslint/no-explicit-any
  d: number; scale: [number, number];
  sm: number | null; smT: number; eased: boolean; target: number | null; shown: number | null; fillSeen: boolean; followKey: string | null;
  hist: Array<[number, number]>; trend: '' | 'up' | 'down';
  sevNow: Band | undefined; waitT: number; nm: boolean; noneGlyph: string;
  // the number's count (countTo)
  cShown: number | null; rollUntil: number; rollN: number; fadeN: number; stale: boolean; text: string; roll: Roll | null;
  fillL: number | null; fillW: number | null; fillEl: HTMLElement | null;
  flash: '' | 'flash' | 'flash2';
  /** a vital's own state (vital-read.js: its definition, and the hold on its cut-off) */
  vs: { v: unknown };
  r?: { v: number; s?: number; d?: number; bad?: boolean };
  preT: string | null;
  out: Out;
}

const blank = (id: string): Out => ({ id, text: '', roll: null, fade: 0, stale: false, sev: 'none', word: '', unmeas: false, bandFade: false, cmp: null, trend: '', flash: '', aria: '', hiddenVal: true, pre: '' });
const same = (a: Out, b: Out): boolean => a.text === b.text && a.roll === b.roll && a.fade === b.fade && a.stale === b.stale && a.sev === b.sev && a.word === b.word && a.unmeas === b.unmeas && a.bandFade === b.bandFade
  && a.trend === b.trend && a.flash === b.flash && a.aria === b.aria && a.hiddenVal === b.hiddenVal && a.pre === b.pre && a.cmp?.text === b.cmp?.text && a.cmp?.dir === b.cmp?.dir;

/** The glide's options: one step of the last digit printed is `small` (a number prints only whole steps of it, so a move of one step or less shows the same whether it glides or lands at once). */
const followOpts = (d: number, snap: boolean) => ({ snap, small: Math.pow(10, -d), eps: 0.05 * Math.pow(10, -d) });

export class ReadoutsLive {
  private xs = new Map<string, X>();
  private order: X[] = [];
  private subs = new Map<string, Set<() => void>>();
  private lastF: { m: M; ctx: FeedCtx } | null = null;
  private bandAsk: unknown = 0;
  private on = false;
  private deps: LiveDeps;
  constructor(deps: LiveDeps) {
    this.deps = deps;
    for (const t of TILES as Array<Record<string, any>>) this.add(t.id, t, null); // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const [id] of SYSTEMIC) { const v = (VITALS as Array<{ id: string }>).find((x) => x.id === id)!; this.add(id, null, v as unknown as Record<string, any>); } // eslint-disable-line @typescript-eslint/no-explicit-any
  }
  private add(id: string, t: X['t'], vit: X['vit']) {
    const S = vit ? ((SCALE as unknown as Record<string, [number, number, number[]]>)[id] ?? null) : null;
    const x: X = {
      id, t, vit, S, d: (t?.d ?? vit?.d ?? 0) as number, scale: (t ? t.scale : S ? [S[0], S[1]] : [0, 1]) as [number, number],
      sm: null, smT: 0, eased: false, target: null, shown: null, fillSeen: false, followKey: null, hist: [], trend: '', sevNow: undefined, waitT: 0, nm: false, noneGlyph: '?',
      cShown: null, rollUntil: 0, rollN: 0, fadeN: 0, stale: false, text: '', roll: null, fillL: null, fillW: null, fillEl: null, flash: '', preT: null, out: blank(id), vs: { v: vit },
    };
    if (vit) x.r = undefined;
    this.xs.set(id, x); this.order.push(x);
  }

  // ── the pane's side ──
  get(id: string): Out { return this.xs.get(id)!.out; }
  subscribe(id: string, cb: () => void): () => void {
    let s = this.subs.get(id); if (!s) this.subs.set(id, s = new Set());
    s.add(cb); return () => { s!.delete(cb); };
  }
  /** The bar of tile `id` is this element: its length is written to it (translate and scale, the compositor's). */
  bindFill(id: string, el: HTMLElement | null): void {
    const x = this.xs.get(id); if (!x) return;
    x.fillEl = el;
    if (el) this.writeFill(x, true);
  }
  mount(): void { this.on = true; }
  unmount(): void { this.on = false; this.deps.unlater(this.bandAsk); this.bandAsk = 0; }
  /** Start over (a new pane, a new patient): every tile takes its first value as it comes. */
  reset(): void {
    for (const x of this.order) {
      Object.assign(x, { sm: null, smT: 0, target: null, shown: null, fillSeen: false, followKey: null, hist: [], trend: '', sevNow: undefined, waitT: 0, nm: false, cShown: null, rollUntil: 0, stale: false, text: '', roll: null, fillL: null, fillW: null, flash: '', preT: null, r: undefined });
      this.deps.shown.delete('rp:' + x.id); this.deps.shown.delete('rpfill:' + x.id);
      x.out = blank(x.id);
    }
  }
  /** Re-run the last frame (the band waited on a number, or the pinned moment or the hidden set changed with no model frame to say so). */
  refresh(ctx?: Partial<FeedCtx>): void { if (this.lastF) this.feed(this.lastF.m, { ...this.lastF.ctx, ...ctx, now: ctx?.now ?? this.lastF.ctx.now }); }

  // ── a model frame (readouts-pane.js update, follow = false) ──
  feed(m: M, ctx: FeedCtx): void {
    this.lastF = { m, ctx };
    this.deps.unlater(this.bandAsk); this.bandAsk = 0;
    const sh = this.deps.shown;
    for (const x of this.order) {
      if (x.t) {
        const t = x.t;
        const raw = readoutValue(t as never, m, ctx.params, ctx.hidden);
        // A running mean (about a second) keeps the number steady through the beat; a real step or a paused model shows at once.
        let v = raw, eased = false;
        if (raw != null && x.sm != null && ctx.running && Math.abs(raw - x.sm) < 0.1 * Math.abs(t.scale[1] - t.scale[0])) { v = x.sm + (raw - x.sm) * Math.min(1, (ctx.now - x.smT) / MEAN_MS); eased = true; }
        x.sm = v; x.smT = ctx.now; x.eased = eased; x.target = v;
        x.shown = v == null ? null : sh.set('rp:' + t.id, v, followOpts(t.d, !eased));
        this.fillTo(x, v, x.fillSeen); x.fillSeen = v != null;
      } else {
        const hid = ctx.hidden?.has(x.vit!.hideKey);
        x.r = vitalReading(x.vs as never, m, ctx.running, ctx.now) as X['r'];
        x.shown = sh.set('rp:' + x.id, x.r!.v, followOpts(x.d, !ctx.running));
        const fv = hid || !Number.isFinite(x.r!.v) ? null : x.r!.v;
        this.fillTo(x, fv, x.fillSeen); x.fillSeen = fv != null;
        x.eased = ctx.running;
      }
      x.followKey = null;
      this.paint(x, m, ctx, false);
    }
  }

  // ── a display frame while a glide is on its way (readouts-pane.js update, follow = true) ──
  follow(): void {
    if (!this.lastF || !this.on) return;
    const { m, ctx } = this.lastF, sh = this.deps.shown, now = ctx.now;
    for (const x of this.order) {
      if (x.t) { if (x.target != null) x.shown = sh.or('rp:' + x.id, x.target); }
      else x.shown = sh.or('rp:' + x.id, x.shown as number);
      this.paint(x, m, { ...ctx, now: this.clockNow(now) }, true);
    }
  }
  private nowFn: () => number = () => clock.now();
  setNow(fn: () => number): void { this.nowFn = fn; }
  private clockNow(_: number): number { return this.nowFn(); }

  /** A bar's length glides on the same filter, across a jump too (dock.js fillTo); shown again after "Not measured", from its origin. */
  private fillTo(x: X, v: number | null, seen: boolean): void {
    const [lo, hi] = x.scale, r = Math.abs(hi - lo), o = { small: FILL_SMALL * r, eps: 0.0005 * r, across: true }, key = 'rpfill:' + x.id, sh = this.deps.shown;
    if (v != null && Number.isFinite(v) && !seen && sh.get(key) === undefined) sh.set(key, clamp(0, Math.min(lo, hi), Math.max(lo, hi)), o);
    sh.set(key, v as number, o);
  }
  private writeFill(x: X, force = false): void {
    const el = x.fillEl; if (!el) return;
    const fl = x.out.hiddenVal ? 0 : (x.fillL ?? 0), fw = x.out.hiddenVal ? 0 : (x.fillW ?? 0);
    if (!force && el.dataset.fl === `${fl}|${fw}`) return;
    el.dataset.fl = `${fl}|${fw}`;
    el.style.translate = `${fl * 100}% 0`; el.style.scale = `${fw} 1`;
  }

  // ── the number: countTo, as a text and a roll ──
  private count(x: X, v: number | null, d: number, eased: boolean, now: number): void {
    const reduce = this.deps.reduce(), fm = fmtG;
    const odo = now < x.rollUntil && !!x.roll;
    // A number being worked out again keeps the last number on show, dimmed, and lands undimmed on the next one that is whole.
    if (v != null && !Number.isFinite(v) && x.cShown != null) { x.stale = true; return; }
    x.stale = false;
    if (odo && (eased || v == null || !Number.isFinite(v) || reduce)) { x.rollUntil = 0; x.roll = null; }
    if (!eased && v != null && Number.isFinite(v)) {
      const rolling = now < x.rollUntil;
      // (A roll under way that is asked for the value it rolls to keeps going; any other value rolls on from the one it lands on.)
      if (rolling) { if (Math.abs(v - (x.cShown as number)) < Math.pow(10, -d) * 0.5) return; x.rollUntil = 0; x.roll = null; }
      const same2 = x.cShown != null && fm(x.cShown, d) === fm(v, d);
      if (!same2 && x.cShown != null && !reduce) {
        const a = fm(x.cShown, d), b = fm(v, d), plan = odoPlan(a, b, v > x.cShown);
        x.cShown = v;
        if (plan) { x.rollN++; x.roll = { n: x.rollN, plan, ms: COUNT_MS }; x.rollUntil = now + COUNT_MS + ROLL_TAIL_MS; x.text = b; }
        else { x.text = b; x.roll = null; x.rollUntil = 0; x.fadeN++; }
        return;
      }
    }
    if (v == null || !Number.isFinite(v)) { const was = x.cShown != null; x.cShown = null; x.text = x.noneGlyph; x.roll = null; x.rollUntil = 0; if (was) x.fadeN++; return; }
    const fresh = x.cShown == null;
    x.cShown = v; x.text = fm(v, d);
    if (fresh) x.fadeN++;
  }
  /** Whether the number's roll is still going (countTo's numberMoving). */
  private rolling(x: X, now: number): boolean { return now < x.rollUntil; }

  private trendOf(x: X, v: number, now: number): '' | 'up' | 'down' {
    const hs = x.hist;
    if (!hs.length || now - hs[hs.length - 1]![0] > 500) { hs.push([now, v]); while (hs.length && now - hs[0]![0] > TREND_S * 1000 + 600) hs.shift(); }
    if (now - hs[0]![0] < TREND_S * 1000 * 0.8) return '';
    const dlt = v - hs[0]![1], thr = TREND_FRAC * (x.scale[1] - x.scale[0]);
    return dlt > thr ? 'up' : dlt < -thr ? 'down' : '';
  }

  private commit(x: X, o: Out): void {
    if (same(x.out, o)) return;
    x.out = o;
    for (const cb of this.subs.get(x.id) ?? []) cb();
  }
  private askBand(): void { if (!this.bandAsk) this.bandAsk = this.deps.later(() => { this.bandAsk = 0; this.refresh({ now: this.nowFn() }); }, BAND_RECHECK_MS); }

  /** The tile's number as the bar beside it prints it is the same number here (shown.js: HVPG and PPG as the dock's strip shows them); no bar in the 3D app writes them yet, so the tile's own stands. */
  private shownFor(x: X, hidden: ReadonlySet<string> | null): number | null {
    let v = x.shown ?? null;
    const t = x.t;
    if (v != null && t && (t.id === 'hvpg' || t.id === 'ppg') && !hidden?.has(t.hideKey)) { const g = barShown.get(t.id); if (g != null && Number.isFinite(g) && Math.abs(g - v) < 0.25) v = g; }
    return v;
  }

  private paint(x: X, m: M, ctx: FeedCtx, follow: boolean): void {
    const sh = this.deps.shown, now = ctx.now, hidden = ctx.hidden, reduce = this.deps.reduce();
    const prev = x.out;
    if (x.t) this.paintTile(x, m, ctx, follow, sh, now, hidden, reduce, prev);
    else this.paintVital(x, m, ctx, follow, sh, now, hidden, reduce, prev);
  }

  private paintTile(x: X, m: M, ctx: FeedCtx, follow: boolean, sh: ShownLike, now: number, hidden: ReadonlySet<string> | null, reduce: boolean, prev: Out): void {
    const t = x.t!;
    const v = this.shownFor(x, hidden), eased = follow || x.eased;
    // (A display frame between model frames repaints only the tiles whose shown number or bar moved since they were last painted.)
    if (follow) { const fk = `${v}|${sh.or('rpfill:' + t.id, '' as unknown as number)}`; if (fk === x.followKey) return; x.followKey = fk; } else x.followKey = null;
    if (v != null && !Number.isFinite(v)) { this.count(x, v, t.d, eased, now); this.commit(x, { ...prev, stale: x.stale }); return; }
    const measured = v != null && !!hidden?.has(t.hideKey);
    let sev: Band, s: string;
    if (v == null) {
      const nm = t.id === 'hvpg' && hvpgBlockedBy(ctx.params);
      x.nm = nm; x.noneGlyph = nm ? NOT_SHOWN : '?';
      this.count(x, null, t.d, eased, now);
      s = nm ? NOT_MEASURABLE : 'Not measured'; sev = 'none'; x.hist.length = 0;
    } else {
      this.count(x, v, t.d, eased, now);   // (a paused edit or a treatment rolls to the new number: P17)
      const vs = shownOf(v, t.d);   // (the word judges the number shown)
      s = measured ? 'Measured' : t.s(vs, m);
      sev = t.st(vs, m);
      const lo = x.scale[0], hi = x.scale[1], pos = (q: number) => clamp((q - lo) / (hi - lo), 0, 1);
      const w = pos(sh.or('rpfill:' + t.id, v)), o = pos(clamp(0, lo, hi));
      x.fillL = fillQ(Math.min(w, o)); x.fillW = fillQ(Math.abs(w - o));
    }
    const trend = v == null || measured ? '' : this.trendOf(x, v, now);
    x.trend = trend;
    const cmp = ctx.then && v != null && !measured ? changeFrom(t as never, v, ctx.then) ?? null : null;
    const band = this.band(x, sev, sh.isMoving('rp:' + t.id), reduce, now, v != null ? () => t.st(shownOf(sh.or('rpfill:' + t.id, v), t.d), m) : null);
    const un = v == null && !x.nm;
    const aria = `${t.title || t.k}: ${v == null ? s.toLowerCase() : `${fmt(v, t.d)} ${t.u}${t.ux || ''}, ${s}`}${trend ? `, ${trend === 'up' ? 'rising' : 'falling'}` : ''}`;
    const word = band.sev === sev ? s : prev.word || s;
    this.commit(x, { id: x.id, text: x.text, roll: x.roll, fade: x.fadeN, stale: x.stale, sev: band.sev, word: band.sev === sev ? word : prev.word, unmeas: band.sev === sev ? un : prev.unmeas, bandFade: band.fade, cmp, trend, flash: band.flash, aria, hiddenVal: v == null, pre: '' });
    this.writeFill(x);
  }

  private paintVital(x: X, m: M, ctx: FeedCtx, follow: boolean, sh: ShownLike, now: number, hidden: ReadonlySet<string> | null, reduce: boolean, prev: Out): void {
    const def = x.vit!, S = x.S!;
    const hid = !!hidden?.has(def.hideKey);
    const rv = x.shown as number;
    if (follow) { const fk = `${rv}|${hid}|${sh.or('rpfill:' + x.id, '' as unknown as number)}`; if (fk === x.followKey) return; x.followKey = fk; } else x.followKey = null;
    x.noneGlyph = '?';
    this.count(x, hid ? null : rv, def.d, ctx.running, now);
    const rr = x.r;
    const pre = hid || !Number.isFinite(rv) || !Number.isFinite(rr?.s as number) || !Number.isFinite(rr?.d as number) ? '' : `${Math.round(rr!.s as number)}/${Math.round(rr!.d as number)}`;
    // (Its tile's word and colour, judging the number as shown; the tile's colour holds a moment before it changes, as the others do.)
    const none = hid || !Number.isFinite(rv);
    const rate = (v: number) => (RATE as unknown as Record<string, (v: number, o: object) => readonly [string, string]>)[x.id]!(shownOf(v, def.d), def.s ? { sbp: rr?.s } : {});
    const [cls, word]: [string | null, string] = none ? [null, 'Not measured'] : [...rate(rv)] as [string, string];
    const sev = ((SEV_OF_RATE as Record<string, Band>)[cls ?? ''] ?? 'none') as Band;
    x.fillL = 0; x.fillW = none ? 0 : fillQ(clamp((sh.or('rpfill:' + x.id, rv) - S[0]) / (S[1] - S[0]), 0, 1));
    const band = this.band(x, sev, sh.isMoving('rp:' + x.id), reduce, now, !none ? () => ((SEV_OF_RATE as Record<string, Band>)[rate(sh.or('rpfill:' + x.id, rv))[0]!] ?? 'none') as Band : null);
    const aria = `${def.title}: ${none ? 'not measured' : `${def.s ? bpText(rr?.s, rr?.d, rv) : fmt(rv, def.d)} ${def.u}, ${word}`}`;
    this.commit(x, { id: x.id, text: x.text, roll: x.roll, fade: x.fadeN, stale: x.stale, sev: band.sev, word: band.sev === sev ? (word as string) : prev.word, unmeas: band.sev === sev ? none : prev.unmeas, bandFade: band.fade, cmp: null, trend: '', flash: band.flash, aria, hiddenVal: none, pre });
    this.writeFill(x);
  }

  /** A reading crossing a cut-off rolls in its old colour; its colour and word change once the number has landed (A1, band-settle.js). Reduce Motion: all three at once. */
  private band(x: X, sev: Band, moving: boolean, reduce: boolean, now: number, shownBand: (() => Band) | null): { sev: Band; fade: boolean; flash: '' | 'flash' | 'flash2' } {
    const waited = x.waitT ? now - x.waitT : 0;
    // (A number that keeps moving past a roll, a live strain, never lands: its band is taken once the number on show has itself entered it.)
    const sb = waited >= BAND_LONG_MS && shownBand ? shownBand() : null;
    const step = bandStepFor(x.sevNow, sev, this.rolling(x, now) || moving, reduce, waited, sb as string) as 'same' | 'now' | 'fade' | 'wait';
    let fade = false;
    if (step === 'wait') { if (!x.waitT) x.waitT = now; this.askBand(); }
    else {
      x.waitT = 0;
      if (step !== 'same') {
        if (x.sevNow && RANKS[sev]! > RANKS[x.sevNow]!) x.flash = x.flash === 'flash' ? 'flash2' : 'flash';   // (the two names alternate so the animation starts again)
        const was = x.sevNow; x.sevNow = sev;
        fade = !!was && was !== 'none' && sev !== 'none';
      }
    }
    return { sev: x.sevNow ?? 'none', fade, flash: x.flash };
  }
}

/** The bottom bar's printed HVPG and PPG (shown.js setShown / shownOr): the Readouts tile prints the same number as the bar beside it, so one number never reads 11.7 in one place and 11.6 in another. */
export const barShown = new Map<string, number>();
export const setShown = (id: string, v: number): void => { barShown.set(id, v); };
export const shownOr = (id: string, fallback: number): number => { const v = barShown.get(id); return Number.isFinite(v) ? (v as number) : fallback; };

export { GROUPS };
