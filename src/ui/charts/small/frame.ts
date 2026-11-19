// The all-patients chart as a frame (2D: visual-allpatients.js build(); looks: chart-looks/time.js, plot.js and allp.js, host 'curve'). Every size, weight, colour and
// dash is asked of the 2D look tables; the layout is the 2D model's own (allpatients-model.js layout()).
import type { ChartCtx } from '../Chart.tsx';
import { look, type Look } from '../looks.ts';
import { measure } from '../measure.ts';
import type { Frame, Shape, TextShape } from '../scene.ts';
import { allPatientsWords, at, CUT, fmtOf, KEYS, layout, smoothPts, verdictOf, type Geo, type Series } from './model.ts';

const FMT = Object.fromEntries(KEYS.map((k) => [k, fmtOf(k)])) as Record<string, (v: number) => string>;
const tokName = (v: string) => v.replace(/^--/, '');
/** the plot's corner radius (2D plot-look.js plotR): 10 px, less on a plot too small for it */
const plotR = (w: number, h: number) => Math.max(0, Math.min(10, w / 4, h / 4));

export interface AllPatientsOut { frame: Frame; G: Geo }

/** The chart for a card c.w px wide. ser: the four patients' series, or null for the frame alone (the numbers are still being worked out). foot: the small print under the chart. */
export function allPatientsFrame(ser: Series | null, foot: readonly string[], c: ChartCtx): AllPatientsOut {
  const W = Math.max(200, Math.round(c.w));
  const G = layout(W, ser, [...foot]);
  const { f, r, X, Y, B, T, L, R, plotW, py } = G;
  const H = { host: 'curve', px: f };   // (the type the layout was made for is the base an em is in: 2D gl.setCtx({ px: G.f }))
  const lk = (key: string, state: Record<string, unknown> = {}, tone?: string, name = 'c'): Look => look(c, H, key, state, tone ? { [name]: tone } : {});
  const shapes: Shape[] = [];
  /** a word as its look says; (x, y) is the middle of its line, as the 2D builder places it (y + 0.35 f) */
  const say = (l: Look, s: string, x: number, y: number, anchor: TextShape['anchor'] = 'start', o: Partial<TextShape> = {}) => {
    shapes.push({ k: 'text', x: +x.toFixed(1), y: +(y + 0.35 * f).toFixed(1), s, size: l.size ?? f, weight: l.weight, color: l.fill!, anchor, ...(l.halo ? { halo: l.halo } : {}), ...(l.upper ? { upper: true } : {}), ...(l.ls ? { ls: l.ls } : {}), ...o });
  };
  const line = (x1: number, y1: number, x2: number, y2: number, l: Look) => shapes.push({ k: 'line', x1, y1, x2, y2, pen: { color: l.stroke!, w: l.width ?? 1, dash: l.dash, cap: l.cap } });

  // the panel and the CSPH side tinted from the line up (clipped to the panel's corners)
  const ph = B + G.foot - py, cutY = Y(CUT), pr = plotR(plotW, ph);
  shapes.push({ k: 'rect', x: 0, y: py, w: plotW, h: ph, r: pr, fill: lk('plot.bg').fill });
  shapes.push({ k: 'clip', x: 0, y: py, w: plotW, h: ph, r: pr });
  shapes.push({ k: 'rect', x: 0, y: py, w: plotW, h: +(cutY - py).toFixed(1), fill: lk('co.z', { rate: 'hi' }).fill });
  shapes.push({ k: 'unclip' });
  // the grid: lines, the numbers in the strip at the left, the cut-off's in its colour
  for (const v of G.ticks) {
    line(L, Y(v), R, Y(v), lk('plot.grid.line', { cut: false }));
    say(lk('time.grid.text', {}, 'text-3'), String(v), L - 0.5 * f, Y(v), 'end');
  }
  line(L, cutY, R, cutY, lk('plot.grid.line', { cut: true, rate: 'hi' }));
  say(lk('cv.tc', { tc: 'hi' }), String(CUT), L - 0.5 * f, cutY, 'end');
  // the zones named in the two corners no line reaches
  say(lk('ap.zone', { tc: 'hi' }), 'CSPH', X(24), T + 0.9 * f, 'end');
  say(lk('ap.zone', { tc: 'ok' }), 'No CSPH', X(24), B - 0.9 * f, 'end');
  for (const m of [12, 24].filter((q) => q <= G.end)) line(+X(m).toFixed(1), +T.toFixed(1), +X(m).toFixed(1), +B.toFixed(1), lk('cv.at'));
  // the clock under the plot
  line(L, B, R, B, lk('time.axis.line'));
  for (const [m, s] of G.xt) say(lk('time.tk'), s, X(m), B + 1.1 * f, 'middle');
  // the caption: HVPG, in mmHg
  const cap = lk('time.key.text', {}, 'text-2');
  say(cap, 'HVPG', 0, 0.8 * f);
  say(lk('time.key.unit'), ', mmHg', measure('HVPG', cap.size ?? f, cap.weight ?? 700), 0.8 * f, 'start', { size: cap.size ?? f });

  if (ser) {
    const pxOf = (p: Series[number], from: number, to: number): [number, number][] => p.pts.filter((q) => q.m >= from && q.m <= to).map((q) => [X(q.m), Y(q.hvpg)]);
    for (const p of ser) {
      const yr = p.pace ? 12 : 24, tone = tokName(p.c);   // (a patient with one year in the deck: the line, then the model's second year dotted)
      const ln = lk('cv.line', {}, tone);
      shapes.push({ k: 'path', pts: smoothPts(pxOf(p, 0, yr)), pen: { color: ln.stroke!, w: ln.width!, cap: ln.cap, join: ln.join } });
      if (p.pace) {
        const md = lk('ap.model', {}, tone);
        shapes.push({ k: 'path', pts: smoothPts(pxOf(p, 12, 24)), pen: { color: md.stroke!, w: md.width!, cap: md.cap, join: md.join, dash: md.dash } });
      }
    }
    for (const p of ser) {
      const tone = tokName(p.c), ring = lk('cv.ring', {}, tone), dot = lk('cv.dot', {}, tone);
      shapes.push({ k: 'circle', cx: +X(0).toFixed(1), cy: +Y(p.pts[0]!.hvpg).toFixed(1), r, fill: ring.fill, pen: { color: ring.stroke!, w: ring.width! } });
      for (const m of [12, 24].filter((q) => at(p, q, 'hvpg') != null)) shapes.push({ k: 'circle', cx: +X(m).toFixed(1), cy: +Y(at(p, m, 'hvpg')!).toFixed(1), r: m === 24 ? r + 1 : r, fill: dot.fill, pen: { color: dot.stroke!, w: dot.width! } });
    }
    for (const [k, key] of [['start', 'ft.v0'], ['year1', 'cv.v'], ['year2', 'cv.v']] as const) {
      for (const w of G.words[k]) say(lk(key, {}, tokName(w.p.c)), FMT.hvpg!(w.v), w.x, w.y, 'start');
    }
    keyShapes(G, ser, say, lk, shapes);
  }
  // the small print
  const tk = lk('time.tk');
  G.note.lines.forEach((l, i) => say(tk, l, G.note.x, G.note.y + (i + 0.5) * G.note.lh, 'start'));
  return { frame: { w: G.W, h: G.H, shapes, label: allPatientsWords(ser) }, G };
}

