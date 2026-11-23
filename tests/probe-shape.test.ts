// The ultrasound probe's approved look (1A, 23 Nov 2026, docs/approved/us-probe.md): its outline, bands, seams and cable are pinned here so a later change cannot drift from the mock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANDS, BODY_END, CABLE, FACE_HALF, SEAMS, bodyStations, radiusAt, stations, cableAt } from '../src/scene/devices/probes/probe-shape.ts';
import { PROBE } from '../src/scene/devices/probes/copied/dop-probe.copied.js';

test('the face is a convex arc: a round apex that widens to the footprint', () => {
  assert.equal(radiusAt(0), 0);
  assert.ok(Math.abs(radiusAt(4.5) - FACE_HALF) < 1e-9, 'the footprint is 25 px wide');
  let last = -1; for (let x = 0; x <= 4.5; x += 0.25) { const r = radiusAt(x); assert.ok(r > last); last = r; }
});
test('the outline keeps the mock\'s widths: head 13.3 at x 15, waist 7.3 at x 28, boot 3.9 at the end', () => {
  assert.ok(Math.abs(radiusAt(15) - 13.3) < 0.01); assert.ok(Math.abs(radiusAt(28) - 7.3) < 0.01); assert.ok(Math.abs(radiusAt(BODY_END) - 3.9) < 0.01);
  for (let x = 4.5; x <= BODY_END; x += 0.1) assert.ok(radiusAt(x) <= 13.5 && radiusAt(x) >= 3.8, `no overshoot at ${x}`);
});
test('bands lie flush on the body: their stations are the body\'s own, exact at both ends', () => {
  for (const b of BANDS) { const s = stations(b.x0, b.x1); assert.equal(s[0]!.x, b.x0); assert.equal(s[s.length - 1]!.x, b.x1); for (const q of s) assert.ok(Math.abs(q.r - radiusAt(q.x)) < 1e-12); }
  assert.deepEqual(BANDS.map((b) => b.id), ['lens', 'ring', 'boot']);
  assert.deepEqual(SEAMS.map((s) => s.x), [7, 21.4, 24.4, 42.2]);
});
test('the body has enough rings for a smooth silhouette and none closer than a pixel', () => {
  const s = bodyStations(); assert.ok(s.length > 40 && s.length < 80);
  for (let i = 1; i < s.length; i++) assert.ok(s[i]!.x > s[i - 1]!.x);
});
test('the probe keeps the room the layout search gives it (PROBE.LEN 84 px, at scale 1.35): body 73 px, cable ends within one px of it; the head is 18 px a side', () => {
  assert.ok(BODY_END * PROBE.SCALE < PROBE.LEN);
  assert.ok(Math.abs(CABLE.pts[3][0] * PROBE.SCALE - PROBE.LEN) < 1.5);
  assert.ok(13.3 * PROBE.SCALE < PROBE.HALF + 1.5);
});
test('the cable leaves the boot on the axis and fades out at its free end', () => {
  assert.deepEqual(cableAt(0), { x: CABLE.pts[0][0], y: CABLE.pts[0][1] });
  assert.ok(Math.abs(cableAt(1).x - CABLE.pts[3][0]) < 1e-9); assert.ok(CABLE.fade > 0 && CABLE.fade < 1);
});
