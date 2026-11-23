// The plane chart as a frame (2D: visual-plane.js planePlot().draw, planeKey, planeCardKey, planeReading; looks: chart-looks/plane.js, hosts 'plane' and 'planecard', and crit.js for the
// guideline card's own look). A summary (visual: 'plane') draws a point with its name for each patient; the data card (tool: { kind: 'plane' }) draws the slide's case as a dot,
// the trail of the slides before it, and each zone's words clear of both. Where a word, a line or a name stands is plane/model.ts (the 2D layout, copied); this file draws it.
import type { ChartCtx } from '../Chart.tsx';
import { mix, withAlpha, type Rgba } from '../colour.ts';
import { hatchSlivers } from '../criteria/zones.ts';
import { look, type Look } from '../looks.ts';
import { measure } from '../measure.ts';
import type { Frame, Shape } from '../scene.ts';
import { wrapWords } from '../trial/model.ts';
import { keyEntries, planeLayout, planeReading, planeWords, plotHeightOf, shownReading, stepWalk, valOf, type WalkState, type Fp, type PlaneDef, type PlanePoint, type PlaneLayout, type Stop } from './model.ts';

/** What the plane is told. */
export interface PlaneIn {
  plane: PlaneDef;
  /** a summary's points (visual: 'plane', the slide's `of`): each patient's reading, where it started, its name and site */
  points?: readonly PlanePoint[];
  /** the data card's case: the slide's fingerprint (tool: { kind: 'plane' }). Setting it draws the card, not the summary. */
  ring?: Fp | null;
  /** the card: true for the data card (tool), false for a summary (visual). Default: the card when `ring` is given. */
  card?: boolean;
  /** where the card's dot was: the zones' words keep clear of its way (the previous reading) */
  ringWas?: Fp | null;
  /** the card's trail: the stops before this slide, in order */
  stops?: readonly Stop[];
  /** the way the dot went since the slide came up (kept by the card between its frames: this frame moves it on to the dot where it stands now, stepWalk) */
  walk?: WalkState;
  /** the room the card leaves the chart, px (2D --pz-room): the guideline card's graph is never taller than it less the key and the reading */
  room?: number;
  /** the plot's height, px; the default is the 2D one at this width */
  height?: number;
}
export interface PlaneOut { frame: Frame; layout: PlaneLayout; /** the plot's own height (the key and the reading come under it) */ plotH: number }

const fade = (c: Rgba | undefined, k: number | undefined): Rgba | undefined => (c && k !== undefined ? withAlpha(c, k) : c);
const plotR = (w: number, h: number) => Math.max(0, Math.min(10, w / 4, h / 4));

/** The plane as a frame. A summary (not the data card) given the room its panel leaves it is never taller than it (Plan 43: never, whatever the room): the plot gives up the height the key, the sources and the
 *  reading under it need (2D sizes the plot by the window and lets the panel's fit zoom the rest; the zoom stops at 12 px words, past which the panel's foot cut the chart off: audit 95bbb8ec, 163 to 285 px on the
 *  summary planes). The plot keeps 150 px where the room allows it; where it does not, the plot gives up more (never under PLOT_LEAST) and the frame reports the height it WANTS (Frame.want), so the panel
 *  zooms its contents down until the plane has its own plot (CardFrame's fit), instead of drawing the plane past its panel and cutting its axis, its lower zone and its last point off. */
export const PLOT_LEAST = 96;
export function planeFrame(spec: PlaneIn, c: ChartCtx): PlaneOut {
  const out = planeFrameAt(spec, c);
  if ((spec.card ?? !!spec.ring) || !(spec.room && spec.room > 0) || out.frame.h <= spec.room) return out;
  const over = out.frame.h - spec.room;
  const kept = planeFrameAt({ ...spec, height: Math.max(150, Math.floor(out.plotH - over)) }, c);
  if (kept.frame.h <= spec.room) return kept;
  const least = planeFrameAt({ ...spec, height: Math.max(PLOT_LEAST, Math.floor(kept.plotH - (kept.frame.h - spec.room))) }, c);
  return { ...least, frame: { ...least.frame, want: kept.frame.h } };
}

