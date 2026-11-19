// WCAG contrast of the five looks' text and signal colours against what they sit on (the 2D app's looks table bench, as a pure function a test and the debug page both call).
// Text must reach 4.5:1 (the limit CONTRAST_TEXT), a signal colour used on its own as a mark 3:1 (WCAG 1.4.11); a colour that carries meaning also needs its second cue
// (rules-a11y.ts a11y-colour-cue), so a signal that misses 3:1 is reported as a warning, never the only failure.
import { LOOKS, LOOK_IDS, type LookId } from '../../looks/looks.ts';
import { CONTRAST_TEXT } from './limits.ts';

export const CONTRAST_MARK = 3;
type Rgba = [number, number, number, number];

export function parseColour(c: string): Rgba {
  const h = /^#([0-9a-f]{6})$/i.exec(c.trim());
  if (h) { const n = parseInt(h[1]!, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]; }
  const m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i.exec(c.trim());
  if (!m) throw new Error(`cannot read the colour ${c}`);
  return [+m[1]!, +m[2]!, +m[3]!, m[4] === undefined ? 1 : +m[4]];
}
/** `top` laid over the opaque `under`. */
export const over = (top: string, under: string): [number, number, number] => { const t = parseColour(top), u = parseColour(under); return [0, 1, 2].map((i) => t[i]! * t[3] + u[i]! * (1 - t[3])) as [number, number, number]; };
const lum = ([r, g, b]: number[]) => { const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!); };
export function contrast(fg: string, bg: string): number {
  const a = lum(over(fg, bg)), b = lum(over(bg, '#000000'));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

export interface ContrastRow { look: LookId; fg: string; on: string; ratio: number; need: number; ok: boolean; use: string }
/** Every pairing the app draws: text, the two lighter text tones and the accent on the card and the ground; the three signals on the card as marks. */
export function contrastTable(): ContrastRow[] {
  const rows: ContrastRow[] = [];
  for (const id of LOOK_IDS) {
    const l = LOOKS[id];
    const add = (fgName: string, fg: string, onName: string, on: string, need: number, use: string) => { const ratio = contrast(fg, on); rows.push({ look: id, fg: fgName, on: onName, ratio, need, ok: ratio >= need, use }); };
    for (const [n, c] of [['text', l.text], ['text-2', l.text2], ['text-3', l.text3], ['accent', l.accent]] as const) { add(n, c, 'card', l.card, CONTRAST_TEXT, 'text'); add(n, c, 'bg', l.bg, CONTRAST_TEXT, 'text'); }
    for (const [n, c] of [['ok', l.ok], ['caution', l.caution], ['danger', l.danger]] as const) add(n, c, 'card', l.card, CONTRAST_MARK, 'mark');
  }
  return rows;
}
