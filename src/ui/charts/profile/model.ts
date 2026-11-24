// The pressure profile along the circuit (2D: tool-profile.js, host 'prof'): pure layout as a function of (width, height, type size, a word's width, the numbers).
// The layout itself (the stations, zones, name fit, value places, pills, line names, brackets' fit, red blocks) is the 2D file's own code, copied by
// scripts/copy-chart-profile.mjs into layout.generated.js; this file types it and adds the drawing's own numbers (the smooth line, the cuts the readings
// make in it, the gridlines, the brace, the hatching), each lifted from the 2D tool's model builder (buildModel / paintNow).
import { measure } from '../measure.ts';
import { fmt } from '../fmt.ts';
import * as L from './layout.generated.js';
import { hvpgSentence } from './wedge.ts';

export const {
  STATIONS, SPANS, NO_SPANS, BRACE_NAME, FULL_NAMES, SHORT_NAMES, ZONES, BLOCK_FALL, NUM_PAD, BR_PAD, BR_GAP, PILL_GAP,
  spansOf, spansStented, hasStent, profileOf, axisTop, blocksOf, blockSpan, chartScale, pillReadings, whole, zoneSpans, zoneSize,
  profileGeo: profileGeo2D, nameFit, zoneFit, bracketFit, braceD, numberSides, placePills, placeLineNames, pillSize, LIVER_NAMES, SPOKEN, RATE_OF, PATH,
} = L as unknown as {
  STATIONS: string[]; SPANS: Span[]; NO_SPANS: Span[]; BRACE_NAME: string; FULL_NAMES: Record<string, string>; SHORT_NAMES: Record<string, string>;
  ZONES: { cls: string; one: string; top: string }[]; BLOCK_FALL: number; NUM_PAD: number; BR_PAD: number; BR_GAP: number; PILL_GAP: number;
  spansOf(keys?: readonly string[] | null): Span[]; spansStented(list: Span[]): Span[]; hasStent(fp: Fp | null | undefined): boolean;
  profileOf(fp: Fp | null | undefined): Prof | null; axisTop(...lines: (Prof | null | undefined)[]): number; blocksOf(p: Prof | null, hl: Prof | null): number[];
  blockSpan(cx: number, slot: number, tw: Tw): [number, number]; chartScale(W: number, w0: number, f0: number, floor?: number): { k: number; s: number };
  pillReadings(fp: Fp | null | undefined): { k: string; name: string; v: string; rate: Rate }[]; whole(v: number): string;
  zoneSpans(): [number, number][]; zoneSize(f: number): number;
  profileGeo(w: number, h: number, f: number, tw: Tw, inside?: boolean, spans?: Span[]): Geo; nameFit(slot: number, tw: Tw): unknown; zoneFit(slot: number, f: number, tw: Tw): unknown;
  bracketFit(span: number, name: string, tw: Tw, f: number): { mode: 'gap' | 'tight' | 'stack'; fs: number }; braceD(xa: number, xb: number, y0: number, d: number): string;
  numberSides(G: Geo, tw: Tw, goal: Goal): Side[]; placePills(G: Geo, tw: Tw, goal: Goal, hl: Prof | null, bf: Prof | null, sides: Side[]): Box[] | null;
  placeLineNames(G: Geo, tw: Tw, goal: Goal, hl: Prof | null, bf: Prof | null, sides: Side[], brk: null, bfName: string, pills: Box[]): LineName[];
  pillSize(G: Geo, tw: Tw): { w: number[]; h: number; pad: number }; LIVER_NAMES: Record<string, string>; SPOKEN: Record<string, string>;
  RATE_OF: Record<string, (v: number) => Rate>; PATH: { liver: [string, string]; nodes: string[]; names: Record<string, string> };
};

