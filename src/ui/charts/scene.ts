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
  shapes: readonly Shape[];
  /** the chart in a sentence, for a screen reader (the picture is aria-hidden) */
  label: string;
}

export const pen = (color: Rgba, w = 1, extra: Partial<Pen> = {}): Pen => ({ color, w, ...extra });
