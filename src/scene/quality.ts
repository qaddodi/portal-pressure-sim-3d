// Settings > Figure detail and Sharp while moving, as pixel ratios for the canvas (parity plan section 6). Detail caps the figure's pixel ratio at 1x, 1.5x or 2x
// (never above what the screen has); with Sharp while moving off, a gesture or a camera move draws at 1x and the figure comes back to its detail when it settles.
import { FIGURE_DETAIL } from '../state/settings.ts';

export function figureDpr(detail: number, sharpMoving: boolean, moving: boolean, deviceRatio: number): number {
  const cap = FIGURE_DETAIL[Math.max(0, Math.min(FIGURE_DETAIL.length - 1, Math.round(detail)))].dpr;
  const want = moving && !sharpMoving ? 1 : cap;
  return Math.max(1, Math.min(want, deviceRatio || 1));
}
