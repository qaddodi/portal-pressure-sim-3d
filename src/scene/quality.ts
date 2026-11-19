// Settings > Figure detail and Sharp while moving, as pixel ratios for the canvas (parity plan section 6). Detail caps the figure's pixel ratio at 1x, 1.5x or 2x
// (never above what the screen has); with Sharp while moving off, a gesture or a camera move draws at 1x and the figure comes back to its detail when it settles.
import { FIGURE_DETAIL } from '../state/settings.ts';

/** The figure never draws above 2x, on any screen (a 3x phone gains nothing from it at this line width, and costs a third more pixels than 2x for no change in the art). */
export const MAX_FIGURE_DPR = 2;
/** From this pixel ratio up the canvas has no multisampling: the lines are anti-aliased in their shaders and 4x samples on every pass is what a phone cannot spare (plan 8.2). */
export const MSAA_OFF_FROM_DPR = 2;

export function figureDpr(detail: number, sharpMoving: boolean, moving: boolean, deviceRatio: number): number {
  const cap = FIGURE_DETAIL[Math.max(0, Math.min(FIGURE_DETAIL.length - 1, Math.round(detail)))].dpr;
  const want = moving && !sharpMoving ? 1 : cap;
  return Math.max(1, Math.min(want, MAX_FIGURE_DPR, deviceRatio || 1));
}

/** Whether the canvas is made with multisampling, for the pixel ratio the figure will rest at. A context's antialias is fixed when it is made, so Stage keys the canvas on this answer. */
export const msaaFor = (restDpr: number): boolean => restDpr < MSAA_OFF_FROM_DPR;
