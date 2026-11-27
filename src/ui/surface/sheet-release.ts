// Where a panel sheet settles when the finger lets go (menu unification, stage 3: reports/menu-unification.md 3.2 "Sheet mode", one detent model). Pure, so node tests
// judge it (tests/sheet-detents.test.ts); the pull (sheet-pull.ts) asks it on every release. The rules are every sheet's over the thumb dock (2D dock-sheet.js and
// util.js swipeSheet, ease.js SHEET_*), with Peek between Half and closed (approved decision 4):
//   from Full  a pull down past STAY_FULL settles at Half (a second pull goes on from there); a pull up is the content's or eases back
//   from Half  a pull up past FAR_UP or a flick up goes to Full; a pull down past the close distance rests at Peek, and a pull past Peek (the sheet's top below where
//              Peek's would be) or a flick down closes it, in that one pull (owner, 20 Nov: "close in one pull")
//   from Peek  a pull up past PEEK_UP or a flick up comes back to Half; a pull down past the close distance or a flick closes it
// A sheet that cannot be closed (the case's stop card) rests at Peek instead. A short pull eases back to where it was.
// @ts-ignore plain JS copied from the 2D app
import { isFlick, SHEET_FLICK_MIN, SHEET_FLICK_FAR, SHEET_CLOSE_PX, SHEET_CLOSE_SHARE } from '../tests/copied/ease.copied.js';
import type { Detent } from './sheet-stops.ts';

/** How far a pull up must go (px), or how fast as the finger lifted (px per ms, up is negative), and how far down a pull from Full must go before it settles at Half. */
export const FAR_UP = 40, PEEK_UP = 24, STAY_FULL = 40, FLICK_UP = -0.5;

export interface Release {
  from: Detent;
  /** how far the finger went, px, down positive (with what a caught settle carried) */
  dy: number;
  /** the finger's speed as it lifted, px per ms down (releaseSpeed) */
  speed: number;
  /** the pull's average speed, px per ms down */
  avg: number;
  /** the sheet's height when the pull began, and its Peek */
  h0: number;
  peek: number;
  /** a pull may close it */
  closable: boolean;
}

/** The pull down that closes or steps a sheet: SHEET_CLOSE_PX, or its share of the sheet's height, whichever is less. */
export const closeDistance = (h: number): number => Math.min(SHEET_CLOSE_PX, h * SHEET_CLOSE_SHARE);

/** Where the sheet settles: a stop, or closed. */
export function releaseTo(r: Release): Detent | 'close' {
  const { from, dy, speed } = r;
  const close = r.closable ? 'close' : 'peek';
  if (dy > 0) {
    const flick = isFlick(dy, speed, r.avg, SHEET_FLICK_MIN, SHEET_FLICK_FAR) as boolean;
    if (from === 'full') return dy > STAY_FULL ? 'half' : 'full';
    if (from === 'peek') return flick || dy > closeDistance(r.h0) ? close : 'peek';
    // (from Half: a flick or a pull past Peek closes it; a pull past the close distance rests at Peek)
    if (flick || dy > r.h0 - r.peek) return close;
    return dy > closeDistance(r.h0) ? 'peek' : 'half';
  }
  if (dy < 0) {
    if (from === 'half') return -dy > FAR_UP || speed < FLICK_UP ? 'full' : 'half';
    if (from === 'peek') return -dy > PEEK_UP || speed < FLICK_UP ? 'half' : 'peek';
  }
  return from;
}

/** The grab bar's tap (Tests' onGrab, now every sheet's): Half to Full and back; from Peek up to Half. */
export const grabStep = (at: Detent): Detent => (at === 'half' ? 'full' : 'half');
