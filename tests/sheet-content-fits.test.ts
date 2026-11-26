// B11 (capture 0bc14020, iPhone): the Tests sheet's last line, "re-evaluate in 12 months (Baveno VIII 1.16, 1.17)", was cut off at the card's foot while a case played. The sheet itself stood right
// (one gap over the case bar); what ran out was its content: 2D's phone rule held the FibroScan map at 180 px, and a Half sheet (a share of the screen, not 2D's 520 px) left the stiffness bar's
// words less than that. The rule pinned here: over every phone and upright iPad, in every case phase, (1) the sheet rests one gap over the dock as the bar makes it, whatever is up, and (2) the
// words that stand under the map fit in the Half sheet with the map still at least FIBRO_MAP_MIN, because the map is the part that gives way, never the words, and (3) on a short phone, where the share of the
// screen cannot hold the pane, Half grows to hold it (never to within FULL_CLEAR of Full) and only if it still cannot, the pane's note steps aside (pane-need.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { M, FIBRO_MAP_MIN } from '../src/ui/shell/metrics.ts';
import { sheetFoot, dockHeight, dockInset, layoutVars } from '../src/ui/shell/room.ts';
import { CASE_BAR_THUMB_H, caseBarUp } from '../src/ui/case/room.ts';
import { useCase, CASE_OFF } from '../src/ui/case/store.ts';
import { testsPlace, HEAD_H, FULL_CLEAR } from '../src/ui/tests/place.ts';
import { AROUND, CHART_MIN, NEEDS, paneNeed, resolveNeed, stiffWordsH, fitPlace } from '../src/ui/tests/pane-need.ts';
import { PANES, PANE_ORDER, type PaneId } from '../src/ui/tests/panes.ts';
import type { CasePhase } from '../src/ui/case/types.ts';

const SCREENS = [
  { vp: { w: 375, h: 667, safe: { top: 20, right: 0, bottom: 0, left: 0 } }, d: 'phone-portrait' as const },
  { vp: { w: 390, h: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } }, d: 'phone-portrait' as const },
  { vp: { w: 390, h: 844, safe: { top: 0, right: 0, bottom: 0, left: 0 } }, d: 'phone-portrait' as const },
  { vp: { w: 393, h: 852, safe: { top: 59, right: 0, bottom: 34, left: 0 } }, d: 'phone-portrait' as const },
  { vp: { w: 430, h: 932, safe: { top: 59, right: 0, bottom: 34, left: 0 } }, d: 'phone-portrait' as const },
  { vp: { w: 820, h: 1180, safe: { top: 24, right: 0, bottom: 20, left: 0 } }, d: 'tablet-portrait' as const },
];
const PHASES: CasePhase[] = ['off', 'stop', 'travel', 'left'];
const inPhase = (phase: CasePhase) => useCase.setState({ ...CASE_OFF, phase });

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

const ORGANS = ['liver', 'spleen'] as const;
const around = AROUND.pad + AROUND.switch + AROUND.paneGap + AROUND.viewGap + AROUND.barMargin;

test('no pane\'s content clips at the Half stop: the map keeps its floor over the words, in free play and in every phase of a case, on a short phone and a tall one', () => {
  for (const phase of PHASES) {
    inPhase(phase);
    for (const { vp, d } of SCREENS) for (const organ of ORGANS) {
      const { place, noteAside } = fitPlace(vp, d, { sheetSize: 0 }, 'fibroscan', organ);
      const words = stiffWordsH(vp.w, vp.h, organ, !noteAside);
      const left = place.rect.h - HEAD_H - around - words;
      const tag = `${phase} ${vp.w}x${vp.h} ${organ} (Half ${place.rect.h}, note ${noteAside ? 'aside' : 'shown'})`;
      assert.ok(left >= FIBRO_MAP_MIN, `${tag}: the map would have ${Math.round(left)} px, under ${FIBRO_MAP_MIN}: the words would run out of the card`);
      assert.ok(place.stops![0] <= place.stops![1] - FULL_CLEAR || place.stops![0] === testsPlace(vp, d, { sheetSize: 0 }).stops![0], `${tag}: Half stays under Full`);
      assert.equal(vp.h - (place.rect.y + place.rect.h), vp.safe.bottom + sheetFoot(d), `${tag}: the foot is unchanged by the growth`);
    }
  }
  inPhase('off');
});

