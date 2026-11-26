// Rule (Mohammad, 26 Nov, capture 0bc14020, "keep labels out from under panels"): no word on the figure stands under the app's own chrome: a playing case's stop card (at the left of a Mac, or the sheet
// over the foot of an iPad and an iPhone), the Tests card, the case bar. The root was that each writer of words (the Anatomy's names, the Circuit's captions, the Lobule's names, the probes) built its own
// keep-out list and none had the case's; this holds the one shared list (labels/chrome-claims.ts) to the rule on every screen, and every writer to reading it. Pure numbers and source reading, node only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Vector3 } from 'three';
import { Vector3 as V3 } from 'three';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { LabelController, NO_STATE, type LabelDeps } from '../src/scene/labels/controller.ts';
import { chromeBoxes, chromeClaims, CASE_TRAVEL_H } from '../src/scene/labels/chrome-claims.ts';
import { hits, rectToBox, type Box } from '../src/scene/labels/geometry.ts';
import { labelView } from '../src/scene/labels/room.ts';
import { caseRoom, type CaseCut } from '../src/ui/case/room.ts';
import { useCase } from '../src/ui/case/store.ts';
import type { Rect } from '../src/ui/layout/device.ts';
import { BAR } from '../src/ui/layout/plan.ts';
import { freeRoom, layoutClass, sheetFoot, topBarH } from '../src/ui/shell/room.ts';
import { panRoom, type TestsPlace } from '../src/ui/tests/place.ts';

const measure: LabelDeps['measure'] = (t, size, _w, track = 0) => t.length * size * 0.56 + track * t.length;
const tests = (kind: 'side' | 'sheet', rect: Rect): TestsPlace => ({ kind, rect, maxH: rect.h, vars: { plot: 200, square: 220 }, focus: false, stops: null });
const none = { top: 0, right: 0, bottom: 0, left: 0 };

interface Screen { name: string; vp: { w: number; h: number; safe: typeof none }; thumb: boolean; cardH: number; sheetH: number; tests: TestsPlace | null }
const SCREENS: Screen[] = [
  // (the card and bar of the capture: 12,64 to 412,338 and 12,796 to 1428,888 on the Mac)
  { name: 'mac', vp: { w: 1440, h: 900, safe: none }, thumb: false, cardH: 274, sheetH: 0, tests: null },
  { name: 'mac + Tests card', vp: { w: 1440, h: 900, safe: none }, thumb: false, cardH: 274, sheetH: 0, tests: tests('side', { x: 840, y: 64, w: 580, h: 720 }) },
  { name: 'ipad portrait', vp: { w: 820, h: 1180, safe: none }, thumb: true, cardH: 0, sheetH: 300, tests: null },
  { name: 'iphone', vp: { w: 390, h: 844, safe: { top: 47, right: 0, bottom: 34, left: 0 } }, thumb: true, cardH: 0, sheetH: 250, tests: null },
];

/** What CaseUi publishes for a screen: the cut and the card's height. */
function cutOf(sc: Screen): CaseCut {
  const d = layoutClass(sc.thumb);
  return sc.thumb ? { kind: 'foot', y: sc.vp.h - sc.vp.safe.bottom - sheetFoot(d) - sc.sheetH } : { kind: 'left', x: sc.vp.safe.left + 12 + 400 };
}

test('the chrome list holds the stop card, the sheet, the Tests card and the foot the case bar stands in, on every screen', () => {
  useCase.setState({ phase: 'stop' });
  try {
    for (const sc of SCREENS) {
      const d = layoutClass(sc.thumb), cut = cutOf(sc), { vp } = sc;
      const list = chromeBoxes({ vp, d, caseUp: true, cut, cardH: sc.cardH, tests: sc.tests });
      const covers = (r: Box) => list.some((b) => b.x0 <= r.x0 + 0.5 && b.y0 <= r.y0 + 0.5 && b.x1 >= r.x1 - 0.5 && b.y1 >= r.y1 - 0.5);
      if (!sc.thumb) {
        const top = vp.safe.top + topBarH(vp, d) + 8;
        assert.ok(covers({ x0: 12, y0: top, x1: 412, y1: top + sc.cardH }), `${sc.name}: the stop card is a keep-out`);
        assert.ok(covers({ x0: 12, y0: 796, x1: 1428, y1: 888 }), `${sc.name}: the case bar of the capture is a keep-out`);
      } else {
        assert.ok(covers({ x0: 8, y0: cut.kind === 'foot' ? cut.y : 0, x1: vp.w - 8, y1: vp.h - vp.safe.bottom }), `${sc.name}: the sheet and the foot are a keep-out`);
      }
      if (sc.tests) assert.ok(covers(rectToBox(sc.tests.rect)), `${sc.name}: the Tests card is a keep-out`);
      assert.deepEqual(chromeBoxes({ vp, d, caseUp: false, cut: null, cardH: 0, tests: null }), [], `${sc.name}: no case, no card: nothing`);
    }
  } finally { useCase.setState({ phase: 'off' }); }
});

