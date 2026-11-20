// With the Tests card up the figure is framed in the room left of it (or above the sheet) and its names stand there too: none under the card, none cut off at the screen's edge
// (Mac and phone play-tests, 19 Nov: "t hepatic vein", "Splenic vein 18.3" under the card, the body a thin strip with every label piled on it).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Vector3 } from 'three';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { LabelController, NO_STATE, type LabelDeps } from '../src/scene/labels/controller.ts';
import { hits, rectToBox, type Box } from '../src/scene/labels/geometry.ts';
import { labelView, placeBlockers } from '../src/scene/labels/room.ts';
import { PLATE_BOUNDS, FIGURE_Z } from '../src/scene/anatomy/placeholder.ts';
import { roomWith, type TestsPlace } from '../src/ui/tests/place.ts';
import { BAR } from '../src/ui/layout/plan.ts';
import { freeRoom, layoutClass } from '../src/ui/shell/room.ts';
import { Vector3 as V3 } from 'three';

const measure: LabelDeps['measure'] = (t, size, _w, track = 0) => t.length * size * 0.56 + track * t.length;
const place = (kind: 'side' | 'sheet', rect: { x: number; y: number; w: number; h: number }): TestsPlace => ({ kind, rect, maxH: rect.h, vars: { plot: 200, square: 220 }, focus: false, stops: null });

const SCREENS = [
  { name: 'mac', vp: { w: 1440, h: 900, safe: { top: 0, right: 0, bottom: 0, left: 0 } }, thumb: false, place: place('side', { x: 840, y: 64, w: 580, h: 740 }) },
  { name: 'iphone', vp: { w: 375, h: 812, safe: { top: 47, right: 0, bottom: 34, left: 0 } }, thumb: true, place: place('sheet', { x: 0, y: 470, w: 375, h: 340 }) },
];

for (const sc of SCREENS) {
  test(`${sc.name}: with the Tests card up the figure stands in the room left of it and the names stand there, clear of it`, () => {
    const { vp } = sc;
    const room = roomWith(freeRoom(vp, layoutClass(sc.thumb)), sc.place);
    const rig = new CameraRig('play', room); rig.resize(vp.w, vp.h); rig.goTo('play', room, 0, 0); rig.update(0);
    // the figure (the 2D plate's extent) is inside the room it was framed in
    const p = PLATE_BOUNDS;
    for (const [x, y] of [[p.x0, p.y0], [p.x1, p.y0], [p.x0, p.y1], [p.x1, p.y1]] as const) {
      const q = rig.project(new V3(x, y, FIGURE_Z), { x: 0, y: 0 });
      assert.ok(q.x >= room.x - 1 && q.x <= room.x + room.w + 1 && q.y >= room.y - 1 && q.y <= room.y + room.h + 1, `the plate's corner (${x.toFixed(1)}, ${y.toFixed(1)}) is at ${q.x.toFixed(0)},${q.y.toFixed(0)}, outside the room ${JSON.stringify(room)}`);
    }
    const view = labelView(vp, BAR, sc.place);
    const blockers = placeBlockers(sc.place);
    let t = 1000;
    const deps = { now: () => t, project: (pt: Vector3, o: { x: number; y: number }) => rig.project(pt, o), cameraMoving: () => rig.isMoving, free: () => rectToBox(room), view: () => view, vp: () => vp, reversed: () => false, words: () => null, blockers: () => blockers, measure, pressure: () => 5, reading: () => null, cathere: () => 0, level: () => 'all' } as unknown as LabelDeps;
    const ctl = new LabelController(deps); ctl.setState({ ...NO_STATE, organNames: true });
    for (let i = 0; i < 120; i++) { t += 16; ctl.tick(); }
    assert.ok(ctl.out.length >= 3, `${ctl.out.length} names stand`);
    for (const d of ctl.out) {
      const box: Box = { x0: d.x, y0: d.y, x1: d.x + d.w, y1: d.y + d.h };
      assert.ok(box.x0 >= view.x0 - 0.01 && box.x1 <= view.x1 + 0.01 && box.y0 >= view.y0 - 0.01 && box.y1 <= view.y1 + 0.01, `${d.id} left the view ${JSON.stringify(view)}: ${JSON.stringify(box)}`);
      for (const b of blockers) assert.ok(!hits(box, b), `${d.id} stands under the Tests card`);
    }
  });
}

test('the view is the room left of a side card, or above a sheet, 8 px clear of it; no card leaves it whole', () => {
  const vp = { w: 1440, h: 900, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
  assert.equal(labelView(vp, BAR, null).x1, 1440);
  assert.equal(labelView(vp, BAR, place('side', { x: 840, y: 64, w: 580, h: 740 })).x1, 832);
  assert.equal(labelView(vp, BAR, place('sheet', { x: 0, y: 470, w: 1440, h: 400 })).y1, 462);
});

test('the label layer uses them: its view and its blockers (and the slide cards\' own) know the Tests card, and it places the names again when the card comes or goes', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('src/scene/labels/LabelLayer.tsx', 'utf8');
  assert.ok(/view: \(\) => labelView\(ui\.getState\(\)\.vp, BAR, useTestsRoom\.getState\(\)\.place\)/.test(src));
  assert.ok((src.match(/placeBlockers\(useTestsRoom\.getState\(\)\.place\)/g) ?? []).length >= 2, 'both the names\' and the figure cards\' blockers');
  assert.ok(/useTestsRoom\.subscribe\(\(\) => \{ ctl\.markDirty\(\)/.test(src));
});
