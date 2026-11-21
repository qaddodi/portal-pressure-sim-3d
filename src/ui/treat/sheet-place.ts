// Where the Treat sheet stands, as the camera's room reads it (tests/place.ts TestsPlace, kind 'sheet'): its top edge is the screen's foot less the dock gap and the sheet's own height, so the figure is
// framed in the part above it. Pure, so a test can judge it (release review #15).
import type { Viewport } from '../layout/device.ts';
import type { TestsPlace } from '../tests/place.ts';

export function sheetPlace(vp: Viewport, gapBelow: number, h: number): TestsPlace {
  const y = Math.max(0, vp.h - vp.safe.bottom - gapBelow - h);
  return { kind: 'sheet', rect: { x: 0, y, w: vp.w, h }, maxH: h, vars: { plot: 0, square: 0 }, focus: false, stops: null };
}
