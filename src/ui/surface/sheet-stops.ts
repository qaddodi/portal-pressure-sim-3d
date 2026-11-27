// The heights a panel's phone sheet stops at (menu unification, stage 3: reports/menu-unification.md 3.2 "Sheet mode", approved decision 4: Peek, Half and Full for every
// phone panel). ONE pure function for every panel sheet (Tests, Treat, History, Compare, Why, the action card, the case's stop card): before it, Tests had its own stops
// (tests/place.ts sheetStops) and Treat a copy of 2D's sheetHeight (treat/sheet-height.copied.ts), both from 2D dock-sheet.js, and History stood at a fixed 78 %.
//   Peek  the head row, the tabs and the grab bar only: the figure is seen over the sheet, which is brought back with a pull up or the grab bar.
//   Half  "as tall as the words, capped": a sheet of words is as tall as its words up to the cap; a sheet whose pane flexes to it (Tests) stands at a share of the screen
//         (2D's 520 px at most, held under HALF_SHARE of it) grown to hold the pane's least; a list that scrolls by its nature stands at that share. The cap keeps
//         Half at least FULL_CLEAR under Full, so the two are two stops.
//   Full  the room: from under the top bar to the sheet's foot (an upright tablet: 62 % of the screen at most); a sheet of words is never taller than its words.
// Pure (no DOM): node tests load it (tests/sheet-detents.test.ts holds every panel's three stops and Tests' to the pixel of the stops it had).
import type { DeviceClass, Viewport } from '../layout/device.ts';
import { topBarH, sheetFoot } from '../shell/room.ts';
// @ts-ignore plain JS copied from the 2D app
import { testsHalfPx, MIN_HALF } from '../tests/copied/stack-plan.copied.js';
// @ts-ignore plain JS copied from the 2D app
import { isFlick, SHEET_FLICK_MIN, SHEET_FLICK_FAR, SHEET_CLOSE_PX, SHEET_CLOSE_SHARE } from '../tests/copied/ease.copied.js';

export type Detent = 'peek' | 'half' | 'full';
export const DETENTS: readonly Detent[] = ['peek', 'half', 'full'];

/** Peek: the head row, the tabs and the grab bar (owner, 20 Nov: swipe the panel down out of the way to see more of the figure, and bring it back). */
export const PEEK_H = 72;
/** A phone's Half at most (2D dock-sheet.js testsHalfPx: about 90 % of the room, 520 px at most). */
export const HALF_PX = 520;
/** A phone's Half is never more than this share of the screen: tall enough for a pane's own content, low enough that it does not open high up (owner, 20 Nov). */
export const HALF_SHARE = 0.52;
/** Half stays at least this far under Full, so the two are still two stops. */
export const FULL_CLEAR = 24;
/** An upright tablet's Half and Full, as shares of the screen (2D dock-sheet.js TABLET). */
export const TABLET_HALF = 0.45, TABLET_FULL = 0.62;
/** What a sheet keeps clear under the top bar (2D: the room ends 22 px under it). */
export const ROOM_CLEAR = 22;

/** What a sheet holds, which says how tall its Half and Full are. */
export type SheetFit =
  /** words: as tall as they are (`h`, px; Infinity where they are not measured, which gives the caps), up to the stop */
  | { kind: 'words'; h: number }
  /** a pane that flexes to the sheet (Tests): its least height (`least`, px: the head and the pane's least body, tests/pane-need.ts), 0 when it has none */
  | { kind: 'flex'; least: number }
  /** a list that scrolls by its nature (History's moments): it never asks for more than the share */
  | { kind: 'list' };

export interface StopsIn {
  /** the screen's height, px */
  H: number;
  /** the room a sheet may fill, px (sheetRoom) */
  R: number;
  /** an upright tablet (its stops are shares of the screen) */
  tablet: boolean;
  fit: SheetFit;
  /** the vessel's card is up above the sheet (Tests' Half gives way, stack-plan.js) */
  vesselCard?: boolean;
}
export interface Stops { peek: number; half: number; full: number }