function planeFrameAt(spec: PlaneIn, c: ChartCtx): PlaneOut {
  const card = spec.card ?? !!spec.ring, fs = Math.max(12, c.type.sm), W = Math.max(200, c.w);
  const pl0 = spec.plane;
  // the plane as it is drawn (a summary with fit: true cuts its axes to its points, so the plot's own height is read from that one)
  const ownWords = card && pl0.key === 'never';
  const plotH = Math.round(spec.height ?? plotHeightOf(pl0, W, card, { room: spec.room }) + (ownWords ? fs * 1.3 + 6 : 0));
  const L = planeLayout({ plane: pl0, W, H: plotH, fs, card, points: spec.points, ring: spec.ring, ringWas: spec.ringWas, stops: spec.stops });
  const { pl, axed } = L;
  if (card && spec.walk) stepWalk(spec.walk, L, spec.stops ?? [], L.dot);
  const H = { host: card ? 'planecard' : 'plane', px: fs };
  const lk = (key: string, state: Record<string, unknown> = {}): Look => look(c, H, key, { axes: axed, ...state });
  const shapes: Shape[] = [];
  const say = (x: number, y: number, s: string, l: Look, o: Partial<Extract<Shape, { k: 'text' }>> = {}) => {
    shapes.push({ k: 'text', x, y, s, size: l.size ?? fs, weight: l.weight, color: l.fill!, ...(l.halo ? { halo: l.halo } : {}), ...(l.upper ? { upper: true } : {}), ...(l.ls ? { ls: l.ls } : {}), ...o });
  };
  const lines = (x: number, y: number, ls: readonly string[], l: Look, size: number, anchor: 'start' | 'middle' | 'end') => ls.forEach((t, i) => say(x, y + (i ? i * size * 1.2 : 0), t, l, { size, anchor }));
  const pen = (l: Look) => ({ color: fade(l.stroke, l.opacity ?? l.strokeOpacity)!, w: l.width ?? 1, dash: l.dash, cap: l.cap, join: l.join });
  const seg = (s: { x1: number; y1: number; x2: number; y2: number }, l: Look) => shapes.push({ k: 'line', ...s, pen: pen(l) });

  // Zones, the rest of the plane first, the first listed last (on top), the whole of them one rounded shape (plot-look.js).
  if (axed) shapes.push({ k: 'rect', x: 0, y: 0, w: W, h: plotH, r: plotR(W, plotH), fill: lk('plot.bg').fill });
  else {
    shapes.push({ k: 'clip', x: 0, y: 0, w: W, h: plotH, r: plotR(W, plotH) });
    for (const z of L.fills) shapes.push({ k: 'rect', x: z.x, y: z.y, w: z.w, h: z.h, fill: (L.guide ? lk('crit.zone', { rate: z.rate }) : lk('plane.zone', { tone: z.tone })).fill });
    if (L.hatch) { const hf = lk('crit.hatch').fill!; for (const pts of hatchSlivers(L.hatch.x, L.hatch.y, L.hatch.w, L.hatch.h)) shapes.push({ k: 'path', pts, closed: true, fill: hf }); }
    shapes.push({ k: 'unclip' });
  }
  if (L.ax) for (const g of L.ax.grid) seg(g, lk('plane.grid'));
  for (const b of L.boxes) { const l = lk('plane.box'); shapes.push({ k: 'rect', x: b.x, y: b.y, w: b.w, h: b.h, pen: pen(l) }); }
  for (const w of L.words) {
    const l = lk(L.guide ? 'plane.gzt' : 'plane.zt', { tone: w.z.tone || 'none', onl: false });
    lines(w.x, w.y, w.lines, l, fs, w.anchor);
  }
  // The cut-off lines, the lines' names, the diagonal.
  for (const s of L.cuts) seg(s, lk('plane.cut'));
  for (const n of L.lines) say(n.x, n.y, n.text, lk('plane.ln'), { anchor: n.anchor });
  if (L.diag) { seg(L.diag.seg, lk('plane.diag')); if (L.diag.label) say(L.diag.label.x, L.diag.label.y, L.diag.label.text, lk('plane.dt'), { anchor: L.diag.label.anchor }); }
  // The lines of equal resistance, their names last.
  if (L.iso) for (const ln of L.iso.lines) { seg(ln.seg, lk('plane.iso')); say(ln.label.x, ln.label.y, ln.label.text, lk('plane.isot'), { anchor: ln.label.anchor }); }
  // The axes: their lines and ticks, the numbers and names beside them.
  if (L.ax) for (const s of [...L.ax.axes, ...L.ax.ticks]) seg(s, lk('plane.axis'));
  for (const n of L.nums) {
    const l = L.guide ? lk('crit.word', { q: n.cls === 'pze-ax' }) : n.cls === 'pze-ax' ? lk('plane.ax') : lk('plane.t', { on: n.cls.includes('on') });
    say(n.x, n.y, n.text, l, { anchor: n.anchor });
  }
  // The patients: a point each, its name beside it.
  L.at.forEach((p, i) => {
    const n = L.names[i], site = p.site || 'none';
    if (p.was) {
      seg({ x1: p.was.x, y1: p.was.y, x2: p.x, y2: p.y }, lk('plane.path', { site }));
      const w = lk('plane.was', { site });
      shapes.push({ k: 'circle', cx: p.was.x, cy: p.was.y, r: 6, fill: w.fill, pen: { color: w.stroke!, w: w.width! } });
    }
    if (n?.lead) seg({ x1: p.x, y1: p.y, x2: n.lead[0], y2: n.lead[1] }, lk('plane.lead'));
    const d = lk('plane.pt.dot', { site });
    shapes.push({ k: 'circle', cx: p.x, cy: p.y, r: L.pr, fill: d.fill, pen: { color: d.stroke!, w: d.width! } });
    if (n) lines(n.x, n.y, n.lines, lk('plane.pt.name'), n.fs ?? fs, n.anchor);
  });
  // The card: the trail (its line, its rings and their names), each zone's words, and the case's dot with a clear gap round it.
  if (card) {
    const w = spec.walk?.walk ?? [], dot = L.dot, st = L.trail.stops;
    const pts: number[] = st.flatMap((s) => [s.x, s.y]);
    for (let i = 0; i + 1 < w.length; i += 2) pts.push(L.X(w[i]!), L.Y(w[i + 1]!));
    if (dot) pts.push(dot.x, dot.y);
    if (st.length) {
      const wl = lk('plane.walk');
      if (pts.length >= 4) shapes.push({ k: 'path', pts, pen: { color: fade(wl.stroke, wl.strokeOpacity)!, w: wl.width!, cap: wl.cap, join: wl.join } });
      st.forEach((s, i) => {
        const sl = lk('plane.stop'), nm = L.trail.names[i];
        shapes.push({ k: 'circle', cx: s.x, cy: s.y, r: 5, pen: { color: sl.stroke!, w: sl.width! } });
        if (nm) say(nm.x, nm.y, s.name, lk('plane.sn'), { anchor: nm.anchor });
      });
    }
    for (const cw of L.cardWords) lines(cw.x, cw.y, cw.lines, lk(L.guide ? 'plane.gzt' : 'plane.zt', { tone: cw.z.tone || 'none', cw: true, onl: !!cw.onLine }), cw.fs ?? fs, 'middle');
    if (dot) {
      shapes.push({ k: 'circle', cx: dot.x, cy: dot.y, r: dot.r + dot.g, fill: lk('plane.halo').fill });
      shapes.push({ k: 'circle', cx: dot.x, cy: dot.y, r: dot.r, fill: lk('plane.dot').fill });
    }
  }

  // Under the plot: the key and, in the card, the case's reading (the 2D page's .pze-key, .pze-ckey, .pze-read, .pzc-key).
  const pal = c.pal, cardL = (key: string, state: Record<string, unknown> = {}) => look(c, { host: 'planecard', px: fs }, key, state);
  const text2 = pal.tok('text-2'), text = pal.tok('text'), text3 = pal.tok('text-3');
  const swatch = (x: number, y: number, size: number, e: { tone?: string; box?: boolean }) => {
    if (e.box) shapes.push({ k: 'rect', x, y, w: size, h: size, r: 2, pen: { color: text2, w: 1.5, dash: [3, 3] } });
    else shapes.push({ k: 'rect', x, y, w: size, h: size, r: 2, fill: cardL('plane.zone', { tone: e.tone || 'none' }).fill });
  };
  let y = plotH;
  const sw = 0.8 * fs;
  const ckey = (): void => {
    // a short key: a swatch and a short name each, in rows that wrap, each row centred (flex-wrap, gap 2px 12px)
    const es = keyEntries(pl).map((e) => ({ e, t: e.short || e.t, w: sw + 0.35 * fs + measure(e.short || e.t, fs, 400) }));
    const rows: (typeof es)[] = [[]];
    for (const it of es) { const cur = rows.at(-1)!, used = cur.reduce((s, o) => s + o.w, 0) + 12 * Math.max(0, cur.length - 1); if (cur.length && used + 12 + it.w > W) rows.push([it]); else cur.push(it); }
    y += 6;
    for (const row of rows) {
      const rw = row.reduce((s, o) => s + o.w, 0) + 12 * (row.length - 1);
      let x = (W - rw) / 2;
      const rh = fs * 1.25;
      for (const it of row) {
        swatch(x, y + (rh - sw) / 2, sw, it.e);
        say(x + sw + 0.35 * fs, y + rh / 2 + 0.35 * fs, it.t, { fill: text2, weight: 400 } as Look);
        x += it.w + 12;
      }
      y += rh + 2;
    }
    y -= 2;
  };
  const fullKey = (): void => {
    // the zones' key: a card each, swatch, name in bold, its note under it (a column, 8 px apart)
    const px = 0.8 * fs, py = 0.5 * fs, sz = 0.9 * fs, gx = 0.6 * fs;
    const tx = px + sz + gx, tw = W - tx - px;
    y += 8;
    for (const e of keyEntries(pl)) {
      const note = e.note ? wrapWords(e.note, tw, fs, 400, measure, 3) : [];
      const hh = py * 2 + fs * 1.3 + note.length * fs * 1.3;
      shapes.push({ k: 'rect', x: 0, y, w: W, h: hh, r: 12, fill: pal.tok('surface-2') });
      swatch(px, y + (hh - sz) / 2, sz, e);
      say(tx, y + py + fs * 1.0, e.t, { fill: text, weight: 600 } as Look);
      note.forEach((t, i) => say(tx, y + py + fs * 1.3 + fs * 1.0 + i * fs * 1.3 - fs * 0.0, t, { fill: text2, weight: 400 } as Look));
      y += hh + 8;
    }
    y -= 8;
  };
  const source = (): void => {
    if (!pl.source) return;
    y += 8;
    const sl = wrapWords(pl.source, W, fs, 400, measure, 3);
    sl.forEach((t, i) => say(0, y + fs * (1 + i * 1.3), t, { fill: text3, weight: 400 } as Look));
    y += sl.length * fs * 1.3;
  };
  if (card) {
    if (pl.key !== 'never') ckey();
    if (pl.hatchOf) {
      // "Hatched: can skip EGD" (the guideline card's own key line): a hatched swatch, then the words
      y += 0.7 * fs;
      const label = 'Hatched:', rest = ' can skip EGD', lw = measure(label, fs, 600), rw = measure(rest, fs, 500), total = 22 + 0.5 * fs + lw + rw, x0 = (W - total) / 2, rh = fs * 1.3;
      const base = mix('srgb', text, 42, pal.tok('surface-3')), sx = x0, sy = y + (rh - 14) / 2;
      shapes.push({ k: 'clip', x: sx, y: sy, w: 22, h: 14, r: 4 }, { k: 'rect', x: sx, y: sy, w: 22, h: 14, fill: pal.tok('surface-3') });
      for (const pts of hatchSlivers(sx, sy, 22, 14, 4.95, 2)) shapes.push({ k: 'path', pts, closed: true, fill: base });
      shapes.push({ k: 'unclip' });
      say(x0 + 22 + 0.5 * fs, y + rh / 2 + 0.35 * fs, label, { fill: text, weight: 600 } as Look);
      say(x0 + 22 + 0.5 * fs + lw, y + rh / 2 + 0.35 * fs, rest, { fill: text2, weight: 500 } as Look);
      y += rh;
    }
    const reading = spec.ring ? planeReading(pl, spec.ring) : '';
    if (reading) {
      y += 4;
      const rl = wrapWords(reading, W, fs, 400, measure, 3);
      rl.forEach((t, i) => say(W / 2, y + fs * (1 + i * 1.3), t, { fill: text2, weight: 400 } as Look, { anchor: 'middle' }));
      y += rl.length * fs * 1.3;
    }
  } else if (pl.noWords) { ckey(); source(); }
  else if (pl.key === 'never') source();
  else if (pl.key !== false) { fullKey(); source(); }
  else { fullKey(); source(); }
  const pts = (spec.points ?? []).map((p) => ({ f: p.f, name: p.name }));
  const label = planeWords(pl, pts, spec.ring);
  return { frame: { w: W, h: Math.ceil(y), shapes, label }, layout: L, plotH };
}

export { planeReading, shownReading, valOf };
