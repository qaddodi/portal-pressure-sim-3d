// The least a pane's content needs inside the Tests sheet, so the Half stop can grow to hold it (B11 on short phones: no pane's content clips at Half). The sheet's stops are a share of the screen
// (place.ts HALF_SHARE); a pane whose words and picture cannot fit in that share would run out of the card's foot, and nothing scrolls inside a card. So a pane that knows its least says it here and
// Half is never under it, but never within FULL_CLEAR px of Full (Half and Full stay two stops). Where even that cannot hold the pane's optional
// words (a note under a chart), they step aside, as 2D's do in a short window (app-08-cards.css, `.ctl-sub`): the picture and the readings stay. Pure; tests/sheet-content-fits.test.ts judges it.
import { FIBRO_MAP_MIN } from '../shell/metrics.ts';
import { stiffLayout } from '../charts/stiff/model.ts';
import { measure } from '../charts/measure.ts';
import { toolType } from '../charts/type.ts';
import { halfCap, testsPlace, HEAD_H, type PlaceOpts, type TestsPlace } from './place.ts';
import type { Viewport, DeviceClass } from '../layout/device.ts';
import type { PaneId } from './panes.ts';

/** What stands round a pane's picture in the sheet's body (2D's stylesheets, as measured on the iPhone capture 0bc14020): the dock pane's
 *  10 px over and 12 px under, its 10 px gap under the Liver / Spleen switch (30 px high), the view's 8 px gap over the bar, and the bar's
 *  own 10 px margin. */
export const AROUND = { pad: 10 + 12, switch: 30, paneGap: 10, viewGap: 8, barMargin: 10 } as const;
export interface NeedIn { w: number; h: number; organ: 'liver' | 'spleen'; /** the optional note under the pane's chart is shown */ note: boolean }
const sumAround = AROUND.pad + AROUND.switch + AROUND.paneGap + AROUND.viewGap + AROUND.barMargin;

/** The tallest the stiffness bar's words are in any state of one organ (the liver's three-line indeterminate note with the platelets,
 *  the congested and vascular notes; the spleen's), with or without the note. */
export function stiffWordsH(w: number, h: number, organ: 'liver' | 'spleen', note: boolean): number {
  const f = toolType(w, h).sm, W = w - 2 * 8 - 2 * 16;
  const ins = organ === 'spleen'
    ? [{ lsm: 64, plt: null, organ }, { lsm: 30, plt: null, organ }]
    : [{ lsm: 20, plt: 148, organ }, { lsm: 20, plt: 90, organ }, { lsm: 18, plt: 140, organ, ctx: 'congested' as const }, { lsm: 22, plt: 100, organ, ctx: 'vascular' as const }];
  return Math.max(...ins.map((i) => stiffLayout(W, f, measure, { ...i, note }).H));
}

/** How a pane meets the sheet's height. 'fixed': its content has a least height (a picture at its floor and the rows that stand round it) and Half grows to hold it. 'scrolls': the pane is a list that
 *  scrolls inside the card by 2D's own rule (`.dock-pane { overflow: hidden auto }`), so it never clips: it needs no more than its head. */
export type PaneFit = { kind: 'fixed'; body: (i: NeedIn) => number } | { kind: 'scrolls'; why: string };

/** The picture's floor in every pane that flexes one: 2D's phone-sheet rule `.chart-box { flex: 1 1 0; min-height: 130px }` (app-08-cards.css, the @container ws block). */
export const CHART_MIN = 130;
/** The rows that stand round a picture, in px, from 2D's own rules (font size x line height, button and chip heights) and checked
 *  against the rows of the iPhone capture 0bc14020 (390 x 844, Half 439): a row that wraps is counted at the lines it has at 375 px. */
const ROW = {
  /** the switch under the head (Along the circuit / Over time, Liver / Spleen, Measure / TIPS, Endoscopic view / Wall mechanics):
   *  .pressure-switch 26 + 2 x 2 padding, and the dock pane's 10 px gap under it */
  switch: 30 + 10,
  /** the view's gap between its parts (.instrument-view { gap: 8px }) */
  gap: 8,
  /** Pressure: the legend row (12 px type, one line) and the strip of three readings (label 12/1.3, value 24/1.15, note 15 + two 1 px gaps) */
  legend: 18, strip: 16 + 28 + 15 + 2,
  /** Over time: the HVPG hero (the number at 28 px) and a row of chips (28 px, 6 px gap); the twelve chips fill two rows at 390 px, three at 375 */
  hero: 36, chip: 28, chipGap: 6,
  /** Doppler: the mode row (34), and the report under the spectrum: direction and pattern, the speed row, three rows of numbers (24 each) */
  mode: 34, report: 88,
  /** HVPG: the Measure bar, its button 40 px high and a 2 px frame */
  bar: 44,
  /** Scope: the caption under the picture, the four readings, the Band / EUS buttons row */
  caption: 20, reads: 40, buttons: 44,
  /** Ascites: what stands round the belly at its floor (the dial's 96 px belly): the tiles, the drain's rows, the serum albumin and
   *  diuretics rows, and the gaps, measured on the capture at its 140 px belly less 44 */
  belly: 96, abdomenRows: 223,
} as const;
const chipRows = (w: number): number => (w >= 390 ? 2 : 3);

