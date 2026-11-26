// Every catheter, tube, wire and scope bends smoothly (owner, 26 Nov 2026: the Sengstaken-Blakemore tube turned into the stomach at the GE junction in an acute kink; "real catheters ... don't kink like that").
// Root cause: each device laid its own path from its anatomy's waypoints and none had to answer for how sharply it turned (the tamponade tube's 2D bend was 16 figure units, 20 tube radii; BRTO's and BATO's route
// turned within about 1.5 shaft radii at the renal vein and the shunt). The rule is now ONE: a device has a minimum bend radius (bend-path.ts DEVICE_BEND_RADII, in its own shaft radii) and every path goes
// through `limitBend`. This test walks every device's path as the scene draws it and fails if any stretch turns more tightly than its device's radius. A device kind with no sampler here fails the test, so a new
// device cannot be added without its path being walked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { organsReady, setOrganData } from '../src/scene/organs/meshes.ts';
import { DEVICE_BEND_RADII, type DeviceKind, type V3, arcOf, bendWindow, filletPath, limitBend, minBendRadius } from '../src/scene/devices/bend-path.ts';
import { route3d } from '../src/scene/procedures/route3d.ts';
import { ROUTE_KINDS } from '../src/scene/procedures/route.ts';
import { scopeWay, glueScopeWay, scopeZ, wayShift, SCOPE_SLIM } from '../src/scene/devices/probes/scope.ts';
import { TUBE_MIN_BEND, TUBE_R, tubeLine, lineSceneSamples } from '../src/scene/devices/balloons/tamponade-path.ts';
import { tubePath } from '../src/scene/procedures/copied/balloon-gas.js';
import { UNITS_PER_SCENE, len3, x3, y3 } from '../src/scene/frame2d.ts';

const file = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);

/** A path may measure this much under its device's radius (the window's own rounding): the limiter stops at 0.97 of it and the scene's depth and shift add a little. */
const SLACK = 0.9;

interface Walked { name: string; shaft: number; points: V3[] }
/** Each device kind's paths as the scene draws them, with the shaft radius they are measured in (scene units). */
const SAMPLERS: Record<DeviceKind, () => Promise<Walked[]> | Walked[]> = {
  catheter: () => ROUTE_KINDS.map((kind) => {
    const r3 = route3d(kind)!, step = 1.2, points: V3[] = [];
    for (let d = 0; d <= r3.route.free; d += step) { const v = r3.point(d, new Vector3()); points.push([v.x, v.y, v.z]); }
    return { name: `the ${kind} catheter`, shaft: r3.rc, points };
  }),
  scope: async () => {
    await organsReady;
    const R = len3(6) * SCOPE_SLIM;
    return [['the echoendoscope', scopeWay()], ['the glue slide scope', glueScopeWay()]].map(([name, way]) => ({
      name: name as string, shaft: R,
      points: (way as ReturnType<typeof scopeWay>).pts.map((p) => { const y = y3(p[1]), x = x3(p[0]) + wayShift(y); return [x, y, scopeZ(x, y)] as V3; }),
    }));
  },
  tamponade: async () => { await organsReady; return [{ name: 'the Blakemore tube', shaft: TUBE_R / UNITS_PER_SCENE, points: lineSceneSamples(tubeLine()) }]; },
};

for (const kind of Object.keys(DEVICE_BEND_RADII) as DeviceKind[]) {
  test(`every ${kind} path bends no tighter than ${DEVICE_BEND_RADII[kind]} shaft radii`, async () => {
    const walked = await SAMPLERS[kind]();
    assert.ok(walked.length > 0, `no ${kind} paths walked`);
    for (const w of walked) {
      const R = DEVICE_BEND_RADII[kind] * w.shaft, m = minBendRadius(w.points, bendWindow(w.points, R));
      assert.ok(m.radius >= R * SLACK, `${w.name}: tightest bend ${(m.radius / w.shaft).toFixed(1)} shaft radii at sample ${m.at} of ${w.points.length}, the least is ${DEVICE_BEND_RADII[kind]}`);
    }
  });
}

