// Tests > Pressure > Along the circuit (2D charts.js createProfile, "the hydraulic grade line"): the pressure from gut to heart through the stations of the 2D app's own path, the
// healthy line dashed beneath it, the compared moment dotted, each station's value placed where it stands clear of the line and the dots, the LIVER band, and the HVPG and PPG
// brackets with their pills. Where the plot is too short for its pills the brackets take rows of their own under the names ("band"), and where even that is too short the chart
// becomes five stations in a row ("strip"), as in 2D. A pure function of the pressures and the box: the same inputs give the same frame, and the form (plot, band or strip) is a function of the box alone (formOf), so a test reads the words
// without a browser. The stations, names, offsets and words are the 2D app's, copied by scripts/copy-b11-profile.mjs; the drawing below is charts.js drawWith/drawStrip written as
// shapes (the GPU chart's display list) instead of canvas calls.
import type { Frame, Shape, TextShape } from '../../charts/scene.ts';
import type { Palette } from '../../charts/palette.ts';
import { withAlpha, type Rgba } from '../../charts/colour.ts';
import { fmt } from '../../charts/fmt.ts';
import { measure } from '../../charts/measure.ts';
import { NODES } from '../../../engine/hales/portal/topology.js';
import { tenthGap } from '../../../engine/hales/core/gap.js';
import { MARK_NAME, hvpgSentence, measuredTop } from '../../charts/profile/wedge.ts';
import { sampler } from '../../../scene/lenses/oklab.ts';
import { PRESSURE_RAMP } from '../../../scene/lenses/pressure-ramp.ts';
import { PROFILE_PATHS, SHORT } from './copied/anatomy.copied.js';
import { monotoneSegs, curveTester } from './copied/curve-near.copied.js';
import {
  ARTERIAL, CAND_KX, CAND_DY, LIVER_AT, C30, STRIP, STRIP_NAME, PLOT_MIN, BAND_PLOT_MIN, BAND_ROW, AT_SHOWN, DASH_HEALTHY, DASH_SNAP, DASH_LEAD, plotR, axisTop,
} from './copied/consts.copied.js';

export interface ProfilePath {
  id: string; label: string; nodes: string[]; names?: Record<string, string>; liver?: [string, string];
  dims?: { k: string; hi: string; lo: string; hiM?: string; loM?: string; m: string; sev: (v: number) => string; hide?: string }[];
}
export const PATHS = PROFILE_PATHS as unknown as ProfilePath[];
const NI: Record<string, number> = Object.fromEntries((NODES as { id: string }[]).map((n, i) => [n.id, i]));
type PressureList = ArrayLike<number>;

export interface ProfileInput {
  /** the node pressures as shown (the beat-filtered Pf where the frame has it), in topology order */
  P: PressureList;
  /** the frame's metrics (the readings the brackets are read from: whvp, fhvp, pv, ivc) */
  metrics?: Record<string, number | undefined> | null;
  /** the healthy reference's node pressures */
  healthy?: PressureList | null;
  /** the compared moment's node pressures (Compare's pinned A) */
  snap?: PressureList | null;
  /** readouts the case leaves unmeasured (2D hiddenNow): 'trueHVPG' leaves the HVPG bracket out */
  hidden?: ReadonlySet<string> | null;
  pathId?: string;
}
export interface ProfileBox { w: number; h: number; pal: Palette }
/** The form the chart keeps for a size and a path. It is decided from the room alone (formOf), never from the live pressures or from what the chart drew before, so the same room
 *  is always the same layout; the lock only remembers the verdict for the size it was given for, so a frame does not ask again. */
export interface FormLock { key: string; form: Form | null }
export const newLock = (): FormLock => ({ key: '', form: null });
export type Form = 'plot' | 'band' | 'strip';
export interface ProfileOut { frame: Frame; form: Form; /** the axis top, mmHg */ maxP: number; /** whether the compared moment is drawn (the legend names it) */ compared: boolean; /** whether an arterial station is drawn above a broken axis */ offscale: boolean; /** the words a screen reader gets */ items: { name: string; v: number }[] }

const curPath = (id?: string): ProfilePath => PATHS.find((p) => p.id === id) ?? PATHS[0]!;
const nameOf = (path: ProfilePath, n: string): string => path.names?.[n] || (SHORT as Record<string, string>)[n] || n;
const STATIONS = new Map(PATHS.map((p) => [p.id, p.nodes.filter((n) => !ARTERIAL.has(n))]));
const DIM_NAME = (k: string) => `${k} `;
const W = (s: string, size: number, weight: number) => measure(s, size, weight);
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

// the pressure ramp (pressure-ramp.ts, the one source), read over 0..35 in 256 steps as 2D's colormap.js pressureColor does
const RAMPS = new Map<string, ReturnType<typeof sampler>>();
export function pressureColour(p: number, look: string): Rgba {
  let s = RAMPS.get(look);
  if (!s) { s = sampler(PRESSURE_RAMP[look as keyof typeof PRESSURE_RAMP]); RAMPS.set(look, s); }
  const q = Math.round((Math.min(35, Math.max(0, p)) / 35) * 255) / 255 * 35;
  const c = s.at(q);
  return [c[0], c[1], c[2], 1];
}
const lerpRgba = (a: Rgba, b: Rgba, t: number): Rgba => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 1];

