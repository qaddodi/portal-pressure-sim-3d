// The dialog shell's arithmetic (menu unification, stage 5: reports/menu-unification.md 3.2 "Dialog shell"), pure, for node tests.
//   where a dialog's foot rests: a size-l dialog in sheet mode is a sheet from the foot that rests on the dock, or on the on-screen keyboard while it is up;
//     every other dialog (any size in float mode, a size-s one in sheet mode) is centred in the room above the keyboard.
//   the keyboard: iOS draws it over the page without shrinking the layout viewport, so its height is the layout viewport's foot less the visual viewport's
//     (2D palette.js fitList, util.js visibleBottom; Search's own fit until 27 Nov, now the shell's for every dialog).
//   the focus trap: Tab and Shift Tab walk the dialog's controls and wrap at either end; focus that has left the dialog comes back to its first (or last) control.
import type { SURFACES } from './kinds.ts';
import type { SurfaceMode } from './mode.ts';

/** The surfaces that are dialogs. */
export type DialogId = { [K in keyof typeof SURFACES]: (typeof SURFACES)[K]['kind'] extends 'dialog' ? K : never }[keyof typeof SURFACES];
/** s: a question (Reset, the deck dialogs, the case guard). l: a page or a field (About, References, Privacy, the Guide, Search). */
export type DialogSize = 's' | 'l';
/** What cancelled a dialog: Esc, a press outside it (the scrim, or the dock below a sheet), its X, or a pull down on a phone's sheet. */
export type CancelBy = 'esc' | 'press' | 'x' | 'pull';

/** The part of `window.visualViewport` the fit reads. */
export interface VisualVp { offsetTop: number; height: number }

/** The on-screen keyboard's height (0 with none) and the visible height, px. */
export function keyboardFit(innerHeight: number, vv: VisualVp | null): { kb: number; vh: number } {
  if (!vv) return { kb: 0, vh: Math.round(innerHeight) };
  // (a viewport's own numbers, not a layout read)
  const { offsetTop: top, height } = vv;
  return { kb: Math.max(0, Math.round(innerHeight - Math.min(innerHeight, top + height))), vh: Math.round(height) };
}

/** The page's numbers a dialog's foot is set by, px: the keyboard, the dock's rest line (--thumb-occ: where a phone sheet rests, from the screen's foot), the sheet gap and the safe area. */
export interface FootIn { kb: number; occ: number; gap: number; safeB: number }

/** The margin round a centred dialog (dialog.css `--dlg-edge`). */
export const DIALOG_EDGE = 16;

/** How far above the screen's foot the dialog's room ends, px. dialog.css writes the same rule with the same custom properties (tests/dialog-shell.test.ts holds the two together). */
export function dialogFoot(mode: SurfaceMode, size: DialogSize, f: FootIn): number {
  // (a sheet rests where every phone sheet rests, one gap over the dock; the keyboard, when it is taller, lifts it to one gap over the keys)
  if (mode === 'sheet' && size === 'l') return Math.max(f.occ, f.kb + f.gap);
  return DIALOG_EDGE + Math.max(f.safeB, f.kb);
}

/** Where a dialog stands in its room: a sheet at the foot, a question in the middle, a page hung from the line a full-height page is centred on (so a Search list that grows
 *  and shrinks as you type never moves the field). */
export function dialogAlign(mode: SurfaceMode, size: DialogSize): 'end' | 'center' | 'start' {
  if (size === 's') return 'center';
  return mode === 'sheet' ? 'end' : 'start';
}

/** The controls Tab walks in a dialog (a row with tabindex -1, a disabled control and a hidden one are left out by the shell). */
export const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tab in a dialog with `count` controls, focus on control `at` (-1: focus is not on one of them). The control to focus, `box` (none: the dialog itself holds it), or null (the browser's own step). */
export function trapStep(count: number, at: number, shift: boolean): number | 'box' | null {
  if (count === 0) return 'box';
  if (at < 0) return shift ? count - 1 : 0;
  if (!shift && at === count - 1) return 0;
  if (shift && at === 0) return count - 1;
  return null;
}
