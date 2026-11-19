// The stent pictures' numbers and layout (2D: tool-stent.js, stent-drop-pic.js, stent-trace-pic.js, stent-waist.js; looks chart-looks/stent.js): the side view of a TIPS or DIPS, the
// longitudinal traces along it and the staircase of where its pressure goes. Every function is the 2D one, lifted: no DOM, no easing (a Chart glides between frames). Units are the 2D pictures' own
// (a 320 wide picture; a frame scales them to the card's width).
import { smooth01 } from '../looks2d/num.js';
import { geomFix, geomOf, profileAt } from '../../../engine/hales/portal/stent-geom.js';
import { STENT_SITES, STENT_SPANS, stentSite, dopplerK, edgeById } from '../../../engine/hales/portal/topology.js';
import { stentTrace, makeTrace, TRACE_N } from '../../../engine/hales/portal/stent-trace.js';
import { stentNormal as stentNormal2D, velPos as velPos2D } from '../../../scene/lenses/vel-normal.copied.js';

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export { TRACE_N, makeTrace, smooth01, STENT_SPANS };

// ── what the card draws, in units of its pictures ──
export const VW = 320;
export const N_PROFILE = 96;   // (the outline's samples along the stent: 97 each side)
export const PARTS = ['tract', 'wall', 'ends', 'jet'];
export const IDS = { TIPS: 'tips', DIPS: 'dips' } as const;
export type StentId = keyof typeof IDS;

export interface Side { pxCm: number; pxMm: number; x0: number; span: number; stubH: number; labY: number; dimY: number; siteY: number; cy: number; nameY: number; numY: number; gateTop: number; capY: number; keyY: number; bandY: number; bandH: number; h: number }
/** The side view's rows for words of size fs (the picture's units: a narrower card draws its words larger in them, so the rows follow them and never touch). */
export function sideLayout(fs: number, o: Partial<Side> = {}): Side {
  const s = o as Side;
  s.pxCm = 26; s.pxMm = 3.1; s.x0 = 44; s.span = 232; s.stubH = 31;
  s.labY = fs * 0.6 + 1; s.dimY = s.labY + fs * 0.6 + 3; s.siteY = s.dimY + 12; s.cy = s.dimY + 36;
  s.nameY = s.cy + s.stubH / 2 + 3 + fs * 0.55;
  s.numY = s.cy + 20 + 5 + fs * 0.55; s.gateTop = s.numY - fs * 0.6 - 1;
  s.capY = s.numY + fs * 1.25; s.keyY = s.capY + fs * 1.25;
  s.bandY = s.cy + 12; s.bandH = s.numY + fs * 0.6 - s.bandY;
  s.h = s.keyY + fs * 0.7 + 3;
  return s;
}
/** The stent's two ends in the side view's x (units): the stent fills the picture's span whatever its length, so the staircase's guides stand on the same two. */
export const stentSpan = (): [number, number] => { const S = sideLayout(11); return [S.x0, S.x0 + S.span]; };
/** The staircase's top (mmHg) for a PPG: the next multiple of 4 over it, at least 8, at most 40. */
export const dropTop = (ppg: number) => clamp(Math.ceil((ppg + 1e-9) / 4) * 4, 8, 40);

// ── the numbers' words ──
export const ten = (v: number) => (Math.min(99.9, Math.max(0, Math.round(v * 10) / 10))).toFixed(1);
export const int = (v: number) => String(Math.max(0, Math.round(v)));

/** The pressure each part takes, in whole tenths of a mmHg that add up to the stent's own drop as it prints (largest remainder, the earlier part on a tie). Writes into out, returns the total in tenths. */
export function printedParts(parts: readonly number[], out: number[] = []): number {
  let sum = 0;
  for (let i = 0; i < parts.length; i++) sum += Math.max(0, parts[i]!);
  const total = Math.round(sum * 10);
  let used = 0;
  for (let i = 0; i < parts.length; i++) { out[i] = Math.floor(Math.max(0, parts[i]!) * 10 + 1e-9); used += out[i]!; }
  for (let left = total - used; left > 0; left--) {
    let best = -1, br = -1;
    for (let i = 0; i < parts.length; i++) { const r = Math.max(0, parts[i]!) * 10 - out[i]!; if (r > br + 1e-12) { br = r; best = i; } }
    out[best]!++;
  }
  return total;
}

