// Every bleed leaves the vein that is bleeding, and the blood in the stomach is a volume (Mohammad, 26 Nov, Play the case, stop 2, the gastric varix bleed: "the fundal varices are not bleeding from the actual vessel, also the
// stomach is too full of blood"). Root causes: (1) the tear was the 2D app's point, but the 3D placement moves every vessel, so the fundal loops crest 10 units below it, and the stream rode on the stomach's front wall while the vein lies
// 0.2 deep inside it (the 14 degree view turns that gap into a sideways shift); (2) the pool's fill was the square root of the blood's share of the stomach, doubling a small bleed. The rules are general, so they are judged for every site.
(globalThis as { location?: unknown }).location = { search: '', pathname: '/', hostname: 'localhost' };
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLACED_PATH_2D, PLACED_Z } from '../src/scene/anatomy/placed-network.ts';
import { PLACED_VESSELS } from '../src/scene/anatomy/placement.generated.ts';
import { streamZ, lumenClearance } from '../src/scene/disease/lumen.ts';
import { VARIX_COURSE, STREAM_MARGIN, TEAR_DEPTH_EASE, nearestOnCourse, inwardTo, streamDepth, tearAt, tearOf, fitStream, type BleedSite } from '../src/scene/disease/stream-fit.ts';
import { tearPoint } from '../src/scene/disease/tear.ts';
import { poolFill, PUDDLE_FILL, STOMACH_BLOOD_ML } from '../src/scene/disease/targets.ts';
import { POOL_FULL, poolShare, poolSurfaceY } from '../src/scene/organs/pool-level.ts';
import { LUMEN, LUMEN_AREA, STO_Y0, STO_DY, STO_N } from '../src/scene/disease/copied/stomach-lumen.js';

const SITES: BleedSite[] = ['VAR', 'GV'];

/** The drawn course of a site's varix vessel(s): the points and the depth at each. */
function courseOf(site: BleedSite): { pts: [number, number][]; zs: number[]; r: number } {
  const pts: [number, number][] = [], zs: number[] = [];
  let r = 0;
  for (const id of VARIX_COURSE[site]) { PLACED_PATH_2D[id]!.forEach((p, i) => { pts.push([p[0], p[1]]); zs.push(PLACED_Z[id]![i]!); }); r = Math.max(r, PLACED_VESSELS[id]!.r); }
  return { pts, zs, r };
}
/** How far a point is from the nearest point of the course (figure units). */
const farFrom = (c: { pts: [number, number][]; zs: number[] }, x: number, y: number): number => { const n = nearestOnCourse(c.pts, c.zs, [x, y]); return Math.hypot(n.x - x, n.y - y); };

test('nearestOnCourse: the nearest point of a course is on it, between its points, with its depth interpolated', () => {
  const n = nearestOnCourse([[0, 0], [10, 0], [10, 10]], [0, 1, 3], [4, 5]);
  assert.deepEqual([n.x, n.y, n.z], [4, 0, 0.4], 'on the first segment, 4 along, 0.4 of the way in depth');
  const e = nearestOnCourse([[0, 0], [10, 0], [10, 10]], [0, 1, 3], [30, 30]);
  assert.deepEqual([e.x, e.y, e.z], [10, 10, 3], 'past an end it is the end');
});

test('every site\'s tear is on its own varix vessel as the 3D figure draws it, whatever the 2D app\'s point was', () => {
  for (const site of SITES) {
    const c = courseOf(site), [x, y] = tearOf(site);
    // (the gastric loops stand 10 units below the 2D app's tear: it was far off the vein, which the figure showed as a stream floating between the loops)
    const slide = Math.abs(inwardTo(farOn(c, x, y).x, y, STREAM_MARGIN) - farOn(c, x, y).x);
    const reach = c.r * 300 + slide + 1;
    assert.ok(farFrom(c, x, y) <= reach, `${site}: the tear is ${farFrom(c, x, y).toFixed(1)} from the vein, wants at most ${reach.toFixed(1)}`);
  }
  assert.ok(farFrom(courseOf('GV'), ...tearOf('GV')) < 1, 'the gastric varix lies inside the stomach with room: the tear is exactly on it');
  assert.deepEqual([...tearPoint('GV')], [...tearOf('GV')], 'the mark and the jet share it');
});

/** The point of the course nearest the tear's height: where the slide began. */
function farOn(c: { pts: [number, number][]; zs: number[] }, x: number, y: number): { x: number; y: number } { const n = nearestOnCourse(c.pts, c.zs, [x, y]); return { x: n.x, y: n.y }; }

test('the tear has the stream\'s room from the wall: inside the lumen', () => {
  for (const site of SITES) { const [x, y] = tearOf(site); assert.ok(lumenClearance(x, y) >= STREAM_MARGIN - 0.01, `${site} clear of the wall`); }
});

