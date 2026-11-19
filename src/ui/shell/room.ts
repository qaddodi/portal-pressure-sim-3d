// The room the figure has in free play: the screen less the top bar and the foot (the play bar, and on a phone or an upright tablet the bottom bar). Pure numbers, so the
// scene's camera can fit into it and a test can judge it. In a talk the cards' own plan (ui/layout/plan.ts) gives the room.
import type { Rect, Viewport } from '../layout/device.ts';
import { isPhone, type DeviceClass } from '../layout/device.ts';

export const TOP_BAR_H = 52;          // buttons 44 px, 4 px above and below
export const PLAY_BAR_H = 52;
export const THUMB_BAR_H = 56;        // the bottom bar's tabs
export const VIEW_ROW_H = 44;         // the view pills' row above the play bar on a phone

/** Phones and upright tablets carry the actions in a bottom bar; a laptop or an iPad held sideways keeps them at the top. */
export const usesBottomBar = (d: DeviceClass): boolean => d === 'phone-portrait' || d === 'phone-landscape' || d === 'tablet-portrait';

/** The height the foot of the screen takes (above the bottom safe area). */
export function footHeight(d: DeviceClass): number {
  if (usesBottomBar(d)) return THUMB_BAR_H + PLAY_BAR_H + (isPhone(d) && d === 'phone-landscape' ? 0 : VIEW_ROW_H) + 8;
  return PLAY_BAR_H + 16;
}

export function freeRoom(vp: Viewport, d: DeviceClass): Rect {
  const top = vp.safe.top + TOP_BAR_H + 8;
  const bottom = vp.safe.bottom + footHeight(d);
  const x = vp.safe.left, w = vp.w - vp.safe.left - vp.safe.right;
  return { x, y: top, w: Math.max(0, w), h: Math.max(0, vp.h - top - bottom) };
}