/** The least each pane's content needs, one entry per Tests pane (tests/sheet-content-fits.test.ts fails for a pane with none). */
export const NEEDS: Record<PaneId, PaneFit> = {
  // the pane's padding, the switch, the picture at its floor, the legend, the strip of readings
  profile: { kind: 'fixed', body: () => AROUND.pad + ROW.switch + CHART_MIN + ROW.gap + ROW.legend + ROW.gap + ROW.strip },
  // the switch, the hero, the picture, the chips (the line of explanation under them steps aside in a sheet this short, 2D's @container rule)
  scope: { kind: 'fixed', body: (i) => AROUND.pad + ROW.switch + ROW.hero + ROW.gap + CHART_MIN + ROW.gap + chipRows(i.w) * ROW.chip + (chipRows(i.w) - 1) * ROW.chipGap },
  hvpg: { kind: 'fixed', body: () => AROUND.pad + ROW.switch + ROW.bar + ROW.gap + CHART_MIN },
  doppler: { kind: 'fixed', body: () => AROUND.pad + ROW.mode + ROW.gap + CHART_MIN + ROW.gap + ROW.report },
  endoscopy: { kind: 'fixed', body: () => AROUND.pad + ROW.switch + CHART_MIN + ROW.gap + ROW.caption + ROW.gap + ROW.reads + ROW.gap + ROW.buttons },
  abdomen: { kind: 'fixed', body: () => AROUND.pad + ROW.belly + ROW.abdomenRows },
  // the map at its floor over the stiffness bar's words
  fibroscan: { kind: 'fixed', body: (i) => sumAround + FIBRO_MAP_MIN + stiffWordsH(i.w, i.h, i.organ, i.note) },
  readouts: { kind: 'scrolls', why: 'the tiles are a list of groups that scrolls in the card' },
  trials: { kind: 'scrolls', why: 'the trials are a list that scrolls in the card' },
};

/** The least body height of a pane, or 0 when it scrolls. */
export const paneNeed = (pane: PaneId, i: NeedIn): number => { const f = NEEDS[pane]; return f.kind === 'fixed' ? f.body(i) : 0; };

/** The need to give the sheet, and whether the pane's optional note steps aside: the note stays while Half can hold the pane with it,
 *  otherwise it goes and the pane is held without it. `headH` is the card's head row. */
export function resolveNeed(pane: PaneId, i: Omit<NeedIn, 'note'>, half: number, R: number, headH: number): { needH: number; noteAside: boolean } {
  const withNote = paneNeed(pane, { ...i, note: true });
  if (!withNote) return { needH: 0, noteAside: false };
  const cap = halfCap(half, R);
  if (headH + withNote <= cap) return { needH: headH + withNote, noteAside: false };
  const without = paneNeed(pane, { ...i, note: false });
  // (a pane with no optional note has nothing to step aside)
  return { needH: headH + without, noteAside: without < withNote };
}

/** The Tests card's place with the open pane's least content held: the one composition TestsLayer and the tests read. A side card (no Half) is placed as it is.
 *  `scrollMin` is the fallback for a pane whose least still does not fit the sheet as it stands (Half grown as far as it may, or Full): the pane's view keeps that height (its body less the card's
 *  padding) and the pane scrolls inside the card, by 2D's own `.dock-pane { overflow: hidden auto }`, instead of clipping its last rows. 0 when the pane fits. */
export function fitPlace(
  vp: Viewport, device: DeviceClass, o: PlaceOpts, pane: PaneId, organ: 'liver' | 'spleen',
): { place: TestsPlace; noteAside: boolean; scrollMin: number } {
  const base = testsPlace(vp, device, o);
  if (base.kind !== 'sheet' || !base.stops) return { place: base, noteAside: false, scrollMin: 0 };
  const { needH, noteAside } = resolveNeed(pane, { w: vp.w, h: vp.h, organ }, base.stops[0], base.stops[1], HEAD_H);
  const place = needH ? testsPlace(vp, device, { ...o, needH }) : base;
  const short = needH > place.rect.h && o.sheetSize !== 2;
  return { place, noteAside, scrollMin: short ? needH - HEAD_H - AROUND.pad : 0 };
}
