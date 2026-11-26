// What a playing case takes from the figure, in one place for the shell's sums (shell/room.ts, Shell.tsx) and the camera (tests/room.ts cutRoom),
// which load with the boot (the case's own UI is a chunk).
// 1. The foot is taller while the case bar stands in the play bar's place (docs/approved/play-the-case.md, "The bar"): shell/room.ts dockHeight adds the lift, so the figure's room, the
//    cards and sheets that rest on the dock, the zoom pill and the view pill all clear the bar by the same number.
//     - A Mac or an iPad on its side: the bar is CASE_BAR_H tall where the play bar's row is M.timelineH.
//     - The thumb layout (a phone, an upright iPad): the bar stands flush on the tab row, the two one dock (owner, 26 Nov: "still not 100% the bottom portion"), its two rows
//       CASE_BAR_THUMB_H tall where the play bar's row was M.phoneTimelineH. Its height is the sum of its parts (CASE_BAR_ROWS, the strip's CASE_STRIP_H), never a number set
//       apart from them: a fixed 96 px under 103 px of content let the chapters' names spill out of the bar onto the tab row.
// 2. The room the case's cards leave the figure, published for the camera as the Tests card publishes its place (tests/room.ts): the stop card at the left on a Mac, the stop sheet over the
//    foot of the figure on an upright iPad and an iPhone. The figure pans into what the card leaves, never zooms (the owner's rule for every card, 20 Nov: tests/place.ts panRoom).
import { create } from 'zustand';
import type { DeviceClass, Rect } from '../layout/device.ts';
import { M } from '../shell/metrics.ts';
import { useCase } from './store.ts';
import type { CasePhase } from './types.ts';

export const CASE_BAR_H = 92;
/** The thumb bar's two rows: its pads, the buttons' row (40 px buttons in a 3 px padded, 1 px edged group), the gap over the strip. */
export const CASE_BAR_ROWS = { PAD_T: 8, ROW: 48, GAP: 2, PAD_B: 8 } as const;
/** The strip's height: with the stops' names over the rail (a Mac, an iPad on its side), or the rail and the chapters' names only (the thumb bar, phone and upright iPad alike:
 *  the shell sums the thumb dock as one class, shell/room.ts layoutClass). strip.ts stripNeeds must fit in it (tests/case-bar.test.ts). */
export const CASE_STRIP_H = { names: 54, bare: 34 } as const;
/** The thumb bar's height: the sum of its rows. */
export const CASE_BAR_THUMB_H = CASE_BAR_ROWS.PAD_T + CASE_BAR_ROWS.ROW + CASE_BAR_ROWS.GAP + CASE_STRIP_H.bare + CASE_BAR_ROWS.PAD_B;

/** The case bar is up: at a stop or on the way (left or off, the play bar is back). */
export const caseBarUp = (phase: CasePhase): boolean => phase === 'stop' || phase === 'travel';

const bottomBar = (d: DeviceClass): boolean => d === 'phone-portrait' || d === 'phone-landscape' || d === 'tablet-portrait';
/** The extra height the bar takes over the play bar's row, for a layout class (pure). */
export const caseLiftFor = (d: DeviceClass, up: boolean): number => (!up ? 0 : bottomBar(d) ? CASE_BAR_THUMB_H - M.phoneTimelineH : CASE_BAR_H - M.timelineH);
/** The same, for the case as it is now. */
export const caseLift = (d: DeviceClass): number => caseLiftFor(d, caseBarUp(useCase.getState().phase));
/** The bar is up, for a component whose place reads sheetFoot() or dockHeight() (the Tests sheet, an action card): it is placed again when the bar comes and goes, so it rests on the bar. */
export const useCaseBarUp = (): boolean => useCase((s) => caseBarUp(s.phase));

/** A card at the left, its right edge `x` px from the screen's left; or a sheet over the foot, its top `y` px from the screen's top. */
export type CaseCut = { kind: 'left'; x: number } | { kind: 'foot'; y: number };
export const useCaseRoom = create<{ cut: CaseCut | null }>(() => ({ cut: null }));
/** The Mac's stop card column (its width and its gap from the screen's left): its right edge is the cut (CaseUi.tsx). */
export const CASE_CARD_W = 400, CASE_CARD_GAP = 12;
/** The share of the figure's room the stop's sheet takes at the thumb layouts, when it has not been measured yet (a phone: the sheet stands about 60 % of the room; an iPad, about 47 %). */
export const SHEET_SHARE = 0.6;
/** The cut a stop's card makes on a device class, before it has been measured: the column on a Mac, the sheet's usual share on a thumb layout. */
export function typicalCut(d: DeviceClass, room: Rect, left = 0): CaseCut {
  return bottomBar(d) ? { kind: 'foot', y: room.y + room.h * (1 - SHEET_SHARE) } : { kind: 'left', x: left + CASE_CARD_GAP + CASE_CARD_W };
}

const AIR = 8;
/** The room of the same size, centred in what the card leaves of it (the room itself with no card, or when the card leaves it nothing). */
export function caseRoom(room: Rect, cut: CaseCut | null): Rect {
  if (!cut) return room;
  if (cut.kind === 'left') {
    const l = Math.min(room.x + room.w, Math.max(room.x, cut.x + AIR));
    return { ...room, x: room.x + (l - room.x) / 2 };
  }
  const b = Math.max(room.y, Math.min(room.y + room.h, cut.y - AIR));
  return { ...room, y: room.y - (room.y + room.h - b) / 2 };
}
/** What the card leaves of the room, as it stands (the rectangle the figure is centred in, which caseRoom gives at the room's own size): the part of the room no card covers. */
export function caseFree(room: Rect, cut: CaseCut | null): Rect {
  if (!cut) return room;
  if (cut.kind === 'left') {
    const l = Math.min(room.x + room.w, Math.max(room.x, cut.x + AIR));
    return { ...room, x: l, w: room.x + room.w - l };
  }
  const b = Math.max(room.y, Math.min(room.y + room.h, cut.y - AIR));
  return { ...room, h: b - room.y };
}
/** The same, for the card up now. */
export const caseCutRoom = (room: Rect): Rect => caseRoom(room, useCaseRoom.getState().cut);