export type Rate = 'ok' | 'mid' | 'hi';
/** A bracket: [key, name, from-station, to-station]. */
export type Span = readonly [string, string, string, string];
/** A fingerprint as the engine reports it (src/engine/hales/portal/fingerprint.js): the tiles' numbers and `at.P`, the node pressures. */
export type Fp = Record<string, unknown> & { at?: { P: ArrayLike<number> } | null };
/** A profile: the eight stations' pressures in order, and the three gradients as the tiles give them. */
export interface Prof { v: number[]; hvpg: number; eus: number; ppg: number }
/** The profile the chart is aimed at, with the axis's top. */
export interface Goal extends Prof { top: number; /** the measured wedged and free hepatic venous pressures (the Intra- and HV stations' readings), for the HVPG's sentence */ whvp?: number; fhvp?: number }
export type Box = [number, number, number, number];
export type Tw = (t: string, weight?: number) => number;
export interface Side { s: number; dx: number; by: number; box: Box }
export interface LineName { t: string; c: 'hl' | 'bf'; x: number; y: number; w: number }
export interface Geo {
  w: number; h: number; f: number; L: number; R: number; T: number; B: number; Z: number; slot: number; x(i: number): number;
  fit: { names: string[]; rows: number; dx: number[]; low: boolean[] }; brMode: ('gap' | 'tight' | 'stack')[]; brFs: number[]; spans: Span[];
  zone: { lines: number; tight: boolean; /** two lines of name made one: the first word only (PRE, INTRA, POST) */ word?: boolean }; zb: number; hdr: number; need: number; braceY: number; /** the baseline-centre row of the inline "sinusoidal" bracket */ sinY: number; nameX(i: number): number; nameY(i: number): number; brY(k: number): number;
}

/** The room the card gives back to the chart without growing (Gut to Heart, 23 and 24 Nov: "this top card can use some space ... without changing the card height", "wasted space between the HVPG and PPG
 *  brackets"). The 2D layout's zone names took two lines (PRE / HEPATIC) and the liver's brace its own row under the station names; its bracket rows stood 29 px apart. Here the zone names are one word on one
 *  line, "sinusoidal" stands in a bracket on the row under the names (the bracket style of HVPG and PPG), a row shorter than the brace, and the bracket rows stand `ROW_AIR` em clear of each other
 *  (about 20 px apart at 13.8 px type). The chart's height and its `need` floor stay the 2D tool's, so the card's height never changes: all the room goes to the plot. */
const SIN_ROW = 1.0;     // em the brace row gives back
const ROW_AIR = 0.6;     // em of clear air between two bracket rows' words
const BAND_PAD = 0.25;   // em above the first row and under the last
export function profileGeo(w: number, h: number, f: number, tw: Tw, inside = false, spans: Span[] = SPANS): Geo {
  const G0 = profileGeo2D(w, h, f, tw, inside, spans);
  const cut1 = G0.zone.lines === 2 ? 1.05 * zoneSize(f) : 0, braceH = 1.85 * f, braceH2 = braceH - SIN_ROW * f;
  const nameH = G0.fit.rows * 1.25 * f + 0.4 * f, n = spans.length;
  const T = G0.T - cut1;
  // (each row's half height as the 2D layout counts it; a stacked label is taller)
  const half = G0.brMode.map((m) => (m === 'stack' ? 0.91 : 0.36) * f + 1), centre: number[] = [];
  let y = BAND_PAD * f;
  for (let k = 0; k < n; k++) { y += k ? half[k - 1]! + Math.min(ROW_AIR * f, 9) + half[k]! : half[0]!; centre.push(y); }
  const band = inside || !n ? 0 : (centre[n - 1] ?? 0) + half[n - 1]! + BAND_PAD * f;
  const B = Math.max(T + 3 * f + band, h - nameH - braceH2 - 0.5 * f), Z = inside ? B : B - band;
  const nameY = (i: number) => B + 1.05 * f + (G0.fit.low[i] ? 1.25 * f : 0);
  return { ...G0, T, B, Z, hdr: G0.hdr - cut1, zone: cut1 ? { ...G0.zone, word: true } : G0.zone, nameY,
    braceY: B + nameH - 0.1 * f, sinY: B + 1.05 * f + (G0.fit.rows - 1) * 1.25 * f + 1.15 * f,
    brY: (k: number) => (inside || !n ? G0.brY(k) : Z + centre[k]!) };
}

