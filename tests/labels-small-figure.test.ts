// The phone's figure: it fills the room the bars leave (no 160 px of empty screen above it), and with the Tests sheet up it is too small for its names, which then stand aside
// (Phone play-tests at 375 x 812, 20 Nov: the figure 130 px tall with the callouts huge and over each other, "16.6" over "Right sinusoids").
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { CameraRig } from '../src/scene/camera/rig.ts';
import { LabelController, NO_STATE, FIG_MIN_H, FIG_BACK, type LabelDeps } from '../src/scene/labels/controller.ts';
import { labelView, placeBlockers } from '../src/scene/labels/room.ts';
import { rectToBox } from '../src/scene/labels/geometry.ts';
import { PLATE_BOUNDS, FIGURE_Z } from '../src/scene/anatomy/placeholder.ts';
import { roomWith, testsPlace, type TestsPlace } from '../src/ui/tests/place.ts';
import { BAR } from '../src/ui/layout/plan.ts';
import { freeRoom, layoutClass } from '../src/ui/shell/room.ts';
import { FILL } from '../src/scene/camera/room.ts';

const measure: LabelDeps['measure'] = (t, size, _w, track = 0) => t.length * size * 0.56 + track * t.length;
const phone = { w: 375, h: 812, safe: { top: 47, right: 0, bottom: 34, left: 0 } };
// the sheet as the Tests card places it on this phone (Half: 520 px over the dock)
const sheet: TestsPlace = testsPlace(phone, 'phone-portrait', {});

function world(place: TestsPlace | null, state = NO_STATE) {
  const room = roomWith(freeRoom(phone, layoutClass(true)), place);
  const rig = new CameraRig('play', room); rig.resize(phone.w, phone.h); rig.goTo('play', room, 0, 0); rig.update(0);
  const mid = (PLATE_BOUNDS.x0 + PLATE_BOUNDS.x1) / 2, a = { x: 0, y: 0 }, b = { x: 0, y: 0 };
  const figureH = () => Math.abs(rig.project(new Vector3(mid, PLATE_BOUNDS.y0, FIGURE_Z), b).y - rig.project(new Vector3(mid, PLATE_BOUNDS.y1, FIGURE_Z), a).y);
  const view = labelView(phone, BAR, place), blockers = placeBlockers(place);
  let t = 1000;
  const deps = { now: () => t, project: (p: Vector3, o: { x: number; y: number }) => rig.project(p, o), cameraMoving: () => rig.isMoving, free: () => rectToBox(room), view: () => view, vp: () => phone, reversed: () => false, words: () => null, blockers: () => blockers, measure, pressure: () => 5, reading: () => null, cathere: () => 0, figureH } as unknown as LabelDeps;
  const ctl = new LabelController(deps); ctl.setState({ ...state, organNames: true });
  for (let i = 0; i < 120; i++) { t += 16; ctl.tick(); }
  return { room, rig, ctl, figureH };
}

test('in Anatomy the phone\'s figure fills the room\'s width, and never leaves more than 60 px empty above or below it', () => {
  const { room, rig, figureH } = world(null);
  const mid = (PLATE_BOUNDS.x0 + PLATE_BOUNDS.x1) / 2;
  const l = rig.project(new Vector3(PLATE_BOUNDS.x0, 0, FIGURE_Z), { x: 0, y: 0 }), r = rig.project(new Vector3(PLATE_BOUNDS.x1, 0, FIGURE_Z), { x: 0, y: 0 });
  assert.ok(r.x - l.x >= room.w * FILL * 0.9, `the plate is ${(r.x - l.x).toFixed(0)} px wide in a room ${room.w} px wide`);
  const top = rig.project(new Vector3(mid, PLATE_BOUNDS.y1, FIGURE_Z), { x: 0, y: 0 }).y, bottom = rig.project(new Vector3(mid, PLATE_BOUNDS.y0, FIGURE_Z), { x: 0, y: 0 }).y;
  assert.ok(top - room.y <= 60 && room.y + room.h - bottom <= 60, `empty above ${(top - room.y).toFixed(0)}, below ${(room.y + room.h - bottom).toFixed(0)}`);
  assert.ok(figureH() > FIG_BACK, 'a figure this size keeps its names');
});