interface Rect { x0: number; x1: number; y0: number; y1: number }
const overlap = (r: Rect, o: Rect, g = 2) => r.x0 < o.x1 + g && r.x1 > o.x0 - g && r.y0 < o.y1 + g && r.y1 > o.y0 - g;
const anyOverlap = (pool: Rect[], n: number, r: Rect, g = 2) => { for (let i = 0; i < n; i++) if (overlap(r, pool[i]!, g)) return true; return false; };
const lineY = (pp: number[][], px: number): number | null => {
  for (let q = 0; q < pp.length - 1; q++) if (px >= pp[q]![0]! && px <= pp[q + 1]![0]!) return pp[q]![1]! + (pp[q + 1]![1]! - pp[q]![1]!) * (px - pp[q]![0]!) / (pp[q + 1]![0]! - pp[q]![0]! || 1);
  return null;
};
const hitsLine = (r: Rect, pp: number[][]) => { for (let px = r.x0; px <= r.x1 + 3; px += 4) { const ly = lineY(pp, Math.min(px, r.x1)); if (ly != null && ly > r.y0 - 5 && ly < r.y1 + 5) return true; } return false; };

/** The curve through the points as a polyline (monotone cubic, 2D smoothPath), `steps` samples to a span so a frame keeps one shape as the numbers change. */
export function smoothPoly(pts: number[][], steps = 12): number[][] {
  const n = pts.length;
  if (n < 2) return pts.map((p) => [p[0]!, p[1]!]);
  const segs = monotoneSegs(pts) as number[][] | null;
  if (!segs) return pts.map((p) => [p[0]!, p[1]!]);
  const out: number[][] = [[segs[0]![0]!, segs[0]![1]!]];
  for (const s of segs) {
    for (let k = 1; k <= steps; k++) {
      const t = k / steps, u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      out.push([a * s[0]! + b * s[2]! + c * s[4]! + d * s[6]!, a * s[1]! + b * s[3]! + c * s[5]! + d * s[7]!]);
    }
  }
  return out;
}
const flat = (pts: number[][]): number[] => { const o: number[] = []; for (const p of pts) o.push(p[0]!, p[1]!); return o; };

interface Geo { w: number; hh: number; stations: string[]; L: number; R: number; T: number; B: number; slot: number; maxP: number; stagger: boolean; hasArt: boolean; artY: number; roomy: boolean; band: boolean; x(i: number): number; y(p: number): number; path: ProfilePath }
function geometry(path: ProfilePath, w: number, hh: number, maxP: number, band: boolean): Geo {
  const stations = STATIONS.get(path.id)!;
  const slot0 = (w - 56) / stations.length;
  const stagger = slot0 < 74;
  let tilt = 0;
  if (stagger) { let widest = -Infinity; for (const s of stations) widest = Math.max(widest, W(nameOf(path, s), 12, 500)); tilt = widest * 0.5; }
  const hasArt = stations.some((s) => ARTERIAL.has(s));
  const roomy = hh > 230;
  const w2 = W('88', 12, 500), w3 = W('888', 12, 500);
  let L = Math.ceil(w2 + (w3 - w2) * clamp((maxP - 95) / 5, 0, 1)) + 14;
  const R = 10, T = hasArt ? (roomy ? 58 : 34) : 28, B = (stagger ? Math.ceil(tilt) + 20 : 26) + (band ? (path.dims ? path.dims.length : 0) * BAND_ROW + 2 : 0);
  if (stagger) {
    const nws = stations.map((s) => W(nameOf(path, s), 12, 500));
    for (let k = 0; k < 3; k++) {
      const sl = (w - L - R) / stations.length;
      let need = -Infinity;
      for (let i = 0; i < stations.length; i++) need = Math.max(need, 8 + C30 * nws[i]! + 3 - (L + sl * (i + 0.5) + 3));
      if (need <= 0) break;
      L += Math.ceil(need);
    }
  }
  const slot = (w - L - R) / stations.length;
  const g: Geo = {
    w, hh, stations, L, R, T, B, slot, maxP, stagger, hasArt, artY: roomy ? T - 24 : T - 20, roomy, band, path,
    x: (i) => L + slot * (i + 0.5), y: (p) => T + (hh - T - B) * (1 - clamp(p, -2, maxP) / maxP),
  };
  return g;
}

