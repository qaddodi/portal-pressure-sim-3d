// What a chart is, as data: a Frame, the display list of one moment of one chart. A chart's model is a pure function (inputs, palette, width) → Frame;
// the renderer (gl.ts) draws the shapes on the GPU and the text layer (text-layer.ts) writes the words over them with transform and opacity only.
// Coordinates are CSS px inside the chart's own box (0,0 top left).
import type { Rgba } from './colour.ts';

export interface Pen {
  color: Rgba;
  /** line width, px */
  w: number;
  /** dash lengths, px: [on, off, ...] */
  dash?: readonly number[];
  cap?: 'butt' | 'round';
  join?: 'miter' | 'round';
}

export interface RectShape { k: 'rect'; x: number; y: number; w: number; h: number; r?: number; fill?: Rgba; pen?: Pen; key?: string }
export interface LineShape { k: 'line'; x1: number; y1: number; x2: number; y2: number; pen: Pen; key?: string }
/** A polyline or polygon. pts is [x0, y0, x1, y1, …]. A fill needs closed. */
export interface PathShape { k: 'path'; pts: readonly number[]; closed?: boolean; fill?: Rgba; pen?: Pen; key?: string }
/** The area between two polylines of the same length, in the same order along x: a series' area, a band. */
export interface BandShape { k: 'band'; top: readonly number[]; bottom: readonly number[]; fill: Rgba; key?: string }
export interface CircleShape { k: 'circle'; cx: number; cy: number; r: number; fill?: Rgba; pen?: Pen; key?: string }
/** A radial gradient: `stops` from the centre out (r ascending, the first may be 0), each its own colour, blended smoothly between (the picture's soft round things: a wall lit by a tip light, a dome, a spot). */
export interface RadialShape { k: 'radial'; cx: number; cy: number; stops: readonly { r: number; c: Rgba }[]; key?: string }
/** Everything after this, up to the matching unclip, is drawn only inside the rounded rectangle (a plot's rounded panel). One clip at a time. */
export interface ClipShape { k: 'clip'; x: number; y: number; w: number; h: number; r?: number }
export interface UnclipShape { k: 'unclip' }

export interface TextShape {
  k: 'text';
  /** the anchor point: where the text sits horizontally (per `anchor`) and its baseline or middle vertically (per `baseline`) */
  x: number; y: number;
  s: string;
  size: number;
  weight?: number;
  color: Rgba;
  anchor?: 'start' | 'middle' | 'end';
  baseline?: 'alphabetic' | 'middle' | 'top';
  font?: 'ui' | 'display';
  /** a stroke laid under the letters in the plot's colour so a word reads over any fill (paint-order: stroke) */
  halo?: { color: Rgba; w: number };
  upper?: boolean;
  /** letter spacing, em */
  ls?: number;
  italic?: boolean;
  /** the word turned this many degrees about its anchor point (the station names of a narrow chart, -30) */
  rot?: number;
  /** opacity 0..1 (a label that fades, never slides) */
  alpha?: number;
  key?: string;
}

export type Shape = RectShape | LineShape | PathShape | BandShape | CircleShape | RadialShape | ClipShape | UnclipShape | TextShape;

export interface Frame {
  /** the box, px */
  w: number;
  h: number;
  /** the height the chart WANTS, px, when it was held to a room shorter than that (Plan 43): the card judges its pair by it, never by the height the chart was squeezed to */
  want?: number;
  shapes: readonly Shape[];
  /** the chart in a sentence, for a screen reader (the picture is aria-hidden) */
  label: string;
  /** a chart laid out on time (a trace, the EKG paper): it moves by itself from one frame to the next, so it is never blended with the frame before it (painter.ts `glides`):
   *  blend() pairs the shapes by their place in the list, and when a line of the paper leaves the left edge every line is paired with its neighbour and glides the wrong way */
  scrolls?: true;
}

/** The height a chart takes by its own aspect (a plot so many tenths of its width), under its card's fit (2D `.pz-curve { height: cv-h * var(--pz-fit) }`). A card's `zoom` lays the box out at width / fit,
 *  so a height read off that width came out, once zoomed, as tall as at fit 1 and the chart stood past the card's foot however far the fit went (iPhone: 53 px cut on the stent slides). Times the fit it shrinks with the card. */
export const fitHeight = (h: number, c: { fit?: number }): number => (c.fit && c.fit > 0 && c.fit < 1 ? h * c.fit : h);

export const pen = (color: Rgba, w = 1, extra: Partial<Pen> = {}): Pen => ({ color, w, ...extra });

/** A frame drawn k times as large, every length of it (coordinates, sizes, pens, dashes, halos). A chart laid out at the screen's own pixels and scaled by 1/fit comes out, under its card's
 *  zoom, at the size it was laid out in: the words of a chart that must never be under 12 px on the screen (the 2D app's rule) stay 12 px, whatever the card's fit. */
export function scaleFrame(f: Frame, k: number): Frame {
  if (k === 1) return f;
  const pen = (p: Pen | undefined): Pen | undefined => (p ? { ...p, w: p.w * k, ...(p.dash ? { dash: p.dash.map((d) => d * k) } : {}) } : p);
  const xs = (a: readonly number[]) => a.map((v) => v * k);
  const one = (s: Shape): Shape => {
    switch (s.k) {
      case 'rect': return { ...s, x: s.x * k, y: s.y * k, w: s.w * k, h: s.h * k, ...(s.r !== undefined ? { r: s.r * k } : {}), pen: pen(s.pen) };
      case 'line': return { ...s, x1: s.x1 * k, y1: s.y1 * k, x2: s.x2 * k, y2: s.y2 * k, pen: pen(s.pen)! };
      case 'path': return { ...s, pts: xs(s.pts), pen: pen(s.pen) };
      case 'band': return { ...s, top: xs(s.top), bottom: xs(s.bottom) };
      case 'circle': return { ...s, cx: s.cx * k, cy: s.cy * k, r: s.r * k, pen: pen(s.pen) };
      case 'radial': return { ...s, cx: s.cx * k, cy: s.cy * k, stops: s.stops.map((t) => ({ ...t, r: t.r * k })) };
      case 'clip': return { ...s, x: s.x * k, y: s.y * k, w: s.w * k, h: s.h * k, ...(s.r !== undefined ? { r: s.r * k } : {}) };
      case 'unclip': return s;
      case 'text': return { ...s, x: s.x * k, y: s.y * k, size: s.size * k, ...(s.halo ? { halo: { ...s.halo, w: s.halo.w * k } } : {}) };
    }
  };
  return { ...f, w: f.w * k, h: f.h * k, shapes: f.shapes.map(one) };
}
