// The fluid balance as a frame (2D: tool-fluid.js, looks chart-looks/fluid.js, host 'fluid'). Three pictures in one card: the flow picture (the lymph made and where it goes), the day card
// (window: two tiles, a number and a thin gauge each, the answer in a sentence) and the forces strip across the sinusoid wall. The page rules of the 2D card (app-11-deck-visuals.css .gf, .gs,
// .gc-*) are written here as em of the host size: the same rows, gaps, paddings and multipliers. Pieces that carry a look entry ask the 2D table for their colour, width, dash and size.
import type { ChartCtx } from '../Chart.tsx';
import { measure } from '../measure.ts';
import { look, type Look } from '../looks.ts';
import type { Rgba } from '../colour.ts';
import type { Frame, Shape } from '../scene.ts';
import { wrapWords } from '../trial/model.ts';
import {
  BAND_N, END_POINT, END_ROUND, FLOW_H, NAMES, bandPts, dayWords, fluidDay, fluidFlows, fluidWords, forcesWords, gaugeParts, mlInt, mlMin, nodeValue, partPts, tugParts,
  type EndKind, type Forces, type Fluid, type NodeId,
} from './model.ts';
import { NOT_SHOWN } from '../fmt.ts';

export interface FluidOpts {
  /** the day card in place of the flow picture */
  window?: boolean;
  /** the forces across the sinusoid wall (a strip under the flow picture, or the second tile of the day card) */
  forces?: boolean;
  /** the line that the rates are the model's own (a slide whose patient is on diuretics, or that asks for it) */
  caveat?: boolean;
}

const H = { host: 'fluid' };
const WORDS_CAVEAT = 'Model rates, not clinical figures.';
const a = (c: Rgba, k: number): Rgba => [c[0], c[1], c[2], c[3] * k];
const fillOf = (k: Look): Rgba => a(k.fill ?? [0, 0, 0, 0], (k.opacity ?? 1) * (k.fillOpacity ?? 1));
const penOf = (k: Look, o: number = 1) => ({ color: a(k.stroke!, o * (k.strokeOpacity ?? 1)), w: k.width ?? 1, dash: k.dash, cap: k.cap, join: k.join });
/** words cut with an ellipsis to w px (the 2D chips never wrap: white-space nowrap, text-overflow ellipsis) */
function ellip(s: string, w: number, size: number, weight: number): string {
  if (measure(s, size, weight) <= w + 1e-6) return s;
  let t = s;
  while (t.length > 1 && measure(`${t}…`, size, weight) > w) t = t.slice(0, -1);
  return `${t}…`;
}

export interface FluidBuild { frame: Frame }