test('the stream is drawn at the vein\'s own surface at the tear and rides the organ\'s wall farther down', () => {
  for (const site of SITES) {
    const t = tearAt(site), c = courseOf(site);
    assert.ok(t.z >= Math.min(...c.zs) && t.z <= Math.max(...c.zs) + c.r + 1e-9, `${site}: the tear's depth is the vein's near surface`);
    assert.ok(Math.abs(streamDepth(site, t.x, t.y) - t.z) < 1e-9, `${site}: at the tear it is the vein's depth`);
    const far = streamDepth(site, t.x, t.y + TEAR_DEPTH_EASE), wall = streamZ(t.x, t.y + TEAR_DEPTH_EASE);
    assert.ok(Math.abs(far - wall) < 1e-9, `${site}: past the ease it is just in front of the wall`);
    let last = streamDepth(site, t.x, t.y);
    for (let d = 1; d <= TEAR_DEPTH_EASE; d++) {
      const z = streamDepth(site, t.x, t.y + d), w = streamZ(t.x, t.y + d), a = Math.min(t.z, w) - 1e-6, b = Math.max(t.z, w) + 1e-6;
      assert.ok(z >= a && z <= b, `${site}: between the vein and the wall at ${d}`);
      assert.ok(Math.abs(z - last) < 0.02, `${site}: no jump in depth at ${d}`);
      last = z;
    }
  }
});

test('the jet\'s fit starts at the tear on the vein, for every site', () => {
  for (const site of SITES) { const fit = fitStream(site, 50, poolSurfaceY(0.5)), [x, y] = tearOf(site); assert.deepEqual([fit.x0, fit.y0], [x, y]); }
});

// ---- the pool is a volume ----
/** The share of the lumen's area under a height (figure units). */
function shareUnder(y: number): number {
  let a = 0;
  for (let r = 0; r < STO_N; r++) {
    const top = STO_Y0 + r * STO_DY, bot = top + STO_DY, w = (LUMEN[r]![1] - LUMEN[r]![0]);
    a += w * Math.max(0, Math.min(bot, Math.max(top, bot)) - Math.max(top, y));
  }
  return a / LUMEN_AREA;
}

test('the pool grows in step with the blood lost: a share of what the stomach holds, never the square root of it', () => {
  assert.equal(poolFill(0), PUDDLE_FILL, 'a puddle at first');
  assert.equal(poolFill(STOMACH_BLOOD_ML), 1);
  assert.equal(poolFill(9 * STOMACH_BLOOD_ML), 1, 'never over the lumen');
  for (const ml of [200, 400, 600, 900, 1200]) {
    assert.ok(Math.abs(poolFill(ml) - ml / STOMACH_BLOOD_ML) < 1e-9, `${ml} mL fills ${ml / STOMACH_BLOOD_ML} of the stomach`);
    assert.ok(poolFill(ml) < Math.sqrt(ml / STOMACH_BLOOD_ML) - 0.05, `${ml} mL fills less than the 2D app's root rule`);
  }
  let last = 0;
  for (let ml = 0; ml <= 1600; ml += 50) { const f = poolFill(ml); assert.ok(f >= last, 'only more blood, more pool'); last = f; }
});

test('the pool shows the blood lost on a rise that tops out at half the lumen (the puddle unchanged)', () => {
  for (const ml of [300, 450, 600, 900, 1200]) {
    const drawn = shareUnder(poolSurfaceY(poolFill(ml)));
    assert.ok(Math.abs(drawn - poolShare(ml / STOMACH_BLOOD_ML)) < 0.04, `${ml} mL: the pool covers ${(drawn * 100).toFixed(0)}% of the lumen`);
  }
});

test('the cap: no bleed (any site, rate, blood lost) fills the stomach past half, and the level only eases', () => {
  assert.equal(POOL_FULL, 0.5);
  for (const ml of [0, 300, 750, 1500, 3000, 9000]) assert.ok(shareUnder(poolSurfaceY(poolFill(ml))) <= 0.5 + 0.02, `${ml} mL stays at or under half`);
  assert.ok(shareUnder(poolSurfaceY(1)) <= 0.5 + 0.02 && shareUnder(poolSurfaceY(1)) >= 0.45, 'full stands at half');
  assert.equal(poolShare(PUDDLE_FILL), PUDDLE_FILL, 'the puddle is where it was');
  let last = Infinity;
  for (let f = PUDDLE_FILL; f <= 1.0001; f += 0.02) { const y = poolSurfaceY(f); assert.ok(y <= last + 1e-9, 'no snap: the surface never drops back'); assert.ok(last === Infinity || last - y < 14, 'no jump between neighbouring fills'); last = y; }
  for (const site of SITES) for (const rate of [10, 50, 150]) { const fit = fitStream(site, rate, poolSurfaceY(1)); assert.ok(fit.yl >= poolSurfaceY(1) - 1e-6, `${site}@${rate}: the jet lands on the half-way surface`); }
});
