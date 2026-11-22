// The fillet's fidelity in SCREEN PIXELS (plan owner, 22 Nov, "Rulings on WP2"): the tolerance of a region's midpoint sag (REFINE.world, scene units) is judged as 0.5 CSS px at the closest zoom the app allows, on iPhone and Mac.
// The closest zoom is K_MAX (6, scene/gesture/view.ts) times the whole figure's fit; the fit is the figure's front-view extent (x, y) scaled into the viewport, taken over the phone (portrait and landscape) and the Mac window, whichever shows it largest.
import type { Skeleton } from './types.ts';

export const FIDELITY_PX = 0.5, MAX_ZOOM = 6;
/** CSS pixel sizes of the screens that matter: iPhone portrait and landscape, a Mac window. */
export const VIEWPORTS: readonly { name: string; w: number; h: number }[] = [{ name: 'iPhone', w: 390, h: 844 }, { name: 'iPhone landscape', w: 844, h: 390 }, { name: 'Mac', w: 1440, h: 900 }];

/** The front-view (x, y) extent of the figure at the body pose. */
export function figureExtent(skel: Skeleton): { w: number; h: number } {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const b of skel.bones) { const p = b.pos[0]; x0 = Math.min(x0, p[0] - b.r[0]); x1 = Math.max(x1, p[0] + b.r[0]); y0 = Math.min(y0, p[1] - b.r[0]); y1 = Math.max(y1, p[1] + b.r[0]); }
  return { w: x1 - x0, h: y1 - y0 };
}

/** CSS pixels per scene unit at the closest zoom, the largest over the screens. */
export function pixelsPerUnitAtMaxZoom(extent: { w: number; h: number }): number {
  return Math.max(...VIEWPORTS.map((v) => MAX_ZOOM * Math.min(v.w / extent.w, v.h / extent.h)));
}

/** The pixels a scene-unit tolerance spans at the closest zoom. */
export const tolerancePx = (world: number, extent: { w: number; h: number }): number => world * pixelsPerUnitAtMaxZoom(extent);