/** The fluid balance card for a width: f the balance, forces the sinusoid wall's pressures (null: none yet). Pure. */
export function fluidFrame(f: Fluid | null, forces: Forces | null, c: ChartCtx, o: FluidOpts = {}): Frame {
  const W = Math.max(220, c.w), pal = c.pal;
  const lk = (key: string, st: Record<string, unknown> = {}) => look(c, { ...H, fs12: c.type.sm }, key, st);
  const em = lk('fluid.in').size!;
  const text = pal.tok('text'), text2 = pal.tok('text-2'), text3 = pal.tok('text-3');
  const shapes: Shape[] = [];
  const say = (x: number, y: number, s: string, size: number, weight: number, color: Rgba, anchor: 'start' | 'middle' | 'end' = 'start', extra: { baseline?: 'alphabetic' | 'middle'; ls?: number; upper?: boolean; alpha?: number } = {}) =>
    shapes.push({ k: 'text', x, y, s, size, weight, color, anchor, baseline: extra.baseline ?? 'middle', ...(extra.ls ? { ls: extra.ls } : {}), ...(extra.upper ? { upper: true } : {}), ...(extra.alpha !== undefined ? { alpha: extra.alpha } : {}) });
  const LH = 1.3;   // .gs: font 500 var(--gs-fs)/1.3
  const row = em * LH;

  if (!f) {
    say(0, row / 2, 'No fluid balance yet', em, 500, text3);
    return { w: W, h: Math.ceil(row), shapes, label: 'Fluid balance: no numbers yet.' };
  }

  // ── a strip's part (a coloured arrow or gauge part) ──
  const part = (key: string, x: number, w: number, y0: number, y1: number, ends: [number, number], kinds: [EndKind, EndKind]) => {
    const pts = partPts(x, w, y0, y1, ends[0] * em, ends[1] * em, kinds[0], kinds[1]);
    if (pts.length) shapes.push({ k: 'path', pts, closed: true, fill: fillOf(lk(key)) });
  };
  const slot = (x: number, y: number, w: number, h: number, r: number) => shapes.push({ k: 'rect', x, y, w, h, r, fill: a(text, 0.08) });   // .gs-trk: --gs-slot, 8 % of the text colour
  /** the forces strip's track at (x, y), width w: the push and the pull meeting at the wall; bar in em, thin gauges (the day card's tile) have round ends and no words */
  const tug = (x: number, y: number, w: number, F: Forces, thin: boolean) => {
    const bar = (thin ? 0.5 : 1.25) * em, T = tugParts(F.out, F.pull, w);
    slot(x, y, w, bar, (thin ? 0.3 : 0.4) * em);
    part('fluid.seg.push', x + T.push.x, T.push.w, y, y + bar, thin ? [0.25, 0.25] : [0.4, 0.7], thin ? [END_ROUND, END_ROUND] : [END_ROUND, END_POINT]);
    part('fluid.seg.pull', x + T.pull.x, T.pull.w, y, y + bar, thin ? [0.25, 0.25] : [0.7, 0.4], thin ? [END_ROUND, END_ROUND] : [END_POINT, END_ROUND]);
    if (thin) return;
    const wall = lk('fluid.wall');
    shapes.push({ k: 'line', x1: x + T.wall + 0.75, y1: y, x2: x + T.wall + 0.75, y2: y + bar, pen: penOf(wall) });
    // the words in the arrows: the first that fits (natural width only), faded with the part's own length
    const words = forcesWords(F.out, F.pull), pad = em * 0.7;
    const inWord = (cands: string[], p: { x: number; w: number }, padEm: number) => {
      for (const s of cands) {
        const w0 = measure(s, em, 600);
        if (em >= 9 && w0 + em * 1.05 <= p.w - pad) {
          const k = Math.min(1, Math.max(0, 1 + (p.w - w0 - (padEm + 0.5) * em) / (0.5 * em)));
          const i = lk('fluid.in');
          say(x + p.x + padEm * em, y + bar / 2, s, i.size!, i.weight ?? 600, i.fill ?? text, 'start', { alpha: k });
          return;
        }
      }
    };
    inWord(words.push, T.push, 0.6);
    inWord(words.pull, T.pull, 1.1);
  };

  let y = 0;
  let label = '';

  if (o.window) {
    // ── the day card ──
    const d = fluidDay(f), sw = dayWords(d), gap = 0.6 * em, two = !!o.forces;
    const tileW = two ? (W - gap) / 2 : W, padX = 0.7 * em, inner = tileW - 2 * padX;
    const bn = 1.7 * em, bnLine = 1.15 * bn, small = 0.6 * bn;
    const capH = row, nH = bnLine, plateH = 0.5 * em + 2 * 0.18 * em, footH = row, tg = 0.1 * em;
    const tileH = 0.6 * em + capH + tg + nH + tg + plateH + tg + footH + 0.65 * em;
    const tileBg = a(text, 0.055);
    const tile = (x: number, cap: string, num: string, unit: string, foot: string, gauge: ((gx: number, gy: number, gw: number) => void) | null) => {
      shapes.push({ k: 'rect', x, y, w: tileW, h: tileH, r: 0.75 * em, fill: tileBg });
      let ty = y + 0.6 * em;
      say(x + padX, ty + capH / 2, ellip(cap.toUpperCase(), inner - 0.06 * em * cap.length, em, 500), em, 500, text3, 'start', { ls: 0.06, upper: true });
      ty += capH + tg;
      // (the number and its unit share a baseline: the line box's half-leading puts it .5 (1.15 − 1.21) em of the number's size above the content area)
      const base = ty + 0.5 * (1.15 - 1.21) * bn + 0.969 * bn;
      const nw = measure(num, bn, 500);
      say(x + padX, base, num, bn, 500, text, 'start', { baseline: 'alphabetic' });
      const ux = x + padX + nw + 0.3 * small;
      if (unit) say(ux, base, ellip(unit, Math.max(0, x + padX + inner - ux), small, 500), small, 500, text3, 'start', { baseline: 'alphabetic' });
      ty += nH + tg;
      if (gauge) gauge(x + padX, ty + 0.18 * em, inner);
      ty += plateH + tg;
      say(x + padX, ty + footH / 2, ellip(foot, inner, em, 500), em, 500, text3);
    };
    tile(0, 'Liver + gut lymph', mlInt(d.made), 'mL/day', sw.limit, (gx, gy, gw) => {
      const bar = 0.5 * em, P = gaugeParts({ carried: d.carried, over: d.over, room: Math.max(0, d.room) }, gw);
      slot(gx, gy, gw, bar, 0.3 * em);
      part('fluid.seg.car', gx + P.car.x, P.car.w, gy, gy + bar, [0.25, 0.25], [END_ROUND, END_ROUND]);
      part('fluid.seg.build', gx + P.over.x, P.over.w, gy, gy + bar, [0.25, 0.25], [END_ROUND, END_ROUND]);
      if (P.tick.op > 0.002) {
        const t = lk('fluid.tick');
        shapes.push({ k: 'line', x1: gx + P.tick.x, y1: gy - 0.18 * em, x2: gx + P.tick.x, y2: gy + bar + 0.18 * em, pen: penOf(t, P.tick.op) });
      }
    });
    if (two) {
      const fw = forces ? forcesWords(forces.out, forces.pull) : null;
      tile(tileW + gap, 'Net filtration', fw ? fw.wNum : NOT_SHOWN, fw ? fw.wUnit : '', fw ? fw.wFoot : '', forces ? (gx, gy, gw) => tug(gx, gy, gw, forces, true) : null);
    }
    y += tileH + 0.3 * em;
    // the answer: the sentence and the day's change, baseline aligned (margin-top .35em)
    y += 0.35 * em;
    const ts = 1.1 * em, ns = 1.2 * em, ansH = 1.3 * ns, ansBase = y + 0.5 * (1.3 - 1.21) * ns + 0.969 * ns;
    const nc = sw.dir === 'up' ? pal.tok('caution-ink') : sw.dir === 'down' ? pal.tok('ok-ink') : text;
    const nw = measure(sw.net, ns, 600);
    say(W, ansBase, sw.net, ns, 600, nc, 'end', { baseline: 'alphabetic' });
    say(0, ansBase, ellip(sw.title, W - nw - 0.6 * em, ts, 500), ts, 500, text, 'start', { baseline: 'alphabetic' });
    y += ansH + 0.3 * em;
    say(0, y + row / 2, ellip(sw.detail, W, em, 500), em, 500, text3);
    y += row;
    label = `Fluid balance, mL/day: ${sw.title}${d.net ? `, ${mlInt(Math.abs(d.net))}` : ''}. Lymph formation ${mlInt(d.made)} (hepatic ${mlInt(d.liver)}, splanchnic ${mlInt(d.gut)}); thoracic duct and lymphatic drainage ${mlInt(d.carried)}, capacity ${mlInt(d.limit)}${d.room > 0 ? `, ${mlInt(d.room)} unused` : ''}. ${sw.detail}`;
  } else {
    // ── the flow picture ──
    const L = fluidFlows(f, W, FLOW_H);
    for (const b of L.bands) {
      const k = lk(`fluid.band.${b.to}`);
      shapes.push({ k: 'path', pts: bandPts(L.xL + L.NW, b.ly, L.xR, b.ry, b.t, BAND_N), closed: true, fill: fillOf(k) });
    }
    const nodeRect = (n: { id: NodeId; y: number; lh: number }, x: number) => {
      const k = lk(`fluid.node.${n.id}`);
      shapes.push({ k: 'rect', x, y: n.y, w: L.NW, h: Math.max(n.lh, 0.01), r: 2, fill: fillOf(k), ...(k.stroke ? { pen: penOf(k) } : {}) });
    };
    const t = lk('fluid.flow.t'), tv = lk('fluid.flow.tv');
    const size = t.size!, wt = t.weight ?? 500, wv = tv.weight ?? 600;
    for (const n of L.left) {
      nodeRect(n, L.xL);
      // the name and its number are one run, set to the node's left: the value's tspan comes dx 5 after the name
      const v = nodeValue(n.id, f), xe = L.xL - 6;
      say(xe, y + n.cy, v, size, wv, tv.fill ?? text, 'end');
      say(xe - measure(v, size, wv) - 5, y + n.cy, NAMES[n.id], size, wt, t.fill ?? text2, 'end');
    }
    for (const n of L.right) {
      nodeRect(n, L.xR);
      const xs = L.xR + L.NW + 6, v = nodeValue(n.id, f);
      say(xs, y + n.cy, NAMES[n.id], size, wt, t.fill ?? text2, 'start');
      say(xs + measure(NAMES[n.id], size, wt) + 5, y + n.cy, v, size, wv, tv.fill ?? text, 'start');
      if (n.id === 'carried' && n.room > 0.5) {
        const r = lk('fluid.room');
        shapes.push({ k: 'rect', x: L.xR + 0.75, y: n.y + n.lh, w: L.NW - 1.5, h: Math.max(0, n.room - 0.75), r: 2, pen: penOf(r) });
      }
    }
    y += FLOW_H + 4;
    say(W, y + row / 2, 'mL/min', em, 500, text3, 'end');
    y += row + 4;
    y += 2;
    const bs = c.type.name, lines = wrapWords(fluidWords(f), W, bs, 600, measure, 4);
    lines.forEach((l, i) => say(0, y + (i + 0.5) * bs * LH, l, bs, 600, text));
    y += lines.length * bs * LH + 2;
    if (o.forces && forces) {
      y += 4;
      const fw = forcesWords(forces.out, forces.pull), fr = em * 1.25;
      y += 0;   // (the margin-top .1em)
      y += 0.1 * em;
      shapes.push({ k: 'line', x1: 0, y1: y + 0.5, x2: W, y2: y + 0.5, pen: { color: pal.tok('border'), w: 1 } });
      y += 1 + 0.3 * em;
      const w1 = measure(fw.caption, em, 500), w2 = measure(fw.net, em, 600), wrap = w1 + w2 + 0.6 * em > W;
      say(0, y + fr / 2, fw.caption, em, 500, text3);
      if (wrap) y += fr;
      // (the answer is a sentence: on a card narrower than it, it wraps to its own lines, each ending at the right edge, never past the box)
      for (const ln of w2 <= W ? [fw.net] : wrapWords(fw.net, W, em, 600, measure, 3)) { say(W, y + fr / 2, ln, em, 600, text, 'end'); y += fr; }
      y += 0.3 * em;
      tug(0, y, W, forces, false);
      y += 1.25 * em;
    }
    if (o.caveat) { y += 4; say(0, y + row / 2, WORDS_CAVEAT, em, 500, text3); y += row; }
    label = `Fluid balance, mL/min: lymph formation ${mlMin(f.made)} (hepatic ${mlMin(f.hep)}, splanchnic ${mlMin(f.spl)}); thoracic duct and lymphatic drainage ${mlMin(f.carried)}, capacity ${mlMin(f.cap)}; peritoneal reabsorption ${mlMin(f.back)}. ${fluidWords(f)}`;
  }
  return { w: W, h: Math.ceil(y + 1), shapes, label };
}

/** The card's sentence for a screen reader. */
export const fluidLabel = (f: Fluid | null, o: FluidOpts = {}): string => {
  if (!f) return 'Fluid balance: no numbers yet.';
  if (o.window) { const d = fluidDay(f), sw = dayWords(d); return `Fluid balance, mL/day: ${sw.title}${d.net ? `, ${mlInt(Math.abs(d.net))}` : ''}. Lymph formation ${mlInt(d.made)}. ${sw.detail}`; }
  return `Fluid balance, mL/min: lymph formation ${mlMin(f.made)}; lymphatic drainage ${mlMin(f.carried)}, capacity ${mlMin(f.cap)}; peritoneal reabsorption ${mlMin(f.back)}. ${fluidWords(f)}`;
};