export const NS = STATIONS.length;
/** The fade and glide time of the blocks, brackets, pills and names (2D: D_SURFACE). */
export const FADE_MS = 420;
/** SEG_K: steps of a span of the smooth line. */
export const SEG_K = 10;
/** A reading's width is tabled to here, a whole mmHg at a time; past it the last one stands. */
export const V_MAX = 300;
/** A bracket's or pill's reading (HVPG, PPG, EUS-PPG): one decimal, as the card's pill prints it ("0.5", never "1"). The stations' own readings stay whole numbers. */
export const gap1 = (v: number): string => fmt(v, 1);
export const whole0 = (v: number) => { const r = Math.round(v); return r > V_MAX ? V_MAX : r > 0 ? r : 0; };
export const toneOf = (r: Rate) => (r === 'hi' ? 2 : r === 'mid' ? 1 : 0);

/** A profile of eight pressures made by hand (a specimen, a test). */
export const profOf = (v: readonly number[], hvpg: number, ppg: number, eus = 0): Prof => ({ v: [...v], hvpg, eus, ppg });
/** The goal for a state: its profile, the healthy and the earlier one, and the axis that holds them all. */
export const goalOf = (p: Prof, hl: Prof | null, bf: Prof | null): Goal => ({ ...p, v: [...p.v], top: axisTop(p, hl, bf) });

/** A word's width as Inter sets it at type size f. */
export const twAt = (f: number): Tw => (t, wt = 600) => measure(t, f, wt);

/** What a chart of this size draws: the 2D tool's plan (layout, value places, pills, the lines' names), settled once for a state. */
export interface ProfilePlan {
  /** the box this was made for (the same text means the same layout: a new state at this size glides) */
  size: string;
  w: number; h: number; f: number; tw: Tw; G: Geo; goal: Goal; hl: Prof | null; bf: Prof | null; spans: Span[];
  sides: Side[]; pills: Box[] | null; names: LineName[]; bfName: string;
}

/** The chart's height: the box the card gives it (or its own default: the stacked card's, min(74 % of the width, 270) less 1.6 em), at least 11 em (the CSS
 *  min-height) and at least what the layout needs with its plot at its smallest and the brackets' band kept. */
export function heightFor(w: number, f: number, spans: Span[], asked?: number): number {
  const need = profileGeo(w, 0, f, twAt(f), false, spans).need;
  const own = asked ?? Math.min(w * 0.74, 270) - 1.6 * f;
  return Math.ceil(Math.max(own, 11 * f, need));
}

/** A line's name that stands on a reading's number (a short plot has no clear place beside the line: "Healthy" over the HV's 16, Where resistance 7, capture 4bf601dd) goes on its own line instead
 *  (Mohammad, 21 Oct: "put healthy on the dashed line"), where its halo breaks it: the place nearest the line's right end clear of every number (and its halo) and of the slide's own line. */
