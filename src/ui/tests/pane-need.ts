// The least a pane's content needs inside the Tests sheet, so the Half stop can grow to hold it (B11 on short phones: no pane's content clips at Half). The sheet's stops are a share of the screen
// (place.ts HALF_SHARE); a pane whose words and picture cannot fit in that share would run out of the card's foot, and nothing scrolls inside a card. So a pane that knows its least says it here and
// Half is never under it, but never within FULL_CLEAR px of Full (Half and Full stay two stops). Where even that cannot hold the pane's optional words (a note under a chart), they step aside, as 2D's do
// in a short window (app-08-cards.css, `.ctl-sub`): the picture and the readings stay. Pure; tests/sheet-content-fits.test.ts judges it.
import { FIBRO_MAP_MIN } from '../shell/metrics.ts';
import { stiffLayout } from '../charts/stiff/model.ts';
import { measure } from '../charts/measure.ts';
import { toolType } from '../charts/type.ts';
import { halfCap, testsPlace, HEAD_H, type PlaceOpts, type TestsPlace } from './place.ts';
import type { Viewport, DeviceClass } from '../layout/device.ts';
import type { PaneId } from './panes.ts';

/** What stands round a pane's picture in the sheet's body (2D's stylesheets, as measured on the iPhone capture 0bc14020): the dock pane's 10 px over and 12 px under, its 10 px gap under the Liver / Spleen
 *  switch (30 px high), the view's 8 px gap over the bar, and the bar's own 10 px margin. */
export const AROUND = { pad: 10 + 12, switch: 30, paneGap: 10, viewGap: 8, barMargin: 10 } as const;
export interface NeedIn { w: number; h: number; organ: 'liver' | 'spleen'; /** the optional note under the pane's chart is shown */ note: boolean }
const sumAround = AROUND.pad + AROUND.switch + AROUND.paneGap + AROUND.viewGap + AROUND.barMargin;

/** The tallest the stiffness bar's words are in any state of one organ (the liver's three-line indeterminate note with the platelets, the congested and vascular notes; the spleen's), with or without the note. */
export function stiffWordsH(w: number, h: number, organ: 'liver' | 'spleen', note: boolean): number {
  const f = toolType(w, h).sm, W = w - 2 * 8 - 2 * 16;
  const ins = organ === 'spleen'
    ? [{ lsm: 64, plt: null, organ }, { lsm: 30, plt: null, organ }]
    : [{ lsm: 20, plt: 148, organ }, { lsm: 20, plt: 90, organ }, { lsm: 18, plt: 140, organ, ctx: 'congested' as const }, { lsm: 22, plt: 100, organ, ctx: 'vascular' as const }];
  return Math.max(...ins.map((i) => stiffLayout(W, f, measure, { ...i, note }).H));
}

/** The least body height (under the card's head row) each pane's content needs: the picture at its floor and the words that stand round it. Panes that flex all their content (every other pane today) say nothing. */
const NEEDS: Partial<Record<PaneId, (i: NeedIn) => number>> = {
  fibroscan: (i) => sumAround + FIBRO_MAP_MIN + stiffWordsH(i.w, i.h, i.organ, i.note),
};

/** The least body height of a pane, or 0 when it flexes everything. */
export const paneNeed = (pane: PaneId, i: NeedIn): number => NEEDS[pane]?.(i) ?? 0;

/** The need to give the sheet, and whether the pane's optional note steps aside: the note stays while Half can hold the pane with it, otherwise it goes and the pane is held without it. `headH` is the card's head row. */
export function resolveNeed(pane: PaneId, i: Omit<NeedIn, 'note'>, half: number, R: number, headH: number): { needH: number; noteAside: boolean } {
  const withNote = paneNeed(pane, { ...i, note: true });
  if (!withNote) return { needH: 0, noteAside: false };
  const cap = halfCap(half, R);
  if (headH + withNote <= cap) return { needH: headH + withNote, noteAside: false };
  return { needH: headH + paneNeed(pane, { ...i, note: false }), noteAside: true };
}

/** The Tests card's place with the open pane's least content held: the one composition TestsLayer and the tests read. A side card (no Half) is placed as it is. */
export function fitPlace(vp: Viewport, device: DeviceClass, o: PlaceOpts, pane: PaneId, organ: 'liver' | 'spleen'): { place: TestsPlace; noteAside: boolean } {
  const base = testsPlace(vp, device, o);
  if (base.kind !== 'sheet' || !base.stops) return { place: base, noteAside: false };
  const { needH, noteAside } = resolveNeed(pane, { w: vp.w, h: vp.h, organ }, base.stops[0], base.stops[1], HEAD_H);
  return { place: needH ? testsPlace(vp, device, { ...o, needH }) : base, noteAside };
}
