// The one answer to "is this surface a bottom sheet or a floating box on this screen?" (menu unification, stage 0: reports/menu-unification.md).
// Before 27 Nov five rules answered it (STACK_MQ, THUMB_MQ / useThumb, usesBottomBar, onPhone, frameIsSheet) and they disagreed on a phone held sideways: the action card
// was a sheet there while History and Treat were side cards. Now every menu, panel and dialog asks this, and only this (lint `one-sheet-rule`).
// The rule: a surface is a sheet exactly when the thumb dock is up (a screen up to 1100 px wide held upright), because that dock is what a sheet rests on. A phone held
// sideways has the laptop's bar and side cards (owner, 27 Nov: "I agree with your suggestions", section 6 question 5).
import { useSyncExternalStore } from 'react';

export type SurfaceMode = 'sheet' | 'float';

/** The media query of the thumb dock (2D main.js `thumbMQ`), the same box CSS reads as `html.thumb-ui`. */
export const SHEET_MQ = '(max-width: 1100px) and (orientation: portrait)';

/** Pure: the mode for a screen of w x h CSS px (portrait is height >= width, as the media query's orientation). */
export const surfaceModeOf = (w: number, h: number): SurfaceMode => (w <= 1100 && h >= w ? 'sheet' : 'float');

/** The mode now, read from the page (float with no window, as a node test or the first server render). */
export const surfaceModeNow = (): SurfaceMode => (typeof matchMedia === 'function' && matchMedia(SHEET_MQ).matches ? 'sheet' : 'float');

/** Whether surfaces are sheets now. */
export const sheetMode = (): boolean => surfaceModeNow() === 'sheet';

function subscribe(cb: () => void): () => void {
  if (typeof matchMedia !== 'function') return () => undefined;
  const m = matchMedia(SHEET_MQ);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
}

/** The mode as a React value: re-renders when the screen turns or the window crosses the line. */
export const useSurfaceMode = (): SurfaceMode => useSyncExternalStore(subscribe, surfaceModeNow, () => 'float');
