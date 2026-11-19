// The flows bar's layout in pixels (ported from tool-flows.js): where each segment's words go, the pills under the bar, the Healthy mark. Pure.
import { INFLOW, OTHER, barOrder, type Part } from './parts.ts';

export type Measure = (text: string, size: number, weight?: number) => number;

/** A part's words keep their place until it no longer holds them by the label rule; they move nearer the bar only with TIER_BAND × f to spare. */
export const TIER_BAND = 0.35;
/** A name never comes nearer than this to another name, a line, a segment's edge or the bar (px). */
export const LABEL_GAP = 4;
export const INFLOW_SHORT: Record<string, string> = { portal: 'Portal', artery: 'Artery' };

export type Tiers = Record<string, number>;

// ── the liver's inflow: one bar, portal and arterial ──
export function inflowGeo(f: number) {
  const g = Math.max(LABEL_GAP, 0.34 * f), barH = 2.7 * f, top = 1.75 * f;
  return { f, g, barH, mc: Math.max(6, 0.5 * f), base: 1.05 * f, top, bottom: top + barH, h: top + barH + 0.5 * f, n1: 1.15 * f, n2: 2.27 * f, mid: barH / 2 + 0.36 * f };
}
export type InflowGeo = ReturnType<typeof inflowGeo>;
export interface Span { id: string; pct: number; a: number; b: number; name?: string }
export function inflowSpans(bar: readonly Part[], w: number): Span[] {
  let acc = 0;
  return bar.map((p) => { const a = (acc / 100) * w; acc += p.pct; return { id: p.id, pct: p.pct, a, b: (acc / 100) * w }; });
}
export interface InflowMark { x: number; text: string; L: number; R: number; hp: number }
export function inflowMarker(hParts: readonly Part[] | null, w: number, f: number, measure: Measure): InflowMark | null {
  const hp = hParts?.find((p) => p.id === 'portal')?.pct;
  if (!(hp! > 0 && hp! < 100)) return null;
  const text = `Healthy portal ${hp}%`, tw = measure(text, f, 500), x = (hp! / 100) * w;
  const L = Math.min(Math.max(x - tw / 2, 0), Math.max(0, w - tw));
  return { x, text, L, R: L + tw, hp: hp! };
}
export interface InflowLabel { id: string; tier: number; cx: number; lead?: number; text?: string; tw?: number }
/** tier 0: name and percent on the segment; 1: the short name and percent; 2: the percent alone; 3: one line above the bar on a leader; 4: nothing (no clear place). */
export function inflowLabels(spans: readonly Span[], w: number, geo: InflowGeo, measure: Measure, mark: InflowMark | null = null, prev: Tiers | null = null): InflowLabel[] {
  const { f, g, mc } = geo, E = 1e-6;
  return spans.map((s) => {
    const full = INFLOW.find(([k]) => k === s.id)![1], short = INFLOW_SHORT[s.id]!, v = `${s.pct}%`, vw = measure(v, f, 700), mid = (s.a + s.b) / 2;
    const wid = [Math.max(measure(full, f, 500), vw), Math.max(measure(short, f, 500), vw), vw];
    const free: [number, number][] = mark && mark.x > s.a + 0.5 && mark.x < s.b - 0.5 ? [[s.a, mark.x - mc], [mark.x + mc, s.b]] : [[s.a, s.b]];
    const was = prev?.[s.id];
    for (let tier = 0; tier < 3; tier++) {
      const band = was != null && tier < was ? TIER_BAND * f : 0;
      const fit = free.filter(([a, b]) => b - a - 2 * g - band >= wid[tier]! - E).map(([a, b]) => ({ cx: Math.min(Math.max(mid, a + g + wid[tier]! / 2), b - g - wid[tier]! / 2) }));
      if (fit.length) return { id: s.id, tier, cx: fit.sort((p, q) => Math.abs(p.cx - mid) - Math.abs(q.cx - mid))[0]!.cx };
    }
    const text = `${short} ${v}`, tw = measure(text, f, 600), box = mark ? [mark.L - g, mark.R + g] as const : null;
    const spots = [Math.min(Math.max(mid - tw / 2, 0), Math.max(0, w - tw))];
    if (box) spots.push(box[0] - tw, box[1]);
    const L = spots.find((l) => l >= -E && l + tw <= w + E && l <= mid + E && mid <= l + tw + E && (!box || l + tw <= box[0] + E || l >= box[1] - E));
    return L == null ? { id: s.id, tier: 4, cx: mid } : { id: s.id, tier: 3, cx: L + tw / 2, lead: mid, text, tw };
  });
}

