// B11 (capture 0bc14020, iPhone): the Tests sheet's last line, "re-evaluate in 12 months (Baveno VIII 1.16, 1.17)", was cut off at the card's foot while a case played. The sheet itself stood right
// (one gap over the case bar); what ran out was its content: 2D's phone rule held the FibroScan map at 180 px, and a Half sheet (a share of the screen, not 2D's 520 px) left the stiffness bar's
// words less than that. The rule pinned here: over every phone and upright iPad, in every case phase, (1) the sheet rests one gap over the dock as the bar makes it, whatever is up, and (2) the
// words that stand under the map fit in the Half sheet with the map still at least FIBRO_MAP_MIN, because the map is the part that gives way, never the words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { M, FIBRO_MAP_MIN } from '../src/ui/shell/metrics.ts';
import { sheetFoot, dockHeight, dockInset, layoutVars } from '../src/ui/shell/room.ts';
import { CASE_BAR_THUMB_H, caseBarUp } from '../src/ui/case/room.ts';
import { useCase, CASE_OFF } from '../src/ui/case/store.ts';
import { testsPlace, HEAD_H } from '../src/ui/tests/place.ts';
import { stiffLayout } from '../src/ui/charts/stiff/model.ts';
import { measure } from '../src/ui/charts/measure.ts';
import { toolType } from '../src/ui/charts/type.ts';
import type { CasePhase } from '../src/ui/case/types.ts';

const SCREENS = [
  { vp: { w: 390, h: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } }, d: 'phone-portrait' as const },
  { vp: { w: 390, h: 844, safe: { top: 0, right: 0, bottom: 0, left: 0 } }, d: 'phone-portrait' as const },
  { vp: { w: 393, h: 852, safe: { top: 59, right: 0, bottom: 34, left: 0 } }, d: 'phone-portrait' as const },
  { vp: { w: 430, h: 932, safe: { top: 59, right: 0, bottom: 34, left: 0 } }, d: 'phone-portrait' as const },
  { vp: { w: 820, h: 1180, safe: { top: 24, right: 0, bottom: 20, left: 0 } }, d: 'tablet-portrait' as const },
];
const PHASES: CasePhase[] = ['off', 'stop', 'travel', 'left'];
const inPhase = (phase: CasePhase) => useCase.setState({ ...CASE_OFF, phase });

// What stands round the map in the sheet's body (2D's stylesheets, as measured on the iPhone capture): the dock pane's 10 px over and 12 px under, its 10 px gap under the Liver / Spleen switch (30 px high),
// the view's 8 px gap over the bar, and the bar's own 10 px margin.
const AROUND = { pad: 10 + 12, switch: 30, paneGap: 10, viewGap: 8, barMargin: 10 };

/** The tallest the words under the map are in any state: the liver's three-line indeterminate note with the platelets, the congested note, the spleen's. */
function worstWordsH(w: number, h: number): number {
  const f = toolType(w, h).sm, W = w - 2 * 8 - 2 * 16;
  const ins = [{ lsm: 20, plt: 148, organ: 'liver' as const }, { lsm: 20, plt: 90, organ: 'liver' as const }, { lsm: 18, plt: 140, organ: 'liver' as const, ctx: 'congested' as const }, { lsm: 22, plt: 100, organ: 'liver' as const, ctx: 'vascular' as const }, { lsm: 64, plt: null, organ: 'spleen' as const }];
  return Math.max(...ins.map((i) => stiffLayout(W, f, measure, { ...i, note: true }).H));
}

test('every phase of a case: the Tests sheet rests one gap over the dock, the bar included, at every stop of the sheet', () => {
  for (const phase of PHASES) {
    inPhase(phase);
    for (const { vp, d } of SCREENS) {
      const up = caseBarUp(phase), bar = CASE_BAR_THUMB_H;
      const dock = vp.safe.bottom + dockInset(d) + dockHeight(d);
      assert.equal(dockHeight(d), M.phoneTimelineH + M.phoneTabsPadTop + M.phoneTabH + M.phoneTabsPadBottom + (up ? bar - M.phoneTimelineH : 0), `${phase}: the dock is as tall as the bar makes it`);
      for (const sheetSize of [0, 1, 2] as const) {
        const p = testsPlace(vp, d, { sheetSize });
        assert.equal(vp.h - (p.rect.y + p.rect.h), dock + M.sheetGap, `${phase} ${vp.w}x${vp.h} size ${sheetSize}: the sheet's foot is the bar's top plus one gap`);
        assert.ok(p.rect.y >= vp.safe.top, 'and its top stays on the screen');
      }
      assert.equal(layoutVars(vp, d)['--nb-occ'], `${vp.safe.bottom + sheetFoot(d)}px`, 'the cards that rest on the dock read the same sum');
    }
  }
  inPhase('off');
});

test('the stiffness bar\'s words fit in the Half sheet with the map still FIBRO_MAP_MIN high, in free play and while a case plays', () => {
  for (const phase of PHASES) {
    inPhase(phase);
    for (const { vp, d } of SCREENS) {
      const half = testsPlace(vp, d, { sheetSize: 0 }).rect.h;
      const left = half - HEAD_H - AROUND.pad - AROUND.switch - AROUND.paneGap - AROUND.viewGap - AROUND.barMargin - worstWordsH(vp.w, vp.h);
      assert.ok(left >= FIBRO_MAP_MIN, `${phase} ${vp.w}x${vp.h}: the map would have ${Math.round(left)} px (Half ${half}), under ${FIBRO_MAP_MIN}: the words would run out of the card`);
    }
  }
  inPhase('off');
});

test('the map\'s least is the one number: 2D held it at 180, which no Half sheet of a phone leaves once the three-line note is up', () => {
  assert.ok(FIBRO_MAP_MIN < 180 && FIBRO_MAP_MIN >= 100, 'the map still reads');
  const { vp, d } = SCREENS[0]!;
  const half = testsPlace(vp, d, { sheetSize: 0 }).rect.h;
  const left = half - HEAD_H - AROUND.pad - AROUND.switch - AROUND.paneGap - AROUND.viewGap - AROUND.barMargin - worstWordsH(vp.w, vp.h);
  assert.ok(left < 180, `with 2D's 180 px the iPhone's Half sheet (${Math.round(left)} px left) is the bug`);
  assert.equal(layoutVars(vp, d)['--fibro-map-min'], `${FIBRO_MAP_MIN}px`, 'the stylesheet reads the same number');
});
