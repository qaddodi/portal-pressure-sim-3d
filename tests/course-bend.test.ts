import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { NETWORK } from '../src/scene/vessels/network.ts';
import { coursesOf, FAIRED, REST } from '../src/scene/vessels/shape.ts';
import { BEND_MIN_R, fairBends, tightestBend } from '../src/scene/vessels/bend.ts';
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
