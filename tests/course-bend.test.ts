import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { NETWORK } from '../src/scene/vessels/network.ts';
import { coursesOf, FAIRED, REST } from '../src/scene/vessels/shape.ts';
import { BEND_MIN_R, blendLead, fairBends, smoothRun, tightestBend } from '../src/scene/vessels/bend.ts';
import type { Vec3 } from '../src/scene/anatomy/vessels.ts';

// The bend floor (23 Nov, the shunts' blocky elbows): no drawn course bends tighter than BEND_MIN_R radii of its tube.
test('every course faired (the surgical shunts) bends no tighter than two radii of its tube (smooth joins on)', () => {
  setSmoothJoins(true);
  const bad: string[] = [];
  for (const v of NETWORK) {
    if (!FAIRED.has(v.id)) continue;
    const c = coursesOf(v, REST)[0]!;
    const t = tightestBend(c.pts as Vec3[], c.radius);
    if (t.ratio < BEND_MIN_R) bad.push(`${v.id} ${t.ratio.toFixed(2)}R at ${t.u.toFixed(2)}`);
  }
  assert.deepEqual(bad, []);
  assert.deepEqual([...FAIRED].filter((id) => !NETWORK.some((v) => v.id === id)), [], 'every faired id is a vessel');
});

test('the three shunts clear the floor', () => {
  setSmoothJoins(true);
  for (const id of ['S_PC', 'S_MC', 'S_DSR']) {
    const c = coursesOf(NETWORK.find((v) => v.id === id)!, REST)[0]!;
    assert.ok(tightestBend(c.pts as Vec3[], c.radius).ratio >= BEND_MIN_R, id);
  }
});

test('a course that clears the floor comes back as it was, the first and last point never move, and a hook is faired', () => {
  const R = 0.01, straight: Vec3[] = Array.from({ length: 30 }, (_, i) => [i * 0.02, 0, 0] as Vec3);
  assert.equal(fairBends(straight, R), straight);
  const hook: Vec3[] = straight.map((p, i) => (i === 15 ? [p[0], 0.03, 0] as Vec3 : p));
  assert.ok(tightestBend(hook, R).ratio < BEND_MIN_R);
  const f = fairBends(hook, R);
  assert.deepEqual([f[0], f[f.length - 1]], [hook[0], hook[hook.length - 1]]);
  assert.ok(tightestBend(f, R).ratio >= BEND_MIN_R);
});

// THE JOINT (27 Nov, Mohammad: the distal splenorenal shunt's take-off is "kinky", then "seamless"): each course cleared the floor alone, but the splenic vein runs on into the Warren shunt at a corner of 1.0 radius
// (the bend floor looked at one course at a time), and the shunt then ran straight a while and turned back. The shunt is now one smooth curve with the vein (bend.ts smoothRun, blendLead).
const unfaired = (id: string) => NETWORK.find((v) => v.id === id)!;
const partnerOf = (id: string) => NETWORK.find((o) => o.to === unfaired(id).from && o.kind === 'vein')!;

test('the vein that runs on into the Warren shunt and the shunt are one smooth curve: no bend tighter than four radii across the joint and the first stretch', () => {
  setSmoothJoins(true);
  const sp = coursesOf(partnerOf('S_DSR'), REST)[0]!, ds = coursesOf(unfaired('S_DSR'), REST)[0]!;
  assert.deepEqual(ds.pts[0], sp.pts[sp.pts.length - 1], 'the shunt still starts where the vein ends');
  const joint = [...(sp.pts as Vec3[]).slice(-12), ...(ds.pts as Vec3[]).slice(1, 30)];
  assert.ok(tightestBend(joint, ds.radius).ratio >= 4, 'the joint and the first stretch are one round curve (it was 1.0 radius)');
});

test('smoothRun keeps the ends and the count, stays within 2.5 radii of the course, and makes it round with its partner', () => {
  const R = 0.01, tail: Vec3[] = Array.from({ length: 61 }, (_, i) => [-0.2 + i * 0.0033, 0.2 - i * 0.0033, 0] as Vec3);
  // (straight down from the node, then a gentle turn: the Warren shunt's own shape)
  const course: Vec3[] = [[0, 0, 0], ...Array.from({ length: 70 }, (_, i) => { const y = -(i + 1) * 0.0033; return [i > 40 ? -(i - 40) * 0.0014 : 0, y, 0] as Vec3; })];
  assert.ok(tightestBend([...tail.slice(-24), ...course.slice(0, 40)], R).ratio < BEND_MIN_R, 'the corner is under the floor');
  const sm = smoothRun(course, tail, R);
  assert.equal(sm.length, course.length);
  assert.deepEqual(sm[0], course[0]);
  assert.deepEqual(sm[sm.length - 1], course[course.length - 1]);
  let dev = 0;
  for (const p of sm) { let m = Infinity; for (const q of course) m = Math.min(m, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])); dev = Math.max(dev, m); }
  assert.ok(dev <= 2.5 * R + 1e-9, 'it stays within 2.5 radii of the course');
  assert.ok(tightestBend([...tail.slice(-24), ...sm], R).ratio >= 4, 'one round curve with its partner');
  assert.equal(smoothRun(tail, tail, R).length, tail.length, 'a straight run is untouched');
});

test('blendLead leaves along the partner and rejoins the course, keeping every count; a clean joint comes back as it was', () => {
  const R = 0.01, tail: Vec3[] = Array.from({ length: 61 }, (_, i) => [-0.2 + i * 0.0033, 0.2 - i * 0.0033, 0] as Vec3);
  const corner: Vec3[] = [[0, 0, 0], ...Array.from({ length: 40 }, (_, i) => [0, -(i + 1) * 0.005, 0] as Vec3)];
  assert.ok(tightestBend([...tail.slice(-24), ...corner.slice(0, 20)], R).ratio < BEND_MIN_R, 'the corner is under the floor');
  const b = blendLead(corner, tail, R);
  assert.equal(b.length, corner.length);
  assert.deepEqual(b[0], corner[0]);
  assert.deepEqual(b[b.length - 1], corner[corner.length - 1]);
  assert.ok(tightestBend([...tail.slice(-24), ...b.slice(0, 30)], R).ratio >= 2.2, 'the blended joint clears with room');
  const straight: Vec3[] = Array.from({ length: 20 }, (_, i) => [i * 0.01, -i * 0.01, 0] as Vec3);
  assert.equal(blendLead(straight, tail, R), straight, 'a clean joint is the same array');
});