export interface Geom { len: number; waist: number; trans: number; red: number }
/** The lumen's outline for the side view: the top edge from the portal end to the hepatic end, then the bottom back, [x, y, …] of 2 × (N_PROFILE + 1) points, at the stent's start x0 and length L (units), its diameter dPx, the wall's thickness `wt` outside the lumen, the narrowing s and the geometry g with the site's fraction. */
export function stentOutline(x0: number, L: number, cy: number, dPx: number, wt: number, s: number, g: Geom, site: number): number[] {
  const n = N_PROFILE, buf = new Array<number>(4 * (n + 1));
  for (let i = 0; i <= n; i++) {
    const u = i / n, half = (dPx * profileAt(g, s, site, u)) / 2 + wt, x = x0 + u * L;
    buf[2 * i] = x; buf[2 * i + 1] = cy - half;
    const q = 2 * n + 1 - i;
    buf[2 * q] = x; buf[2 * q + 1] = cy + half;
  }
  return buf;
}
/** The stent's local velocity at fraction u, as the scanner would read it (cm/s): the open stent's peak velocity over the share of the lumen's diameter squared. */
export const localVelocity = (v0: number, prof: number) => v0 / Math.max(0.05, prof * prof);
/** The open stent's scanner velocity (cm/s) from its flow (L/min) and diameter (mm), as the Doppler reads it (dopplerK). */
export function openVelocity(flowLpm: number, dMm: number, id: StentId): number {
  const A = Math.PI * (dMm / 10) * (dMm / 10) / 4;
  return A > 0 ? (Math.abs(flowLpm) / 0.06 / A) * dopplerK(edgeById(id)) : 0;
}
/** The scanner's reading over the mean velocity for this stent. */
export const scanK = (id: StentId) => dopplerK(edgeById(id));
/** The range the stent's peak velocity is read against ([lo, hi] cm/s): 90 to 190 for an 8 to 10 mm stent, scaled for the open diameter (velNormal.js stentNormal). */
export const stentNormal = (id: StentId, d: number): [number, number] => stentNormal2D(id, d) as [number, number];
/** A velocity's place on the velocity ramp against a vessel's range (velNormal.js velPos). */
export const velPos = (v: number, r: readonly [number, number]): number => velPos2D(v, r as [number, number]);

export const stentTitle = (t: { vessel?: string; show?: string[] } | null | undefined) => {
  const v = t?.vessel === 'DIPS' ? 'DIPS' : 'TIPS', show = Array.isArray(t?.show) ? t!.show! : ['lumen'];
  return show.includes('card') ? `${v}, the stent` : show.includes('trace') && !show.includes('lumen') ? `${v}, along the stent` : show.includes('lumen') ? `${v}, side view` : `${v}, where the pressure goes`;
};

// ── what the stent is, from a fingerprint or a frame ──
/** The numbers a stent shows, from a fingerprint (the slide's) or a frame's metrics (live): null when there is no stent. */
export interface StentRead { flow: number; dp: number; g0: number; g1: number; g2: number; tract: number; wall: number; ends: number; jet: number; ppg: number; lumen: number; vel: number; ivc: number;
  gLen?: number; gWaist?: number; gTrans?: number; gRed?: number; dOpen?: number; end?: number; site?: number | string }
