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

/** The room a sheet may fill on this screen: from under the top bar down to its foot (one gap over the dock, as a case's bar raises it), less ROOM_CLEAR. */
export function sheetRoom(vp: Viewport, device: DeviceClass): number {
  return Math.max(1, vp.h - vp.safe.top - topBarH(vp, device) - (vp.safe.bottom + sheetFoot(device)) - ROOM_CLEAR);
}

/** A panel sheet's stops on this screen. */
export const stopsFor = (vp: Viewport, device: DeviceClass, fit: SheetFit, vesselCard = false): Stops =>
  sheetStops({ H: vp.h, R: sheetRoom(vp, device), tablet: device === 'tablet-portrait', fit, vesselCard });

/** The stops as the CSS custom properties a sheet's stylesheet sizes it by (surface/sheet.css): Half and Full are caps (max-height) for a sheet of words. */
export const stopVars = (s: Stops): Record<'--sf-peek' | '--sf-half' | '--sf-full', string> => ({ '--sf-peek': `${s.peek}px`, '--sf-half': `${s.half}px`, '--sf-full': `${s.full}px` });