export function clearOfReadings(names: LineName[], G: Geo, goal: Goal, hl: Prof | null, bf: Prof | null, sides: Side[]): LineName[] {
  const f = G.f, cap = 0.72 * f, halo = 2.5;
  const yg = (v: number) => G.Z - (G.Z - G.T) * Math.max(0, Math.min(v, goal.top)) / goal.top;
  const lineAt = (p: Prof, x: number): number => {
    const xs = p.v.map((_, i) => G.x(i));
    let i = 0; while (i < xs.length - 2 && x > xs[i + 1]!) i++;
    const t = Math.max(0, Math.min(1, (x - xs[i]!) / ((xs[i + 1]! - xs[i]!) || 1)));
    return yg(p.v[i]! + (p.v[i + 1]! - p.v[i]!) * t);
  };
  const over = (b: Box, bs: Box[]) => bs.some((o) => b[0] < o[1] && o[0] < b[1] && b[2] < o[3] && o[2] < b[3]);
  const nums: Box[] = sides.filter((v) => v?.box).map((v) => [v.box[0] - halo, v.box[1] + halo, v.box[2] - halo, v.box[3] + halo]);
  return names.map((n) => {
    const own = n.c === 'hl' ? hl : bf;
    const box: Box = [n.x - n.w / 2, n.x + n.w / 2, n.y - cap, n.y + 0.2 * f];
    if (!own || !over(box, nums)) return n;
    for (let x = G.R - n.w / 2; x >= G.L + n.w / 2 + 2; x -= 3) {
      const y = lineAt(own, x) + 0.36 * f, b: Box = [x - n.w / 2, x + n.w / 2, y - cap, y + 0.2 * f];
      const gy = [x - n.w / 2, x, x + n.w / 2].map((px) => lineAt(goal, px));
      if (over(b, nums) || gy.some((g) => g > b[2] - 2 && g < b[3] + 2) || b[2] < G.T || b[3] > G.Z) continue;
      return { ...n, x, y };
    }
    return n;
  });
}

export function planProfile(w: number, h: number, f: number, goal: Goal, hl: Prof | null, bf: Prof | null, spans: Span[], bfName = 'Before'): ProfilePlan {
  const tw = twAt(f);
  const hh = heightFor(w, f, spans, h > 0 ? h : undefined);
  const G = profileGeo(w, hh, f, tw, false, spans);
  const sides = numberSides(G, tw, goal), pills = placePills(G, tw, goal, hl, bf, sides);
  const names = clearOfReadings(placeLineNames(G, tw, goal, hl, bf, sides, null, bfName, pills || []), G, goal, hl, bf, sides);
  return { size: `${Math.round(w)}x${Math.round(hh)}|${f.toFixed(3)}|${spans.map(([k]) => k).join()}`, w, h: hh, f, tw, G, goal, hl, bf, spans, sides, pills, names, bfName };
}

/** The pressure's y at value v on the plot. */
export const yOf = (G: Geo, top: number, v: number) => G.Z - (G.Z - G.T) * Math.max(0, Math.min(v, top)) / top;

/** The monotone smooth line through the points (xs, ys) as a polyline of SEG_K steps a span, flat [x0, y0, x1, y1, ...] (2D: smoothInto, curve-near.js's own control points). */
export function smooth(xs: ArrayLike<number>, ys: ArrayLike<number>): number[] {
  const n = xs.length, sl: number[] = [], tn: number[] = [], dx: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = xs[i + 1]! - xs[i]! || 1e-6; sl[i] = (ys[i + 1]! - ys[i]!) / dx[i]!; }
  tn[0] = sl[0]!;
  for (let i = 1; i < n - 1; i++) tn[i] = sl[i - 1]! * sl[i]! <= 0 ? 0 : (sl[i - 1]! + sl[i]!) / 2;
  tn[n - 1] = sl[n - 2]!;
  for (let i = 0; i < n - 1; i++) {
    if (sl[i] === 0) { tn[i] = tn[i + 1] = 0; continue; }
    const a = tn[i]! / sl[i]!, b = tn[i + 1]! / sl[i]!, h2 = a * a + b * b;
    if (h2 > 9) { const k = 3 / Math.sqrt(h2); tn[i] = k * a * sl[i]!; tn[i + 1] = k * b * sl[i]!; }
  }
  const out = [xs[0]!, ys[0]!];
  for (let i = 0; i < n - 1; i++) {
    const d = dx[i]! / 3, x0 = xs[i]!, y0 = ys[i]!, x1 = xs[i + 1]!, y1 = ys[i + 1]!, ax = x0 + d, ay = y0 + tn[i]! * d, bx = x1 - d, by = y1 - tn[i + 1]! * d;
    for (let j = 1; j <= SEG_K; j++) {
      const t = j / SEG_K, u = 1 - t;
      out.push(u * u * u * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x1, u * u * u * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y1);
    }
  }
  return out;
}

