// The Circuit's bracket under a span of stations (2D callout-math.js spanOf, spanY; V25): a line under the circuit from one station's x to the other's, with a tick up at each
// end, in the map's own units (the circuit's view box, y down). It runs below the lowest station (690) and the collateral lanes (down to about 725), under the zone bands (730),
// inside the circuit's view (760). Pure: the numbers are the 2D app's (figure2d.copied.ts SPAN_2D) and the stations' places are the copied map's (NODE_CIRCUIT).
import { SPAN_2D } from './figure2d.copied.ts';
import { NODE_CIRCUIT } from '../circuit/data.copied.ts';

export const SPAN_Y = SPAN_2D.y, SPAN_TICK = SPAN_2D.tick;

/** The bracket's height on the map at k screen pixels per map unit: the lanes' captions sit under the lowest lane in screen pixels, so the bracket keeps SPAN_ROOM px below it at any zoom. */
export const spanY = (k = 1): number => Math.max(SPAN_2D.y, SPAN_2D.laneLow + SPAN_2D.room / (k > 0 ? k : 1));

export interface Span { x0: number; x1: number; y: number }

/** A span between two stations in map units, or null when either is not a station of the map or both stand at one x (the 2D app draws nothing then). */
export function spanOf(from: string, to: string, k = 1): Span | null {
  const a = NODE_CIRCUIT[from], b = NODE_CIRCUIT[to];
  if (!a || !b || a[0] === b[0]) return null;
  return { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y: spanY(k) };
}

/** The bracket's three strokes as map points: the line, then the tick at each end (a tick runs from the line up toward the circuit). */
export function spanStrokes(s: Span): [[number, number], [number, number]][] {
  return [[[s.x0, s.y], [s.x1, s.y]], [[s.x0, s.y], [s.x0, s.y - SPAN_TICK]], [[s.x1, s.y], [s.x1, s.y - SPAN_TICK]]];
}
