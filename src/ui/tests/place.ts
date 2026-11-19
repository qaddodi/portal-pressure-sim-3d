// Where the Tests card stands, as the 2D dock places it (dock.js): on a wide screen (Mac, an iPad held sideways) a tall card on the right with one fixed width
// (sideFixed: 30 % of the screen between 500 and 600 px); on a phone or an upright iPad a sheet over the bottom of the figure. The card is sized to its content up to the room
// it has; it never scrolls inside (the owner's rule), so a pane that would not fit is laid out in the room the card has. Pure numbers: the scene frames the figure in what is left.
import type { DeviceClass, Rect, Viewport } from '../layout/device.ts';
import { isPhone } from '../layout/device.ts';
import { footHeight, usesBottomBar } from '../shell/room.ts';
import { M } from '../shell/metrics.ts';
import { clamp } from './copied/num.copied.js';
import { testsHalfPx } from './copied/stack-plan.copied.js';
import { sheetDockVars } from './copied/dock-vars.copied.js';

export const SIDE_W = 500, SIDE_W_WIDE = 600;
/** The side card's width on a screen W px wide (dock.js sideFixed): the fixed width, growing with a very large window. */
export const sideFixed = (W: number): number => Math.min(SIDE_W_WIDE, Math.max(SIDE_W, Math.round(W * 0.3)));
/** Where it gives way (dock.js sideWidth, not sideways): never more than 62 % of the stage. */
export const sideWidth = (W: number): number => Math.min(sideFixed(W), Math.max(360, W * 0.62));
/** A phone held sideways keeps its divider (the only card whose width is dragged): the remembered width, else 45 % of the stage, between 320 px and 62 % of it (dock.js sideWidth). */
export const sidewaysWidth = (W: number, widthPx: number | null): number => clamp(widthPx ?? Math.max(340, W * 0.45), 320, Math.max(360, W * 0.62));
/** The tallest a side card is on a Mac or an iPad on its side (app-07-floating.css --ws-max). */
export const SIDE_MAX_H = 760;
/** The sheet's two heights, Half and Full (dock-sheet.js stops): a phone's Half is one fixed 520 px (testsHalfPx), Full the room; a tablet held upright 45 % and 62 % of the screen. */
export const TESTS_HALF_PX = 520;
export function sheetStops(device: DeviceClass, H: number, R: number, vesselCard = false): [number, number] {
  if (device === 'tablet-portrait') return [Math.round(Math.min(1, testsHalfPx(R, 0.45 * H, vesselCard) / R) * R), Math.round(Math.min(1, (0.62 * H) / R) * R)];
  return [Math.round(Math.min(0.9, testsHalfPx(R, TESTS_HALF_PX, vesselCard) / R) * R), Math.round(R)];
}
/** The sizes a card on the right hands its panes (dock.js sizeObserver): the plots share the body's height, a square is the card's width less its padding. */
export const sideVars = (w: number, bodyH: number, count: number): { plot: number; square: number } => ({ plot: clamp(bodyH / Math.max(1, count) - 90, 190, 380), square: clamp(w - 80, 220, 380) });
/** The card's head row, tabs and the comparison line over the body, until the body is measured (the plot sizes follow the body's own height, dock.js sizeObserver). */
export const HEAD_H = 56;

export interface TestsPlace {
  kind: 'side' | 'sheet';
  rect: Rect;
  /** the tallest the card may be (its content scrolls nowhere: the panes size to this) */
  maxH: number;
  /** the two sizes the card hands its panes: a plot's height and a square's (dock.js sizeObserver; a sheet's are dock-vars.js) */
  vars: { plot: number; square: number };
  /** the card fills the screen (instrument-focus) */
  focus: boolean;
  /** the sheet's Half and Full heights (a side card has none) */
  stops: [number, number] | null;
}

