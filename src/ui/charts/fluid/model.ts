// The fluid balance's numbers and layout (2D: tool-fluid.js, host 'fluid'): the lymph made, split into what the lymphatics carry, what the belly takes back and what stays as
// ascites; the day card's gauges; the forces across the sinusoid wall. Every function here is the 2D one, lifted: no DOM, no frame, nothing eased (a Chart glides between frames).
import { NODES } from '../../../engine/hales/portal/topology.js';
import { tissueP, sinusoidPull, pushOfHepLymph } from '../../../engine/hales/portal/lymph.js';
import { lymphDay, LYMPH_UNIT } from './lymph-day.generated.js';
import { fmt } from '../fmt.ts';

export { LYMPH_UNIT };
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const NI: Record<string, number> = Object.fromEntries((NODES as { id: string }[]).map((n, i) => [n.id, i]));
const num = (x: unknown) => (Number.isFinite(+(x as number)) && x != null ? +(x as number) : null);

/** The fluid balance (mL/min). made = liver + gut; carried = what the lymphatics carry (made, up to their capacity); back = what the belly takes back; drained = carried + back;
 *  net = made − drained, the ascites made (negative while it shrinks). */
export interface Fluid { hep: number; spl: number; made: number; cap: number; carried: number; spare: number; over: number; back: number; drained: number; net: number; perDay: number }

/** The balance from a fingerprint (hepLymph, splLymph, lymphCap, lymphOver, lymphBack, lymphNet) or from a live frame's metrics (metrics.ascites: hepLymph, splLymph, lymphCap, ratePerDay), or null when it has none. */
export function fluidOf(src: any): Fluid | null {
  if (!src) return null;
  let hep, spl, cap, over, back, net;
  if (src.ascites) {
    const a = src.ascites;
    hep = num(a.hepLymph); spl = num(a.splLymph); cap = num(a.lymphCap);
    if (hep == null || spl == null || cap == null || num(a.ratePerDay) == null) return null;
    over = Math.max(0, hep + spl - cap); net = a.ratePerDay / 1440; back = over - net;
  } else {
    hep = num(src.hepLymph); spl = num(src.splLymph); cap = num(src.lymphCap); over = num(src.lymphOver); back = num(src.lymphBack); net = num(src.lymphNet);
    if ([hep, spl, cap, over, back, net].some((x) => x == null)) return null;
  }
  const h = hep!, s = spl!, c = cap!, b = back!, n = net!;
  const made = h + s, carried = Math.min(made, c), drained = carried + b;
  return { hep: h, spl: s, made, cap: c, carried, spare: Math.max(0, c - made), over: over!, back: b, drained, net: n, perDay: n * 1440 };
}

export interface Forces { out: number; pull: number }

/** The forces across the sinusoid wall (mmHg), as the engine's Starling step weighs them: the pressure pushing fluid out against the blood's protein pulling it back in. P: node pressures. */
export function sinusoidForces(P: ArrayLike<number> | null | undefined, params: { albumin?: number; cirrhosis?: number } | null | undefined, iap?: number): Forces | null {
  if (!P || !params) return null;
  const at = (id: string) => P[NI[id]!]!;
  const out = 0.6 * (0.7 * at('SIN_R') + 0.3 * at('CV_R')) + 0.4 * (0.7 * at('SIN_L') + 0.3 * at('CV_L')) - tissueP(iap);
  const pull = sinusoidPull(params.albumin ?? 4, 0.1 + 0.5 * (params.cirrhosis ?? 0));
  return Number.isFinite(out) && Number.isFinite(pull) ? { out, pull } : null;
}

/** The forces at a slide's state, from its fingerprint: the push read back from the engine's own liver lymph (so every screen shows the same number). null where the lymph is at its healthy floor. */
export function pinnedForces(fp: { hepLymph?: number; salb?: number } | null | undefined, params: { albumin?: number; cirrhosis?: number } | null | undefined): Forces | null {
  if (!fp || !params || !Number.isFinite(fp.hepLymph)) return null;
  const pull = sinusoidPull(fp.salb ?? params.albumin ?? 4, 0.1 + 0.5 * (params.cirrhosis ?? 0)), out = pushOfHepLymph(fp.hepLymph, pull);
  return out == null ? null : { out, pull };
}