/** The compact strip's own form (2D drawStrip): five stations in a row, names over readings, the HVPG and PPG as brackets under them. */
function stripShapes(inp: ProfileInput, path: ProfilePath, pal: Palette, look: string, w: number, hh: number): Shape[] {
  const out: Shape[] = [];
  const PM = inp.P, m = inp.metrics ?? {}, hid = inp.hidden;
  const text = pal.tok('text'), muted = pal.tok('text-2'), faint = pal.tok('text-3'), danger = pal.tok('danger'), caution = pal.tok('caution');
  const reading = (n: string) => { const k = (AT_SHOWN as Record<string, string>)[n]; const sv = k ? m[k] : undefined; return k && Number.isFinite(sv) ? sv! : PM[NI[n]!]!; };
  const gapOf = (d: NonNullable<ProfilePath['dims']>[number], hv: number, lv: number) =>
    tenthGap(d.hiM && m[d.hiM] != null && Number.isFinite(m[d.hiM]) ? m[d.hiM]! : hv, d.loM && m[d.loM] != null && Number.isFinite(m[d.loM]) ? m[d.loM]! : lv, hv - lv);
  const NS = STRIP.length, x0 = 12, x1 = w - 12;
  const vals = STRIP.map((n: string) => reading(n)), txt = vals.map((v: number) => fmt(v, 1));
  const nw = STRIP.map((n: string) => W((STRIP_NAME as Record<string, string>)[n]!, 12, 600));
  let vf = 15, tw: number[] = [];
  for (; vf >= 13; vf--) {
    tw = txt.map((t: string) => W(t, vf, 700));
    let need = 0;
    for (let i = 0; i < NS; i++) need += Math.max(nw[i]! + 6, tw[i]! + 24);
    if (need <= x1 - x0) break;
  }
  if (vf < 13) vf = 13;
  tw = txt.map((t: string) => W(t, vf, 700));
  const cw = nw.map((n, i) => Math.max(n + 6, tw[i]! + 24));
  const gap = Math.max(0, (x1 - x0 - cw.reduce((a, b) => a + b, 0)) / NS);
  const cx: number[] = []; let at = x0 + gap / 2;
  for (let i = 0; i < NS; i++) { cx.push(at + cw[i]! / 2); at += cw[i]! + gap; }
  const sc = Math.min(1, Math.max(0.8, hh / 112));
  let rk = 18 * sc, rv = 44 * sc, rh = 72 * sc, rp = 98 * sc;
  const top = rk - 12, bot = rp + 8, dy = Math.max(0, (hh - (bot - top)) / 2 - top);
  rk = Math.round(rk + dy); rv = Math.round(rv + dy); rh = Math.round(rh + dy); rp = Math.round(rp + dy);
  const T = (x: number, y: number, s: string, size: number, weight: number, color: Rgba, anchor: TextShape['anchor'] = 'middle', baseline: TextShape['baseline'] = 'alphabetic'): void => { out.push({ k: 'text', x, y, s, size, weight, color, anchor, baseline }); };
  for (let i = 0; i < NS; i++) T(cx[i]!, rk, (STRIP_NAME as Record<string, string>)[STRIP[i]!]!, 12, 600, muted);
  for (let i = 0; i < NS - 1; i++) {
    const a = cx[i]! + tw[i]! / 2 + 6, b = Math.max(a, cx[i + 1]! - tw[i + 1]! / 2 - 6);
    const ca = pressureColour(vals[i]!, look), cb = pressureColour(vals[i + 1]!, look);
    const K = 6;
    for (let k = 0; k < K; k++) { const xa = a + ((b - a) * k) / K, xb = a + ((b - a) * (k + 1)) / K; out.push({ k: 'line', x1: xa, y1: rv - 5, x2: xb, y2: rv - 5, pen: { color: lerpRgba(ca, cb, (k + 0.5) / K), w: 2.5, cap: 'round' } }); }
  }
  for (let i = 0; i < NS; i++) T(cx[i]!, rv, txt[i]!, vf, 700, text);
  for (const d of path.dims ?? []) {
    if (d.hide && hid?.has(d.hide)) continue;
    const a = STRIP.indexOf(d.hi), b = STRIP.indexOf(d.lo);
    if (a < 0 || b < 0) continue;
    if (d.hiM && measuredTop(d, m) == null) continue;
    const v = gapOf(d, reading(d.hi), reading(d.lo))!;
    const sv = d.sev(v), col = sv === 'danger' ? danger : sv === 'caution' ? caution : muted;
    const yy = d.k === 'HVPG' ? rh : rp, bx0 = cx[a]!, bx1 = cx[b]!, name = DIM_NAME(d.k), num = fmt(v, 1);
    const w1 = W(name, 12, 600), w2 = W(num, 12.5, 700), lw = w1 + w2, inl = bx1 - bx0 - lw - 16 >= 8, lx = inl ? (bx0 + bx1) / 2 - lw / 2 : bx1 + 8;
    const pen = { color: col, w: 1.5, cap: 'butt' as const };
    out.push({ k: 'line', x1: bx0, y1: yy - 4, x2: bx0, y2: yy + 4, pen }, { k: 'line', x1: bx1, y1: yy - 4, x2: bx1, y2: yy + 4, pen });
    if (inl) out.push({ k: 'line', x1: bx0, y1: yy, x2: lx - 6, y2: yy, pen }, { k: 'line', x1: lx + lw + 6, y1: yy, x2: bx1, y2: yy, pen });
    else out.push({ k: 'line', x1: bx0, y1: yy, x2: bx1, y2: yy, pen });
    T(lx, yy + 0.5, name, 12, 600, muted, 'start', 'middle');
    T(lx + w1, yy + 0.5, num, 12.5, 700, col === muted ? text : col, 'start', 'middle');
  }
  T(x1, rp + 0.5, 'mmHg', 12, 500, faint, 'end', 'middle');
  return out;
}

const LEAD_PIECES = 4;

/** The sentence a screen reader gets after the stations: where the HVPG's two ends come from (empty when it is not drawn). (The words are charts/profile/wedge.ts's, shared with the slides' chart.) */
export function bracketSummary(inp: Pick<ProfileInput, 'metrics' | 'hidden' | 'pathId'>): string {
  const out: string[] = [];
  for (const d of curPath(inp.pathId).dims ?? []) {
    if (!d.hiM || !d.loM || (d.hide && inp.hidden?.has(d.hide))) continue;
    const s = hvpgSentence(measuredTop(d, inp.metrics), measuredTop({ hiM: d.loM }, inp.metrics), d.k);
    if (s) out.push(s);
  }
  return out.length ? ` ${out.join('. ')}.` : '';
}

