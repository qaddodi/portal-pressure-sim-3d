// One size table for every instrument picture (Plan 45, Mohammad 23 Nov: "standardize how tall the cards should roughly be on all platforms and unify everything").
// The height of an instrument's picture (the profile, the plane, the curve, the Doppler box, FibroScan, HVPG, the beats, the vitals…) comes from the SCREEN's height, never from the card's width
// (a stacked card's `60cqi` made an upright iPad's Doppler a third of the screen) and never from the words above it (the chart used to grow into whatever room the words left, so a longer line
// of words shrank it). It is decided once per viewport; a card's room can only hold it DOWN (heldToRoom, never under 11 em).
import { layoutOf, isSideways } from './rules2d.ts';

export const CHART_MIN = 150, CHART_MAX = 300;
/** Share of the screen's height: a stacked screen (phone, upright iPad) has two cards in one column, a floating one has the pair beside the figure. */
export const CHART_K = { stacked: 0.22, floating: 0.27 } as const;

/** The height of an instrument's picture on this screen, px. */
export function chartH(w: number, h: number): number {
  const lay = layoutOf(w, h), k = lay === 'stack' || lay === 'tab' ? CHART_K.stacked : CHART_K.floating;
  return Math.min(CHART_MAX, Math.max(CHART_MIN, Math.round(k * h)));
}
/** The same, for a phone on its side (its pictures keep the sideways rules of 2D: model.ts layoutHeight): false there, so no caller uses the table for it. */
export const usesTable = (w: number, h: number): boolean => !isSideways(w, h);