/** The line under the flow picture. */
export function fluidWords(f: Fluid): string {
  const d = Math.round(Math.abs(f.perDay) / 10) * 10;
  if (f.net > 0 && d >= 10) return `Ascites accumulates at about ${d.toLocaleString('en-US')} mL/day.`;
  if (f.net < 0 && d >= 10) return `Ascites decreases by about ${d.toLocaleString('en-US')} mL/day.`;
  return f.over > 0.005 ? 'Ascites is stable: peritoneal reabsorption matches transudation.' : 'No ascites: lymphatic drainage matches lymph formation.';
}

export interface Day { liver: number; gut: number; made: number; limit: number; carried: number; over: number; back: number; net: number; room: number }
/** The day card's numbers, per day: each part rounded to 10 mL from the model's mL/min, then the sums taken from those parts, so every printed sum is exact. */
export function fluidDay(f: Fluid): Day {
  const r = lymphDay as (v: number) => number;
  const liver = r(f.hep), gut = r(f.spl), limit = r(f.cap), back = r(f.back);
  const made = liver + gut, carried = Math.min(made, limit), over = made - carried;
  return { liver, gut, made, limit, carried, over, back, net: over - back, room: limit - made };
}

/** A whole number of mL with its thousands comma (5,360). */
export const mlInt = (v: number) => Math.round(Math.max(0, v)).toLocaleString('en-US');

export interface DayWords { title: string; detail: string; limit: string; net: string; dir: 'up' | 'down' | '' }
/** The day card's words for a day's numbers: the answer in a sentence, the line under it, the lymphatics' limit and the day's change. */
export function dayWords(d: Day): DayWords {
  const title = d.net > 0 ? 'Ascites accumulating' : d.net < 0 ? 'Ascites decreasing' : d.over > 0 ? 'Ascites stable' : 'No ascites';
  const detail = d.over > 0
    ? (d.back > 0 ? `Transudation ${mlInt(d.over)}; peritoneal reabsorption ${mlInt(d.back)}.` : `Transudation ${mlInt(d.over)}; no peritoneal reabsorption.`)
    : d.back > 0 ? `No transudation; peritoneal reabsorption ${mlInt(d.back)}.` : 'Lymphatic drainage matches lymph formation.';
  return { title, detail, limit: d.room > 0 ? `Capacity ${mlInt(d.limit)}` : `Capacity ${mlInt(d.limit)} · full`,
    net: d.net > 0 ? `▲ ${mlInt(d.net)}` : d.net < 0 ? `▼ ${mlInt(-d.net)}` : '0', dir: d.net > 0 ? 'up' : d.net < 0 ? 'down' : '' };
}

/** The lymph gauge's parts, px of a track W wide, from the day's numbers in mL: what the lymphatics carry and, past their limit, what leaks, on one scale with the room left. */
export const GAUGE_GAP = 2, GAUGE_MARK = 2.5;
export interface GaugeParts { car: { x: number; w: number }; over: { x: number; w: number }; tick: { x: number; op: number } }
export function gaugeParts(g: { carried: number; over: number; room: number }, W: number): GaugeParts {
  const carried = Math.max(0, g.carried), over = Math.max(0, g.over), room = Math.max(0, g.room), k = W / Math.max(carried + over + room, 1);
  const px = over * k, ow = px + GAUGE_MARK * clamp(px / 0.5, 0, 1), cw = Math.max(0, Math.min(carried * k, W - ow));
  return { car: { x: 0, w: Math.max(0, cw - GAUGE_GAP * clamp(ow / (GAUGE_MARK + GAUGE_GAP), 0, 1)) }, over: { x: cw, w: ow }, tick: { x: cw, op: clamp(px / 6, 0, 1) } };
}

/** The forces strip's parts, px of a track W wide: the push and the pull as two arrows meeting at the wall, each as long as its pressure. */
export interface TugParts { push: { x: number; w: number }; pull: { x: number; w: number }; wall: number }
export function tugParts(out: number, pull: number, W: number): TugParts {
  const o = Math.max(0, out), p = Math.max(0, pull), wall = o + p > 0 ? (o / (o + p)) * W : W / 2;
  return { push: { x: 0, w: Math.max(0, wall - 1.5) }, pull: { x: wall + 1.5, w: Math.max(0, W - wall - 1.5) }, wall };
}

export const mlMin = (x: number) => fmt(Math.max(0, x), x < 10 ? 1 : 0);

