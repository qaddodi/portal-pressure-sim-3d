// A case on one line, and the names strip over the six, as frames (2D: tool-profile.js createProfileStrip; looks: chart-looks/profile.js 'prof.*', card.js 'card.hatch.*', hosts 'pstrip' and 'pstriph').
// Every size, weight, colour and dash is asked of the 2D look tables. Not expressible in a Frame, and approximated: the line's gradient (the pressure ramp along the line) is drawn as short
// butt-capped pieces, each in the ramp's colour at its place; the red blocks' hatching (a pattern fill) is the faint tint under diagonal stripes clipped to the block.
import type { ChartCtx } from '../Chart.tsx';
import type { Rgba } from '../colour.ts';
import { look, type Look } from '../looks.ts';
import { measure } from '../measure.ts';
import type { Frame, Shape } from '../scene.ts';
import { samplerFor } from '../../../scene/lenses/model.ts';
import { braceD, braceLine, namesLayout, profileOf, stripLayout, STATIONS, ZONE_LOOK, BRACE_NAME, type Fp } from './model.ts';

/** The strips' type: the card's label size on a case's own strip, its cap size over the six; 12 px at least (2D fittedType). */
const typeOf = (c: ChartCtx) => Math.max(12, c.type.sm);
const tw = (f: number) => (t: string, weight = 600) => measure(t, f, weight);
const withAlpha = (c: Rgba, a: number): Rgba => [c[0], c[1], c[2], c[3] * a];

/** The pressure ramp's colour at p mmHg in this look (2D colormap.js pressureColor), as a Rgba. */
export const pressureRgba = (c: ChartCtx, p: number): Rgba => { const [r, g, b] = samplerFor(c.look, 'pressure').at(p, [0, 0, 0]); return [r, g, b, 1]; };

/** One case's pressures on one line at c.w px: the readings joined by the line, the red blocks where the pressure falls, the zones' tints. null where the fingerprint has no profile. */
export function stripFrame(fp: Fp | null | undefined, healthy: Fp | null | undefined, c: ChartCtx): Frame | null {
  if (!fp) return null;
  const w = Math.max(120, Math.round(c.w)), f = typeOf(c), H = { host: 'pstrip', lab: f };
  const L = stripLayout(w, f, fp, healthy ?? null, tw(f));
  if (!L) return null;
  const lk = (key: string): Look => look(c, H, key);
  const shapes: Shape[] = [];
  // the zones' tints, a hair apart, across the line's full height
  L.zones.forEach(([x0, ww], k) => shapes.push({ k: 'rect', x: x0, y: 0, w: ww, h: L.h, r: 4, fill: lk(ZONE_LOOK[k]!).fill }));
  // each block on its station's column, behind the line and the readings: the faint red tint, the stripes, the outline
  const bg = lk('card.hatch.bg'), st = lk('card.hatch.stripe'), blk = lk('prof.blk');
  for (const [x0, x1] of L.blocks) {
    const bw = x1 - x0, r = Math.min(4, bw / 2);
    shapes.push({ k: 'rect', x: x0, y: 1, w: bw, h: L.h - 2, r, fill: bg.fill });
    shapes.push({ k: 'clip', x: x0, y: 1, w: bw, h: L.h - 2, r });
    const stripe = withAlpha(st.fill!, st.fillOpacity ?? 1), step = 7 * Math.SQRT2;   // (the pattern: 7 px square, rotated 45 degrees, its stripe half the period)
    for (let m = Math.floor((x0 + 1) / step) - 1; step * (m + 0.25) <= x1 + L.h; m++) {
      const K = step * (m + 0.25);   // (a stripe is the line x + y = K, the pattern's stripe centre)
      const ya = Math.max(1, K - x1), yb = Math.min(L.h - 1, K - x0);   // (the stripe's part inside the block's box)
      if (yb > ya) shapes.push({ k: 'line', x1: K - ya, y1: ya, x2: K - yb, y2: yb, pen: { color: stripe, w: 3.5 } });
    }
    shapes.push({ k: 'unclip' });
    shapes.push({ k: 'rect', x: x0, y: 1, w: bw, h: L.h - 2, r, pen: { color: withAlpha(blk.stroke!, blk.strokeOpacity ?? 1), w: blk.width ?? 1.2 } });
  }
  // the line, in the ramp's colour along it (stops at each station, the colours between them joined as a gradient would)
  const ln = lk('prof.strip.line'), v = profileOf(fp)!.v;
  const colourAt = (xx: number) => {
    const t = Math.min(STATIONS.length - 1, Math.max(0, xx / L.slot - 0.5)), i = Math.min(STATIONS.length - 2, Math.floor(t)), u = t - i;
    const a = pressureRgba(c, v[i]!), b = pressureRgba(c, v[i + 1]!);
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, 1] as Rgba;
  };
  for (const [xa, xb] of L.segs) {
    if (!(xb > xa)) continue;
    const n = Math.max(1, Math.ceil((xb - xa) / 4));
    for (let k = 0; k < n; k++) {
      const x0 = xa + ((xb - xa) * k) / n, x1 = xa + ((xb - xa) * (k + 1)) / n;
      shapes.push({ k: 'line', x1: x0, y1: L.cy, x2: x1 + (k < n - 1 ? 0.5 : 0), y2: L.cy, pen: { color: colourAt((x0 + x1) / 2), w: ln.width ?? 4, cap: k === 0 || k === n - 1 ? ln.cap : 'butt' } });
    }
  }
  const val = lk('prof.strip.v');
  L.labels.forEach((t, i) => shapes.push({ k: 'text', x: L.x(i), y: +(L.cy + 0.36 * f).toFixed(2), s: t, size: val.size ?? f, weight: val.weight, color: val.fill!, anchor: 'middle', ...(val.halo ? { halo: val.halo } : {}) }));
  return { w, h: L.h, shapes, label: L.label };
}

