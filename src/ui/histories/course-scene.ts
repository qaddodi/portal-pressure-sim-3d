// The little course in a history's card (look B, mock 2): the portal vein pressure along the whole course, and the steps of the course as lines with their words above. One line of words
// is as many as fit; a word that would run into the one before it goes on the next row. Pure: a history's meta in, a frame for the GPU chart out.
import { measure } from '../charts/measure.ts';
import { pen, type Frame, type Shape } from '../charts/scene.ts';
import { withAlpha } from '../charts/colour.ts';
import type { ChartCtx } from '../charts/Chart.tsx';
import type { HistoryMeta } from './types.ts';

const FS = 12, ROW = 16, PLOT = 52, PAD = 4;

export function courseScene(h: HistoryMeta, c: ChartCtx): Frame {
  const W = c.w, shapes: Shape[] = [], n = h.pv.length;
  const label = `${h.name}: portal vein pressure over ${h.months} months, with ${h.marks.map((m) => m.word).join(', ')}`;
  if (W < 40 || n < 2) return { w: W, h: 10, shapes, label };
  const x = (d: number) => PAD + (d / h.days) * (W - 2 * PAD);
  // the words, left to right, each on the first row where it clears the one before (a word at the right edge is drawn back from it)
  const rows: number[] = [], placed: { m: HistoryMeta['marks'][number]; tx: number; r: number }[] = [];
  for (const m of h.marks) {
    const w = measure(m.word, FS, 600), tx = Math.min(x(m.day) + 3, W - PAD - w);
    let r = 0; while (rows[r] != null && rows[r]! > tx - 8) r++;
    rows[r] = tx + w; placed.push({ m, tx, r });
  }
  const nRows = Math.max(1, rows.length), top = nRows * ROW + 4, H = top + PLOT + 6, base = top + PLOT;
  const y = (v: number) => base - (Math.max(0, Math.min(h.max, v)) / h.max) * PLOT;
  const ink = (t: HistoryMeta['marks'][number]['tone']) => c.pal.tok(t === 'danger' ? 'danger' : t === 'ok' ? 'ok' : t === 'caution' ? 'caution' : t === 'change' ? 'accent' : 'text-2');
  shapes.push({ k: 'line', x1: PAD, y1: base, x2: W - PAD, y2: base, pen: pen(c.pal.tok('grid'), 1) });
  for (const p of placed) {
    const col = ink(p.m.tone), lx = x(p.m.day);
    shapes.push({ k: 'line', x1: lx, y1: p.r * ROW + 16, x2: lx, y2: base, pen: pen(withAlpha(col, 0.55), p.m.tone === 'change' ? 1.5 : 1) });
  }
  const pts: number[] = [];
  h.pv.forEach((v, i) => pts.push(PAD + (i / (n - 1)) * (W - 2 * PAD), y(v)));
  shapes.push({ k: 'path', pts, pen: pen(c.pal.tok('tr-pv'), 2.2, { cap: 'round', join: 'round' }) });
  for (const p of placed) shapes.push({ k: 'text', x: p.tx, y: p.r * ROW + 12, s: p.m.word, size: FS, weight: 600, color: ink(p.m.tone), halo: { color: c.pal.tok('surface'), w: 3 } });
  return { w: W, h: H, shapes, label };
}
