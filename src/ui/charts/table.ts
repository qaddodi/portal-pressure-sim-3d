// A chart's numbers for a screen reader (WCAG 1.3.1). A chart is a picture with real words over it, and the picture is one `role="img"` with a one-sentence label: a screen reader heard the
// sentence and none of the numbers (the one structural gap docs/accessibility.md listed). Every word a chart draws is also written, in the order it reads, as a visually hidden table beside
// the picture: a row for each line of the chart, a cell for each word on it. This is derived from the frame itself (the display list every chart already builds), so every chart kind has it,
// and it can never differ from what is drawn.
import type { Frame, TextShape } from './scene.ts';

export interface DataTable { caption: string; rows: string[][] }

/** The words of a frame as rows: lines top to bottom (words within a line share a baseline, to a third of their size), words left to right; a word drawn twice in one place (a halo) once. */
export function frameTable(f: Frame): DataTable {
  const words = f.shapes.filter((s): s is TextShape => s.k === 'text' && s.s.trim() !== '' && (s.alpha ?? 1) > 0.01)
    .map((s) => ({ s: s.s.trim(), x: s.x, y: s.y, size: s.size, rot: s.rot ?? 0 }));
  words.sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: { y: number; ws: typeof words }[] = [];
  for (const w of words) {
    const r = rows[rows.length - 1];
    if (r && Math.abs(w.y - r.y) <= Math.max(3, w.size / 3)) r.ws.push(w); else rows.push({ y: w.y, ws: [w] });
  }
  const out: string[][] = [];
  for (const r of rows) {
    r.ws.sort((a, b) => a.x - b.x);
    const cells: string[] = [];
    let last: (typeof words)[number] | null = null;
    for (const w of r.ws) {
      if (last && last.s === w.s && Math.abs(last.x - w.x) < 1) continue;
      cells.push(w.s); last = w;
    }
    if (cells.length) out.push(cells);
  }
  return { caption: f.label || '', rows: out };
}

export const tableKey = (t: DataTable): string => t.rows.map((r) => r.join('\u001f')).join('\u001e');