// The key: a block for each patient (a dot, the name and the verdict in its colour; a row each for the HVPG, the stiffness and the platelets at before, 1 year
// and 2 years), under one header on a wide card and under a header of its own in each block on a phone.
function keyShapes(G: Geo, ser: Series, say: (l: Look, s: string, x: number, y: number, a?: TextShape['anchor'], o?: Partial<TextShape>) => void, lk: (key: string, state?: Record<string, unknown>, tone?: string) => Look, shapes: Shape[]) {
  void ser;
  const { f, key: K } = G, n = (v: number) => +v.toFixed(1);
  const heads = (h: { y: number; colR: number[]; texts: string[] }) => h.texts.forEach((s, i) => say(lk('time.tk'), s, n(h.colR[i]!), h.y, 'end'));
  if (K.head) heads(K.head);
  for (const b of K.blocks) {
    const v = verdictOf(b.p), star = b.p.pace ? '*' : '', tone = tokName(b.p.c);
    const dot = lk('cv.dot', {}, tone);
    shapes.push({ k: 'circle', cx: n(b.x + 0.4 * f), cy: n(b.nameY), r: 0.36 * f, fill: dot.fill, pen: { color: dot.stroke!, w: dot.width! } });
    say(lk('time.key.text', {}, tone), b.p.name + star, n(b.x + 1.15 * f), b.nameY, 'start');
    say(lk('time.key.text', {}, v.ok ? 'ok' : 'danger'), v.text, n(b.colR[2]!), b.nameY, 'end');
    if (b.head) heads(b.head);
    for (const row of b.rows) {
      say(lk('time.tk'), row.label, n(b.x + 1.15 * f), row.y, 'start');
      [0, 12, 24].forEach((m, i) => {
        const val = at(b.p, m, row.k);
        if (val == null) return;
        if (row.k === 'hvpg') say(lk('time.key.text', {}, tone), FMT_OF(row.k)(val), n(b.colR[i]!), row.y, 'end');
        else say(lk('time.grid.text', {}, i ? 'text-2' : 'text-3'), FMT_OF(row.k)(val), n(b.colR[i]!), row.y, 'end');
      });
    }
  }
}
const FMT_OF = (k: string) => fmtOf(k);
