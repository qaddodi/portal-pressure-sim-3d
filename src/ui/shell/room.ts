// The room the figure has in free play: the screen less the top bar and the foot (the dock and the view pill above it). Pure numbers, so the scene's camera can fit into it
// and a test can judge it; every size is the 2D app's (metrics.ts). In a talk the cards' own plan (ui/layout/plan.ts) gives the room.
import type { Rect, Viewport } from '../layout/device.ts';
import type { DeviceClass } from '../layout/device.ts';
import { M, FIBRO_MAP_MIN, botOcc, viewPillHeight } from './metrics.ts';
import { isSideways } from '../layout/rules2d.ts';
import { caseLift } from '../case/room.ts';

/** The class whose room the figure has: the 2D app's thumb layout (a screen up to 1100 px wide, held upright) has the bottom bar; everything else keeps the laptop's bars (a phone held sideways too, compacted by the stylesheet). */
export const layoutClass = (thumb: boolean): DeviceClass => (thumb ? 'phone-portrait' : 'desktop');
/** Phones and upright tablets carry the actions in a bottom bar; a laptop or an iPad held sideways keeps them at the top. */
export const usesBottomBar = (d: DeviceClass): boolean => d === 'phone-portrait' || d === 'phone-landscape' || d === 'tablet-portrait';
/** Who shows the Blood / Layers rows: the top bar's popover (a laptop, an iPad on its side) or the Layers sheet from the foot (the bottom bar). Never both: they answer the same `sheet === 'layers'`. */
export const figureRowsOwner = (d: DeviceClass): 'topbar' | 'sheet' => (usesBottomBar(d) ? 'sheet' : 'topbar');

/** The top bar's own height, from the safe area down (2D main.js: `tbH = topbar.offsetHeight`, published as `--top-safe`): its padding and its pill, so a laptop or an iPad on its side 10 + 46 = 56, a phone or an upright
 *  tablet 8 + 42 = 50, a phone held sideways 6 + 42 = 48. The figure's room and the Tests card's top are measured from it. It was a fixed 64 (2D's CSS fallback), 8 to 14 px too tall on every screen: the Tests card stood
 *  12 px lower than 2D's, and the figure kept that much more clear above it (20 Nov 2026, play-test). */
export function topBarH(vp: Viewport, d: DeviceClass): number {
  const pill = M.pillH - (usesBottomBar(d) || isSideways(vp.w, vp.h) ? 4 : 0);
  return (usesBottomBar(d) && !isSideways(vp.w, vp.h) ? M.topPadPhone : isSideways(vp.w, vp.h) ? M.topPadSideways : M.topPad) + pill;
}

/** The dock's own height: the timeline row (and on a phone the tab row under it), and while a case plays, what its bar takes over the timeline row (case/room.ts):
 *  every sum of the foot below reads this one. */
export function dockHeight(d: DeviceClass): number {
  return (usesBottomBar(d) ? M.phoneTimelineH + M.phoneTabsPadTop + M.phoneTabH + M.phoneTabsPadBottom : M.timelineH) + caseLift(d);
}
/** The gap between the dock and the screen foot (above the bottom safe area). */
export const dockInset = (d: DeviceClass): number => (usesBottomBar(d) ? M.phoneInset : M.dockBottom);

/** The height the foot of the screen takes (above the bottom safe area): the dock and the view pill over it, which is 2D's --bot-occ. */
export function footHeight(d: DeviceClass): number {
  return dockInset(d) + dockHeight(d) + M.viewGapAbove + viewPillHeight();
}
/** The slot the view pill takes above the dock (its gap and its height): the open action card stands over it (the pill fades out underneath), so its foot sits this much lower. */
export const pillSpace = (): number => M.viewGapAbove + viewPillHeight();
/** The foot of every sheet and card that stands over the dock (vessel and device card, Tests, Treat, the menus), above the bottom safe area: the dock's top edge plus the one gap (M.sheetGap). */
export const sheetFoot = (d: DeviceClass): number => dockInset(d) + dockHeight(d) + M.sheetGap;
export { botOcc };

