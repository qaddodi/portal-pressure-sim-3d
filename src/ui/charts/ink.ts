// Where a word's ink is, not its line box (the 2D app's glyph-measure.js inkBox, from the glyph atlas's own record of each glyph's pixels, copied by scripts/copy-chart-ink.mjs):
// the layout of a picture that names its parts (the varix cross-section's σ, r, w, lumen and muscle) keeps a name's ink clear of the lines and rings round it, so it needs the
// ink. No canvas is drawn and read back. The word is set centred on the anchor with the middle baseline, as the text layer sets it (text-layer.ts: the anchor is the middle of a
// line box whose height is the font size, so the baseline stands BASELINE_EM − 0.5 of the size below it).
import { INK, INK_BASE, INK_PAD } from './ink.generated.ts';
import { BASELINE_EM } from './text-layer.ts';

export type InkRow = [top: number, bottom: number, left: number, right: number];
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const WEIGHTS = Object.keys(INK).map(Number);
const cache = new Map<string, InkRow[]>();

/** The ink of `s` set in Inter at `size` px and `weight` (the nearest the atlas holds), centred on (0, 0) with the middle baseline: one row for each band two atlas px tall of each glyph's ink, [top, bottom, left, right] in CSS px from that point. */
export function inkRows(s: string, size: number, weight = 500): InkRow[] {
  const w = WEIGHTS.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a));
  const key = `${w}|${size}|${s}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { glyphs, kern } = INK[w]!, q = size / INK_BASE, by = (BASELINE_EM - 0.5) * size;
  const chars = [...s];
  let width = 0, prev = '';
  for (const ch of chars) { const g = glyphs[ch] ?? glyphs['?']!; if (prev) width += (kern[prev + ch] ?? 0) * size; width += g[0] * size; prev = ch; }
  let x = -width / 2;
  prev = '';
  const rows: InkRow[] = [];
  for (const ch of chars) {
    const g = glyphs[ch] ?? glyphs['?']!, ink = g[3];
    if (prev) x += (kern[prev + ch] ?? 0) * size;
    const gl = x + (INK_PAD - g[1]) * q, gt = by + (INK_PAD - g[2]) * q;
    for (let i = 0; i + 1 < ink.length; i += 2) {
      const l = B64.indexOf(ink[i]!), r = B64.indexOf(ink[i + 1]!);
      if (l > 0) rows.push([gt + i * q, gt + (i + 2) * q, gl + (l - 1) * q, gl + r * q]);
    }
    x += g[0] * size; prev = ch;
  }
  if (!rows.length) rows.push([0, 0, 0, 0]);
  if (cache.size > 500) cache.clear();
  cache.set(key, rows);
  return rows;
}
