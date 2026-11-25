// The pressure profile as a frame (looks: chart-looks/profile.js, hosts 'prof'; plot.js for the gridlines and the unit; card.js for the block's hatching).
// The pieces and their order are the 2D tool's model (tool-profile.js buildModel / paintNow): the zones' tints and names, the gridlines, the unit, the fill
// and the line (the 2D gradient is drawn as one short stroke or band a span, each in the gradient's colour at its middle), the red blocks (hatching clipped
// to the block), the healthy and the earlier line, the axis, the readings on their dots, the lines' names with a halo, the stations' names, the
// sinusoidal brace, the brackets and the pills.
import type { ChartCtx } from '../Chart.tsx';
import { measure } from '../measure.ts';
import { stationText } from '../readings.ts';
import { look, type Look, type LookCtxIn } from '../looks.ts';
import type { Rgba } from '../colour.ts';
import type { Frame, Shape, TextShape } from '../scene.ts';
import { ZONE_LOOK, zoneLines } from './layout.generated.js';
import {
  BRACE_NAME, FULL_NAMES, NS, RATE_OF, STATIONS, blockRect, blockSpan, bracePts, bracketGeom, cutRuns, gap1, gridOf, holesOf, pillSize, profileWords, smooth, whole,
  yOf, zoneSize, zoneSpans, hatchLines, PATH, type Prof, type ProfilePlan,
} from './model.ts';
import { pressureColour } from './pressure-colour.ts';
import { restView, type View } from './glide.ts';

/** The ladder's cell variant (2D: in 'cell', the instrument drawn once at its own size): the looks that differ there (thicker pens, em of --ch-cap) and the scale the cell sets. */
export interface CellOpts { chCap?: number; lad?: number }

const fade = (c: Rgba | undefined, a: number): Rgba | undefined => (c && a < 1 ? [c[0], c[1], c[2], c[3] * a] : c);
const plotR = (w: number, h: number) => Math.max(0, Math.min(10, w / 4, h / 4));
/** A reading's words: a whole number, a true minus (2D num-words.js numWords(v, 0)); the one formatter of every station's reading (../readings.ts). */
export const words0 = stationText;

/** The looks of this chart for a context: asked once each (a glide asks for a frame every tick). */
export function profileLooks(c: ChartCtx, f: number, cell?: CellOpts | null) {
  const host: LookCtxIn = { host: 'prof', px: f, sm: f, ...(cell ? { in: 'cell', layout: 'wide', chCap: cell.chCap ?? f, lad: cell.lad ?? 1 } : {}) };
  const memo = new Map<string, Look>();
  return (key: string, state?: Record<string, unknown>): Look => {
    const id = state ? `${key}|${Object.entries(state).join()}` : key;
    let k = memo.get(id);
    if (!k) { k = look(c, host, key, state); memo.set(id, k); }
    return k;
  };
}

/** A word's halo on this chart is an outline, never a chip: the 2D look's 4 px stroke of the card's opaque colour closed the gap between two digits into one solid pill, darker than the glass and
 *  tints behind it ("dark chips on every number", Lobule deck review 23 Nov; Mohammad: chart words get an outline, never a box). Capped so a halo reaches about 1.25 px past the letters. */
export const OUTLINE_W = 2.5;
const outline = (h: TextShape['halo']): TextShape['halo'] => (h ? { ...h, w: Math.min(h.w, OUTLINE_W) } : undefined);
const text = (x: number, y: number, s: string, k: Look, o: Partial<TextShape> = {}): TextShape => {
  const t: TextShape = { k: 'text', x, y, s, size: k.size!, weight: k.weight, color: k.fill!, anchor: 'middle', ...(k.halo ? { halo: k.halo } : {}), ...o };
  const h = outline(t.halo);
  if (h) t.halo = h;
  return t;
};

/** The frame of `plan` as `view` shows it (a moment of a glide, or the chart at rest: restView). */
/** Where the unit's baseline goes: just over the top gridline's number (the smallest y of the gridlines, less a line of the type). */
export const profileUnitY = (ys: readonly number[], f: number): number => Math.min(...ys) - 0.75 * f;

