// Every panel's phone sheet stops at Peek, Half and Full from ONE function (menu unification, stage 3: surface/sheet-stops.ts sheetStops; approved decision 4), with
// Peek < Half <= Full <= the room; the Tests sheet's stops are the ones it had to the pixel (tests/fixtures/tests-sheet-stops.json, recorded from tests/place.ts before it
// moved onto the one function); and one release rule (surface/sheet-stops.ts releaseTo) settles every sheet, with a pull past Peek closing it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sheetStops, stopsFor, sheetRoom, baseHalf, fullOf, halfCap, releaseTo, grabStep, closeDistance, PEEK_H, FULL_CLEAR, PANEL_FITS } from '../src/ui/surface/sheet-stops.ts';
import { fitPlace, resolveNeed } from '../src/ui/tests/pane-need.ts';
import { testsPlace, HEAD_H } from '../src/ui/tests/place.ts';
import { deviceClass, type Viewport } from '../src/ui/layout/device.ts';
import { useCase, CASE_OFF } from '../src/ui/case/store.ts';
import type { PaneId } from '../src/ui/tests/panes.ts';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const SCREENS: Record<string, Viewport> = {
  '390x844': { w: 390, h: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } },
  '375x667': { w: 375, h: 667, safe: { top: 20, right: 0, bottom: 0, left: 0 } },
  '820x1180': { w: 820, h: 1180, safe: { top: 24, right: 0, bottom: 20, left: 0 } },
  '1024x1366': { w: 1024, h: 1366, safe: { top: 24, right: 0, bottom: 20, left: 0 } },
};
interface Row { screen: string; device: string; caseBar: boolean; pane: PaneId; organ: 'liver' | 'spleen'; sheetSize: 0 | 1 | 2; stops: [number, number]; h: number; y: number; noteAside: boolean; scrollMin: number }
const FIXTURE = JSON.parse(read('tests/fixtures/tests-sheet-stops.json')) as Row[];
const inCase = (bar: boolean) => useCase.setState({ ...CASE_OFF, phase: bar ? 'stop' : 'off' });

test('the Tests sheet stands where it stood, to the pixel, on every phone and upright iPad, with and without a case bar, for every pane and organ at Peek, Half and Full', () => {
  assert.ok(FIXTURE.length >= 400, 'the fixture covers 390x844, 375x667, 820x1180, 1024x1366, both case states, every pane');
  for (const r of FIXTURE) {
    inCase(r.caseBar);
    const vp = SCREENS[r.screen]!, d = deviceClass(vp.w, vp.h);
    const got = fitPlace(vp, d, { sheetSize: r.sheetSize }, r.pane, r.organ);
    const tag = `${r.screen}${r.caseBar ? ' case bar' : ''} ${r.pane} ${r.organ} size ${r.sheetSize}`;
    assert.deepEqual(got.place.stops, r.stops, `${tag}: Half and Full`);
    assert.equal(got.place.rect.h, r.h, `${tag}: the height`);
    assert.equal(got.place.rect.y, r.y, `${tag}: the top`);
    assert.equal(got.noteAside, r.noteAside, `${tag}: the note`);
    assert.equal(got.scrollMin, r.scrollMin, `${tag}: the scroll floor`);
    // and the one function gives the same stops from the same inputs (the pane's least is its Half's fit)
    const base = testsPlace(vp, d, {});
    const { needH } = resolveNeed(r.pane, { w: vp.w, h: vp.h, organ: r.organ }, base.stops![0], base.stops![1], HEAD_H);
    const one = stopsFor(vp, d, { kind: 'flex', least: needH });
    assert.deepEqual([one.half, one.full], r.stops, `${tag}: sheetStops`);
    assert.equal(one.peek, PEEK_H, `${tag}: Peek`);
  }
  inCase(false);
});

