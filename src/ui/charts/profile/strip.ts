// The phone grid's strips (2D: createProfileStrip in tool-profile.js, hosts 'pstrip' and 'pstriph'): one case's eight readings joined by the line on the zones' tints with the
// red blocks between them, and the names-only strip over the six (each station's name, the sinusoidal brace turned to open down onto them).
import type { ChartCtx } from '../Chart.tsx';
import { measure } from '../measure.ts';
import { look, type Look } from '../looks.ts';
import type { Rgba } from '../colour.ts';
import type { Frame, Shape, TextShape } from '../scene.ts';
import { ZONE_LOOK } from './layout.generated.js';
import { NS, NUM_PAD, PATH, STATIONS, BRACE_NAME, blockSpan, blocksOf, bracePts, nameFit, profileOf, whole, zoneSpans, SPOKEN, hatchLines, type Fp, type Prof } from './model.ts';
import { pressureColour } from './pressure-colour.ts';
import { words0 } from './frame.ts';

const words = (p: Prof) => `Pressure from gut to heart: ${STATIONS.map((s, i) => `${SPOKEN[s]} ${whole(p.v[i]!)}`).join(', ')} mmHg.`;

/** One case's strip at width w: the line through its eight readings (stopping short of each), the zones' tints behind, the blocks where the pressure falls. null without a profile. */
export function profileStripFrame(fp: Fp | null | undefined, healthy: Fp | null | undefined, c: ChartCtx): Frame | null {
  const p = profileOf(fp);
  if (!p) return null;
  const f = Math.max(12, c.type.sm), w = c.w, hl = profileOf(healthy), tw = (t: string, wt = 600) => measure(t, f, wt);
  const lk = (key: string): Look => look(c, { host: 'pstrip', px: f, sm: f, lab: f }, key);
  const slot = (w - 10) / NS, x = (i: number) => slot * (i + 0.5), n = NS - 1, hh = Math.ceil(1.9 * f), cy = hh / 2;
  const labels = p.v.map(whole), hw = labels.map((t) => tw(t, 700) / 2), shapes: Shape[] = [];
  for (const [k, [a, b]] of zoneSpans().entries()) shapes.push({ k: 'rect', x: x(a) - slot / 2 + 0.5, y: 0, w: slot * (b - a + 1) - 1, h: hh, r: 4, fill: lk(ZONE_LOOK[k]).fill });
  const bg = lk('card.hatch.bg'), st = lk('card.hatch.stripe'), bk = lk('prof.blk');
  for (const i of blocksOf(p, hl)) {
    const [x0, x1] = blockSpan(x(i), slot, tw), r = Math.min(4, (x1 - x0) / 2);
    shapes.push({ k: 'rect', x: x0, y: 1, w: x1 - x0, h: hh - 2, r, fill: bg.fill });
    shapes.push({ k: 'clip', x: x0, y: 1, w: x1 - x0, h: hh - 2, r });
    const sc: Rgba = [st.fill![0], st.fill![1], st.fill![2], st.fill![3] * (st.fillOpacity ?? 1)];
    for (const [ax, ay, bx, by] of hatchLines(x0, 1, x1 - x0, hh - 2, 7)) shapes.push({ k: 'line', x1: ax!, y1: ay!, x2: bx!, y2: by!, pen: { color: sc, w: 3.5 } });
    shapes.push({ k: 'unclip' });
    shapes.push({ k: 'rect', x: x0, y: 1, w: x1 - x0, h: hh - 2, r, pen: { color: [bk.stroke![0], bk.stroke![1], bk.stroke![2], bk.stroke![3] * (bk.strokeOpacity ?? 1)], w: bk.width ?? 1.2 } });
  }
  // the line stops NUM_PAD px short of each reading; each piece is the gradient's colour at its middle (the stops stand on the stations, mixed in sRGB)
  const cols = p.v.map((v) => pressureColour(c.look, v)), ln = lk('prof.strip.line');
  for (let i = 0; i < n; i++) {
    const a = x(i) + hw[i]! + NUM_PAD, b = x(i + 1) - hw[i + 1]! - NUM_PAD;
    if (!(b > a)) continue;
    const u = ((a + b) / 2 - x(i)) / slot, A = cols[i]!, B = cols[i + 1]!, col: Rgba = [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, A[2] + (B[2] - A[2]) * u, 1];
    shapes.push({ k: 'path', pts: [a, cy, b, cy], pen: { color: col, w: ln.width ?? 4, cap: ln.cap ?? 'round' } });
  }
  const vk = lk('prof.strip.v');
  labels.forEach((_, i) => shapes.push({ k: 'text', x: x(i), y: cy + 0.36 * f, s: words0(p.v[i]!), size: vk.size!, weight: vk.weight, color: vk.fill!, anchor: 'middle', ...(vk.halo ? { halo: vk.halo } : {}) } as TextShape));
  return { w, h: hh, shapes, label: words(p) };
}

/** The names strip over the six cases: the sinusoidal brace opening down onto Pre-, Intra- and Post-, then every station's name in its column. */
export function profileNamesFrame(c: ChartCtx): Frame {
  const f = Math.max(12, c.type.sm), w = c.w, tw = (t: string, wt = 600) => measure(t, f, wt);
  const lk = (key: string): Look => look(c, { host: 'pstriph', px: f, sm: f, cap: f }, key);
  const slot = (w - 10) / NS, x = (i: number) => slot * (i + 0.5), fit = nameFit(slot, tw) as { names: string[]; rows: number; dx: number[]; low: boolean[] };
  const ends = 1.85 * f, base = ends + 1.05 * f, hh = Math.ceil(base + (fit.rows - 1) * 1.25 * f + 0.3 * f), shapes: Shape[] = [];
  const i0 = STATIONS.indexOf(PATH.liver[0]), i1 = STATIONS.indexOf(PATH.liver[1]);
  if (i0 >= 0) {
    const bp = lk('prof.brace.path'), bt = lk('prof.brace.text');
    // the brace of the chart turned over: y becomes ends - y
    const pts = bracePts(x(i0) - 0.42 * slot, x(i1) + 0.42 * slot, 0, 0.55 * f).map((v, i) => (i % 2 ? ends - v : v));
    shapes.push({ k: 'path', pts, pen: { color: bp.stroke!, w: bp.width ?? 1.5, cap: bp.cap ?? 'round', join: bp.join ?? 'round' } });
    shapes.push({ k: 'text', x: (x(i0) + x(i1)) / 2, y: 0.95 * f, s: BRACE_NAME, size: bt.size!, weight: bt.weight, color: bt.fill!, anchor: 'middle' });
  }
  const nk = lk('prof.name');
  STATIONS.forEach((_, i) => shapes.push({ k: 'text', x: x(i) + fit.dx[i]!, y: base + (fit.low[i] ? 1.25 * f : 0), s: fit.names[i]!, size: nk.size!, weight: nk.weight, color: nk.fill!, anchor: 'middle' }));
  return { w, h: hh, shapes, label: '' };
}