/** The share Half stands at before anything is fitted in it (2D's, as Tests had it). */
export function baseHalf(tablet: boolean, H: number, R: number, vesselCard = false): number {
  if (tablet) return Math.round(Math.min(1, testsHalfPx(R, TABLET_HALF * H, vesselCard) / R) * R);
  return Math.min(Math.round(Math.min(0.9, testsHalfPx(R, HALF_PX, vesselCard) / R) * R), Math.max(MIN_HALF, Math.round(HALF_SHARE * H)), Math.round(R));
}
/** The room's stop: a phone's whole room, an upright tablet's 62 % of the screen within it. */
export const fullOf = (tablet: boolean, H: number, R: number): number => (tablet ? Math.round(Math.min(1, (TABLET_FULL * H) / R) * R) : Math.round(R));
/** The tallest Half may be: FULL_CLEAR under Full, never under the share Half already had. */
export const halfCap = (half: number, full: number): number => Math.max(half, Math.round(full) - FULL_CLEAR);

/** The one rule: a sheet's Peek, Half and Full. Peek < Half <= Full <= the room. */
export function sheetStops({ H, R, tablet, fit, vesselCard = false }: StopsIn): Stops {
  const room = fullOf(tablet, H, R), base = baseHalf(tablet, H, R, vesselCard), cap = halfCap(base, room);
  let half: number, full = room;
  if (fit.kind === 'flex') half = Math.min(Math.max(base, fit.least), cap);
  else if (fit.kind === 'list') half = base;
  else {
    // (words: as tall as they are, up to the cap; and never under Peek's own height and the gap, so a short card still has two stops)
    const w = Math.ceil(Math.max(fit.h, PEEK_H + FULL_CLEAR));
    half = Math.min(w, cap);
    full = Math.min(w, room);
  }
  return { peek: Math.min(PEEK_H, half - 1), half, full };
}

/** What each phone panel holds, so its stops follow (approved decision 4: Peek, Half and Full for every phone panel). The timeline chart is the one full-width panel and keeps its own raise. */
export const PANEL_FITS = {
  tests: { kind: 'flex', least: 0 },
  treat: { kind: 'words', h: Infinity },
  history: { kind: 'list' },
  compare: { kind: 'words', h: Infinity },
  why: { kind: 'words', h: Infinity },
  action: { kind: 'words', h: Infinity },
  stop: { kind: 'words', h: Infinity },
} as const satisfies Record<string, SheetFit>;
export type SheetPanel = keyof typeof PANEL_FITS;

/** The room a sheet may fill on this screen: from under the top bar down to its foot (one gap over the dock, as a case's bar raises it), less ROOM_CLEAR. */
export function sheetRoom(vp: Viewport, device: DeviceClass): number {
  return Math.max(1, vp.h - vp.safe.top - topBarH(vp, device) - (vp.safe.bottom + sheetFoot(device)) - ROOM_CLEAR);
}

/** A panel sheet's stops on this screen. */
export const stopsFor = (vp: Viewport, device: DeviceClass, fit: SheetFit, vesselCard = false): Stops =>
  sheetStops({ H: vp.h, R: sheetRoom(vp, device), tablet: device === 'tablet-portrait', fit, vesselCard });

/** The stops as the CSS custom properties a sheet's stylesheet sizes it by (treat.css, action.css, shell.css, history.css): Half and Full are caps (max-height) for a sheet of words. */
export const stopVars = (s: Stops): Record<'--sf-peek' | '--sf-half' | '--sf-full', string> => ({ '--sf-peek': `${s.peek}px`, '--sf-half': `${s.half}px`, '--sf-full': `${s.full}px` });

// ── Where a panel sheet settles when the finger lets go (the one detent model).
// The pull (sheet-pull.ts) asks releaseTo on every release. The rules are every sheet's over the thumb dock (2D dock-sheet.js and
// util.js swipeSheet, ease.js SHEET_*), with Peek between Half and closed (approved decision 4):
//   from Full  a pull down past STAY_FULL settles at Half (a second pull goes on from there); a pull up is the content's or eases back
//   from Half  a pull up past FAR_UP or a flick up goes to Full; a pull down past the close distance rests at Peek, and a pull past Peek (the sheet's top below where
//              Peek's would be) or a flick down closes it, in that one pull (owner, 20 Nov: "close in one pull")
//   from Peek  a pull up past PEEK_UP or a flick up comes back to Half; a pull down past the close distance or a flick closes it
// A sheet that cannot be closed (the case's stop card) rests at Peek instead. A short pull eases back to where it was.
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
    // (from Half: a flick or a pull past Peek closes it; a pull past the close distance rests at Peek. The flick here is the finger still going fast as it lifts, not a
    //  brisk pull's average, or a deliberate pull to Peek would close the sheet)
    if ((dy > SHEET_FLICK_FAR && speed > SHEET_FLICK_MIN) || dy > r.h0 - r.peek) return close;
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