export function readStent(src: any, id: StentId): StentRead | null {
  const k = IDS[id] || 'tips';
  const t = src?.metrics ? src.metrics[k] : null, fp = src?.metrics ? null : src;
  const out = {} as StentRead;
  if (t) {
    out.flow = t.flow; out.dp = t.dp; out.g0 = t.peaks[0]; out.g1 = t.peaks[1]; out.g2 = t.peaks[2];
    out.tract = t.parts.tract; out.wall = t.parts.wall; out.ends = t.parts.entry; out.jet = t.parts.jet + t.parts.inlet;
    out.ppg = src.metrics.ppg; out.lumen = t.dWaist; out.vel = t.vPeak; out.ivc = src.metrics.ivc;
    out.gLen = t.geom?.len; out.gWaist = t.geom?.waist; out.gTrans = t.geom?.trans; out.gRed = t.red; out.dOpen = t.d; out.end = t.end; out.site = t.site;
    return out;
  }
  if (!fp || fp[`${k}Flow`] == null) return null;
  out.flow = fp[`${k}Flow`]; out.dp = fp[`${k}Dp`]; out.g0 = fp[`${k}G0`]; out.g1 = fp[`${k}G1`]; out.g2 = fp[`${k}G2`];
  out.tract = fp[`${k}Tract`]; out.wall = fp[`${k}Wall`]; out.ends = fp[`${k}Ends`]; out.jet = fp[`${k}Jet`];
  out.ppg = fp.ppg; out.lumen = fp[`${k}Lumen`]; out.vel = fp[`${k}Vel`]; out.ivc = fp.ivc;
  out.gLen = fp[`${k}Len`]; out.gWaist = fp[`${k}WaistLen`]; out.gTrans = fp[`${k}Trans`]; out.gRed = fp[`${k}Red`]; out.dOpen = fp[`${k}D`]; out.end = fp[`${k}Stn`]; out.site = fp[`${k}StnSite`];
  return out;
}

/** Everything the three pictures draw from, at one moment (the 2D card's goal channels, unscaled). */
export interface StentState {
  id: StentId; have: boolean;
  sh: Geom; /** the end stenosis (0 to 1) and where along the stent it sits (0 to 1) */ s: number; site: number;
  /** the open diameter, mm */ d: number;
  /** the flow, L/min (always positive: the picture shows the size) */ flow: number;
  /** the three Doppler points' peak velocity, cm/s */ g: [number, number, number];
  /** the drop's parts, mmHg, scaled to the stent's own drop */ tract: number; wall: number; ends: number; jet: number;
  /** the PPG less the stent's own drop (the veins outside it), mmHg */ out: number;
  ivc: number; ppg: number; dp: number; lumen: number; vel: number;
}

/** The stent a slide's fingerprint (or a live frame) describes, with the geometry from its own record (a card pinned to the slide draws the stent the numbers came from) and the patient's params where the record has none. */
export function stentState(src: any, id: StentId, params: any): StentState {
  const R = readStent(src, id), e = IDS[id], have = !!R;
  const own = have && R!.gLen != null && R!.dOpen! > 0;
  const g = own ? geomFix({ len: R!.gLen, waist: R!.gWaist, trans: R!.gTrans, red: R!.gRed || 0 }, e) : geomOf(params, id, e);
  const d = own ? R!.dOpen! : params?.[e]?.d > 0 ? params[e].d : 8;
  const s = own && R!.end != null ? clamp(R!.end, 0, 1) : clamp(1 - (1 - (+params?.stenosis?.[id] || 0)) * (1 - (+params?.thrombus?.[id] || 0)), 0, 1);
  const site = own && R!.site != null ? (typeof R!.site === 'string' ? (STENT_SITES as Record<string, number>)[R!.site]! : R!.site) : (STENT_SITES as Record<string, number>)[stentSite(params, id)]!;
  let tract = 0, wall = 0, ends = 0, jet = 0, out = 0, flow = 0, ivc = 0, gs: [number, number, number] = [0, 0, 0];
  if (R) {
    const tot = R.tract + R.wall + R.ends + R.jet, k = tot > 1e-6 && R.dp > 0 ? R.dp / tot : 1;
    tract = Math.max(0, R.tract * k); wall = Math.max(0, R.wall * k); ends = Math.max(0, R.ends * k); jet = Math.max(0, R.jet * k);
    out = Math.max(0, (R.ppg ?? 0) - Math.max(0, R.dp));
    flow = Math.abs(R.flow); ivc = R.ivc || 0; gs = [R.g0, R.g1, R.g2];
  }
  const dp = tract + wall + ends + jet;
  return { id, have, sh: g as Geom, s, site, d, flow, g: gs, tract, wall, ends, jet, out, ivc, ppg: dp + out, dp, lumen: R?.lumen ?? 0, vel: R?.vel ?? 0 };
}

