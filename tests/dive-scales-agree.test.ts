// The zoom from the lobule to the sinusoid is ONE continuous move (Mohammad, 27 Nov: "zoom from anatomy to lobule to sinusoid, anatomy to sinusoid, and every zoom out should feel like one continuous zoom; now the lobule
// disappears and the sinusoid view appears"). The root cause was two layouts: the lobule's sinusoids lay about 90 µm apart and angled, the view's 38 µm and parallel, so at the handoff everything but the target lumen
// changed in place. The rule pinned here: the station is found by RULE on the lobule's own sinusoids, the sinusoid view's row spacing is the one number the station's gap is measured in, and the 3D lobule grows the
// view's own rows round the station so every lumen the view draws already lies on a lobule sinusoid, and the plates stand where the view's do.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLobule, hexFrac, zoneOf } from '../src/scene/lobule/geometry.ts';
import { PARALLEL_DEG, UM_PER_LOCAL, placedSinusoidStation } from '../src/scene/lobule/station.ts';
import { LOBULE_SCALE, SIN_ANGLE, SIN_LOCAL, SIN_SCALE, sinusoidLocal, sinusoidWorld } from '../src/scene/lobule/frames.ts';
import { LOBULE_R, sinusoidRoll, lobuleShot, sinusoidShot } from '../src/scene/lobule/shots.ts';
import { PORTRAIT_ROLL } from '../src/scene/sinusoid/portrait.ts';
import { PERIOD, UM } from '../src/scene/sinusoid/layout.ts';
import { BEYOND, PERIOD as PERIOD_3D } from '../src/scene/micro3d/sinusoid3d.ts';
import { COVER_DEG, COVER_UM, FINE_REACH, FINE_FROM, FINE_TO, fineBands, fineCourses, fineRows, fineShare, nearestSinusoid, sinusoidSegments, viewToLobule, UM_LOCAL, type Seg2 } from '../src/scene/micro3d/lobule-fine.ts';
import { FOV, lensDistance } from '../src/scene/camera/shots.ts';

const net = buildLobule(7);
const FAR = 2.5 * LOBULE_SCALE, NEAR = 3 * SIN_SCALE;
/** The camera's distance (scene units) at a dive share: the shot's r runs geometrically from FAR to NEAR (rig.ts blendPose), and the lens turns r into a distance. */
const distAt = (share: number): number => lensDistance(FAR * Math.pow(NEAR / FAR, share));

test('the row spacing is set in one place, and a plate is one cell thick', () => {
  assert.equal(PERIOD_3D, PERIOD, 'the 3D sinusoid reads layout.ts\'s spacing');
  assert.ok(UM.hep >= 20 && UM.hep <= 25, `a hepatocyte is 20 to 25 µm (${UM.hep})`);
  assert.ok(Math.abs(PERIOD - (UM.hep + 2 * (UM.disse + UM.endo) + 2 * UM.lum)) < 1e-9, 'one plate, Disse, lining, lumen, lining, Disse');
});

test('the station is chosen by rule: zone 2, along the view\'s axis, parallel neighbours either side about two spacings away; the constants are the rule\'s answer', () => {
  const s = placedSinusoidStation(net)!;
  assert.ok(s, 'a place satisfies the rule');
  assert.ok(Math.hypot(SIN_LOCAL[0] - s.x, SIN_LOCAL[1] - s.y) < 1e-4, `SIN_LOCAL is the rule's place (${s.x}, ${s.y}): put these in frames.ts`);
  assert.ok(Math.abs(SIN_ANGLE - s.angle) < 1e-4, `SIN_ANGLE is the rule's flow direction (${s.angle})`);
  assert.equal(zoneOf(hexFrac(s.x / LOBULE_R, -s.y / LOBULE_R)), 2, 'zone 2');
  assert.ok(s.turnLeft <= PARALLEL_DEG && s.turnRight <= PARALLEL_DEG, `neighbours parallel to within ${PARALLEL_DEG} degrees (${s.turnLeft.toFixed(1)}, ${s.turnRight.toFixed(1)})`);
  assert.ok(Math.abs(s.gapLeft - s.gapRight) < 0.25 * (s.gapLeft + s.gapRight) / 2, `the two gaps are even (${s.gapLeft.toFixed(0)} and ${s.gapRight.toFixed(0)} µm)`);
  for (const g of [s.gapLeft, s.gapRight]) assert.ok(Math.abs(g - 2 * PERIOD) < 0.35 * 2 * PERIOD, `a gap (${g.toFixed(0)} µm) is about two row spacings (${(2 * PERIOD).toFixed(0)} µm)`);
  // and the scale the gaps are in is the one the frames use
  assert.ok(Math.abs(UM_PER_LOCAL * UM_LOCAL - 1) < 1e-12);
});