test('the card on the way is as tall as the column it stands in', () => {
  const vp = { w: 1440, h: 900, safe: none }, d = layoutClass(false);
  const css = readFileSync('src/ui/case/case.css', 'utf8');
  assert.match(css, /\.cs-passing \{[^}]*top: calc\(var\(--top-safe, 56px\) \+ 8px \+ 104px\)[^}]*height: 96px/, 'case.css still puts it 104 px down and 96 high');
  assert.equal(CASE_TRAVEL_H, 104 + 96);
  const [b] = chromeBoxes({ vp, d, caseUp: false, cut: { kind: 'left', x: 412 }, cardH: CASE_TRAVEL_H, tests: null });
  assert.equal(b!.y1 - b!.y0, CASE_TRAVEL_H + 8);
});

for (const sc of SCREENS) {
  test(`${sc.name}: no name of the figure stands under the case's card, the Tests card or the case bar`, () => {
    useCase.setState({ phase: 'stop' });
    try {
      const { vp } = sc, d = layoutClass(sc.thumb), cut = cutOf(sc);
      const list = chromeBoxes({ vp, d, caseUp: true, cut, cardH: sc.cardH, tests: sc.tests });
      // the room the camera frames the figure in, as the shell sums it (case card first, then the Tests card)
      const room = panRoom(caseRoom(freeRoom(vp, d), cut), sc.tests);
      const rig = new CameraRig('play', room); rig.resize(vp.w, vp.h); rig.goTo('play', room, 0, 0); rig.update(0);
      const view = labelView(vp, BAR, sc.tests);
      let t = 1000;
      const deps = { now: () => t, project: (pt: Vector3, o: { x: number; y: number }) => rig.project(pt, o), cameraMoving: () => rig.isMoving, free: () => rectToBox(room), view: () => view, vp: () => vp, reversed: () => false, words: () => null, blockers: () => list, measure, pressure: () => 5, reading: () => null, cathere: () => 0, level: () => 'all' } as unknown as LabelDeps;
      const ctl = new LabelController(deps); ctl.setState({ ...NO_STATE, organNames: true });
      for (let i = 0; i < 120; i++) { t += 16; ctl.tick(); }
      assert.ok(ctl.out.length >= 3, `${ctl.out.length} names stand`);
      for (const dd of ctl.out) {
        const box: Box = { x0: dd.x, y0: dd.y, x1: dd.x + dd.w, y1: dd.y + dd.h };
        for (const b of list) assert.ok(!hits(box, b), `${sc.name}: ${dd.id} stands under a keep-out ${JSON.stringify(b)}: ${JSON.stringify(box)}`);
      }
      void V3;
    } finally { useCase.setState({ phase: 'off' }); }
  });
}

test('the claims list tells its listeners only when it changes', () => {
  let n = 0;
  const off = chromeClaims.subscribe(() => { n++; });
  chromeClaims.set([{ x0: 1, y0: 2, x1: 3, y1: 4 }]);
  chromeClaims.set([{ x0: 1, y0: 2, x1: 3, y1: 4 }]);
  assert.equal(n, 1);
  chromeClaims.set([]);
  assert.equal(n, 2);
  off();
});

// The general rule: EVERY writer of words on the figure keeps off the one list, and places again when it changes. A new writer that builds its own list is the bug this pins.
const WRITERS: [string, number, boolean][] = [
  ['src/scene/labels/LabelLayer.tsx', 2, true],
  ['src/scene/circuit/CircuitCaptions.tsx', 1, true],
  ['src/scene/lobule/LobuleCaptions.tsx', 1, true],
  ['src/scene/devices/probes/cards.ts', 1, false],
];
for (const [file, lists, listens] of WRITERS) {
  test(`${file} keeps off the app's chrome (the shared list)`, () => {
    const src = readFileSync(file, 'utf8');
    assert.ok((src.match(/chromeClaims\.boxes/g) ?? []).length >= lists, `reads the list ${lists} time(s)`);
    if (listens) assert.match(src, /chromeClaims\.subscribe/, 'and places again when it changes');
  });
}

test('the shell writes the list, and the case publishes its card\'s height for it', () => {
  assert.match(readFileSync('src/ui/shell/Shell.tsx', 'utf8'), /useChromeClaims\(thumb\)/);
  const writer = readFileSync('src/ui/shell/chrome-claims-writer.ts', 'utf8');
  for (const need of [/useTestsRoom\.subscribe/, /useCaseRoom\.subscribe/, /useCase\.subscribe/, /readUiWalls/]) assert.match(writer, need);
  assert.match(readFileSync('src/ui/case/CaseUi.tsx', 'utf8'), /useCaseRoom\.setState\(\{ cardH \}\)/);
});
