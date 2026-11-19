// Where the Tests card stands, as the 2D dock places it (dock.js): on a wide screen (Mac, an iPad held sideways) a tall card on the right with one fixed width
// (sideFixed: 30 % of the screen between 500 and 600 px); on a phone or an upright iPad a sheet over the bottom of the figure. The card is sized to its content up to the room
// it has; it never scrolls inside (the owner's rule), so a pane that would not fit is laid out in the room the card has. Pure numbers: the scene frames the figure in what is left.
import type { DeviceClass, Rect, Viewport } from '../layout/device.ts';
import { isPhone } from '../layout/device.ts';
import { TOP_BAR_H, footHeight, usesBottomBar } from '../shell/room.ts';
import { clamp } from './copied/num.copied.js';
import { sheetDockVars } from './copied/dock-vars.copied.js';

export const SIDE_W = 500, SIDE_W_WIDE = 600;
/** the side card's width on a screen W px wide (dock.js sideFixed) */
export const sideWidth = (W: number): number => Math.min(SIDE_W_WIDE, Math.max(SIDE_W, Math.round(W * 0.3)));

export interface TestsPlace {
  kind: 'side' | 'sheet';
  rect: Rect;
  /** the tallest the card may be (its content scrolls nowhere: the panes size to this) */
  maxH: number;
  /** the two sizes a sheet hands its panes: a plot's height and a square's (dock-vars.js) */
  vars: { plot: number; square: number };
}

export function testsPlace(vp: Viewport, device: DeviceClass, contentH = 0): TestsPlace {
  const top = vp.safe.top + TOP_BAR_H + 8;
  const bottom = vp.safe.bottom + footHeight(device);
  const room = Math.max(0, vp.h - top - bottom);
  if (!usesBottomBar(device) || device === 'phone-landscape') {
    // beside the figure: right-hand column (a phone held sideways docks on the right too, so the figure keeps the full height)
    const w = device === 'phone-landscape' ? clamp(Math.round(vp.w * 0.46), 300, 460) : sideWidth(vp.w);
    const maxH = room;
    const h = contentH > 0 ? Math.min(contentH, maxH) : maxH;
    const x = vp.w - vp.safe.right - 12 - w;
    return { kind: 'side', rect: { x, y: top, w, h }, maxH, vars: sheetDockVars(h, isPhone(device)) };
  }
  // a sheet over the foot of the figure: the full width less the margins, rising from just above the bottom bars
  const margin = 8, w = vp.w - vp.safe.left - vp.safe.right - 2 * margin;
  const maxH = Math.round(Math.min(room * 0.7, Math.max(200, room - 170)));   // (the figure keeps 160 px or more above it, whatever the foot takes)
  const h = contentH > 0 ? Math.min(contentH, maxH) : maxH;
  return { kind: 'sheet', rect: { x: vp.safe.left + margin, y: vp.h - bottom - h, w, h }, maxH, vars: sheetDockVars(h, isPhone(device)) };
}

/** The room the figure keeps when the card is up: the screen less the card (the camera frames it there). */
export function roomWith(room: Rect, place: TestsPlace | null): Rect {
  if (!place) return room;
  const r = place.rect;
  if (place.kind === 'side') { const w = Math.max(0, Math.min(room.w, r.x - room.x - 8)); return { x: room.x, y: room.y, w, h: room.h }; }
  const h = Math.max(0, Math.min(room.h, r.y - room.y - 8));
  return { x: room.x, y: room.y, w: room.w, h };
}