/** The polyline (flat points) with the boxes [x0, x1, y0, y1] taken out: the runs left, each flat points. The 2D lines stop short of each reading by a mask; a frame has no mask, so the
 *  line is cut where it enters and leaves each box. */
export function cutRuns(pts: readonly number[], holes: readonly Box[]): number[][] {
  const runs: number[][] = [];
  let cur: number[] = [], contig = false;
  const flush = () => { if (cur.length >= 4) runs.push(cur); cur = []; };
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const x0 = pts[i]!, y0 = pts[i + 1]!, x1 = pts[i + 2]!, y1 = pts[i + 3]!, dx = x1 - x0, dy = y1 - y0;
    const inside: [number, number][] = [];
    for (const [bx0, bx1, by0, by1] of holes) {
      let t0 = 0, t1 = 1;
      const clip = (p: number, q: number) => { if (p === 0) return q >= 0; const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } return true; };
      if (clip(-dx, x0 - bx0) && clip(dx, bx1 - x0) && clip(-dy, y0 - by0) && clip(dy, by1 - y0) && t1 > t0) inside.push([t0, t1]);
    }
    inside.sort((a, b) => a[0] - b[0]);
    const out: [number, number][] = [];
    let t = 0;
    for (const [a, b] of inside) { if (a > t) out.push([t, a]); t = Math.max(t, b); }
    if (t < 1) out.push([t, 1]);
    if (!out.length) contig = false;
    for (const [a, b] of out) {
      if (!(a === 0 && contig)) { flush(); cur.push(x0 + dx * a, y0 + dy * a); }
      cur.push(x0 + dx * b, y0 + dy * b);
      contig = b === 1;
    }
  }
  flush();
  return runs;
}

/** The boxes a reading cuts out of the lines: its digits' width and NUM_PAD round them (2D: the mask's holes). */
export function holesOf(G: Geo, f: number, tw: Tw, ys: ArrayLike<number>, v: ArrayLike<number>): Box[] {
  const out: Box[] = [];
  for (let i = 0; i < NS; i++) {
    const hw = tw(String(whole0(v[i]!)), 700) / 2;
    out.push([G.x(i) - hw - NUM_PAD, G.x(i) + hw + NUM_PAD, ys[i]! - 0.36 * f - NUM_PAD, ys[i]! + 0.36 * f + NUM_PAD]);
  }
  return out;
}

/** The gridlines at axis top `top`: every 5 (10 over 40), every other where they would crowd. → [value, y, label?]; no label on the first (0 is implied). */
export function gridOf(G: Geo, f: number, top: number): { v: number; y: number }[] {
  const step = top > 40 ? 10 : 5, every = (G.Z - G.T) / (top / step) < 1.3 * f ? 2 * step : step, cnt = Math.floor(top / every) + 1;
  const out: { v: number; y: number }[] = [];
  for (let k = 0; k < cnt; k++) { const v = Math.max(0, Math.min(k * every, top)); out.push({ v: k * every, y: G.Z - (G.Z - G.T) * v / top }); }
  return out;
}

/** A block's box on the shown line (2D paintNow): on station i's column, from over its reading down to the level of the next reading (the heart's: down to zero). */
export function blockRect(G: Geo, f: number, py: ArrayLike<number>, i: number, bx: [number, number]): { x: number; y: number; w: number; h: number; r: number } {
  const y0 = py[i]! - 0.36 * f - NUM_PAD, y1 = i >= NS - 1 ? Math.max(y0 + 4, G.Z) : Math.max(y0 + 4, py[i + 1]! + 0.36 * f);
  return { x: bx[0], y: y0, w: bx[1] - bx[0], h: y1 - y0, r: Math.min(4, (bx[1] - bx[0]) / 2) };
}

