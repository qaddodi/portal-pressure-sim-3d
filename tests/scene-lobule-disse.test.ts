// The space of Disse in the lobule's network (geometry.ts): 2D at the pin draws it as a sleeve centred on its sinusoid (`lyOff = 0`, lobule-zoom.js), so each is a course along its sinusoid's own samples,
// a first-generation one with its reach out to the terminal lymphatic it drains into in front. How wide it is, how it lies under the blood and how it reads on the screen: tests/lobule-disse-sleeve.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLobule } from '../src/scene/lobule/geometry.ts';

const net = buildLobule();
const ly = net.courses.filter((c) => c.kind === 'ly'), byId = new Map(net.courses.map((c) => [c.id, c]));
const sin = net.courses.filter((c) => c.kind === 's0' || c.kind === 's1' || c.kind === 's2');

test('one space of Disse along every sinusoid and none along a cross-link, in the generation 2D files it under', () => {
  assert.equal(ly.length, sin.length);
  assert.deepEqual([...new Set(ly.map((c) => c.sib))].sort((a, b) => a! - b!), sin.map((c) => c.id).sort((a, b) => a - b));
  for (const c of ly) assert.equal(c.lvl, { s0: 0, s1: 1, s2: 2 }[byId.get(c.sib!)!.kind as 's0'], `course ${c.id}`);
});

test('it runs ON its sinusoid: every sample after the reach is the sinusoid\'s own, to the last digit (no beside, no gap, nothing that can stray, loop or end in a stub)', () => {
  for (const c of ly) {
    const s = byId.get(c.sib!)!, k = c.reach ?? 0;
    assert.equal(c.pts.length, k + s.pts.length, `course ${c.id}`);
    for (let i = 0; i < s.pts.length; i++) { assert.deepEqual(c.pts[k + i], s.pts[i]); assert.equal(c.rho[k + i], s.rho[i]); }
    if (c.lvl !== 0) assert.equal(k, 0, 'only a first-generation one has a reach');
  }
});

test('a first-generation one reaches back out to the terminal lymphatic it drains into: its first sample lies on that lymphatic, and the reach is a straight, short run into the sinusoid\'s first sample', () => {
  const lt = net.courses.filter((c) => c.kind === 'lt');
  for (const c of ly.filter((x) => x.lvl === 0)) {
    const k = c.reach!, s = byId.get(c.sib!)!;
    assert.ok(k >= 2, `course ${c.id} has a reach`);
    const e = c.pts[0]!, d = Math.min(...lt.flatMap((t) => t.pts.map((q) => Math.hypot(q[0] - e[0], q[1] - e[1]))));
    assert.ok(d < 1e-12, `starts ${d} R off the lymphatic`);
    const p0 = s.pts[0]!, len = Math.hypot(p0[0] - e[0], p0[1] - e[1]);
    assert.ok(len < 0.2, `reach ${len.toFixed(3)} R`);
    for (let i = 0; i < k; i++) {
      const t = i / k, want = [e[0] + (p0[0] - e[0]) * t, e[1] + (p0[1] - e[1]) * t];
      assert.ok(Math.hypot(c.pts[i]![0] - want[0]!, c.pts[i]![1] - want[1]!) < 1e-12, `reach sample ${i} is on the straight run`);
    }
  }
});

test('no step across the plate: neighbouring samples are one stretch of the course apart', () => {
  for (const c of ly) for (let i = 1; i < c.pts.length; i++) assert.ok(Math.hypot(c.pts[i]![0] - c.pts[i - 1]![0], c.pts[i]![1] - c.pts[i - 1]![1]) < 0.06, `course ${c.id} jumps at ${i}`);
});