/** The names strip over the six: each station's name over its column, the sinusoidal brace over the liver's three. */
export function namesFrame(c: ChartCtx): Frame {
  const w = Math.max(120, Math.round(c.w)), f = typeOf(c), H = { host: 'pstriph', cap: f };
  const L = namesLayout(w, f, tw(f));
  const lk = (key: string): Look => look(c, H, key);
  const shapes: Shape[] = [];
  if (L.brace) {
    const b = lk('prof.brace.path'), t = lk('prof.brace.text');
    shapes.push({ k: 'path', pts: braceLine(braceD(L.brace.xa, L.brace.xb, 0, L.brace.d), L.ends), pen: { color: b.stroke!, w: b.width ?? 1.5, cap: b.cap, join: b.join } });
    shapes.push({ k: 'text', x: L.brace.textX, y: 0.95 * f, s: BRACE_NAME, size: t.size ?? f, weight: t.weight, color: t.fill!, anchor: 'middle' });
  }
  const nm = lk('prof.name');
  STATIONS.forEach((_, i) => shapes.push({ k: 'text', x: L.x(i) + L.fit.dx[i]!, y: L.base + (L.fit.low[i] ? 1.25 * f : 0), s: L.fit.names[i]!, size: nm.size ?? f, weight: nm.weight, color: nm.fill!, anchor: 'middle' }));
  return { w, h: L.h, shapes, label: `Stations from gut to heart: ${L.fit.names.join(', ')}; the liver's three under the sinusoidal brace.` };
}

const dy = (s: Shape, d: number): Shape => {
  switch (s.k) {
    case 'rect': case 'clip': return { ...s, y: s.y + d };
    case 'line': return { ...s, y1: s.y1 + d, y2: s.y2 + d };
    case 'path': return { ...s, pts: s.pts.map((v, i) => (i % 2 ? v + d : v)) };
    case 'band': return { ...s, top: s.top.map((v, i) => (i % 2 ? v + d : v)), bottom: s.bottom.map((v, i) => (i % 2 ? v + d : v)) };
    case 'circle': return { ...s, cy: s.cy + d };
    case 'text': return { ...s, y: s.y + d };
    default: return s;
  }
};
/** The names strip over a column of cases' strips, as a phone's grid draws them (the cases one under another, `gap` px between): one frame. */
export function ladderColumnFrame(cases: readonly { fp: Fp; healthy?: Fp | null }[], c: ChartCtx, gap = 8): Frame {
  const head = namesFrame(c), shapes: Shape[] = [...head.shapes], labels = [head.label];
  let y = head.h + gap;
  for (const k of cases) {
    const s = stripFrame(k.fp, k.healthy, c);
    if (!s) continue;
    shapes.push(...s.shapes.map((x) => dy(x, y)));
    labels.push(s.label);
    y += s.h + gap;
  }
  return { w: head.w, h: Math.max(head.h, Math.round(y - gap)), shapes, label: labels.join(' ') };
}