/** The block's hatching (2D: the pattern card.hatch.bg / card.hatch.stripe, 8 px, rotated 45): the stripes as segments over a box, [x1, y1, x2, y2], 4 px thick, 8 px apart. */
export function hatchLines(x: number, y: number, w: number, h: number, size = 8): number[][] {
  // pattern space is the plane turned 45 degrees: a stripe stands where (X + Y) / sqrt2 is within [0, size/2) of a multiple of the tile
  const r2 = Math.SQRT2, lo = (x + y) / r2, hi = (x + w + y + h) / r2, out: number[][] = [];
  // each stripe is cut to the box grown by its half width (the frame's clip then rounds the corners): on the line y = c - x, x runs from max(bx0, c - by1) to min(bx1, c - by0)
  const pad = size / 4 / r2 + 0.5, bx0 = x - pad, bx1 = x + w + pad, by0 = y - pad, by1 = y + h + pad;
  for (let k = Math.floor(lo / size) - 1; k * size <= hi + size; k++) {
    const c = (k * size + size / 4) * r2;   // X + Y = c along the stripe's middle
    const xa = Math.max(bx0, c - by1), xb = Math.min(bx1, c - by0);
    if (xb > xa) out.push([xa, c - xa, xb, c - xb]);
  }
  return out;
}

/** A curly brace as points from xa to xb, its back at y0 and its tip d under it at the middle (2D braceD, the quadratics sampled). */
export function bracePts(xa: number, xb: number, y0: number, d: number): number[] {
  const m = (xa + xb) / 2, r = Math.min(d, (xb - xa) / 8), y1 = y0 + d / 2, out: number[] = [xa, y0];
  const q = (cx: number, cy: number, x: number, y: number) => {
    const sx = out[out.length - 2]!, sy = out[out.length - 1]!;
    for (let k = 1; k <= 8; k++) { const t = k / 8, u = 1 - t; out.push(u * u * sx + 2 * u * t * cx + t * t * x, u * u * sy + 2 * u * t * cy + t * t * y); }
  };
  q(xa, y1, xa + r, y1); out.push(m - r, y1);
  q(m, y1, m, y0 + d); q(m, y1, m + r, y1); out.push(xb - r, y1);
  q(xb, y1, xb, y0);
  return out;
}

/** A bracket's bar and label for the shown reading v (2D paintNow): the break in the bar round the label, and the label's pieces' x. */
export interface BracketGeom { x0: number; x1: number; mid: number; yy: number; fs: number; stack: boolean; gap: [number, number]; ticks: number[][]; bar: number[][] }
export function bracketGeom(G: Geo, f: number, tw: Tw, r: number, v: number): BracketGeom {
  const [, name, a, b] = G.spans[r]!;
  const x0 = G.x(STATIONS.indexOf(a)), x1 = G.x(STATIONS.indexOf(b)), fs = G.brFs[r]!, z = fs / f, stack = G.brMode[r] === 'stack', mid = (x0 + x1) / 2, yy = G.brY(r);
  const s = gap1(v);
  let gap: [number, number];
  if (stack) { const ws = Math.max(tw(name, 600), tw(s, 700)); gap = ws + 20 <= x1 - x0 ? [mid - ws / 2 - 5, mid + ws / 2 + 5] : [x0, x1]; }
  else { const lw = z * tw(`${name} ${s}`, 700), wide = (x1 - x0 - lw) / 2 - 5 >= 4; gap = wide ? [mid - lw / 2 - 5, mid + lw / 2 + 5] : [x0, x1]; }
  const ticks = [[x0, yy - 0.3 * f, x0, yy + 0.3 * f], [x1, yy - 0.3 * f, x1, yy + 0.3 * f]];
  const bar = gap[1] - gap[0] >= x1 - x0 - 0.5 ? [] : [[x0, yy, gap[0], yy], [gap[1], yy, x1, yy]];
  return { x0, x1, mid, yy, fs, stack, gap, ticks, bar };
}