test('with the Tests sheet up the phone\'s figure is too small for its names: only what the slide or the viewer asked for stands', () => {
  const free = world(null);
  assert.ok(free.ctl.out.filter((d) => d.alpha > 0.99).length >= 5, 'Anatomy has its names');
  const w = world(sheet);
  assert.ok(w.figureH() < FIG_MIN_H, `the figure is ${w.figureH().toFixed(0)} px tall with the sheet up`);
  assert.equal(w.ctl.out.filter((d) => d.alpha > 0.01).length, 0, 'no name stands over a figure that small');
  const named = world(sheet, { ...NO_STATE, named: new Set(['CONF']) });
  const ids = named.ctl.out.filter((d) => d.alpha > 0.99).map((d) => d.id);
  assert.deepEqual(ids, ['CONF'], 'a station the slide names still stands');
});

test('the names come back with a little margin (no flicker at the edge): hidden below FIG_MIN_H, back above FIG_BACK', () => {
  assert.ok(FIG_BACK > FIG_MIN_H);
  let h = 100;
  const t = 1000;
  const ctl = new LabelController({ now: () => t, project: (_p: Vector3, o: { x: number; y: number }) => o, cameraMoving: () => false, free: () => ({ x0: 0, y0: 0, x1: 1, y1: 1 }), view: () => ({ x0: 0, y0: 0, x1: 1, y1: 1 }), vp: () => phone, reversed: () => false, words: () => null, blockers: () => [], measure, pressure: () => 5, reading: () => null, cathere: () => 0, figureH: () => h } as unknown as LabelDeps);
  ctl.setState(NO_STATE);
  const count = () => { ctl.tick(); return ctl.active().length; };
  void count;
  const small = (hh: number) => { h = hh; ctl.tick(); return (ctl as unknown as { tiny: boolean }).tiny; };
  assert.equal(small(100), true);
  assert.equal(small(FIG_MIN_H + 10), true, 'between the two it keeps its last answer');
  assert.equal(small(FIG_BACK + 1), false);
  assert.equal(small(FIG_MIN_H + 10), false, 'and again');
  assert.equal(small(FIG_MIN_H - 1), true);
});

// ── names keep off every drawn vessel, not only the named ones' ──
import { figureCourses } from '../src/scene/labels/stations.ts';
import { crosses } from '../src/scene/labels/geometry.ts';

test('with every drawn vessel known to the solver the phone\'s names cross fewer vessels than with the named ones only (phone play-test: strokes through "Portal vein", "SMV", "Right hepatic vein")', () => {
  const room = roomWith(freeRoom(phone, layoutClass(true)), null);
  const run = (all: boolean) => {
    const rig = new CameraRig('play', room); rig.resize(phone.w, phone.h); rig.goTo('play', room, 0, 0); rig.update(0);
    let t = 1000;
    const deps = { now: () => t, project: (p: Vector3, o: { x: number; y: number }) => rig.project(p, o), cameraMoving: () => rig.isMoving, free: () => ({ x0: 0, y0: 0, x1: phone.w, y1: phone.h }), view: () => ({ x0: 0, y0: 56, x1: phone.w, y1: phone.h }), vp: () => phone, reversed: () => false, words: () => null, blockers: () => [], measure, pressure: () => 5, reading: () => null, cathere: () => 0, ...(all ? { drawn: (v: { kind: string }) => v.kind !== 'collateral' && v.kind !== 'shunt' } : {}) } as unknown as LabelDeps;
    const ctl = new LabelController(deps); ctl.setState({ ...NO_STATE, organNames: true });
    for (let i = 0; i < 120; i++) { t += 16; ctl.tick(); }
    const segs: number[][] = [];
    for (const c of figureCourses()) { if (c.v.kind === 'collateral' || c.v.kind === 'shunt') continue; let prev: { x: number; y: number } | null = null; for (const q of c.pts) { const a = rig.project(q, { x: 0, y: 0 }); if (prev) segs.push([prev.x, prev.y, a.x, a.y]); prev = { x: a.x, y: a.y }; } }
    return ctl.out.filter((d) => d.kind === 'station' && !d.id.startsWith('organ') && segs.some((s) => crosses(s[0]!, s[1]!, s[2]!, s[3]!, { x0: d.x, y0: d.y, x1: d.x + d.w, y1: d.y + d.h }))).map((d) => d.id);
  };
  const named = run(false), all = run(true);
  assert.ok(all.length < named.length, `crossing ${all.join(',')} against ${named.join(',')}`);
  assert.ok(all.length <= 2, `${all.join(',')}`);
});
