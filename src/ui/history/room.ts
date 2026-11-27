// The room History's panel takes from the figure, published for the camera and for the names on the figure, as the Tests card and a case's stop card publish theirs
// (tests/room.ts, case/room.ts). Before 27 Nov the panel was no obstacle: on a Mac the figure stayed centred on the whole screen with the panel over its right third
// (Mac promotion pictures of history:<case>:timeline: a wide empty black area at the left, and "Left gastric vein", "Splenic vein" names running under the panel, clipped).
// Now the figure is panned (never zoomed: the owner's rule for every card) to the middle of what the panel leaves, and the names count it as a wall (chrome-claims.ts).
// Only when the panel stands beside the figure: a Mac, an iPad on its side (at the right), a phone on its side (the column at the left). On an iPhone or an upright iPad it is a sheet
// that covers the figure and closes when the figure is shown, so it leaves no room to share.
import { create } from 'zustand';
import type { Rect } from '../layout/device.ts';
import { caseFree, type CaseCut } from '../case/room.ts';

/** The panel's box in screen pixels while it is open beside the figure; null with it shut or as a sheet. */
export const useHistoryRoom = create<{ rect: Rect | null }>(() => ({ rect: null }));

/** Air kept between the panel and the figure's room (the Tests card's 8 px). */
export const PANEL_AIR = 8;

/** What the case's stop card and the panel leave of the room (the part no card covers). */
export function sheetFree(room: Rect, cut: CaseCut | null, panel: Rect | null): Rect {
  const f = caseFree(room, cut);
  if (!panel || panel.w <= 0 || panel.h <= 0) return f;
  const right = f.x + f.w;
  if (panel.x + panel.w / 2 >= room.x + room.w / 2) {   // (at the right)
    const r = Math.min(right, Math.max(f.x, panel.x - PANEL_AIR));
    return { ...f, w: r - f.x };
  }
  const l = Math.min(right, Math.max(f.x, panel.x + panel.w + PANEL_AIR));   // (at the left)
  return { ...f, x: l, w: right - l };
}

/** The room of the same size, centred in what the cards leave of it (the room itself with none). It equals caseRoom with the panel shut. */
export function sheetRoom(room: Rect, cut: CaseCut | null, panel: Rect | null): Rect {
  const f = sheetFree(room, cut, panel);
  return { x: f.x + f.w / 2 - room.w / 2, y: f.y + f.h / 2 - room.h / 2, w: room.w, h: room.h };
}

/** The same, for the cards up now. */
export const liveSheetRoom = (room: Rect, cut: CaseCut | null): Rect => sheetRoom(room, cut, useHistoryRoom.getState().rect);