test('the view\'s flow is the lobule\'s flow at the station: the frame is turned to the course, and the camera rolls with it on every screen', () => {
  const c = net.courses.find((q) => q.id === 78)!;
  // (the course's own direction at the station, in the lobule's local frame, y up)
  let best = Infinity, ang = 0;
  c.pts.forEach((p, i) => {
    if (i === 0 || i === c.pts.length - 1) return;
    const d = Math.hypot(p[0] * LOBULE_R - SIN_LOCAL[0], -p[1] * LOBULE_R - SIN_LOCAL[1]);
    if (d < best) { best = d; const a = c.pts[i - 1]!, b = c.pts[i + 1]!; ang = Math.atan2(-(b[1] - a[1]), b[0] - a[0]); }
  });
  assert.ok(best < 0.01, `the station is on course 78 (off by ${best})`);
  const turn = Math.abs(((SIN_ANGLE - ang + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
  assert.ok(turn < (3 * Math.PI) / 180, `the view's +x runs with the blood (${((turn * 180) / Math.PI).toFixed(1)} degrees off)`);
  // the view's x axis, mapped into the lobule, points along the course's flow (portal to central)
  const o = sinusoidLocal([0, 0, 0]), a = sinusoidLocal([1, 0, 0]);
  assert.ok(Math.cos(Math.atan2(a[1] - o[1], a[0] - o[0]) - ang) > 0.998);
  // the scene's frame carries the same angle, and the camera's roll undoes it: the portal end is on the left of a wide screen and at the top of a tall one
  const w0 = sinusoidWorld([0, 0, 0]), w1 = sinusoidWorld([1, 0, 0]);
  assert.ok(Math.abs(Math.atan2(w1[1] - w0[1], w1[0] - w0[0]) - SIN_ANGLE) < 1e-9, 'the scene frame is turned by SIN_ANGLE');
  assert.equal(sinusoidRoll(false), SIN_ANGLE);
  assert.ok(Math.abs(sinusoidRoll(true) - (SIN_ANGLE + PORTRAIT_ROLL)) < 1e-12);
  assert.equal(sinusoidShot(false).roll, SIN_ANGLE); assert.ok(Math.abs(sinusoidShot(true).roll! - (SIN_ANGLE + PORTRAIT_ROLL)) < 1e-12);
  assert.equal(lobuleShot('lobule').roll, undefined, 'the lobule is not rolled: the dive turns the picture the short way (rig.ts rollOf)');
  assert.ok(Math.abs(SIN_ANGLE) <= Math.PI, 'the shorter way round');
});

/** A segment list of the lobule's own sinusoids and the fine rows the lobule adds, as the picture has them. */
function drawnSinusoids(): Seg2[] {
  const segs = sinusoidSegments(net);
  for (const c of fineCourses(net)) for (let i = 0; i + 1 < c.pts.length; i++) {
    const a = c.pts[i]!, b = c.pts[i + 1]!, ax = a[0] * LOBULE_R, ay = -a[1] * LOBULE_R, bx = b[0] * LOBULE_R, by = -b[1] * LOBULE_R;
    segs.push({ ax, ay, bx, by, a: Math.atan2(by - ay, bx - ax) });
  }
  return segs;
}

test('every lumen the sinusoid view draws lies on a sinusoid of the lobule (its own or a row it grows) within 3 µm and 3 degrees, over the length on screen at the handoff', () => {
  const segs = drawnSinusoids();
  // (the length on screen at the first share the view is drawn, 0.25, on a wide screen: the half height the lens frames at that distance, over the lumen's size in the scene, times the aspect)
  const half = (distAt(0.25) * Math.tan((FOV * Math.PI) / 360) * 1.8) / (UM_LOCAL * LOBULE_SCALE);
  assert.ok(half > 40 && half < FINE_REACH, `the stretch on screen (${half.toFixed(0)} µm each way) is inside the rows' reach (${FINE_REACH})`);
  const flow = SIN_ANGLE;
  let rows = 0;
  for (let k = -BEYOND; k <= BEYOND; k++) {
    rows++;
    for (let x = -half; x <= half; x += 5) {
      const p = viewToLobule(x, k * PERIOD), d = nearestSinusoid(segs, p[0], p[1], flow, COVER_DEG);
      assert.ok(d <= COVER_UM + 1e-6, `row ${k} at ${x.toFixed(0)} µm is ${d.toFixed(2)} µm from a drawn sinusoid`);
    }
  }
  assert.equal(rows, 2 * BEYOND + 1, 'the main sinusoid and BEYOND rows each side');
  // the rows the lobule already had are not drawn twice: where a lobule sinusoid lies on a row, the row adds nothing there
  const all = fineRows(net), added = all.reduce((n, r) => n + r.runs.length, 0), whole = all.filter((r) => r.runs.length === 1 && r.runs[0]!.length === 2 * (FINE_REACH / 5) + 1).length;
  assert.ok(added > 0 && whole < all.length, 'some stretch of the station\'s own sinusoid is already the lobule\'s: not redrawn');
  const p0 = viewToLobule(0, 0);
  assert.ok(nearestSinusoid(sinusoidSegments(net), p0[0], p0[1], flow) <= COVER_UM, 'the station is on the lobule\'s own sinusoid');
});

test('the plates stand where the view lays them: the bands the lobule grows are the view\'s own, one cell thick, between its rows', () => {
  const bands = fineBands();
  assert.equal(bands.length, 2 * (BEYOND + 1), 'the main plate each side and BEYOND plates each side');
  for (const b of bands) {
    const lo = b.face(0), hi = lo + UM.hep;
    assert.ok(Math.abs(lo - (UM.lum + UM.endo + UM.disse + b.r * PERIOD)) < 0.5, `band ${b.k}: the plate's face is a lumen, a lining and Disse from its row's axis`);
    assert.ok(hi < (b.r + 1) * PERIOD - UM.lum, 'and its far face is short of the next row\'s lumen');
  }
});

test('the new rows are not there at the lobule\'s framing, are whole by 0.45 of the dive, and are one function of the camera\'s distance (going in is coming out)', () => {
  for (const h of [375, 667, 900, 1366]) {
    assert.equal(fineShare(lensDistance(6 * LOBULE_SCALE), h, FOV), 0, `${h} px tall: none at the lobule's own framing`);
    assert.equal(fineShare(lensDistance(2.5 * LOBULE_SCALE), h, FOV), 0, `${h} px tall: none at the station's framing (share 0)`);
    assert.equal(fineShare(distAt(0.45), h, FOV), 1, `${h} px tall: whole by 0.45`);
    let prev = 0;
    for (let s = 0; s <= 1.0001; s += 0.02) { const v = fineShare(distAt(Math.min(1, s)), h, FOV); assert.ok(v >= prev - 1e-12, 'never fades back as the camera comes in'); prev = v; }
  }
  // (a function of the distance alone: the same value at the same distance whichever way the camera is going)
  assert.equal(fineShare(1.234e-3, 900, FOV), fineShare(1.234e-3, 900, FOV));
  assert.ok(FINE_FROM < FINE_TO);
  // nearly whole as the view starts to come in (0.3 of the dive is where its parts begin to grow, sinusoid3d REVEAL_FROM), whole by 0.4: nothing arrives later but the view's own detail
  assert.ok(fineShare(distAt(0.3), 900, FOV) > 0.75 && fineShare(distAt(0.35), 900, FOV) > 0.95 && fineShare(distAt(0.4), 900, FOV) === 1);
});

import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import { stationTile, tileColours } from '../src/scene/lobule/tile-colours.ts';
import { LOOK_IDS } from '../src/looks/looks.ts';

test('the sinusoid view\'s hepatocyte is the colour of the lobule\'s tile at the station, in every look (one rule: lobule/tile-colours.ts)', () => {
  for (const look of LOOK_IDS) {
    const v = new SinusoidView(createShared(), { look });
    const P = v.colours(tileColours(look).dark) as { cCell: number[] }, want = stationTile(look);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(P.cCell[i]! - want[i]!) < 1e-9, `${look}: channel ${i} (${P.cCell[i]} against ${want[i]})`);
    // (and it is the lobule's tile: the cord's tone for zone 2 over the ground, as the lobule's own cells and the fine rows' plates are painted)
    const tc = tileColours(look), q = hexFrac(SIN_LOCAL[0] / LOBULE_R, -SIN_LOCAL[1] / LOBULE_R);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(tc.tile(q, 0.5)[i]! - want[i]!) < 1e-9);
  }
});

test("the slide's 'lobule:sinusoid' camera frames the place the sinusoid view stands (one station for the slide and the dive)", async () => {
  const { lobuleShot } = await import('../src/scene/lobule/shots.ts');
  const { SIN_POINT } = await import('../src/scene/lobule/frames.ts');
  const t = lobuleShot('lobule:sinusoid').target;
  assert.ok(Math.hypot(t[0] - SIN_POINT[0], t[1] - SIN_POINT[1]) < 1e-12);
});
