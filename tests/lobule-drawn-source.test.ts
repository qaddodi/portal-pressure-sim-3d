// One centreline for everything the Lobule draws along a sinusoid (Mohammad, 20 Nov 2026, on-device shot of d2b959e2: the lymph "does not hug", wanders through the plates and bundles up).
// Root cause: the weld planner bent the sinusoids' shallow V's apart AFTER the network was built, and the scene drew the sinusoids along those bent paths; the lymph, the bile and the plates were laid
// along the unbent courses, so the drawn vessel slid across its own lymph by up to five radii. buildLobule now bends the network once (weld-bend.ts) and the planner bends nothing. These tests hold the
// lymph and the bile to what the planner draws, not to the network they were derived from (every earlier lymph test compared the lymph with the unbent network and could not see this).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { buildLobule } from '../src/scene/lobule/geometry.ts';
import { buildBile } from '../src/scene/lobule/bile.ts';
import { HUG } from '../src/scene/lobule/lymph.ts';
import { DUCT_R, lyTaper, sinRadius } from '../src/scene/lobule/widths.ts';
import { bloodWeldCourses } from '../src/scene/lobule/weld-courses.ts';
import { findNodes, refineEnds, TOUCH } from '../src/scene/lobule/weld-nodes.ts';
import { splayCourses } from '../src/scene/lobule/weld-splay.ts';
import { Z_OVER, Z_TUBE, mouthDiscs } from '../src/scene/lobule/weld-bend.ts';
import { decodePlan, weldDigest } from '../src/scene/lobule/weld-codec.ts';
import { weldRequest, LZ, OVER_Z } from '../src/scene/micro3d/lobule3d.ts';

const R = 3, net = buildLobule(), sins = net.courses.filter((c) => c.kind === 's0' || c.kind === 's1' || c.kind === 's2');
const byKey = new Map(net.courses.map((c) => [`${c.kind}${c.id}`, c]));
const polyDist = (q: readonly number[], pts: readonly (readonly number[])[], rad?: readonly number[]) => {
  let best = { d: Infinity, r: 0 };
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!, b = pts[i + 1]!, bx = b[0]! - a[0]!, by = b[1]! - a[1]!, bb = bx * bx + by * by, t = bb ? Math.min(1, Math.max(0, ((q[0]! - a[0]!) * bx + (q[1]! - a[1]!) * by) / bb)) : 0;
    const d = Math.hypot(q[0]! - a[0]! - t * bx, q[1]! - a[1]! - t * by);
    if (d < best.d) best = { d, r: rad ? rad[i]! + (rad[i + 1]! - rad[i]!) * t : 0 };
  }
  return best;
};

test('the planner has next to nothing left to bend: splaying the network\'s own blood courses moves a sample half a radius at most (the bend was done once, in buildLobule)', () => {
  const req = weldRequest(net), blood = req.courses.filter((c) => c.family === 'blood'), refined = refineEnds(blood);
  const nodes = findNodes(refined, TOUCH).filter((n) => !req.avoid.some((d) => Math.hypot(n.J[0] - d.x, n.J[1] - d.y) < d.r));
  const bent = splayCourses(refined, nodes);
  let worst = 0;
  bent.forEach((c, k) => c.pts.forEach((p, i) => { const o = refined[k]!.pts[i]!; worst = Math.max(worst, Math.hypot(p[0] - o[0], p[1] - o[1], p[2] - o[2])); }));
  assert.ok(nodes.length > 40, `${nodes.length} junctions found`);
  assert.ok(worst < 0.01, `the planner would still move a sample by ${worst} (a sinusoid is about 0.02 wide in these units)`);
});

test('every junction of two sinusoids leaves at the planner\'s least angle: no shallow V is left for anything to be laid inside', () => {
  const kids = new Map<number, typeof sins>();
  for (const c of sins) if (c.parent != null) kids.set(c.parent, [...(kids.get(c.parent) ?? []), c]);
  let n = 0, least = 90;
  for (const [pid, [a, b]] of kids) {
    if (!a || !b) continue;
    const p = net.courses[pid]!, J = a.pts.at(-1)!, d = (c: typeof a) => { const q = c.pts[c.pts.length - 4]!; return [q[0] - J[0], q[1] - J[1]]; }, u = d(a), v = d(b);
    void p;
    const ang = Math.acos((u[0]! * v[0]! + u[1]! * v[1]!) / (Math.hypot(u[0]!, u[1]!) * Math.hypot(v[0]!, v[1]!))) * 180 / Math.PI;
    least = Math.min(least, ang); n++;
  }
  assert.equal(n, 36);
  assert.ok(least > 25, `the narrowest fork is ${least.toFixed(1)} degrees`);
});