// every phone panel and what it holds (surface/sheet-stops.ts PANEL_FITS: the stops a stylesheet sizes it by are the caps, words of unmeasured height)
const PANELS = PANEL_FITS;

test('every phone panel\'s Peek, Half and Full come from the one function: Peek < Half <= Full <= the room, Half under Full by FULL_CLEAR where the words reach it', () => {
  for (const bar of [false, true]) {
    inCase(bar);
    for (const [id, vp] of Object.entries(SCREENS)) {
      const d = deviceClass(vp.w, vp.h), R = sheetRoom(vp, d);
      for (const [panel, fit] of Object.entries(PANELS)) {
        const s = stopsFor(vp, d, fit), tag = `${id}${bar ? ' case bar' : ''} ${panel}`;
        assert.ok(s.peek < s.half, `${tag}: Peek ${s.peek} < Half ${s.half}`);
        assert.ok(s.half <= s.full, `${tag}: Half ${s.half} <= Full ${s.full}`);
        assert.ok(s.full <= Math.round(R), `${tag}: Full ${s.full} <= the room ${R}`);
        assert.ok(s.half <= s.full - FULL_CLEAR, `${tag}: Half and Full are two stops`);
      }
      // a short card of words: as tall as its words at Half and Full, so it never stands taller than what it holds
      const short = stopsFor(vp, d, { kind: 'words', h: 210 });
      assert.deepEqual([short.half, short.full], [210, 210], `${id}: words of 210 px`);
      assert.ok(short.peek < short.half);
      // a long one: Half capped under Full, Full at the room
      const long = stopsFor(vp, d, { kind: 'words', h: 5000 }), full = fullOf(d === 'tablet-portrait', vp.h, R);
      assert.equal(long.full, full); assert.equal(long.half, halfCap(baseHalf(d === 'tablet-portrait', vp.h, R), full));
    }
  }
  inCase(false);
  assert.deepEqual(sheetStops({ H: 844, R: 600, tablet: false, fit: { kind: 'list' } }), { peek: PEEK_H, half: 439, full: 600 }, 'a list stands at the share');
});

test('one release rule for every sheet: Full steps to Half, Half to Peek, a pull past Peek or a flick closes; a sheet that cannot close rests at Peek', () => {
  const r = (from: 'peek' | 'half' | 'full', dy: number, speed = 0, closable = true, h0 = from === 'peek' ? 72 : from === 'full' ? 700 : 520) =>
    releaseTo({ from, dy, speed, avg: speed, h0, peek: 72, closable });
  assert.equal(r('full', 80), 'half', 'a pull down from Full settles at Half');
  assert.equal(r('full', 500, 3), 'half', 'however far or fast');
  assert.equal(r('full', 20), 'full', 'a short one eases back');
  assert.equal(r('half', -90), 'full'); assert.equal(r('half', -20), 'half'); assert.equal(r('half', -20, -1), 'full', 'a flick up');
  assert.equal(r('half', 30), 'half', 'a short pull down eases back');
  assert.equal(r('half', closeDistance(520) + 10), 'peek', 'a pull down past the close distance rests at Peek');
  assert.equal(r('half', 520 - 72 + 1), 'close', 'a pull past Peek closes it');
  assert.equal(r('half', 60, 2), 'close', 'a flick closes it in one pull');
  assert.equal(r('half', 30, 2), 'half', 'a short quick one is no flick (under 40 px)');
  assert.equal(r('peek', -30), 'half', 'from Peek a pull up comes back to Half');
  assert.equal(r('peek', 30), 'close', 'and a pull down closes it');
  assert.equal(r('half', 520 - 72 + 1, 0, false), 'peek', 'the stop card is never pulled shut');
  assert.equal(r('peek', 30, 0, false), 'peek');
  assert.deepEqual(['peek', 'half', 'full'].map((d) => grabStep(d as 'peek')), ['half', 'full', 'half'], 'the grab bar: Peek up to Half, Half to Full and back');
});