// ── the flow picture ──
export const FLOW_H = 128;
const FLOW_LW = 78, FLOW_RW = 142, FLOW_NW = 8, FLOW_LINE = 18, FLOW_MIN = 2, FLOW_MAXB = 64;
export type NodeId = 'liver' | 'gut' | 'carried' | 'back' | 'build';
export interface FlowNode { id: NodeId; v: number; h: number; lh: number; y: number; cy: number; room: number }
export interface FlowBand { from: 'liver' | 'gut'; to: 'carried' | 'back' | 'build'; key: string; ly: number; ry: number; t: number }
export interface Flows { xL: number; xR: number; NW: number; left: FlowNode[]; right: FlowNode[]; bands: FlowBand[]; W: number; H: number }
const thick = (v: number, k: number) => (v > 0.005 ? Math.max(FLOW_MIN, v * k) : 0);
const node = (id: NodeId): FlowNode => ({ id, v: 0, h: 0, lh: 0, y: 0, cy: 0, room: 0 });
function flowColumn(nodes: FlowNode[], H: number) {
  let y = 0, prev: FlowNode | null = null;
  for (const n of nodes) {
    if (prev) y += Math.max(6, FLOW_LINE - prev.lh / 2 - n.lh / 2);
    n.y = y; y += n.h; prev = n;
  }
  const top = Math.max(0, (H - y) / 2);
  for (const n of nodes) { n.y += top; n.cy = n.y + n.lh / 2; }
}
/** The flow picture's geometry for a width W: the liver's and the gut's lymph on the left, each a band as thick as its flow, splitting into what the lymphatics carry, what the belly takes back
 *  and what stays as ascites on the right. Bands are matched by sweeping both columns' running totals. Labels' centres are at least 18 px apart. */
export function fluidFlows(f: Fluid, W: number, H = FLOW_H): Flows {
  const xL = FLOW_LW, xR = Math.max(xL + FLOW_NW + 40, W - FLOW_RW - FLOW_NW);
  const into = Math.max(0, f.made - f.carried), back = Math.min(Math.max(0, f.back), into), build = Math.max(0, into - back);
  const k = FLOW_MAXB / Math.max(f.made, f.cap + into, 0.1);
  const liver = node('liver'), gut = node('gut'), carried = node('carried'), nBack = node('back'), nBuild = node('build');
  liver.v = f.hep; gut.v = f.spl;
  liver.h = liver.lh = thick(f.hep, k); gut.h = gut.lh = thick(f.spl, k);
  const left = [liver, gut];
  flowColumn(left, H);
  const roomH = f.spare > 0.005 ? f.spare * k : 0;
  carried.v = f.carried; carried.h = thick(f.carried, k) + roomH; carried.lh = thick(f.carried, k); carried.room = roomH;
  nBack.v = back; nBack.h = nBack.lh = thick(back, k);
  nBuild.v = build; nBuild.h = nBuild.lh = thick(build, k);
  const right = [carried];
  if (f.back > 0.005) right.push(nBack);
  if (f.net > 0.005 || f.perDay <= -10) right.push(nBuild);
  flowColumn(right, H);
  const bands: FlowBand[] = [];
  let a0 = 0;
  for (const Ln of left) {
    const a1 = a0 + Ln.v;
    let b0 = 0;
    for (const R of right) {
      const b1 = b0 + R.v, lo = Math.max(a0, b0), hi = Math.min(a1, b1);
      if (hi - lo > 1e-6) {
        const tk = (hi - lo) * k, ly = Ln.y + (lo - a0) * k * (Ln.lh / Math.max(Ln.v * k, 1e-9)), ry = R.y + (lo - b0) * k * (R.lh / Math.max(R.v * k, 1e-9));
        bands.push({ from: Ln.id as 'liver' | 'gut', to: R.id as 'carried' | 'back' | 'build', key: `${Ln.id}-${R.id}`, ly, ry, t: Math.max(1, Math.min(tk, Ln.lh, R.lh)) });
      }
      b0 = b1;
    }
    a0 = a1;
  }
  return { xL, xR, NW: FLOW_NW, left, right, bands, W, H };
}