// ── the traces (stent-trace-pic.js) ──
export const TR = { x1: 316, veinCm: 3, ph: 92 };
export const PANELS = ['pressure', 'energy', 'velocity'] as const;
export type Panel = (typeof PANELS)[number];
export const TITLES: Record<Panel, string> = { pressure: 'Pressure, mmHg (absolute)', energy: 'Energy lost so far, mmHg', velocity: 'Mean velocity, cm/s' };
export const KEY = '1 Portal  2 Inlet  3 Waist  4 Outlet  5 IVC';
const NICE_V = [20, 40, 60, 80, 100, 150, 200, 300, 400, 600];
/** The sample index of fraction u along a stent of length len cm in the trace (the gates' places on the chart). */
export const gateIndex = (u: number, len: number) => clamp(Math.round((TRACE_N * (u * len + TR.veinCm)) / (len + 2 * TR.veinCm)), 0, TRACE_N);
/** The place of x cm along the trace on the side view's x (units): the stent's own length between its two ends px0 and px1, each vein cut where the picture ends. */
export const xAt = (cm: number, len: number, px0: number, px1: number, xl: number) =>
  (cm <= 0 ? xl + ((px0 - xl) * (cm + TR.veinCm)) / TR.veinCm : cm >= len ? px1 + ((TR.x1 - px1) * (cm - len)) / TR.veinCm : px0 + ((px1 - px0) * cm) / Math.max(1e-9, len));

/** The numbers the trace reads, from a state. */
export interface TraceIn { sh: Geom; s: number; site: number; d: number; flowLpm: number; tract: number; wall: number; ends: number; jet: number; ppg: number; dp: number }
export const traceIn = (st: StentState): TraceIn => ({ sh: st.sh, s: st.s, site: st.site, d: st.d, flowLpm: st.flow, tract: st.tract, wall: st.wall, ends: st.ends, jet: st.jet, ppg: st.ppg, dp: st.dp });
export type Trace = ReturnType<typeof makeTrace>;
/** The trace for the numbers T (the stent's curves of pressure, energy lost and velocity), written into rec when given. */
export function traceFor(T: TraceIn, rec: Trace = makeTrace()): Trace {
  const len = T.sh.len, xa = -TR.veinCm, xb = len + TR.veinCm;
  const prof = (u: number) => profileAt(T.sh, T.s, T.site, u);
  return stentTrace({ len, q: (Math.abs(T.flowLpm) * 1000) / 60, d: T.d, prof, xa, xb, tract: T.tract, wall: T.wall, entry: T.ends, jet: T.jet, inlet: 0, ppg: T.ppg, dp: T.dp }, rec);
}
/** The charts' ranges for the numbers T (nice round ends): pHi, pLo, vHi. */
export function traceFit(T: TraceIn, ivc: number): { pHi: number; pLo: number; vHi: number } {
  const o = traceFor(T);
  let mn = Infinity, mx = 0;
  for (let i = 0; i <= TRACE_N; i++) { if (o.P[i]! < mn) mn = o.P[i]!; if (o.v[i]! > mx) mx = o.v[i]!; }
  mn += ivc;
  return { pHi: Math.max(8, Math.ceil((T.ppg + ivc - 1e-9) / 4) * 4), pLo: mn < -0.05 ? Math.floor(mn / 2) * 2 : 0, vHi: NICE_V.find((t) => t >= mx * 1.08) || Math.ceil((mx * 1.08) / 100) * 100 };
}
export interface TraceRows { fs: number; X0: number; title: number; top: number; base: number; digits: number; key: number; h: number }
/** The trace picture's rows follow the words' size fs (in units): the chart's gutter for its ticks, the title above it, the key and the note under it. */
export function traceLayout(fs: number): TraceRows {
  const X0 = 6 + fs * 0.6 * 3 + 2, title = fs * 0.5 + 2, top = title + fs * 0.5 + 6, base = top + TR.ph, digits = base + fs * 0.9 + 2, key = digits + fs * 1.4;
  return { fs, X0, title, top, base, digits, key, h: key + fs * 0.8 + 3 };
}