/** The stations a screen reader hears (2D speak): the path's venous stations and their pressures. */
export function itemsOf(inp: Pick<ProfileInput, 'P' | 'pathId'>): { name: string; v: number }[] {
  const path = curPath(inp.pathId);
  return STATIONS.get(path.id)!.filter((n) => NI[n] != null && Number.isFinite(inp.P[NI[n]!])).map((n) => ({ name: nameOf(path, n), v: inp.P[NI[n]!]! }));
}

/** The chart, for one box (see the file's head). `lock` is the form kept for this size and path; the caller keeps it between frames and the function updates it in place. */
export function profileFrame(inp: ProfileInput, box: ProfileBox, lock: FormLock = newLock()): ProfileOut {
  const { w, h: hh, pal } = box, look = pal.look;
  const path = curPath(inp.pathId);
  const stations = STATIONS.get(path.id)!;
  const hid = inp.hidden ?? null;
  const items = itemsOf(inp);
  const done = (shapes: Shape[], form: Form, maxP: number, compared: boolean, offscale: boolean): ProfileOut => ({ frame: { w, h: hh, shapes, label: '' }, form, maxP, compared, offscale, items });

  // the axis follows the highest point (now, healthy or the compared moment)
  let top = 0;
  for (const n of path.nodes) { if (ARTERIAL.has(n)) continue; const i = NI[n]!; top = Math.max(top, inp.P[i] ?? 0, inp.healthy?.[i] ?? 0, inp.snap?.[i] ?? 0); }
  const maxP = axisTop(top);

  const key = `${Math.round(w)}|${Math.round(hh)}|${path.id}|${hid ? [...hid].sort().join(',') : ''}|${look}`;
  if (lock.key !== key || !lock.form) { lock.key = key; lock.form = formOf(path, w, hh, hid, pal); }
  const form = lock.form;
  const stripForm = (): Shape[] => [{ k: 'rect', x: 0, y: 0, w, h: hh, r: plotR(w, hh), fill: pal.tok('surface-2') }, ...stripShapes(inp, path, pal, look, w, hh)];
  if (form === 'strip') return done(stripForm(), 'strip', maxP, false, false);
  // (the live pressures draw in the form the room chose; a value label with no clear spot is left to the readings under the chart, never a reason to change the layout)
  const g0 = geometry(path, w, hh, maxP, form === 'band');
  const r = drawPlot(inp, path, pal, look, g0, hid, true);
  return done(r.shapes, form, maxP, r.compared, g0.hasArt);
}

/** Typical pressures gut to heart, for judging a room: the layout must hold for a case with pressures and not only for the one on screen. */
const refP = (over: Record<string, number>): Float32Array => {
  const P = new Float32Array(NODES.length);
  const base: Record<string, number> = { INT: 19, CONF: 18, RPV: 17.5, SIN_R: 15, CV_R: 8.5, RHV: 7, IVCS: 5, RA: 3, ...over };
  for (const [k, v] of Object.entries(base)) { const i = NI[k]; if (i != null) P[i] = v; }
  return P;
};
let REFS: ProfileInput[] | null = null;
/** Three fixed cases: portal hypertension with the healthy line, a severe one with a compared moment pinned, and the healthy one. Each draws with both brackets (HVPG measured). */
const references = (hid: ReadonlySet<string> | null): ProfileInput[] => {
  if (!REFS) {
    const healthy = refP({ INT: 8, CONF: 7, RPV: 6.5, SIN_R: 5, CV_R: 4, RHV: 3.5, IVCS: 3, RA: 2 });
    const typical = refP({}), severe = refP({ INT: 32, CONF: 30, RPV: 29, SIN_R: 26, CV_R: 12, RHV: 9, IVCS: 6, RA: 4 });
    REFS = [
      { P: typical, metrics: { whvp: 15, fhvp: 7, hvpg: 8, pv: 18, ivc: 5, ppg: 13 }, healthy },
      { P: severe, metrics: { whvp: 26, fhvp: 9, hvpg: 17, pv: 30, ivc: 6, ppg: 24 }, healthy, snap: typical },
      { P: healthy, metrics: { whvp: 5, fhvp: 3.5, hvpg: 1.5, pv: 7, ivc: 3, ppg: 4 }, healthy },
    ];
  }
  return REFS.map((r) => ({ ...r, hidden: hid }));
};
/** The form for a room: a pure function of the path, the box and the readouts the case hides (never of the live pressures). The most compact form any of the reference cases needs. */
export function formOf(path: ProfilePath, w: number, hh: number, hid: ReadonlySet<string> | null, pal: Palette): Form {
  const rank: Form[] = ['plot', 'band', 'strip'];
  let worst = 0;
  for (const ref of references(hid)) {
    let top = 0;
    for (const n of path.nodes) { if (ARTERIAL.has(n)) continue; const i = NI[n]!; top = Math.max(top, ref.P[i] ?? 0, ref.healthy?.[i] ?? 0, ref.snap?.[i] ?? 0); }
    const maxP = axisTop(top);
    let band = stripNeed(geometry(path, w, hh, maxP, false)), f: Form = band ? 'band' : 'plot';
    if (stripNeed(geometry(path, w, hh, maxP, band))) f = 'strip';
    else {
      let r = drawPlot(ref, path, pal, pal.look, geometry(path, w, hh, maxP, band), hid);
      if (r.fail && !band) {
        band = true; f = 'band';
        if (stripNeed(geometry(path, w, hh, maxP, true))) f = 'strip';
        else r = drawPlot(ref, path, pal, pal.look, geometry(path, w, hh, maxP, true), hid);
      }
      if (f !== 'strip' && r.fail) f = 'strip';
    }
    worst = Math.max(worst, rank.indexOf(f));
    if (worst === 2) break;
  }
  return rank[worst]!;
}
const stripNeed = (g: Geo) => g.hh - g.T - g.B < (g.band ? BAND_PLOT_MIN : PLOT_MIN);