/** The chart in a sentence, as the 2D tool reads it aloud. */
export function profileWords(goal: Prof, spans: readonly Span[]): string {
  const labels = goal.v.map(whole), g = goal as Goal;
  const hv = spans.some(([k]) => k === 'hvpg') ? hvpgSentence(g.whvp, g.fhvp) : null;   // (where the HVPG's two ends come from: the same sentence as Tests > Pressure)
  return `Pressure from gut to heart: ${STATIONS.map((n, i) => `${SPOKEN[n]} ${labels[i]}`).join(', ')} mmHg.${spans.length ? ` ${spans.map(([k, name]) => `${name} ${gap1((goal as unknown as Record<string, number>)[k]!)}`).join(', ')}.` : ''}${hv ? ` ${hv}.` : ''}`;
}

/** The brackets in force: the slide's, less the HVPG once a stent is in (2D setSpans). */
export function spansFor(want: readonly string[] | null | undefined, fp: Fp | null | undefined): Span[] {
  const list = spansOf(want);
  return hasStent(fp) ? spansStented(list) : list;
}

/** The ladder's height in its own layout, as 2D's CSS gives it (app-11 `--prof-h`): beside the words on a wide screen `min(max(62 % of the width, 28 pzh), 40 pzh) - 1.6 em`
 *  (the card has the window's height to itself, so the plot is as tall as it needs, never the stacked card's flat 270 px); a phone on its side `min(62 % of the width, max(170, 48 pzh)) - 1.6 em`;
 *  a stacked phone keeps the model's own default (undefined). pzh is the window's height over 100 (2D --pzh). */
export function layoutHeight(w: number, f: number, layout: 'wide' | 'short' | 'stack' | 'tab' | string, sideways: boolean, pzh: number): number | undefined {
  if (layout === 'stack' || layout === 'tab') return undefined;
  if (sideways) return Math.round(Math.min(0.62 * w, Math.max(170, 48 * pzh)) - 1.6 * f);
  return Math.round(Math.min(Math.max(0.62 * w, 28 * pzh), 40 * pzh) - 1.6 * f);
}

/** The ladder's height held to the room its data card leaves it (2D app-11 `.pz:not(.stack) .pz-tool[data-kind="profile"] .pz-prof { max-height: var(--pz-room) }`, never under its 11 em least): the width-given
 *  height (`layoutHeight`) knows nothing of the tiles above it, so on a Mac the chart stood 12 to 141 px past the card's foot on every slide whose header took more room than the card's cap left
 *  (Where is the resistance? cases 1 to 6; the 3D port had dropped the rule when it made the chart's height the only one). No height (a stacked card), or no room measured yet: the height as it is. */
export function heldToRoom(own: number | undefined, room: number | undefined, f: number): number | undefined {
  if (own == null || !(room && room > 0)) return own;
  return Math.max(Math.round(11 * f), Math.min(own, Math.floor(room)));
}

/** The tallest the ladder is ever drawn in its layout (2D's `min(max(62 % of the width, 28 pzh), 40 pzh) - 1.6 em`'s upper bound: `40 pzh - 1.6 em`); a phone on its side, and a stacked card, have none beyond their own height. */
export function layoutCeiling(layout: string, sideways: boolean, pzh: number, f: number): number | undefined {
  return layout === 'stack' || layout === 'tab' || sideways ? undefined : Math.round(40 * pzh - 1.6 * f);
}

/** The ladder's height in the room its card leaves it (Plan 43): held DOWN to the room when it is shorter than the chart's own height (never under 11 em, as `heldToRoom`), and UP to
 *  the least of `ceil` and the room when the room is longer (a card whose words are short gives the leftover to the instrument, 2 px short of the card's cap so rounding never tips it over). The
 *  chart's own height is what it WANTS (the card judges its pair by it: Frame.want), whatever it was given. No height, or no room measured yet: the height as it is. */
export function fitToRoom(own: number | undefined, room: number | undefined, f: number, ceil?: number): number | undefined {
  if (own == null || !(room && room > 0)) return own;
  const r = Math.floor(room);
  if (r < own) return Math.max(Math.round(11 * f), r);
  return ceil == null ? own : Math.max(own, Math.min(Math.round(ceil), r - 2));
}
