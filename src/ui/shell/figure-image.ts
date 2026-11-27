// "Copy figure" and "Save figure" (Figure menu): the figure as a picture, for a slide, a handout or a message. The pure part is here and is tested in node (tests/figure-image.test.ts): what the label
// layers look like on the screen (`Item`s, read from their elements by figure-image-dom.ts: names, leaders, the colour key, the catheter's and slides' cards, the probes' screens) becomes the
// ordered drawing list for the picture, in CSS pixels (the painter scales the whole picture), with everything hidden, faded out or off the stage left out.

/** CSS pixels. */
export interface Box { x: number; y: number; w: number; h: number }
/** A CSS colour, or a linear gradient as the key's bar has (stops as 0..1 along the line; `angle` in degrees, CSS's: 0 up, 90 right, 180 down). */
export type Paint = string | { angle: number; stops: [number, string][] };
/** A `clip-path: path()` (the cards' one-shape glass): its path data and where its origin stands. */
export interface Clip { d: string; x: number; y: number }
interface Common { /** opacity as the eye sees it: the element's own times every ancestor's */ alpha: number; clip?: Clip }
export type Item =
  | ({ k: 'box'; x: number; y: number; w: number; h: number; r: number; fill: Paint | null; bw: number; bc: string } & Common)
  | ({ k: 'path'; d: string; m: [number, number, number, number, number, number]; fill: string | null; stroke: string | null; sw: number; join: string; cap: string } & Common)
  | ({ k: 'line'; x1: number; y1: number; x2: number; y2: number; w: number; color: string } & Common)
  | ({ k: 'text'; text: string; x: number; y: number; w: number; font: string; fill: string; halo: string; haloW: number; spacing: number; rot: number } & Common);

/** Below this opacity a label is on its way in or out and is left out (the picture shows what is settled). */
export const MIN_ALPHA = 0.5;

const inside = (b: Box, x: number, y: number, pad = 0) => x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;
const meets = (b: Box, x: number, y: number, w: number, h: number) => x + w >= b.x && x <= b.x + b.w && y + h >= b.y && y <= b.y + b.h;

/** What to draw, in order (a card's glass before its words): the items that are settled and on the stage. Paths are kept whole (a bracket may start off the stage and end on it). */
export function figureItems(items: Item[], stage: Box): Item[] {
  return items.filter((i) => {
    if (i.alpha < MIN_ALPHA) return false;
    if (i.k === 'box') return i.w > 0 && i.h > 0 && meets(stage, i.x, i.y, i.w, i.h);
    if (i.k === 'line') return inside(stage, i.x1, i.y1) || inside(stage, i.x2, i.y2);
    if (i.k === 'text') return !!i.text.trim() && inside(stage, i.x + i.w / 2, i.y);
    return true;
  });
}

/** The picture's size: `want` times the stage (2x), kept inside what the device can draw (one side no longer than `maxSide`, no more than `maxPixels` in all). */
export function pictureScale(stage: { w: number; h: number }, want: number, maxSide: number, maxPixels = 16e6): number {
  if (stage.w <= 0 || stage.h <= 0) return 1;
  return Math.max(1, Math.min(want, maxSide / Math.max(stage.w, stage.h), Math.sqrt(maxPixels / (stage.w * stage.h))));
}

const top = (s: string): string[] => { const out: string[] = []; let d = 0, at = 0; for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '(') d++; else if (c === ')') d--; else if (c === ',' && d === 0) { out.push(s.slice(at, i).trim()); at = i + 1; } } out.push(s.slice(at).trim()); return out; };
const SIDES: Record<string, number> = { top: 0, right: 90, bottom: 180, left: 270 };
const UNIT_DEG: Record<string, number> = { deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 };
/** The line part of a gradient's first argument: an angle (deg, grad, rad, turn) and/or `to <side> [side]`, with an optional colour-space run (`in oklab`) dropped, since a canvas cannot honour it.
 *  Null when the argument is a colour stop. The key's bar is `linear-gradient(in oklab to right, ...)`: unread, it fell to the 180deg default and was drawn top to bottom. */
export function gradientLine(arg: string): number | null {
  let t = arg.trim().toLowerCase();
  const space = /\bin\s+[a-z0-9-]+(\s+(shorter|longer|increasing|decreasing|specified)\s+hue)?/;
  const had = space.test(t);
  t = t.replace(space, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return had ? 180 : null;
  const ang = t.match(/^(-?[\d.]+(?:e-?\d+)?)(deg|grad|rad|turn)$/);
  if (ang) return parseFloat(ang[1]!) * UNIT_DEG[ang[2]!]!;
  const to = t.match(/^to (top|right|bottom|left)(?: (top|right|bottom|left))?$/);
  if (!to) return null;
  const a = SIDES[to[1]!]!, b = to[2] === undefined ? undefined : SIDES[to[2]!];
  if (b === undefined) return a;
  const set = new Set([a, b]);   // (a corner: 45 degrees off each side; the true corner angle follows the box, which a stop list does not know)
  return set.has(0) ? (set.has(90) ? 45 : 315) : (set.has(90) ? 135 : 225);
}

/** A computed `background-image` that is one `linear-gradient(...)`: its angle and stops; null for anything else.
 *  Stops without a position are spread evenly; pixel positions are not supported (null). */
export function parseGradient(css: string): Paint | null {
  const m = css.trim().match(/^linear-gradient\((.*)\)$/s);
  if (!m) return null;
  const parts = top(m[1]!);
  let angle = 180;
  const line = gradientLine(parts[0]!);
  if (line !== null) { angle = line; parts.shift(); }
  const raw: [string, number | null][] = [];
  for (const p of parts) {
    const pos = p.match(/\s(-?[\d.]+)(%|px)$/);
    if (pos && pos[2] === 'px') return null;
    raw.push([pos ? p.slice(0, pos.index).trim() : p, pos ? parseFloat(pos[1]!) / 100 : null]);
  }
  if (raw.length < 2) return null;
  const n = raw.length;
  const stops = raw.map(([c, at], i): [number, string] => [at ?? i / (n - 1), c]);
  return { angle, stops };
}

/** The file's name: what the picture shows, so a folder of them reads. */
export function figureFileName(view: string, patient: string | null): string {
  const part = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return ['portal-pressure', part(view), patient ? part(patient) : ''].filter(Boolean).join('-') + '.png';
}
