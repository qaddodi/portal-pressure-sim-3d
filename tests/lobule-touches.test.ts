// The Lobule's junction finder (weld-nodes.ts findTouches) is boxed, not brute force: the same touches as the plain loop, a small share of the work.
// Root cause it pins (24 Nov, "the splash takes long and snags a few seconds in"): the scene's constructor builds the Lobule's network (buildLobule -> bendNet, three passes) and every pass measured each course end against
// every segment of every other course: 235 of the constructor's 1,100 ms (laptop, cold), seconds on a phone, all before the first picture, for a view nobody has opened.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLobule, rng } from '../src/scene/lobule/geometry.ts';
import { findTouches, touchWork, TOUCH, type Touch } from '../src/scene/lobule/weld-nodes.ts';
import { LOBULE_R } from '../src/scene/lobule/sizes.ts';
import type { WeldCourse, V3 } from '../src/scene/lobule/welds.ts';

/** The plain loop findTouches replaced (every end against every segment). */
function bruteTouches(cs: readonly WeldCourse[], touch: number): Touch[] {
  const out: Touch[] = [];
  const hyp = Math.hypot, lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const foot = (x: number, y: number, a: V3, b: V3) => { const bx = b[0] - a[0], by = b[1] - a[1], bb = bx * bx + by * by; let t = bb > 0 ? ((x - a[0]) * bx + (y - a[1]) * by) / bb : 0; t = Math.min(1, Math.max(0, t)); return { d: hyp(x - a[0] - t * bx, y - a[1] - t * by), t }; };
  cs.forEach((c, i) => {
    for (const end of [0, 1] as const) {
      const P = end === 0 ? c.pts[0]! : c.pts[c.pts.length - 1]!;
      let best: Touch | null = null, bd = touch;
      cs.forEach((o, j) => {
        if (j === i || o.family !== c.family) return;
        for (let s = 0; s < o.pts.length - 1; s++) {
          const f = foot(P[0], P[1], o.pts[s]!, o.pts[s + 1]!);
          if (f.d < bd) { bd = f.d; best = { c: i, end, to: j, seg: s, t: f.t, x: lerp(o.pts[s]![0], o.pts[s + 1]![0], f.t), y: lerp(o.pts[s]![1], o.pts[s + 1]![1], f.t), atEnd: (s === 0 && f.t < 1e-6) || (s === o.pts.length - 2 && f.t > 1 - 1e-6) }; }
        }
      });
      if (best) out.push(best);
    }
  });
  return out;
}

/** The courses the planner sees: the real network's blood courses, in the plan's frame, as weld-bend.ts lays them. */
function realCourses(): WeldCourse[] {
  const net = buildLobule(7, { bend: false });
  return net.courses.filter((c) => ['in', 's0', 's1', 's2', 'an', 'tw'].includes(c.kind)).map((c) => ({ key: `${c.kind}${c.id}`, phase: 0, family: 'blood', pts: c.pts.map((p) => [p[0] * LOBULE_R, -p[1] * LOBULE_R, 0.008] as V3), rad: c.pts.map(() => 0.1), w: c.pts.map(() => 0), seg: 0 }));
}

test('the boxed finder gives the plain loop\'s touches on the real network', () => {
  const cs = realCourses();
  assert.ok(cs.length > 100, `a network of ${cs.length} courses`);
  const want = bruteTouches(cs, TOUCH), got = findTouches(cs, TOUCH);
  assert.ok(want.length > 20, `there are touches to find (${want.length})`);
  assert.deepEqual(got, want);
});

test('and on ends placed on, near and just off other courses', () => {
  const r = rng(11), cs: WeldCourse[] = [];
  const line = (x0: number, y0: number, x1: number, y1: number, n = 12): V3[] => Array.from({ length: n }, (_, k) => [x0 + ((x1 - x0) * k) / (n - 1), y0 + ((y1 - y0) * k) / (n - 1), 0] as V3);
  for (let i = 0; i < 40; i++) cs.push({ key: `a${i}`, phase: 0, family: 'blood', pts: line(r() * 4, r() * 4, r() * 4, r() * 4), rad: Array(12).fill(0.01), w: Array(12).fill(0), seg: 0 });
  for (let i = 0; i < 60; i++) {   // a course that starts on, or within a hair of, another's side or end
    const host = cs[Math.floor(r() * 40)]!, k = Math.floor(r() * 11), t = r(), off = [0, 1e-5, 3e-4, 5e-4, 2e-3][i % 5]!;
    const x = host.pts[k]![0] + (host.pts[k + 1]![0] - host.pts[k]![0]) * t + off, y = host.pts[k]![1] + (host.pts[k + 1]![1] - host.pts[k]![1]) * t;
    cs.push({ key: `b${i}`, phase: 0, family: i % 7 === 0 ? 'bile' : 'blood', pts: line(x, y, r() * 4, r() * 4), rad: Array(12).fill(0.01), w: Array(12).fill(0), seg: 0 });
  }
  const want = bruteTouches(cs, TOUCH), got = findTouches(cs, TOUCH);
  assert.ok(want.length > 30, `touches to compare (${want.length})`);
  assert.deepEqual(got, want);
});

test('it measures a small share of the segments the plain loop did', () => {
  const cs = realCourses(), segs = cs.reduce((a, c) => a + c.pts.length - 1, 0), ends = cs.length * 2;
  touchWork.segments = 0; findTouches(cs, TOUCH);
  const brute = segs * ends;
  assert.ok(touchWork.segments < brute / 40, `${touchWork.segments} segment distances against ${brute} for the plain loop`);
});