function drawPlot(inp: ProfileInput, path: ProfilePath, pal: Palette, look: string, g: Geo, hid: ReadonlySet<string> | null, force = false): { shapes: Shape[]; fail: boolean; compared: boolean } {
  const { w, hh, stations, L, R, T, B, slot, maxP, x, y, stagger, hasArt, artY, roomy } = g;
  const N = stations.length, m = inp.metrics ?? {};
  const out: Shape[] = [];
  const text = pal.tok('text'), muted = pal.tok('text-2'), faint = pal.tok('text-3'), danger = pal.tok('danger'), caution = pal.tok('caution'), surface = pal.tok('surface'), surface2 = pal.tok('surface-2');
  const TX = (x0: number, y0: number, s: string, size: number, weight: number, color: Rgba, anchor: TextShape['anchor'] = 'middle', baseline: TextShape['baseline'] = 'alphabetic', rot?: number, alpha?: number, halo?: TextShape['halo']): void => {
    const t: TextShape = { k: 'text', x: x0, y: y0, s, size, weight, color, anchor, baseline };
    if (rot) t.rot = rot;
    if (halo) t.halo = halo;
    if (alpha !== undefined) t.alpha = alpha;
    out.push(t);
  };
  out.push({ k: 'rect', x: 0, y: 0, w, h: hh, r: plotR(w, hh), fill: surface2 });

  // grid: solid hairlines (absolute pressure has no clinical threshold, so none is drawn), the numbers in a strip inside the panel's edge
  const gridOn = pal.tok('border-strong');
  const step0 = maxP > 40 ? 10 : 5, per = Math.abs(y(0) - y(step0)) || 1;
  const step = step0 * Math.max(1, Math.ceil(6 / per)), lstep = step0 * Math.max(1, Math.ceil(16 / per));
  for (let p = 0; p <= maxP; p += step) {
    const yy = Math.round(y(p)) + 0.5;
    out.push({ k: 'line', x1: L, y1: yy, x2: w - R, y2: yy, pen: { color: withAlpha(gridOn, 0.7), w: 1 } });
    if (p && p % lstep === 0) TX(L - 6, y(p) + 4, String(p), 12, 500, faint, 'end');
  }
  // the liver: a soft band behind its stations, named at the top
  let LC: { bx: number; bw: number } | null = null;
  if (path.liver) {
    const i0 = stations.indexOf(path.liver[0]), i1 = stations.indexOf(path.liver[1]);
    if (i0 >= 0 && i1 >= i0) {
      const bx = x(i0) - slot / 2, bw = slot * (i1 - i0 + 1);
      out.push({ k: 'rect', x: bx, y: T - 6, w: bw, h: y(0) - T + 6, fill: pal.tok('chart-liver-band') });
      if (y(0) - T >= 90) LC = { bx, bw };
    }
  }
  if (roomy || !hasArt) TX(8, 16, 'mmHg', 12, 500, faint, 'start'); else TX(w - R, artY + 4, 'mmHg', 12, 500, faint, 'end');
  // station names: horizontal, or turned 30° (ending under their point) when close together
  for (let i = 0; i < N; i++) {
    const nm = nameOf(path, stations[i]!);
    if (!stagger) TX(x(i), hh - B + 16, nm, 12, 500, muted, 'middle');
    else TX(x(i) + 3, hh - B + 10, nm, 12, 500, muted, 'end', 'middle', -30);
  }
  if (hasArt) {
    const axis = pal.tok('axis');
    for (let s = -1; s <= 1; s += 2) { const dy = 3 * s; out.push({ k: 'line', x1: L - 6, y1: T - 10 + dy + 3, x2: L + 6, y2: T - 10 + dy - 3, pen: { color: axis, w: 1.2 } }); }
    TX(8, artY + 4, 'arterial', 12, 500, faint, 'start');
  }

  // the curve runs through the venous stations only
  const venous: number[] = [];
  for (let i = 0; i < N; i++) if (!ARTERIAL.has(stations[i]!)) venous.push(i);
  const AT = (n: string, k: string | undefined): number => { const sv = k ? m[k] : undefined; return k && sv != null && Number.isFinite(sv) ? sv : inp.P[NI[n]!]!; };
  const now = stations.map((n) => AT(n, (AT_SHOWN as Record<string, string>)[n]));
  const colourOf = (i: number) => pressureColour(now[i]!, look);
  const mkPoly = (P: PressureList) => venous.map((i) => [x(i), y(P[NI[stations[i]!]!]!)]);
  const compared = !!inp.snap;
  const polyHealthy = inp.healthy ? mkPoly(inp.healthy) : null;
  if (polyHealthy) out.push({ k: 'path', pts: flat(smoothPoly(polyHealthy)), pen: { color: faint, w: 1.5, dash: DASH_HEALTHY, cap: 'round', join: 'round' } });
  if (inp.snap) out.push({ k: 'path', pts: flat(smoothPoly(mkPoly(inp.snap))), pen: { color: pal.tok('s1'), w: 2, dash: DASH_SNAP, cap: 'round', join: 'round' } });
  const P0 = venous.map((i) => [x(i), y(now[i]!)]);
  // the line and the soft area under it, in the colour of each station run into the next (2D grad: a horizontal gradient across the stations)
  const curve = smoothPoly(P0);
  if (P0.length > 1) {
    const x0 = P0[0]![0]!, span = Math.max(1, P0[P0.length - 1]![0]! - x0);
    const colAtX = (px: number): Rgba => {
      const t = clamp((px - x0) / span, 0, 1);
      for (let k = 0; k < venous.length - 1; k++) {
        const a = (x(venous[k]!) - x0) / span, b = (x(venous[k + 1]!) - x0) / span;
        if (t <= b || k === venous.length - 2) return lerpRgba(colourOf(venous[k]!), colourOf(venous[k + 1]!), clamp((t - a) / (b - a || 1), 0, 1));
      }
      return colourOf(venous[0]!);
    };
    const base = y(0), PIECE = 2;
    for (let q = 0; q + PIECE <= curve.length - 1 + (PIECE - 1); q += PIECE) {
      const seg = curve.slice(q, Math.min(curve.length, q + PIECE + 1));
      if (seg.length < 2) break;
      const mid = colAtX((seg[0]![0]! + seg[seg.length - 1]![0]!) / 2);
      out.push({ k: 'band', top: flat(seg), bottom: flat(seg.map((p) => [p[0]!, base])), fill: withAlpha(mid, 0.16) });
      out.push({ k: 'path', pts: flat(seg), pen: { color: mid, w: 3, cap: 'round', join: 'round' } });
    }
  }
  const nearCurve = curveTester(P0.map((p) => [p[0]!, p[1]!]));
  const nearHealthy = polyHealthy ? curveTester(polyHealthy) : null;
  const near = (r: Rect, pad: number, healthy = false) => (healthy ? nearHealthy!(r, 3 + 2 * pad, null) : nearCurve(r, 3 + 2 * pad, null));

  let fail = false;
  // station dots, ringed in the surface colour so they sit cleanly on the line
  const dots = stations.map((n, i) => ({ i, cx: x(i), cy: ARTERIAL.has(n) ? artY : y(now[i]!), col: ARTERIAL.has(n) ? pal.tok('artery') : colourOf(i) }));
  for (const d of dots) { out.push({ k: 'circle', cx: d.cx, cy: d.cy, r: 6.5, fill: surface2 }, { k: 'circle', cx: d.cx, cy: d.cy, r: 4.5, fill: d.col }); }
  // labels: the value at each station when there is room
  const taken: Rect[] = dots.map((d) => ({ x0: d.cx - 8, x1: d.cx + 8, y0: d.cy - 8, y1: d.cy + 8 }));
  const dims = path.dims ?? [], dimN = dims.length;
  const vals: { s: string; x: number; y: number }[] = [];
  if (slot >= 26) {
    const bandY = dimN ? y(0) - 12 - (dimN - 1) * 24 - 11 : hh;
    const spans: [number, number][] = [];
    for (const d of dims) { const a = stations.indexOf(d.hi), b2 = stations.indexOf(d.lo); if (a >= 0 && b2 >= 0) spans.push([Math.min(x(a), x(b2)) - 5, Math.max(x(a), x(b2)) + 5]); }
    const overSpan = (q: Rect) => spans.some(([lo, hi]) => q.x1 > lo && q.x0 < hi);
    for (const d of dots) {
      if (ARTERIAL.has(stations[d.i]!)) continue;
      const txt = fmt(now[d.i]!, 1), tw = W(txt, 12, 600), th = 12, sx = tw / 2 + 12;
      const q: Rect = { x0: 0, x1: 0, y0: 0, y1: 0 };
      let found = false;
      for (let ci = 0; ci < 6 * CAND_KX.length; ci++) {
        const cj = ci % CAND_KX.length, pass = Math.floor(ci / CAND_KX.length);
        const kx = CAND_KX[cj]!, dx = kx === 0 ? 0 : kx > 0 ? sx : -sx, dy = CAND_DY[cj]!;
        const cx = d.cx + dx, yy = d.cy + dy;
        q.x0 = cx - tw / 2; q.x1 = cx + tw / 2; q.y0 = yy - th / 2; q.y1 = yy + th / 2;
        if (q.y0 < 2 || q.y1 > hh - B - 2 || q.x0 < L - 4 || q.x1 > w - R + 4 || (q.y1 > bandY && (pass < 2 || (pass < 4 && overSpan(q))))) continue;
        let over = false;
        for (let j = 0; j < taken.length; j++) { const o = taken[j]!, gg = j < N ? 4 : 2; if (q.x0 < o.x1 + gg && q.x1 > o.x0 - gg && q.y0 < o.y1 + gg && q.y1 > o.y0 - gg) { over = true; break; } }
        if (over || near(q, 4) || (polyHealthy && pass % 2 === 0 && near(q, 2, true))) continue;
        found = true; break;
      }
      if (!found) { fail = true; continue; }
      taken.push({ ...q });
      vals.push({ s: txt, x: (q.x0 + q.x1) / 2, y: (q.y0 + q.y1) / 2 + 0.5 });
    }
  }
  const nLbl = taken.length - vals.length;   // (the dots, then each value, then the caption: the leaders break around values and the caption alone)
  // the LIVER caption over its band: centred, or slid along the band, where it stands clear
  if (LC) {
    const lw = W('LIVER', 12, 600), { bx, bw } = LC;
    for (const f of LIVER_AT) {
      const mx = Math.max(bx + lw / 2 + 2, Math.min(bx + bw - lw / 2 - 2, bx + bw * f));
      const q: Rect = { x0: mx - lw / 2 - 2, x1: mx + lw / 2 + 2, y0: T + 4 - 11, y1: T + 4 + 7 };
      if (q.x0 < L || q.x1 > w - R || anyOverlap(taken, taken.length, q) || near(q, 2)) continue;
      TX(mx, T + 4, 'LIVER', 12, 600, muted, 'middle');
      taken.push(q); break;
    }
  }
  // HVPG and PPG: a bracket from where each is measured to where it ends, with a pill giving its value (the tiles' own numbers and cut-offs)
  const claimed: Rect[] = [];
  const bracketOk = (yy: number, lx: number, withHealthy: boolean, tw: number, x0: number, x1: number): boolean => {
    const r: Rect = { x0: lx, x1: lx + tw, y0: yy - 8, y1: yy + 8 };
    if (anyOverlap(taken, taken.length, r, 4) || anyOverlap(claimed, claimed.length, r, 4) || near(r, 4)) return false;
    const bar: Rect = { x0: Math.min(x0, x1) - 3, x1: Math.max(x0, x1) + 3, y0: yy - 6, y1: yy + 6 };
    if (anyOverlap(taken, taken.length, bar) || anyOverlap(claimed, claimed.length, bar)) return false;
    return !withHealthy || !polyHealthy || !hitsLine(r, polyHealthy);
  };
  const pills: { a: number; b: number; col: Rgba; txt: string; num: string; tw1: number; tw: number; x0: number; x1: number; ty: number; tx: number; mk: { x: number; y: number; s: string; lx: number; ly: number } | null }[] = [];
  for (let k = 0; k < dimN; k++) {
    const d = dims[k]!;
    const a = stations.indexOf(d.hi), b = stations.indexOf(d.lo);
    if (a < 0 || b < 0 || (d.hide && hid?.has(d.hide))) continue;
    // (a bracket whose top end is a measured value, the HVPG's WHVP, is drawn from that value; with none measured it is left out, never drawn from the sinusoid's own pressure)
    const wv = measuredTop(d, m);
    if (d.hiM && wv == null) continue;
    const gapV = tenthGap(d.hiM && m[d.hiM] != null && Number.isFinite(m[d.hiM]) ? m[d.hiM]! : now[a]!, d.loM && m[d.loM] != null && Number.isFinite(m[d.loM]) ? m[d.loM]! : now[b]!, now[a]! - now[b]!)!;
    const sv = d.sev(gapV), col = sv === 'danger' ? danger : sv === 'caution' ? caution : muted;
    const txt = DIM_NAME(d.k), num = fmt(gapV, 1);
    const tw1 = W(txt, 12, 600), tw2 = W(num, 12.5, 700), tw = tw1 + tw2 + 12, x1 = x(b);
    // the labelled marker of the measured value (a square, so it is not read as a station dot), nudged aside where it would sit on the station's own dot
    let mk: { x: number; y: number; s: string; lx: number; ly: number } | null = null;
    let x0 = x(a);
    if (wv != null && !g.band) {
      const my = y(wv), mx = x(a) + (Math.abs(my - dots[a]!.cy) < 13 ? 11 : 0), ms = `${MARK_NAME[d.hiM!] ?? d.hiM} ${fmt(wv, 1)}`, lw = W(ms, 12, 600);
      const q: Rect = { x0: 0, x1: 0, y0: 0, y1: 0 };
      let found = false;
      for (let ci = 0; ci < 6 * CAND_KX.length && !found; ci++) {
        const cj = ci % CAND_KX.length, kx = CAND_KX[cj]!, sx = lw / 2 + 11, dx = kx === 0 ? 0 : kx > 0 ? sx : -sx, dy = CAND_DY[cj]! * (1 + Math.floor(ci / CAND_KX.length) * 0.5);
        const cx = mx + dx, yy = my + dy;
        q.x0 = cx - lw / 2; q.x1 = cx + lw / 2; q.y0 = yy - 6; q.y1 = yy + 6;
        if (q.y0 < 2 || q.y1 > hh - B - 2 || q.x0 < L - 4 || q.x1 > w - R + 4) continue;
        if (anyOverlap(taken, taken.length, q, 3) || near(q, 4)) continue;
        found = true;
      }
      if (!found) { fail = true; continue; }
      taken.push({ ...q });
      mk = { x: mx, y: my, s: ms, lx: (q.x0 + q.x1) / 2, ly: (q.y0 + q.y1) / 2 + 0.5 };
      x0 = mx;
    }
    const base = y(0) - 12 - (dimN - 1 - k) * 24;
    const lo = Math.max(L + 2, Math.min(x0, x1) + 8), hi = Math.min(w - R, Math.max(x0, x1) - 8) - tw;
    const cx = Math.max(L + 2, Math.min(w - R - tw, (x0 + x1) / 2 - tw / 2));
    const xs: number[] = [];
    const pushX = (v: number) => { if (v !== v || xs.includes(v)) return; xs.push(v); };
    if (hi >= lo) {
      pushX(Math.max(lo, Math.min(hi, cx)));
      if (hi > lo) for (let s = 12; s <= hi - lo + 12; s += 12) { pushX(Math.max(lo, Math.min(hi, cx + s))); pushX(Math.max(lo, Math.min(hi, cx - s))); }
    }
    const past = Math.max(x0, x1) + 8, before = Math.min(x0, x1) - 8 - tw;
    if (past >= L + 2 && past + tw <= w - R) pushX(past);
    if (before >= L + 2 && before + tw <= w - R) pushX(before);
    let best: { yy: number; lx: number } | null = null;
    if (g.band) best = { yy: hh - (dimN - k) * BAND_ROW + BAND_ROW / 2, lx: cx };
    else for (let wh = 0; wh < 2 && !best; wh++) {
      for (let yy = base; yy >= T + 10 && !best; yy -= 8) for (const lx of xs) if (bracketOk(yy, lx, wh === 0, tw, x0, x1)) { best = { yy, lx }; break; }
    }
    const spotFound = best !== null;
    if (!best) { fail = true; best = { yy: base, lx: cx }; }
    if (!(spotFound && g.band)) claimed.push({ x0: Math.min(x0, x1) - 3, x1: Math.max(x0, x1) + 3, y0: best.yy - 9, y1: best.yy + 9 });
    pills.push({ a, b, col, txt, num, tw1, tw, x0, x1, ty: best.yy, tx: best.lx, mk });
  }
  if (fail && !force) return { shapes: out, fail, compared };
  for (const p of pills) {
    const { a, b, col, txt, num, tw1, tw, x0, x1, mk } = p, yy = p.ty, lx = p.tx;
    // faint leaders from the bracket ends to the two station dots, broken around any value label (none from the band: the brackets stand under their stations' names there)
    if (!g.band) {
      const lead = { color: withAlpha(col, 0.45), w: 1, dash: DASH_LEAD };
      for (let e = 0; e < 2; e++) {
        const px = e === 0 ? x0 : x1, st2 = e === 0 ? a : b;
        const dy = e === 0 && mk ? mk.y : dots[st2]!.cy, from = yy + (dy > yy ? 4 : -4), to = dy + (dy > yy ? -(e === 0 && mk ? 6 : 7) : (e === 0 && mk ? 6 : 7));
        const fromLo = Math.min(from, to), fromHi = Math.max(from, to);
        const across: Rect[] = [];
        for (let j = nLbl; j < taken.length; j++) { const o = taken[j]!; if (px > o.x0 - 2 && px < o.x1 + 2 && o.y1 > fromLo && o.y0 < fromHi) across.push(o); }
        across.sort((p1, p2) => p1.y0 - p2.y0);
        const dir = to > from ? 1 : -1;
        let cur = from;
        const pieces: [number, number][] = [];
        const list = dir > 0 ? across : across.slice().reverse();
        for (const o of list) {
          const e2 = dir > 0 ? o.y0 - 1 : o.y1 + 1;
          if ((e2 - cur) * dir > 0) pieces.push([cur, e2]);
          cur = dir > 0 ? o.y1 + 1 : o.y0 - 1;
        }
        if ((to - cur) * dir > 0) pieces.push([cur, to]);
        // (a fixed number of pieces, the spare ones empty and clear, so the chart keeps one shape as a value moves)
        for (let k = 0; k < LEAD_PIECES; k++) {
          const pc = pieces[k];
          out.push(pc ? { k: 'line', x1: px, y1: pc[0], x2: px, y2: pc[1], pen: lead } : { k: 'line', x1: px, y1: from, x2: px, y2: from, pen: { ...lead, color: withAlpha(col, 0) } });
        }
      }
    }
    if (mk) {
      out.push({ k: 'rect', x: mk.x - 4.5, y: mk.y - 4.5, w: 9, h: 9, r: 1.5, fill: col, pen: { color: surface2, w: 1.5 } });
      TX(mk.lx, mk.ly, mk.s, 12, 600, col === muted ? text : col, 'middle', 'middle');
    }
    const pen = { color: col, w: 1.5, cap: 'butt' as const };
    out.push({ k: 'line', x1: x0, y1: yy - 4, x2: x0, y2: yy + 4, pen }, { k: 'line', x1: x1, y1: yy - 4, x2: x1, y2: yy + 4, pen });
    // The bar stops where the words stand (no box behind them): two pieces always, the spare one empty and clear, so the chart keeps one shape as a value moves.
    const blo = Math.min(x0, x1), bhi = Math.max(x0, x1), gone = { ...pen, color: withAlpha(col, 0) };
    const barPieces = ([[blo, Math.min(bhi, lx)], [Math.max(blo, lx + tw), bhi]] as [number, number][]).filter(([a0, a1]) => a1 - a0 >= 2);
    if (lx + tw <= blo || lx >= bhi) barPieces.splice(0, barPieces.length, [blo, bhi]);
    for (let k = 0; k < 2; k++) {
      const bp = barPieces[k];
      out.push(bp ? { k: 'line', x1: bp[0], y1: yy, x2: bp[1], y2: yy, pen } : { k: 'line', x1: blo, y1: yy, x2: blo, y2: yy, pen: gone });
    }
    const wordHalo = { color: surface2, w: 4 };   // (the plot's own colour round the letters)
    TX(lx + 6, yy + 0.5, txt, 12, 600, muted, 'start', 'middle', undefined, undefined, wordHalo);
    TX(lx + 6 + tw1, yy + 0.5, num, 12.5, 700, col === muted ? text : col, 'start', 'middle', undefined, undefined, wordHalo);
  }
  // the station values, where they were placed
  for (const v of vals) TX(v.x, v.y, v.s, 12, 600, text, 'middle', 'middle');
  return { shapes: out, fail, compared };
}