/** A band's outline (the top edge, a cubic with level tangents from (x0, y0) to (x1, y1), then the lower edge back) as [x, y, …], n segments each way: the same curve the 2D path drew. */
export const BAND_N = 40;
export function bandPts(x0: number, y0: number, x1: number, y1: number, t: number, n = BAND_N): number[] {
  const m = (x0 + x1) / 2, out = new Array<number>(4 * (n + 1));
  for (let i = 0; i <= n; i++) {
    const u = i / n, v = 1 - u, c0 = v * v * v, c1 = 3 * v * v * u, c2 = 3 * v * u * u, c3 = u * u * u;
    const x = c0 * x0 + (c1 + c2) * m + c3 * x1;
    out[2 * i] = x; out[2 * i + 1] = (c0 + c1) * y0 + (c2 + c3) * y1;
    const r = 2 * (2 * n + 1 - i);
    out[r] = x; out[r + 1] = (c0 + c1) * (y0 + t) + (c2 + c3) * (y1 + t);
  }
  return out;
}

/** The names the flow picture's nodes carry. */
export const NAMES: Record<NodeId, string> = { liver: 'Liver', gut: 'Bowel', carried: 'Lymphatics', back: 'Reabsorbed', build: 'Ascites' };

/** What a node's number reads (the right-hand ones follow the 2D paint()). */
export function nodeValue(id: NodeId, f: Fluid): string {
  const into = Math.max(0, f.made - f.carried);
  switch (id) {
    case 'liver': return mlMin(f.hep);
    case 'gut': return mlMin(f.spl);
    case 'carried': return f.spare > 0.05 ? `${mlMin(f.carried)} of ${mlMin(f.cap)}` : mlMin(f.carried);
    case 'back': return mlMin(f.back);
    default: return f.net < 0 ? `−${mlMin(-f.net)}` : mlMin(Math.max(0, into - Math.min(f.back, into)));
  }
}

// ── the bars of the strips: a part's outline ──
export const END_ROUND = 0, END_POINT = 1;
export type EndKind = typeof END_ROUND | typeof END_POINT;
const CORNER_N = 6;
const COS = Array.from({ length: CORNER_N + 1 }, (_, i) => Math.cos((Math.PI / 2) * (i / CORNER_N)));
const SIN = Array.from({ length: CORNER_N + 1 }, (_, i) => Math.sin((Math.PI / 2) * (i / CORNER_N)));
/** A part's outline (x, y pairs), clockwise from the top edge, x to x + w, y0 to y1. eL and eR are its ends' sizes in px (a corner's width and height, or a point's length), kL and kR their kinds. Empty under 0.01 px. */
export function partPts(x: number, w: number, y0: number, y1: number, eL: number, eR: number, kL: EndKind, kR: EndKind): number[] {
  if (!(w > 0.01)) return [];
  const k = Math.min(1, w / Math.max(eL + eR, 1e-6)), l = eL * k, r = eR * k, x1 = x + w, ym = (y0 + y1) / 2, b: number[] = [];
  if (kR === END_POINT) b.push(x1 - r, y0, x1, ym, x1 - r, y1);
  else {
    for (let i = 0; i <= CORNER_N; i++) b.push(x1 - r + r * SIN[i]!, y0 + eR - eR * COS[i]!);
    for (let i = 0; i <= CORNER_N; i++) b.push(x1 - r + r * COS[i]!, y1 - eR + eR * SIN[i]!);
  }
  if (kL === END_POINT) b.push(x + l, y1, x, ym, x + l, y0);
  else {
    for (let i = 0; i <= CORNER_N; i++) b.push(x + l - l * SIN[i]!, y1 - eL + eL * COS[i]!);
    for (let i = 0; i <= CORNER_N; i++) b.push(x + l - l * COS[i]!, y0 + eL - eL * SIN[i]!);
  }
  return b;
}

/** The forces strip's wording. */
export function forcesWords(out: number, pull: number) {
  const r1 = (v: number) => Math.round(v * 10) / 10, shownOut = r1(Math.max(0, out)), shownPull = r1(pull), net = r1(shownOut - shownPull);
  return {
    caption: 'Sinusoidal Starling forces · mmHg',
    net: `Hydrostatic ${fmt(shownOut, 1)} − oncotic ${fmt(shownPull, 1)} = net ${fmt(Math.abs(net), 1)} ${net >= 0 ? 'outward' : 'inward'}`,
    wNum: fmt(Math.abs(net), 1), wUnit: net >= 0 ? 'mmHg outward' : 'mmHg inward', wFoot: `ΔP ${fmt(shownOut, 1)} − σΔπ ${fmt(shownPull, 1)}`,
    push: [`Hydrostatic ${fmt(out, 1)}`, fmt(out, 1)], pull: [`Oncotic ${fmt(pull, 1)}`, fmt(pull, 1)],
  };
}
