// The room the figure has in free play: the screen less the top bar and the foot (the dock and the view pill above it). Pure numbers, so the scene's camera can fit into it
// and a test can judge it; every size is the 2D app's (metrics.ts). In a talk the cards' own plan (ui/layout/plan.ts) gives the room.
import type { Rect, Viewport } from '../layout/device.ts';
import type { DeviceClass } from '../layout/device.ts';
import { M, botOcc, viewPillHeight } from './metrics.ts';

/** The class whose room the figure has: the 2D app's thumb layout (a screen up to 1100 px wide, held upright) has the bottom bar; everything else keeps the laptop's bars (a phone held sideways too, compacted by the stylesheet). */
export const layoutClass = (thumb: boolean): DeviceClass => (thumb ? 'phone-portrait' : 'desktop');
/** Phones and upright tablets carry the actions in a bottom bar; a laptop or an iPad held sideways keeps them at the top. */
export const usesBottomBar = (d: DeviceClass): boolean => d === 'phone-portrait' || d === 'phone-landscape' || d === 'tablet-portrait';

/** The dock's own height: the timeline row (and on a phone the tab row under it). */
export function dockHeight(d: DeviceClass): number {
  return usesBottomBar(d) ? M.phoneTimelineH + M.phoneTabsPadTop + M.phoneTabH + M.phoneTabsPadBottom : M.timelineH;
}
/** The gap between the dock and the screen foot (above the bottom safe area). */
export const dockInset = (d: DeviceClass): number => (usesBottomBar(d) ? M.phoneInset : M.dockBottom);

/** The height the foot of the screen takes (above the bottom safe area): the dock and the view pill over it, which is 2D's --bot-occ. */
export function footHeight(d: DeviceClass): number {
  return dockInset(d) + dockHeight(d) + M.viewGapAbove + viewPillHeight();
}
export { botOcc };

export function freeRoom(vp: Viewport, d: DeviceClass): Rect {
  const top = vp.safe.top + M.topSafe;
  const bottom = vp.safe.bottom + footHeight(d) + M.zoomAboveDock;
  const x = vp.safe.left, w = vp.w - vp.safe.left - vp.safe.right;
  return { x, y: top, w: Math.max(0, w), h: Math.max(0, vp.h - top - bottom) };
}

/** The custom properties the 2D app's main.js publishes on `.app` (--top-safe, --vdock-h, --vdock-top, --vdock-edge, --bot-occ, --dock-occ), from the same sums (main.js syncCmpH):
 *  the dock's height plus the view pill above it is --vdock-h, the gap under the dock on top of that is --bot-occ. Numbers in px; the 2D stylesheets read them (zoom pill, cards, toasts). */
export function layoutVars(vp: Viewport, d: DeviceClass): Record<string, string> {
  const gap = dockInset(d), vdH = dockHeight(d), nbvH = M.viewGapAbove + viewPillHeight();
  const vdock = vdH + nbvH, px = (n: number) => `${Math.round(n)}px`;
  return {
    '--top-safe': px(vp.safe.top + M.topSafe), '--vdock-h': px(vdock), '--vdock-top': px(gap + vdH + nbvH), '--vdock-edge': px(gap + vdH),
    '--bot-occ': px(vdock + gap), '--dock-occ': px(vdock + gap),
  };
}