// ── the staircase (stent-drop-pic.js) ──
export const DROP = { w: 320, gutter: 6, dotR: 3.5, plotH: 50 };
export const COLS = ['out', 'tract', 'ends', 'wall', 'jet'] as const;
export const DROP_NAMES: Record<(typeof COLS)[number], string> = { out: 'Outside', tract: 'Tract', ends: 'In and out', wall: 'Friction', jet: 'Jet' };
export interface DropRows { yT: number; yB: number; baseY: number; nameY: number; valY: number; totY: number; h: number }
/** The picture's rows for words of size fs: the room above the plateau for the PPG's word, the plot, the three words under its baseline, the key's names and numbers, the stent's own drop, and the height. */
export function dropLayout(fs: number): DropRows {
  const yT = 1.4 * fs + 2, yB = yT + DROP.plotH, baseY = yB + 0.65 * fs + 4, nameY = baseY + 1.35 * fs + 4, valY = nameY + 1.3 * fs + 1, totY = valY + 1.4 * fs;
  return { yT, yB, baseY, nameY, valY, totY, h: totY + 0.6 * fs + 3 };
}
/** The key's columns for the words' size fs: each as wide as its longest word and its dot, the room left shared out evenly. Returns the lefts (6 numbers: the last is the right edge) and the size the key's words are drawn at. */
export function keyCols(fs: number): { lefts: number[]; kf: number } {
  const room = DROP.w - 2 * DROP.gutter, need = (f: number, c: (typeof COLS)[number]) => Math.max(DROP_NAMES[c].length, 4) * 0.6 * f + 3 * DROP.dotR + 3;
  let kf = fs;
  while (COLS.reduce((a, c) => a + need(kf, c), 0) > room && kf > 6) kf *= 0.96;
  const extra = (room - COLS.reduce((a, c) => a + need(kf, c), 0)) / COLS.length;
  const lefts: number[] = [];
  let x = DROP.gutter;
  for (let c = 0; c < COLS.length; c++) { lefts[c] = x; x += need(kf, COLS[c]!) + extra; }
  lefts[COLS.length] = x;
  return { lefts, kf };
}

/** What the staircase draws for a state: its trace, the printed parts and the words. to: 'ppg' shows the veins outside the stent too, 'stent' starts at the stent's own drop; max: the scale's top when a slide gives one. */
export interface DropIn { o: Trace; len: number; px0: number; px1: number; ppg: number; pHi: number; on: number; vals: number[]; words: string[]; ppgWord: string; totWord: string }
export function dropIn(st: StentState, o: { to?: 'ppg' | 'stent'; max?: number } = {}): DropIn {
  const on = o.to === 'ppg' ? 1 : 0, T = traceIn(st);
  T.ppg = T.dp + (T.ppg - T.dp) * on;
  const parts4 = [T.tract, T.ends, T.wall, T.jet], tenths: number[] = [];
  const dpTen = printedParts(parts4, tenths), ppgTen = Math.round(T.ppg * 10), outTen = Math.max(0, ppgTen - dpTen);
  const [px0, px1] = stentSpan();
  const vals = [outTen / 10, ...tenths.map((t) => t / 10)];
  const maxMm = +(o.max ?? 0) > 0 ? clamp(+o.max!, 6, 40) : 0;
  const top = maxMm > 0 ? maxMm : dropTop(st.dp + st.out * on);
  return { o: traceFor(T), len: T.sh.len, px0, px1, ppg: T.ppg, pHi: Math.max(4, top), on, vals, words: vals.map(ten), ppgWord: `PPG ${ten(ppgTen / 10)}`, totWord: `Across the stent ${ten(dpTen / 10)} mmHg` };
}