test('the note steps aside only where Half, grown as far as it may, still cannot hold the pane with it; a tall phone keeps it', () => {
  inPhase('off');
  const tall = SCREENS.find((s) => s.vp.h === 844 && s.vp.safe.top === 47)!, short = SCREENS[0]!;
  assert.equal(fitPlace(tall.vp, tall.d, { sheetSize: 0 }, 'fibroscan', 'liver').noteAside, false, 'the 390x844 holds the pane with its note');
  for (const { vp, d } of SCREENS) {
    const base = testsPlace(vp, d, { sheetSize: 0 });
    const r = resolveNeed('fibroscan', { w: vp.w, h: vp.h, organ: 'liver' }, base.stops![0], base.stops![1], HEAD_H);
    const cap = Math.max(base.stops![0], base.stops![1] - FULL_CLEAR);
    assert.equal(r.noteAside, HEAD_H + paneNeed('fibroscan', { w: vp.w, h: vp.h, organ: 'liver', note: true }) > cap, `${vp.w}x${vp.h}: aside exactly when the note does not fit under the cap`);
  }
  const s = fitPlace(short.vp, short.d, { sheetSize: 0 }, 'fibroscan', 'liver');
  assert.ok(s.place.rect.h > testsPlace(short.vp, short.d, { sheetSize: 0 }).rect.h, 'the 375x667 Half grew to hold the pane');
});

test('every Tests pane declares how it meets the sheet\'s height: a minimum, or that it scrolls', () => {
  const ids = Object.keys(PANES).sort();
  assert.deepEqual(Object.keys(NEEDS).sort(), ids, 'a pane with no entry in NEEDS (pane-need.ts) has no declared minimum');
  assert.deepEqual([...PANE_ORDER].sort(), ids, 'and the order of the tabs names the same panes');
  for (const id of ids as PaneId[]) {
    const n = NEEDS[id];
    if (n.kind === 'scrolls') { assert.ok(n.why.length > 10, `${id} says why it scrolls`); assert.equal(paneNeed(id, { w: 390, h: 844, organ: 'liver', note: true }), 0); continue; }
    const least = paneNeed(id, { w: 390, h: 844, organ: 'liver', note: false });
    assert.ok(least > AROUND.pad + CHART_MIN - 1, `${id}: a picture at its floor and its padding at the least (${least})`);
    assert.ok(least + HEAD_H <= 450, `${id}: ${least + HEAD_H} px with its head is more than a 390x844 phone\'s Half can give`);
  }
});

// (the one place the least cannot be given: a 375x667 phone while a case plays, whose Full is 402 px with the bar up; Half may not stand within 24 px of it)
const SHORT: Record<string, string[]> = { 'stop 375x667': ['scope', 'abdomen'], 'travel 375x667': ['scope', 'abdomen'] };

test('every pane at the Half stop: grown to its minimum within the cap, and short only where the cap is lower, which is named', () => {
  for (const phase of PHASES) {
    inPhase(phase);
    for (const { vp, d } of SCREENS) {
      const short: string[] = [];
      for (const pane of PANE_ORDER) {
        const { place, noteAside } = fitPlace(vp, d, { sheetSize: 0 }, pane, 'liver');
        const base = testsPlace(vp, d, { sheetSize: 0 }), cap = Math.max(base.stops![0], base.stops![1] - FULL_CLEAR);
        const need = HEAD_H + paneNeed(pane, { w: vp.w, h: vp.h, organ: 'liver', note: !noteAside });
        assert.equal(place.rect.h, Math.min(Math.max(base.stops![0], need), cap), `${pane} ${phase} ${vp.w}x${vp.h}: Half is the share, grown to the minimum, within the cap`);
        assert.ok(place.rect.h <= place.stops![1] - FULL_CLEAR || place.rect.h === base.stops![0], `${pane}: Half stays under Full`);
        if (place.rect.h < need) short.push(pane);
      }
      const known = (phase === 'off' || phase === 'left' ? [] : SHORT[`${phase === 'stop' ? 'stop' : 'travel'} ${vp.w}x${vp.h}`]) ?? [];
      assert.deepEqual(short, known, `${phase} ${vp.w}x${vp.h}: the panes whose content would still clip`);
    }
  }
  inPhase('off');
});

test('the map\'s least is the one number: 2D held it at 180, which no share-of-the-screen Half leaves once the three-line note is up', () => {
  assert.ok(FIBRO_MAP_MIN < 180 && FIBRO_MAP_MIN >= 100, 'the map still reads');
  const { vp, d } = SCREENS[1]!;
  const half = testsPlace(vp, d, { sheetSize: 0 }).rect.h;
  const left = half - HEAD_H - around - stiffWordsH(vp.w, vp.h, 'liver', true);
  assert.ok(left < 180, `with 2D's 180 px the iPhone's Half sheet (${Math.round(left)} px left) is the bug`);
  assert.equal(layoutVars(vp, d)['--fibro-map-min'], `${FIBRO_MAP_MIN}px`, 'the stylesheet reads the same number');
});