test('the test bites: the 2D app\'s own tube path (the acute kink at the GE junction) is tighter than the tube\'s radius', async () => {
  await organsReady;
  const raw = (tubePath() as { pts: [number, number][] }).pts.map(([x, y]) => [x3(x) + wayShift(y3(y)), y3(y), scopeZ(x3(x), y3(y))] as V3);
  const R = TUBE_MIN_BEND / UNITS_PER_SCENE, m = minBendRadius(raw, bendWindow(raw, R));
  assert.ok(m.radius < R * SLACK, `the raw path's tightest bend is ${(m.radius / (TUBE_R / UNITS_PER_SCENE)).toFixed(0)} radii, under the ${DEVICE_BEND_RADII.tamponade}`);
});

test('limitBend rounds a right-angle elbow to the radius, keeps its ends and its samples, and leaves a straight path alone', () => {
  const elbow: V3[] = [];
  for (let i = 0; i <= 40; i++) elbow.push([i * 0.5, 0, 0]);
  for (let i = 1; i <= 40; i++) elbow.push([20, i * 0.5, 0]);
  const before = minBendRadius(elbow, bendWindow(elbow, 6)).radius;
  const out = limitBend(elbow, { minR: 6 });
  assert.equal(out.length, elbow.length);
  assert.deepEqual(out[0], elbow[0]); assert.deepEqual(out[out.length - 1], elbow[elbow.length - 1]);
  const after = minBendRadius(out, bendWindow(elbow, 6)).radius;
  assert.ok(before < 3 && after >= 6 * 0.9, `elbow radius ${before.toFixed(2)} became ${after.toFixed(2)} (wanted 6)`);
  const line: V3[] = Array.from({ length: 30 }, (_, i) => [i, 2 * i, 0.5 * i]);
  assert.deepEqual(limitBend(line, { minR: 50 }), line);
});

test('limitBend keeps each sample within its room and where it is allowed, and the rounded path has no step', () => {
  const elbow: V3[] = [];
  for (let i = 0; i <= 40; i++) elbow.push([i * 0.5, 0, 0]);
  for (let i = 1; i <= 40; i++) elbow.push([20, i * 0.5, 0]);
  const out = limitBend(elbow, { minR: 6, room: 3, allow: (_i, p) => p[1] > -0.5 });
  out.forEach((p, i) => { assert.ok(Math.hypot(p[0] - elbow[i]![0], p[1] - elbow[i]![1], p[2] - elbow[i]![2]) <= 3 + 1e-9, `sample ${i} left its room`); assert.ok(p[1] > -0.5, `sample ${i} went where it may not`); });
  // (the move ramps in and out: no two neighbouring samples are further apart than the samples were, plus a little)
  for (let i = 1; i < out.length; i++) assert.ok(Math.hypot(out[i]![0] - out[i - 1]![0], out[i]![1] - out[i - 1]![1]) < 0.5 * 1.35, `a step of ${(i)} in the rounded path`);
  // a bend that cannot be rounded for want of room is left as round as the room allows, never worse than it was
  const tight = limitBend(elbow, { minR: 6, room: 0 });
  assert.deepEqual(tight, elbow);
  assert.ok(minBendRadius(out, 2).radius > minBendRadius(elbow, 2).radius, 'rounder than it was');
});

test('filletPath rounds each corner with an exact arc of the radius asked, in three dimensions, and starts and ends on the corners\' own legs', () => {
  // a corner turning 40 degrees, with a turn out of the plane
  const corner: V3[] = [[0, 0, 0], [0, -10, 0], [4, -18, 3]];
  const out = filletPath(corner, 8, 0.25);
  assert.deepEqual(out[0], corner[0]); assert.deepEqual(out[out.length - 1], corner[2]);
  const m = minBendRadius(out, 1.5).radius;
  assert.ok(m > 8 * 0.9 && m < 8 * 1.1, `the arc's radius ${m.toFixed(2)} is the 8 asked`);
  // the path is smooth: no step bigger than the sampling asked, and its length is shorter than the corner's two legs (it cuts the corner)
  const arc = arcOf(out);
  for (let i = 1; i < out.length; i++) assert.ok(arc[i]! - arc[i - 1]! < 0.5, 'a step of the sampling');
  assert.ok(arc[arc.length - 1]! < 10 + Math.hypot(4, 8, 3), 'the corner is cut');
  // where the legs are too short for the radius it rounds less, never overshoots a leg
  const tight = filletPath([[0, 0, 0], [0, -2, 0], [3, -3, 0]], 8, 0.1);
  assert.ok(tight.every((p) => p[1] <= 1e-9 && p[1] >= -3 - 1e-9), 'inside the legs');
});