export interface PlaceOpts {
  /** the remembered width of a sideways phone's card, px */
  widthPx?: number | null;
  /** the remembered height of a sheet that is not over the thumb dock, a share of the stage */
  heightRatio?: number | null;
  /** the phone's sheet: 0 Half, 1 Full */
  sheetSize?: 0 | 1;
  /** instrument-focus: the card fills the screen */
  focus?: boolean;
  /** the body's measured height, px (the plot sizes follow it); the head's estimate until it is measured */
  bodyH?: number;
  /** how many instruments are up (a side card's plots share its height) */
  count?: number;
  /** the vessel's card is up above the sheet (its Half gives way, stack-plan.js) */
  vesselCard?: boolean;
  /** (a content height, px: a card that is shorter than its room) */
  contentH?: number;
}

export function testsPlace(vp: Viewport, device: DeviceClass, o: PlaceOpts = {}): TestsPlace {
  const top = vp.safe.top + M.topSafe + 8;
  // (a phone held sideways has the laptop's bars, compacted, so its foot is the laptop's: shell.ts layoutClass(thumb) says the same to the figure)
  const bottom = vp.safe.bottom + footHeight(device === 'phone-landscape' ? 'desktop' : device);
  const room = Math.max(0, vp.h - top - bottom);
  const contentH = o.contentH ?? 0, count = Math.max(1, o.count ?? 1);
  const side = !usesBottomBar(device) || device === 'phone-landscape';
  const bodyOf = (h: number) => o.bodyH ?? Math.max(0, h - HEAD_H);
  if (o.focus) {
    // the instrument in focus (app-07-floating.css .app.instrument-focus .instrument-workspace): the whole screen but the bars, a gap in from each side
    const gap = device === 'desktop' ? M.gap : 8, y = vp.safe.top + M.topSafe + 4, h = Math.max(0, vp.h - bottom - y - gap);
    const w = Math.max(0, vp.w - vp.safe.left - vp.safe.right - 2 * gap);
    return { kind: side ? 'side' : 'sheet', rect: { x: vp.safe.left + gap, y, w, h }, maxH: h, vars: sideVars(w, bodyOf(h), count), focus: true, stops: null };
  }
  if (side) {
    // beside the figure: right-hand column (a phone held sideways docks on the right too, so the figure keeps the full height)
    const w = device === 'phone-landscape' ? sidewaysWidth(vp.w, o.widthPx ?? null) : sideWidth(vp.w);
    const maxH = device === 'phone-landscape' ? room : Math.min(SIDE_MAX_H, room);
    const h = contentH > 0 ? Math.min(contentH, maxH) : maxH;
    const x = vp.w - vp.safe.right - 12 - w;
    return { kind: 'side', rect: { x, y: top, w, h }, maxH, vars: sideVars(w, bodyOf(h), count), focus: false, stops: null };
  }
  // a sheet over the foot of the figure: the full width less the margins, rising from just above the bottom bars; Half or Full (dock-sheet.js)
  const margin = 8, w = vp.w - vp.safe.left - vp.safe.right - 2 * margin;
  const R = Math.max(1, vp.h - vp.safe.top - M.topSafe - bottom - 22);
  const stops = sheetStops(device, vp.h, R, !!o.vesselCard);
  const maxH = stops[1];
  const h = contentH > 0 ? Math.min(contentH, maxH) : o.heightRatio != null ? Math.max(140, Math.min(maxH, Math.max(180, vp.h * o.heightRatio))) : stops[o.sheetSize === 1 ? 1 : 0];
  return { kind: 'sheet', rect: { x: vp.safe.left + margin, y: vp.h - bottom - h, w, h }, maxH, vars: sheetDockVars(h, isPhone(device)), focus: false, stops };
}

/** The room the figure keeps when the card is up: the screen less the card (the camera frames it there). */
export function roomWith(room: Rect, place: TestsPlace | null): Rect {
  if (!place) return room;
  const r = place.rect;
  if (place.kind === 'side') { const w = Math.max(0, Math.min(room.w, r.x - room.x - 8)); return { x: room.x, y: room.y, w, h: room.h }; }
  const h = Math.max(0, Math.min(room.h, r.y - room.y - 8));
  return { x: room.x, y: room.y, w: room.w, h };
}