export function freeRoom(vp: Viewport, d: DeviceClass): Rect {
  const top = vp.safe.top + topBarH(vp, d);
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
    '--top-safe': px(vp.safe.top + topBarH(vp, d)), '--vdock-h': px(vdock), '--vdock-top': px(gap + vdH + nbvH), '--vdock-edge': px(gap + vdH),
    '--bot-occ': px(vdock + gap), '--dock-occ': px(vdock + gap),
    // 2D main.js: --nb-occ (= --sheet-foot) is where the cards on the dock rest, from the app's bottom (the bottom safe area included); --sheet-gap is the one gap over the dock's top edge
    '--nb-occ': px(vp.safe.bottom + sheetFoot(d)), '--sheet-foot': px(vp.safe.bottom + sheetFoot(d)), '--sheet-gap': px(M.sheetGap), '--fibro-map-min': px(FIBRO_MAP_MIN),
  };
}

/** What 2D's freeRect (sinusoid-view.js) and liveFreeInto (lobule-zoom.js) read: the custom properties main.js and the presenter publish. A talk's cards (--pz-*) and the compare header (--cmp-h) are 0 in free play. */
export interface FigureRoomInputs {
  topSafe: number; cmpH: number; pzT: number; pzB: number; pzL: number; pzR: number;
  /** The foot: the dock and the view pill over it, 2D's --bot-occ (in 3D with the bottom safe area, which 2D's own bar height carries). */
  botOcc: number;
  /** A slide is on (2D: .app.presenting): the foot takes no room, the cards' own --pz-* do. */
  presenting: boolean;
}
/** The inputs free play gives 2D's rules, from the same sums layoutVars publishes. */
export function figureRoomInputs(vp: Viewport, d: DeviceClass): FigureRoomInputs {
  return { topSafe: vp.safe.top + topBarH(vp, d), cmpH: 0, pzT: 0, pzB: 0, pzL: 0, pzR: 0, botOcc: vp.safe.bottom + footHeight(d), presenting: false };
}

/** The room the Sinusoid is centred and sized in: 2D's `freeRect(W, H)` (sinusoid-view.js), the same sums from the same inputs, rounded the same. The side panels are hidden in the view, so
 *  only the bars count: the top bar (+ the compare header + a card's top, and 40 px of air when no card is up), the foot (--bot-occ + 8, never under 34) and a 12 px margin each side. */
export function sinusoidRoom(vp: Viewport, i: FigureRoomInputs): Rect {
  const t = i.topSafe + i.cmpH + i.pzT + 8 + (i.pzT ? 0 : 40);
  const pill = i.presenting ? 0 : (i.botOcc || M.dockBottom + 8 + 42) + 8;
  const b = vp.h - i.pzB - Math.max(34, pill), l = 12 + i.pzL, r = vp.w - 12 - i.pzR;
  return rectOf(l, t, Math.max(l + 80, r), Math.max(t + 80, b));
}
/** The room the Lobule is sized in: 2D's `liveFreeInto` (lobule-zoom.js), the bars' room (the open cards only pan it, which the camera's own room-follow does): 12 px sides, 8 px under the top bar, 8 px over the foot. */
export function lobuleRoom(vp: Viewport, i: FigureRoomInputs): Rect {
  const t = i.topSafe + i.cmpH + i.pzT + 8, l = 12 + i.pzL;
  const b = vp.h - (i.botOcc || 100) - (i.pzB + 8), r = Math.max(l + 80, vp.w - (i.pzR + 12));
  return rectOf(l, t, r, b);
}
const rectOf = (l: number, t: number, r: number, b: number): Rect => ({ x: Math.round(l), y: Math.round(t), w: Math.round(r) - Math.round(l), h: Math.round(b) - Math.round(t) });
/** The room the camera frames a view in, in free play: the Sinusoid and the Lobule follow 2D's own rule for it, the others the screen less the bars. */
export function viewRoom(view: string, vp: Viewport, d: DeviceClass): Rect {
  if (view === 'sinusoid') return sinusoidRoom(vp, figureRoomInputs(vp, d));
  if (view === 'lobule') return lobuleRoom(vp, figureRoomInputs(vp, d));
  return freeRoom(vp, d);
}