export function profileFrame(plan: ProfilePlan, view: View, c: ChartCtx, o: { cell?: CellOpts | null } = {}): Frame {
  const { G, f, tw, w, spans } = plan, sh = view.shown, top = sh.top, lk = profileLooks(c, f, o.cell);
  const shapes: Shape[] = [];
  const xs: number[] = [], py: number[] = [];
  for (let i = 0; i < NS; i++) { xs.push(G.x(i)); py.push(yOf(G, top, sh.v[i]!)); }
  const cols = sh.v.map((v) => pressureColour(c.look, v));
  /** the gradient's colour at x: the stops stand on the stations, mixed in sRGB between them */
  const colAt = (x: number): Rgba => {
    const t = Math.min(NS - 1, Math.max(0, ((x - xs[0]!) / (xs[NS - 1]! - xs[0]!)) * (NS - 1))), i = Math.min(NS - 2, Math.floor(t)), u = t - i, a = cols[i]!, b = cols[i + 1]!;
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, 1];
  };

  // The route's three zones on soft tints (rounded with the plot's band), each named over the plot.
  const y0 = G.T - G.hdr, ph = G.B - y0, zf = zoneSize(f), zs = zoneSpans() as [number, number][];
  shapes.push({ k: 'clip', x: 0, y: y0, w, h: ph, r: plotR(w, ph) });
  zs.forEach(([a, b], k) => {
    const tx0 = k ? G.x(a) - G.slot / 2 : 0, tx1 = k < zs.length - 1 ? G.x(b) + G.slot / 2 : w;
    shapes.push({ k: 'rect', x: tx0, y: y0, w: tx1 - tx0, h: G.B - y0, fill: lk(ZONE_LOOK[k]).fill });
  });
  shapes.push({ k: 'unclip' });
  const holes = holesOf(G, f, tw, py, sh.v);
  if (G.zone.lines) {
    const tk = lk('prof.zone.text'), size0 = zf < f - 0.01 ? zf : f, lsp = G.zone.tight ? 0 : 0.06;
    const names = zs.map(([a, b], k) => { const ls: string[] = zoneLines(k, G.zone.lines).slice(0, G.zone.word ? 1 : 2); return { ls, m: (G.x(a) + G.x(b)) / 2, tw: Math.max(...ls.map((t) => measure(t, size0, tk.weight ?? 500) + lsp * size0 * t.length)) }; });
    // (a name stands whole inside the card: centred on its zone, but never past either edge, so none starts mid-word; Circulation 4, reviewer 24 Nov 2026)
    names.forEach((n) => { n.m = Math.min(Math.max(n.m, n.tw / 2 + 2), w - n.tw / 2 - 2); });
    names.forEach((n) => n.ls.forEach((t, j) => shapes.push(text(n.m, G.T - G.zb - (n.ls.length - 1 - j) * 1.05 * zf, t, tk, { size: size0, ls: lsp }))));
  }

  // The gridlines, bare: every reading carries its own number, and the unit is the card's words (Gut to Heart, 23 Nov: the numbers and "mmHg" crowded the plot's left edge).
  const gl = lk('plot.grid.line');
  gridOf(G, f, top).forEach((g, k) => {
    if (k % 2) return;   // (bare lines: every other one, the 10s, so the plot is not a ruled page)
    shapes.push({ k: 'line', x1: G.L, x2: G.R, y1: g.y, y2: g.y, pen: { color: gl.stroke!, w: gl.width ?? 1 } });
  });

  // The unit, once, turned up the left edge in the gutter between the card's edge and the plot's lines, centred on the plot (24 Nov, Mohammad: "G1 ... needs some margin"). A turned word's baseline is its
  // right-hand side, so the baseline stands a quarter of the type right of the gutter's middle and the letters sit as far from the card's edge as from the lines.
  const uk = lk('plot.unit');
  shapes.push(text(G.L / 2 + 0.26 * uk.size!, (G.T + G.Z) / 2, 'mmHg', uk, { rot: -90 }));

  // The line's fill, closed down to the zero line, and the line: one piece a span of the gradient.
  const line = smooth(xs, py), np = line.length / 2, fillK = lk('prof.fill').opacity ?? 0.16;
  for (let q = 0; q < np - 1; q++) {
    const x0 = line[2 * q]!, x1 = line[2 * q + 2]!, col = colAt((x0 + x1) / 2);
    shapes.push({ k: 'band', top: [x0, line[2 * q + 1]!, x1, line[2 * q + 3]!], bottom: [x0, G.Z, x1, G.Z], fill: [col[0], col[1], col[2], fillK] });
  }

  // The red blocks, over the fill and under the line: a tint, bold diagonal stripes clipped to the block, and the block's own outline.
  const bg = lk('card.hatch.bg'), st = lk('card.hatch.stripe'), bk = lk('prof.blk');
  for (let i = 0; i < NS; i++) {
    const op = view.blk[i]!;
    if (op < 0.005) continue;
    const r = blockRect(G, f, py, i, blockSpan(xs[i]!, G.slot, tw));
    shapes.push({ k: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, r: r.r, fill: fade(bg.fill, op) });
    shapes.push({ k: 'clip', x: r.x, y: r.y, w: r.w, h: r.h, r: r.r });
    const sc = fade(st.fill, op * (st.fillOpacity ?? 1))!;
    for (const [ax, ay, bx, by] of hatchLines(r.x, r.y, r.w, r.h)) shapes.push({ k: 'line', x1: ax!, y1: ay!, x2: bx!, y2: by!, pen: { color: sc, w: 4 } });
    shapes.push({ k: 'unclip' });
    shapes.push({ k: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, r: r.r, pen: { color: fade(bk.stroke, op * (bk.strokeOpacity ?? 1))!, w: bk.width ?? 1.2 } });
  }

  // The lines stop NUM_PAD px short of each reading: cut where they enter and leave its box.
  const dashed = (p: Prof | null, key: string) => {
    if (!p) return;
    const k = lk(key), hy = p.v.map((v) => yOf(G, top, v));
    for (const run of cutRuns(smooth(xs, hy), holes)) shapes.push({ k: 'path', pts: run, pen: { color: k.stroke!, w: k.width ?? 1, dash: k.dash, cap: k.cap ?? 'round' } });
  };
  dashed(plan.hl, 'prof.hl');
  dashed(plan.bf, 'prof.bf');
  const ax = lk('prof.axis');
  shapes.push({ k: 'line', x1: G.L, x2: G.R, y1: G.B, y2: G.B, pen: { color: ax.stroke!, w: ax.width ?? 1 } });
  const ln = lk('prof.line');
  for (const run of cutRuns(line, holes)) for (let q = 0; q + 3 < run.length; q += 2) {
    shapes.push({ k: 'path', pts: [run[q]!, run[q + 1]!, run[q + 2]!, run[q + 3]!], pen: { color: colAt((run[q]! + run[q + 2]!) / 2), w: ln.width ?? 3, cap: ln.cap ?? 'round', join: ln.join ?? 'round' } });
  }

  // The readings on their dots, a whole number, with a halo of the card's colour.
  const vk = lk('prof.v');
  for (let i = 0; i < NS; i++) shapes.push(text(xs[i]!, py[i]! + (plan.sides[i]?.by ?? 0.36 * f), words0(sh.v[i]!), vk));

  // The healthy and earlier lines' names, each with a halo of the card's colour (no box behind the word).
  const nk = lk('prof.name');
  // (a line that is the healthy one needs no "Healthy" on it: the dashed line lies under it)
  const same = !!plan.hl && plan.hl.v.every((v, i) => Math.abs(v - plan.goal.v[i]!) < 0.05);
  for (const n of view.names) if (!(same && n.c === 'hl')) shapes.push(text(n.x, n.y, n.t, nk, { halo: vk.halo }));
  // The stations' names under the axis, and the brace named sinusoidal under the liver's three.
  STATIONS.forEach((_, i) => { const nm = G.fit.names[i]!, half = measure(nm, nk.size!, nk.weight ?? 500) / 2; shapes.push(text(Math.min(Math.max(G.nameX(i), half + 2), w - half - 2), G.nameY(i), nm, nk)); });
  // "sinusoidal" stands in a bracket under the liver's three names, in the bracket style of HVPG and PPG: ticks up at the ends, the bar broken round the word.
  const i0 = STATIONS.indexOf(PATH.liver[0]), i1 = STATIONS.indexOf(PATH.liver[1]);
  if (i0 >= 0) {
    const bp = lk('prof.brace.path'), bt = lk('prof.brace.text'), x0 = G.x(i0) - 0.42 * G.slot, x1 = G.x(i1) + 0.42 * G.slot, mid = (x0 + x1) / 2, y = G.sinY;
    const ww = measure(BRACE_NAME, bt.size!, bt.weight ?? 500), pen = { color: bp.stroke!, w: bp.width ?? 1.5, cap: bp.cap ?? 'round', join: bp.join ?? 'round' } as const;
    const gapL = Math.min(mid - ww / 2 - 7, x1), gapR = Math.max(mid + ww / 2 + 7, x0);
    shapes.push({ k: 'path', pts: [x0, y - 0.3 * f, x0, y, gapL, y], pen });
    shapes.push({ k: 'path', pts: [x1, y - 0.3 * f, x1, y, gapR, y], pen });
    shapes.push(text(mid, y + 0.36 * f, BRACE_NAME, bt));
  }

  // The brackets (HVPG, EUS-PPG, PPG) in their cut-off colours, each label inside its own bracket; held back, they are out.
  const shownOf = sh as unknown as Record<string, number>;
  if (view.brk >= 0.005) spans.forEach(([key, name], r) => {
    const v = shownOf[key]!, rate = RATE_OF[key]!(v), g = bracketGeom(G, f, tw, r, v), bp = lk('prof.br.path', { rate }), bt = lk('prof.br.text', { rate }), bkk = lk('prof.br.k');
    const pen = { color: fade(bp.stroke, view.brk)!, w: bp.width ?? 1.5 };
    for (const t of g.ticks) shapes.push({ k: 'path', pts: t, pen });
    for (const t of g.bar) shapes.push({ k: 'path', pts: t, pen });
    const halo = bt.halo ? { color: fade(bt.halo.color, view.brk)!, w: Math.min(bt.halo.w, OUTLINE_W) } : undefined, val = gap1(v);
    const part = (x: number, y: number, s: string, k: Look, anchor: 'start' | 'middle'): TextShape =>
      ({ k: 'text', x, y, s, size: g.fs < f - 0.01 ? g.fs : f, weight: k.weight, color: fade(k.fill, view.brk)!, anchor, ...(halo ? { halo } : {}) });
    if (g.stack) {
      shapes.push(part(g.mid, g.yy - 0.19 * f, name, bkk, 'middle'));
      shapes.push(part(g.mid, g.yy - 0.19 * f + 1.1 * f, val, bt, 'middle'));
    } else {
      const nw = measure(`${name} `, g.fs, bkk.weight ?? 600), vw = measure(val, g.fs, bt.weight ?? 700), x = g.mid - (nw + vw) / 2, y = g.yy + 0.36 * g.fs;
      shapes.push(part(x, y, `${name} `, bkk, 'start'));
      shapes.push(part(x + nw, y, val, bt, 'start'));
    }
  });

  // The readings (HVPG, PPG) in the plot's top right as plain words in the rating's colour, no capsule (docs/HUMANIZED-DESIGN.md section 0). The brackets below carry the same
  // words, so while they show these fade out (the readings stand where the brackets are); where the brackets are held back the words stand here.
  if (view.pills && view.pillA * (1 - view.brk) >= 0.005) {
    const ps = pillSize(G, tw), a = view.pillA * (1 - view.brk);
    spans.forEach(([key, name], k) => {
      const at = view.pills![k];
      if (!at) return;
      const v = shownOf[key]!, rate = RATE_OF[key]!(v), tk = lk('prof.pill.text', { rate }), kk = lk('prof.pill.k'), bt = lk('prof.br.text', { rate });
      const halo = bt.halo ? { color: fade(bt.halo.color, a)!, w: Math.min(bt.halo.w, OUTLINE_W) } : undefined;
      const val = gap1(v), nw = measure(`${name} `, f, kk.weight ?? 600), vw = measure(val, f, tk.weight ?? 700), x = at.x + ps.w[k]! / 2 - (nw + vw) / 2, y = at.y + ps.h / 2 + 0.36 * f;
      shapes.push({ k: 'text', x, y, s: `${name} `, size: tk.size!, weight: kk.weight, color: fade(tk.fill, a)!, anchor: 'start', ...(halo ? { halo } : {}) });
      shapes.push({ k: 'text', x: x + nw, y, s: val, size: tk.size!, weight: tk.weight, color: fade(tk.fill, a)!, anchor: 'start', ...(halo ? { halo } : {}) });
    });
  }
  void whole;
  return { w, h: plan.h, shapes, label: profileWords(plan.goal, spans) };
}

/** The chart at rest on its plan (every fade done). */
export const profileFrameAtRest = (plan: ProfilePlan, c: ChartCtx, o: { cell?: CellOpts | null; held?: boolean } = {}): Frame => profileFrame(plan, restView(plan, o.held), c, o);