const baked = new URL('../public/lobule/welds.bin', import.meta.url);
test('what is drawn lies on the network: every sample of the baked weld plan\'s blood courses is on the matching net course (skipped when the plan is not baked or is for other numbers)', (t) => {
  if (!existsSync(baked)) { t.skip('not baked'); return; }
  const b = gunzipSync(readFileSync(baked)), plan = decodePlan(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), weldDigest(weldRequest(net)));
  if (!plan) { t.skip('baked for other numbers'); return; }
  let worst = 0, n = 0;
  for (const [k, pc] of plan.courses) {
    const c = byKey.get(k); if (!c) continue;
    const P = c.pts.map((p) => [p[0] * R, -p[1] * R]);
    for (const p of pc.pts) { worst = Math.max(worst, polyDist(p, P).d); n++; }
  }
  assert.ok(n > 3000);
  assert.ok(worst < 1e-5, `a drawn sample is ${worst} off the network's course`);
});

test('the lymph hugs what is drawn: each tube stands at its sinusoid\'s DRAWN wall plus the hug share of its own radius, and never inside another sinusoid\'s wall', () => {
  const draw = bloodWeldCourses(net, { R, over: OVER_Z, tube: LZ.tube, bile: 0 }, { vessel: 10, bile: 6 }).filter((c) => /^s[012]/.test(c.key));
  const own = new Map(draw.map((c) => [c.key, c]));
  let n = 0, held = 0, inside = 0;
  for (const c of net.courses.filter((x) => x.kind === 'ly')) {
    const sk = `${net.courses[c.sib!]!.kind}${c.sib}`, mine = own.get(sk)!;
    c.pts.forEach((p, i) => {
      if (i < 3 || i >= c.pts.length - 3) return;
      const q = [p[0] * R, -p[1] * R], r = DUCT_R * lyTaper(c.rho[i]!) * R, m = polyDist(q, mine.pts, mine.rad), want = m.r + HUG * r;
      n++; if (Math.abs(m.d - want) <= 0.1 * r + 0.03 * m.r) held++;
      for (const o of draw) if (o !== mine) { const f = polyDist(q, o.pts, o.rad); if (f.d < 0.9 * f.r) { inside++; break; } }
    });
  }
  assert.ok(n > 2000);
  assert.ok(held / n > 0.85, `${held} of ${n} samples at the drawn hug distance (the rest: the reach to the lymphatic and the crotch's last stretch)`);
  assert.equal(inside, 0, 'no lymph sample lies inside another sinusoid\'s drawn wall');
});

test('the bile: no lane starts inside a blood vessel, and the rest of its crossings are few (the canal of Hering over an inlet is drawn, under it, by design)', () => {
  const blood = net.courses.filter((c) => ['s0', 's1', 's2', 'an', 'tw'].includes(c.kind));
  const inside = (q: readonly number[], rb: number) => blood.some((c) => { const m = polyDist(q, c.pts.map((p) => [p[0], p[1]])); const rho = Math.hypot(q[0]!, q[1]!); return m.d < (c.kind === 'tw' ? 0.012 : sinRadius(c.kind as 's0', rho)) + rb; });
  let samples = 0, cross = 0;
  for (const b of buildBile(net)) {
    if (b.kind === 'bs') assert.ok(!inside(b.pts[0]!, 0), 'a lane starts clear of every vessel');
    if (b.kind === 'bh') continue;
    b.pts.forEach((p, i) => { samples++; if (inside(p, b.radius[i]!)) cross++; });
  }
  assert.ok(cross / samples < 0.06, `${cross} of ${samples} lane samples lie under a vessel`);
});

test('the bend sees the heights the scene draws at', () => { assert.ok(Math.abs(Z_OVER - OVER_Z) < 1e-12); assert.equal(Z_TUBE, LZ.tube); });

test('the discs of the vessels\' mouths the bend skips are the planner\'s own (weld request)', () => {
  const req = weldRequest(net), mine = mouthDiscs(net.courses, net.courses.filter((c) => c.kind === 'lv').map((c) => c.pts[Math.floor(c.pts.length / 2)]!)).map((d) => [d.x * R, -d.y * R, d.r * R]);
  for (const d of req.avoid) assert.ok(mine.some((m) => Math.hypot(m[0]! - d.x, m[1]! - d.y) < 1e-9 && Math.abs(m[2]! - d.r) < 1e-9), `a mouth at ${d.x.toFixed(3)}, ${d.y.toFixed(3)}`);
});
