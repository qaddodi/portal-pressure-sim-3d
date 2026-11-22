// The flows bar as a frame. Every part the bar can ever show has its own slot (a segment, its words, its pill), a part that is not on this slide sits at width
// 0 and alpha 0, so two frames always pair up and a share, a name or a place glides instead of popping.
import type { ChartCtx } from '../Chart.tsx';
import { measure } from '../measure.ts';
import { withAlpha } from '../colour.ts';
import { inkFor } from '../legible.ts';
import { look } from '../looks.ts';
import type { Frame, Shape } from '../scene.ts';
import { LIVER, OTHER, ROUTES, INFLOW, barOrder, flowsSummary, type Part } from './parts.ts';
import { inflowGeo, inflowLabels, inflowMarker, inflowSpans, routeGeo, routeLayout, routeHeight, INFLOW_SHORT, type Tiers } from './layout.ts';

const PORTAL_IDS = [LIVER, ...ROUTES.map(([id, name, tone]) => [id, name, tone] as const), OTHER];
const NAME = new Map<string, string>([...PORTAL_IDS, ...INFLOW].map(([id, name]) => [id, name]));
const TONE = new Map<string, string>([...PORTAL_IDS, ...INFLOW].map(([id, , tone]) => [id, tone]));
/** Pill rows the card allows (a card is never taller than the screen): the smallest routes join Other past this. */
export const MAX_PILL_ROWS = 2;

export interface FlowsArgs { of: 'portal' | 'inflow'; parts: readonly Part[]; healthy: readonly Part[] | null; tiers: Tiers | null }
export interface FlowsOut { frame: Frame; tiers: Tiers; parts: Part[] }

export function flowsFrame(a: FlowsArgs, c: ChartCtx): FlowsOut {
  return a.of === 'inflow' ? inflowFrame(a, c) : routesFrame(a, c);
}

const dead = (s: Shape): Shape => s;

