// The flows bar's layout in pixels (ported from tool-flows.js): where each segment's words go, the pills under the bar, the Healthy mark. Pure.
import { INFLOW, OTHER, barOrder, type Part } from './parts.ts';

export type Measure = (text: string, size: number, weight?: number) => number;

/** The weight of a chart's numbers: the app's type scale has 400, 500 and 600 only (docs/approved/type.md), so the percents are 600 (the looks' own 700 is not used here). */
export const VAL_W = 600;

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
    const full = INFLOW.find(([k]) => k === s.id)![1], short = INFLOW_SHORT[s.id]!, v = `${s.pct}%`, vw = measure(v, f, VAL_W), mid = (s.a + s.b) / 2;
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

// ── where the portal blood goes: one bar; a part too narrow for its name is named under the bar, on a leader ──
export function routeGeo(f: number) {
  const g = Math.max(LABEL_GAP, 0.34 * f), barH = 2.7 * f, barT = 2.1 * f, barB = barT + barH;
  return { f, g, barH, base: 1.05 * f, brY: 1.45 * f, brTick: 0.4 * f, barT, barB, pillsT: barB + 0.65 * f, ph: 1.6 * f, pg: 0.4 * f, gx: Math.max(g, 0.5 * f), px: 0, n1: 1.15 * f, n2: 2.27 * f, mid: barH / 2 + 0.36 * f };
}
export type RouteGeo = ReturnType<typeof routeGeo>;
export const routeHeight = (rows: number, geo: RouteGeo) => (rows ? geo.pillsT + rows * geo.ph + (rows - 1) * geo.pg : geo.barB);
export const routeRows = (hh: number, geo: RouteGeo) => Math.max(1, Math.floor((hh - geo.pillsT + geo.pg) / (geo.ph + geo.pg) + 1e-6));

/** A name set under the bar: `cx` its centre, `w` its width, `row` its line, `lx` where its leader leaves the bar (the part's own centre, always under the words). */
export interface Pill { id: string; cx: number; w: number; row: number; lx: number }
/** Each name sits under its own part. Two that would touch: the second slides right (its part's centre stays under it) or drops to the next row, and a leader never crosses another name. */
export function routePills(items: readonly { id: string; text: string; mid: number }[], w: number, geo: RouteGeo, measure: Measure, maxRows = Infinity): { pills: Pill[]; rows: number; ok: boolean } {
  const byMid = placePills([...items].sort((p, q) => p.mid - q.mid), w, geo, measure, maxRows);
  if (byMid.ok || items.length < 2) return byMid;
  // A long name placed first can leave a short one to its right no row (its leader would run through the long name above).
  // Placed narrowest first, the short names sit on the upper rows and the long one under them.
  const wid = new Map(items.map((it) => [it.id, measure(it.text, geo.f, 600)]));
  const byWidth = placePills([...items].sort((p, q) => wid.get(p.id)! - wid.get(q.id)! || p.mid - q.mid), w, geo, measure, maxRows);
  if (byWidth.ok) return byWidth;
  if (byMid.ok) return byMid;
  // Last try: a long name leans left so that its own part's centre stays under it and the leader of a part to its right clears its right edge (the narrower names then take the row below it).
  const leaned = placePills([...items].sort((p, q) => p.mid - q.mid), w, geo, measure, maxRows, true);
  return leaned.ok ? leaned : byMid;
}
function placePills(
  order: readonly { id: string; text: string; mid: number }[], w: number, geo: RouteGeo, measure: Measure, maxRows: number, lean = false,
): { pills: Pill[]; rows: number; ok: boolean } {
  const pills: Pill[] = [], rowsL: [number, number][][] = [];
  let ok = true;
  for (const it of order) {
    const tw = Math.min(w, measure(it.text, geo.f, 600)), want = Math.min(Math.max(it.mid - tw / 2, 0), Math.max(0, w - tw));
    let put: { row: number; L: number } | null = null;
    for (let row = 0; row < Math.max(maxRows, 1) && !put; row++) {
      const spans = (rowsL[row] ??= []), last = Math.max(-Infinity, ...spans.map((s) => s[1]));
      const clear = (L: number) => spans.every(([a, b]) => L + tw <= a - geo.gx + 1e-6 || L >= b + geo.gx - 1e-6)
        && rowsL.slice(0, row).every((above) => above.every(([a, b]) => it.mid < a - 2 || it.mid > b + 2));   // (its leader runs down past the rows above)
      const lean0 = lean ? order.filter((o) => o.mid > it.mid).map((o) => o.mid - 3 - tw) : [];   // (its right edge stops short of the next part's leader)
      const tries = [...lean0.map((l) => Math.min(want, l)), want, last + geo.gx];
      for (const L of tries) if (!put && L >= -1e-6 && L + tw <= w + 1e-6 && L <= it.mid + 1e-6 && it.mid <= L + tw + 1e-6 && clear(L)) put = { row, L };
    }
    if (!put) { ok = false; put = { row: rowsL.length, L: want }; }
    (rowsL[put.row] ??= []).push([put.L, put.L + tw]);
    pills.push({ id: it.id, cx: put.L + tw / 2, w: tw, row: put.row, lx: it.mid });
  }
  return { pills, rows: order.length ? Math.max(rowsL.length, 1) : 0, ok };
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
/** The whole card's layout for parts at width w, height hh (Infinity: as tall as it needs), font size f. Tier 0: name and percent on the segment; 3: neither on it, the name and
 *  percent under the bar on a leader (one treatment: never a percent alone, never a name without its number). If the rows the card holds are not enough the smallest routes join Other until they are. */
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
    const room = s.b - s.a - 2 * g, was = prev?.[s.id], band = was != null && 0 < was ? TIER_BAND * f : 0;
    return Math.max(measure(s.name!, f, 500), measure(`${s.pct}%`, f, VAL_W)) <= room - band ? 0 : 3;
  });
  const { pills, rows, ok: placed } = routePills(spans.flatMap((s, i) => (tiers[i] === 3 ? [{ id: s.id, text: `${s.name} ${s.pct}%`, mid: (s.a + s.b) / 2 }] : [])), w, geo, measure, routeRows(hh, geo));
  return { geo, spans, tiers, pills, rows, ok: placed && rows <= routeRows(hh, geo), mark: routeMarker(hParts, w, f, measure), top: Math.max(0, (hh - routeHeight(rows, geo)) / 2) };
}
