// B13c: a 2D slide's camera becomes a 3D shot by arithmetic on the shared frame, and every camera form the decks use places.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { place, boxOf, shotOfBox, camProblems, namesBox, toX, toY, TARGET_Z, MIN_HALF } from '../src/decks/rw/cams.ts';
import { registerShots, shotName } from '../src/decks/rw/plan.ts';
import { SHOTS } from '../src/scene/camera/shots.ts';
import { lobuleShot, sinusoidShot } from '../src/scene/lobule/shots.ts';
import { REGIONS_2D } from '../src/decks/rw/copied/plate.ts';
import { RW_IDS, built } from './decks-rw-helpers.ts';

test('the shared frame: CONF (700, 556) is the origin, 300 plate units a scene unit, y up', () => {
  assert.equal(toX(700), 0); assert.equal(toY(556), 0);
  assert.equal(toX(1000), 1); assert.equal(toY(256), 1);
});

test('a region is framed as the 2D camera frames it: its centre is the target, its half extents the shot\'s', () => {
  const b = REGIONS_2D.portal!;   // [520, 360, 930, 710]
  const s = shotOfBox(b);
  assert.ok(Math.abs(s.target[0] - toX((520 + 930) / 2)) < 1e-9);
  assert.ok(Math.abs(s.target[1] - toY((360 + 710) / 2)) < 1e-9);
  assert.equal(s.target[2], TARGET_Z);
  assert.ok(Math.abs(s.half[0] - (410 / 2) / 300) < 1e-9 || s.half[0] === MIN_HALF);
  assert.ok(s.half[0] >= MIN_HALF && s.half[1] >= MIN_HALF);
});

test('"fit" and no camera are the free-play shot; a box, a region and a list of regions are body shots', () => {
  const shotOf = (c: Parameters<typeof place>[0]) => { const p = place(c); return p.view === 'circuit' ? null : p.shot; };
  assert.equal(shotOf('fit'), SHOTS.play);
  assert.equal(shotOf(undefined), SHOTS.play);
  const u = place(['splenic', 'portal']);
  assert.equal(u.view, 'body');
  const box = boxOf(['splenic', 'portal'])!;
  assert.deepEqual(box, [520, 230, 1110, 710]);
  const raw = place([500, 300, 880, 520]);
  assert.deepEqual(raw.view === 'body' && raw.box, [500, 300, 880, 520]);
});

test('the lobule and sinusoid cameras are the scene\'s own shots, so the views open as the 2D app\'s do', () => {
  for (const c of ['lobule', 'lobule:fit', 'lobule:triad', 'lobule:sinusoid', 'lobule:central'] as const) {
    const p = place(c);
    assert.equal(p.view, 'lobule');
    assert.deepEqual(p.view === 'lobule' && p.shot, lobuleShot(c));
  }
  const p = place('sinusoid');
  assert.deepEqual(p.view === 'sinusoid' && p.shot, sinusoidShot());
});

test('{ on: [names] } frames what the names point at: a vessel\'s whole course, grown a little; a name that points at nothing is refused', () => {
  const { box, unknown } = namesBox(['PVH_R']);
  assert.deepEqual(unknown, []);
  const p = place({ on: ['PVH_R'] });
  assert.equal(p.view, 'body');
  const b = p.view === 'body' ? p.box! : [0, 0, 0, 0];
  assert.ok(b[0] <= box![0] && b[1] <= box![1] && b[2] >= box![2] && b[3] >= box![3], 'the camera box holds the vessel');
  assert.ok(b[2] - b[0] >= 80, 'a lone thin vessel still gets room');
  assert.deepEqual(namesBox(['NOT_A_VESSEL']).unknown, ['NOT_A_VESSEL']);
  assert.throws(() => place({ on: ['NOT_A_VESSEL'] }), /NOT_A_VESSEL/);
  assert.ok(camProblems('no-such-region').length);
  assert.ok(camProblems([10, 10, 5, 5]).length);
  assert.ok(camProblems({ on: ['PV_TRUNK'], near: 'nowhere' }).length);
});

test('a Circuit slide names a Circuit region and the Circuit batch frames it', () => {
  const p = place('series', 'circuit');
  assert.equal(p.view, 'circuit');
  assert.deepEqual(p.view === 'circuit' && p.region, 'series');
  assert.throws(() => place('route', 'circuit'), /Circuit region/);
});

for (const id of RW_IDS) {
  test(`${id}: every slide's camera places, and its shot is registered under its own name`, () => {
    const d = built(id);
    registerShots(d);
    for (const s of d.slides) {
      assert.ok(SHOTS[s.shot as keyof typeof SHOTS], `${s.shot} not registered`);
      assert.equal(s.shot, shotName(id, s.id));
      const sh = SHOTS[s.shot as keyof typeof SHOTS];
      for (const v of [...sh.target, ...sh.half, sh.r, sh.yaw, sh.pitch]) assert.ok(Number.isFinite(v), `${s.shot} has a non-number`);
      assert.ok(sh.half[0] > 0 && sh.half[1] > 0);
    }
  });
}