function routesFrame(a: FlowsArgs, c: ChartCtx): FlowsOut {
  const f = c.type.sm, w = Math.max(160, c.w);
  const lk = (key: string, tone?: string) => look(c, { host: 'flows' }, key, {}, tone ? { tone } : {});
  const geo0 = routeGeo(f), hh = geo0.pillsT + MAX_PILL_ROWS * geo0.ph + (MAX_PILL_ROWS - 1) * geo0.pg;
  const lay = routeLayout(a.parts, w, hh, f, measure, a.healthy, a.tiers);
  const { geo, spans, tiers, pills, mark } = lay;
  const h = Math.ceil(routeHeight(lay.rows, geo)) + 2, yT = geo.barT;
  const nameL = lk('flows.lab.n'), valL = lk('flows.lab.v'), mkLine = lk('flows.mk.line'), mkText = lk('flows.mk.text'), pillText = lk('flows.pill.text');
  const text = nameL.fill!, halo = nameL.halo;
  const by = new Map(spans.map((s, i) => [s.id, { s, tier: tiers[i]!, pill: pills.find((p) => p.id === s.id) }]));
  const shapes: Shape[] = [{ k: 'clip', x: 0, y: yT, w, h: geo.barH, r: Math.min(6, geo.barH / 2) }];
  for (const [id] of PORTAL_IDS) {
    const e = by.get(id);
    const seg = lk('flows.seg', TONE.get(id)!).fill!;
    if (!e) { shapes.push({ k: 'rect', x: id === 'liver' ? 0 : w, y: yT, w: 0, h: geo.barH, fill: withAlpha(seg, 0) }); continue; }
    const inner = e.s.a > 0.5, last = e.s.b < w - 0.5;
    shapes.push({ k: 'rect', x: e.s.a + (inner ? 0.75 : 0), y: yT, w: Math.max(0.5, e.s.b - e.s.a - (inner ? 0.75 : 0) - (last ? 0.75 : 0)), h: geo.barH, fill: seg });
  }
  shapes.push({ k: 'unclip' });
  // the Healthy bracket over the bar and its words
  const x0 = (mark?.x0 ?? 0) + 1, x1 = (mark?.x1 ?? w) - 1, yb = geo.brY;
  shapes.push({ k: 'path', pts: [x0, yb + geo.brTick, x0, yb, x1, yb, x1, yb + geo.brTick], pen: { color: withAlpha(mkLine.stroke!, mark ? 1 : 0), w: mkLine.width!, dash: mkLine.dash, cap: mkLine.cap, join: mkLine.join } });
  shapes.push({ k: 'text', x: mark ? (mark.L + mark.R) / 2 : w / 2, y: geo.base, s: mark?.text ?? '', size: mkText.size!, weight: mkText.weight, color: withAlpha(mkText.fill!, mark ? 1 : 0), anchor: 'middle', halo: mkText.halo });
  for (const [id] of PORTAL_IDS) {
    const e = by.get(id);
    const pillL = lk('flows.pill.rect', TONE.get(id)!), cx = e ? (e.s.a + e.s.b) / 2 : w / 2;
    const onBar = !!e && e.tier !== 3 && true;
    const full = !!e && e.tier === 0, alone = !!e && e.tier === 2;
    shapes.push({ k: 'text', x: cx, y: yT + geo.n1, s: full ? NAME.get(id)! : '', size: nameL.size!, weight: nameL.weight, color: text, alpha: full ? 1 : 0, anchor: 'middle', halo });
    shapes.push({ k: 'text', x: cx, y: full ? yT + geo.n2 : yT + geo.mid, s: onBar && e ? `${e.s.pct}%` : '', size: valL.size!, weight: valL.weight, color: text, alpha: full || alone ? 1 : 0, anchor: 'middle', halo });
    // the part's name (and percent) under the bar where it does not fit on it: plain words in the part's colour, no capsule (docs/HUMANIZED-DESIGN.md section 0).
    // (the slot's rectangle stays, empty, so two frames still pair up and the words glide)
    const pill = e?.pill;
    const pw = pill?.w ?? 0, px = pill ? Math.min(Math.max(pill.cx - pw / 2, 0), w - pw) : cx, py = pill ? geo.pillsT + pill.row * (geo.ph + geo.pg) : geo.pillsT;
    shapes.push({ k: 'rect', x: px, y: py, w: pw, h: geo.ph, r: 0, fill: [0, 0, 0, 0] });
    shapes.push({ k: 'text', x: px + pw / 2, y: py + geo.ph / 2 + 0.36 * f, s: pill && e ? (e.tier === 3 ? `${NAME.get(id)} ${e.s.pct}%` : NAME.get(id)!) : '', size: pillText.size!, weight: pillText.weight, color: inkFor(lk('flows.seg', TONE.get(id)!).fill!, pillL.fill!, pillText.fill!), alpha: pill ? 1 : 0, anchor: 'middle', halo });
  }
  const frame: Frame = { w, h, shapes: shapes.map(dead), label: flowsSummary(lay.parts, a.healthy, 'portal') };
  return { frame, tiers: Object.fromEntries(spans.map((s, i) => [s.id, tiers[i]!])), parts: lay.parts };
}