// ── where the portal blood goes: one bar, pills under it ──
export function routeGeo(f: number) {
  const g = Math.max(LABEL_GAP, 0.34 * f), barH = 2.7 * f, barT = 2.1 * f, barB = barT + barH;
  return { f, g, barH, base: 1.05 * f, brY: 1.45 * f, brTick: 0.4 * f, barT, barB, pillsT: barB + 0.65 * f, ph: 1.6 * f, pg: 0.4 * f, gx: Math.max(g, 0.5 * f), px: 0.6 * f, n1: 1.15 * f, n2: 2.27 * f, mid: barH / 2 + 0.36 * f };
}
export type RouteGeo = ReturnType<typeof routeGeo>;
export const routeHeight = (rows: number, geo: RouteGeo) => (rows ? geo.pillsT + rows * geo.ph + (rows - 1) * geo.pg : geo.barB);
export const routeRows = (hh: number, geo: RouteGeo) => Math.max(1, Math.floor((hh - geo.pillsT + geo.pg) / (geo.ph + geo.pg) + 1e-6));

export interface Pill { id: string; cx: number; w: number; row: number }
export function routePills(items: readonly { id: string; text: string }[], w: number, geo: RouteGeo, measure: Measure): { pills: Pill[]; rows: number } {
  const pills: Pill[] = [];
  let row = 0, cur: { id: string; w: number }[] = [];
  const flush = () => {
    let L = (w - (cur.reduce((s, p) => s + p.w, 0) + (cur.length - 1) * geo.gx)) / 2;
    for (const p of cur) { pills.push({ id: p.id, cx: L + p.w / 2, w: p.w, row }); L += p.w + geo.gx; }
    cur = [];
  };
  for (const it of items) {
    const pw = Math.min(w, measure(it.text, geo.f, 700) + 2 * geo.px);
    if (cur.length && cur.reduce((s, p) => s + p.w, 0) + cur.length * geo.gx + pw > w + 1e-6) { flush(); row++; }
    cur.push({ id: it.id, w: pw });
  }
  if (cur.length) flush();
  return { pills, rows: items.length ? row + 1 : 0 };
}
export interface RouteMark { x0: number; x1: number; text: string; L: number; R: number; hl: number }
export function routeMarker(hParts: readonly Part[] | null, w: number, f: number, measure: Measure): RouteMark | null {
  const hl = hParts?.find((p) => p.id === 'liver')?.pct;
  if (!(hl! > 0)) return null;
  const text = `Healthy: liver ${hl}%`, tw = measure(text, f, 500), x1 = (hl! / 100) * w, L = Math.min(Math.max(x1 / 2 - tw / 2, 0), Math.max(0, w - tw));
  return { x0: 0, x1, text, L, R: L + tw, hl: hl! };
}

export interface RouteLayout {
  geo: RouteGeo; spans: Span[]; tiers: number[]; pills: Pill[]; rows: number; ok: boolean; mark: RouteMark | null; top: number; parts: Part[];
}
/** The whole card's layout for parts at width w, height hh (Infinity: as tall as it needs), font size f. Tier 0: name and percent on the segment, 2: the percent
 *  alone (named in a pill), 3: a pill with name and percent. If the rows the card holds are not enough the smallest routes join Other until they are. */
export function routeLayout(parts: readonly Part[], w: number, hh: number, f: number, measure: Measure, hParts: readonly Part[] | null = null, prev: Tiers | null = null): RouteLayout {
  let use = [...parts], lay = routeOnce(use, w, hh, f, measure, hParts, prev);
  while (!lay.ok) {
    const routes = barOrder(use).filter((p) => p.id !== 'liver' && p.id !== 'other');
    if (routes.length < 2) break;
    const small = routes.at(-1)!, o = use.find((p) => p.id === 'other');
    use = [...use.filter((p) => p !== small && p !== o), { id: OTHER[0], name: OTHER[1], tone: OTHER[2], pct: (o?.pct || 0) + small.pct }];
    lay = routeOnce(use, w, hh, f, measure, hParts, prev);
  }
  return { ...lay, parts: use };
}
function routeOnce(parts: readonly Part[], w: number, hh: number, f: number, measure: Measure, hParts: readonly Part[] | null, prev: Tiers | null) {
  const geo = routeGeo(f), g = geo.g;
  let acc = 0;
  const spans: Span[] = barOrder(parts).map((p) => { const a = (acc / 100) * w; acc += p.pct; return { id: p.id, name: p.name, pct: p.pct, a, b: (acc / 100) * w }; });
  const tiers = spans.map((s) => {
    const room = s.b - s.a - 2 * g, pw = measure(`${s.pct}%`, f, 700), was = prev?.[s.id], band = (t: number) => (was != null && t < was ? TIER_BAND * f : 0);
    return Math.max(measure(s.name!, f, 500), pw) <= room - band(0) ? 0 : pw <= room - band(2) ? 2 : 3;
  });
  // a segment that carries its percent alone is named in a pill under the bar too, its name only
  const { pills, rows } = routePills(spans.flatMap((s, i) => (tiers[i] === 3 ? [{ id: s.id, text: `${s.name} ${s.pct}%` }] : tiers[i] === 2 ? [{ id: s.id, text: s.name! }] : [])), w, geo, measure);
  return { geo, spans, tiers, pills, rows, ok: rows <= routeRows(hh, geo), mark: routeMarker(hParts, w, f, measure), top: Math.max(0, (hh - routeHeight(rows, geo)) / 2) };
}
