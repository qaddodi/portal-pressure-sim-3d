// The one room channel (menu unification, stage 2: reports/menu-unification.md 3.2 "One room channel"). Every open panel publishes the box it stands in, and the figure's
// room is taken once as "the screen less every open panel" (figureRoom): the camera (shell/Shell.tsx useFreeCamera and every cut through tests/room.ts cutRoom), the names on
// the figure (chrome-claims.ts, by the shell's writer) and the zoom pill's reach (panelReach) all read this one list. It replaces the four channels the shell read one by one
// (useTestsRoom's place, useHistoryRoom, Treat borrowing the Tests slot on a phone, and none at all for Treat on a Mac, Compare and Why).
// Two channels are read through the same function rather than folded in, because they carry more than a box:
//   - useCaseRoom (case/room.ts): the case's stop card cut and its height for the names' keep-out, kept by the case's own UI, a chunk of its own;
//   - useActionRoom (action/action-room.ts): the phone's docked action card height, which the view pill, the note and the zoom pill also read; it takes its share off the
//     room's foot (roomAbove), never pans.
// The figure pans, never zooms (the owner's rule for every card, 20 Nov): the room keeps its size and its centre moves to the middle of what the panels leave.
import { create } from 'zustand';
import type { Rect } from '../layout/device.ts';
import type { PanelId } from './kinds.ts';
import { caseFree, useCaseRoom, type CaseCut } from '../case/room.ts';
import { useActionRoom, roomAbove } from '../action/action-room.ts';

/** Which edge of the room a panel takes from: a column at the left or the right of a wide screen, or a sheet over the foot. */
export type PanelSide = 'left' | 'right' | 'foot';
export interface PanelBox {
  rect: Rect;
  side: PanelSide;
  /** the panel fills the screen (a Tests instrument in focus): it takes the room but moves no floating control aside */
  fills?: boolean;
}

/** The boxes the open panels stand in now, by panel. */
export const usePanelRoom = create<{ boxes: Readonly<Partial<Record<PanelId, PanelBox>>> }>(() => ({ boxes: {} }));

const same = (a: PanelBox | undefined, b: PanelBox | null): boolean =>
  !a ? !b : !!b && a.side === b.side && !!a.fills === !!b.fills && a.rect.x === b.rect.x && a.rect.y === b.rect.y && a.rect.w === b.rect.w && a.rect.h === b.rect.h;

/** A panel publishes its box (null: shut, or standing nowhere beside the figure); a box that has not moved a pixel changes nothing. */
export function publishPanel(id: PanelId, box: PanelBox | null): void {
  const was = usePanelRoom.getState().boxes;
  if (same(was[id], box)) return;
  const next = { ...was };
  if (box && box.rect.w > 0 && box.rect.h > 0) next[id] = { ...box, rect: { ...box.rect } };
  else delete next[id];
  usePanelRoom.setState({ boxes: next });
}

/** The open panels' boxes, as a list. */
export const boxesOf = (b: Readonly<Partial<Record<PanelId, PanelBox>>>): PanelBox[] => Object.values(b).filter((x): x is PanelBox => !!x);
export const openBoxes = (): PanelBox[] => boxesOf(usePanelRoom.getState().boxes);

/** Air kept between a panel and the figure's room (the Tests card's 8 px, case/room.ts's AIR). */
export const PANEL_AIR = 8;

/** What the case's cards and every panel leave of the room: the part no card covers. */
export function panelFree(room: Rect, boxes: readonly PanelBox[], cut: CaseCut | null = null): Rect {
  let f = caseFree(room, cut);
  for (const { rect: r, side } of boxes) {
    if (r.w <= 0 || r.h <= 0) continue;
    const right = f.x + f.w;
    if (side === 'right') f = { ...f, w: Math.min(right, Math.max(f.x, r.x - PANEL_AIR)) - f.x };
    else if (side === 'left') { const l = Math.min(right, Math.max(f.x, r.x + r.w + PANEL_AIR)); f = { ...f, x: l, w: right - l }; }
    else { const b = Math.max(f.y, Math.min(f.y + f.h, r.y - PANEL_AIR)); f = { ...f, h: b - f.y }; }
  }
  return f;
}

/** The figure's room: the room's size, centred in what every panel and the case's cards leave, less a docked action card's share of the foot (`actionH`, a phone's). */
export function figureRoom(room: Rect, boxes: readonly PanelBox[], cut: CaseCut | null = null, actionH = 0): Rect {
  const f = panelFree(room, boxes, cut);
  return roomAbove({ x: f.x + f.w / 2 - room.w / 2, y: f.y + f.h / 2 - room.h / 2, w: room.w, h: room.h }, actionH);
}

/** The same, for the panels and cards up now. */
export const liveFigureRoom = (room: Rect): Rect => figureRoom(room, openBoxes(), useCaseRoom.getState().cut, useActionRoom.getState().h);

/** How far the farthest open right-hand panel's left edge stands from the screen's right edge, px (0 with none): the floating controls there (the zoom pill) step aside by it. */
export function panelReach(screenW: number, boxes: readonly PanelBox[]): number {
  let reach = 0;
  for (const b of boxes) if (b.side === 'right' && !b.fills) reach = Math.max(reach, screenW - b.rect.x);
  return Math.max(0, Math.round(reach));
}