function inflowFrame(a: FlowsArgs, c: ChartCtx): FlowsOut {
  const f = c.type.sm, w = Math.max(160, c.w), geo = inflowGeo(f);
  const lk = (key: string, tone?: string) => look(c, { host: 'flows' }, key, {}, tone ? { tone } : {});
  const nameL = lk('flows.lab.n'), valL = lk('flows.lab.v'), mkLine = lk('flows.mk.line'), mkText = lk('flows.mk.text'), lead = lk('flows.lead');
  const mark = inflowMarker(a.healthy, w, f, measure), spans = inflowSpans(barOrder(a.parts, 'inflow'), w);
  const labs = inflowLabels(spans, w, geo, measure, mark, a.tiers);
  const at = new Map(spans.map((s, i) => [s.id, { s, l: labs[i]! }]));
  const yT = geo.top, yB = geo.bottom, text = nameL.fill!, halo = nameL.halo;
  const shapes: Shape[] = [{ k: 'clip', x: 0, y: yT, w, h: geo.barH, r: Math.min(6, geo.barH / 2) }];
  for (const [id] of INFLOW) {
    const e = at.get(id), seg = lk('flows.seg', TONE.get(id)!).fill!;
    if (!e) { shapes.push({ k: 'rect', x: id === 'portal' ? 0 : w, y: yT, w: 0, h: geo.barH, fill: withAlpha(seg, 0) }); continue; }
    const inner = e.s.a > 0.5, last = e.s.b < w - 0.5;
    shapes.push({ k: 'rect', x: e.s.a + (inner ? 0.75 : 0), y: yT, w: Math.max(0.5, e.s.b - e.s.a - (inner ? 0.75 : 0) - (last ? 0.75 : 0)), h: geo.barH, fill: seg });
  }
  shapes.push({ k: 'unclip' });
  shapes.push({ k: 'line', x1: mark?.x ?? w / 2, y1: geo.base + 0.4 * f, x2: mark?.x ?? w / 2, y2: yB + 0.5 * f, pen: { color: withAlpha(mkLine.stroke!, mark ? 1 : 0), w: mkLine.width!, dash: mkLine.dash, cap: mkLine.cap } });
  shapes.push({ k: 'text', x: mark ? (mark.L + mark.R) / 2 : w / 2, y: geo.base, s: mark?.text ?? '', size: mkText.size!, weight: mkText.weight, color: withAlpha(mkText.fill!, mark ? 1 : 0), anchor: 'middle', halo: mkText.halo });
  for (const [id] of INFLOW) {
    const e = at.get(id);
    if (!e) {
      shapes.push({ k: 'text', x: w / 2, y: yT + geo.n1, s: '', size: nameL.size!, weight: nameL.weight, color: text, alpha: 0, anchor: 'middle', halo }, { k: 'text', x: w / 2, y: yT + geo.n2, s: '', size: valL.size!, weight: valL.weight, color: text, alpha: 0, anchor: 'middle', halo },
        { k: 'line', x1: w / 2, y1: 0, x2: w / 2, y2: 0, pen: { color: withAlpha(text, 0), w: 1 } });
      continue;
    }
    const { s, l } = e, d = l.tier;
    if (d <= 1) {
      shapes.push({ k: 'text', x: l.cx, y: yT + geo.n1, s: d ? INFLOW_SHORT[id]! : NAME.get(id)!, size: nameL.size!, weight: nameL.weight, color: text, anchor: 'middle', halo },
        { k: 'text', x: l.cx, y: yT + geo.n2, s: `${s.pct}%`, size: valL.size!, weight: valL.weight, color: text, anchor: 'middle', halo },
        { k: 'line', x1: l.cx, y1: yT, x2: l.cx, y2: yT, pen: { color: withAlpha(text, 0), w: 1 } });
    } else if (d === 2) {
      shapes.push({ k: 'text', x: l.cx, y: yT + geo.n1, s: '', size: nameL.size!, weight: nameL.weight, color: text, alpha: 0, anchor: 'middle', halo },
        { k: 'text', x: l.cx, y: yT + geo.mid, s: `${s.pct}%`, size: valL.size!, weight: valL.weight, color: text, anchor: 'middle', halo },
        { k: 'line', x1: l.cx, y1: yT, x2: l.cx, y2: yT, pen: { color: withAlpha(text, 0), w: 1 } });
    } else if (d === 3) {
      const half = (l.tw ?? 0) / 2, cx = Math.min(Math.max((s.a + s.b) / 2, l.cx - half), l.cx + half);
      shapes.push({ k: 'text', x: l.cx, y: geo.base, s: l.text ?? '', size: nameL.size!, weight: lk('flows.pill.k').weight, color: text, anchor: 'middle', halo },
        { k: 'text', x: l.cx, y: yT + geo.n2, s: '', size: valL.size!, weight: valL.weight, color: text, alpha: 0, anchor: 'middle', halo },
        { k: 'line', x1: cx, y1: yT, x2: cx, y2: geo.base + 0.3 * f, pen: { color: lead.stroke!, w: lead.width! } });
    } else {
      shapes.push({ k: 'text', x: l.cx, y: yT + geo.n1, s: '', size: nameL.size!, weight: nameL.weight, color: text, alpha: 0, anchor: 'middle', halo }, { k: 'text', x: l.cx, y: yT + geo.n2, s: '', size: valL.size!, weight: valL.weight, color: text, alpha: 0, anchor: 'middle', halo },
        { k: 'line', x1: l.cx, y1: yT, x2: l.cx, y2: yT, pen: { color: withAlpha(text, 0), w: 1 } });
    }
  }
  const frame: Frame = { w, h: Math.ceil(geo.h) + 2, shapes, label: flowsSummary(a.parts, a.healthy, 'inflow') };
  return { frame, tiers: Object.fromEntries(spans.map((s, i) => [s.id, labs[i]!.tier])), parts: [...a.parts] };
}
