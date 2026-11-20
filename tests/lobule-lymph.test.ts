// The lymph is two thin tubes on every sinusoid (Mohammad, 20 Nov 2026: "lymph should be tubes that are hugging exactly the blood vessels, not running independently like bile; and split exactly like the sinusoids,
// one on each side of the vessel"; of the filled-in sleeve that replaced them: "disgusting"). Root cause of both failures: the lymph was either ONE line to one side of its sinusoid whose course was never tied to its
// sinusoid's branching, or an AREA (a sleeve) that filled every crotch. lymph.ts now offsets each sinusoid's axis to both sides by its wall and a little under the tube's radius, runs each branch's outer line on into
// the trunk's, and lets the inner lines end at the crotch as threads: a tube is a fixed small width and never an area. These tests pin the lines AND the triangles the scene draws from them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLobule, type Course } from '../src/scene/lobule/geometry.ts';
import { DUCT_R, RS0, lyTaper, sinRadius } from '../src/scene/lobule/widths.ts';
import { END_THREAD, HUG, endTaper, lymphCover, lymphRuns, resampleRun } from '../src/scene/lobule/lymph.ts';
import type { BufferAttribute } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { Lobule3D } from '../src/scene/micro3d/lobule3d.ts';

const net = buildLobule(), byId = new Map(net.courses.map((c) => [c.id, c]));
const ly = net.courses.filter((c) => c.kind === 'ly');
const sins = net.courses.filter((c) => c.kind === 's0' || c.kind === 's1' || c.kind === 's2');
const blood = net.courses.filter((c) => c.kind === 's0' || c.kind === 's1' || c.kind === 's2');
const links = net.courses.filter((c) => c.kind === 'an');
const near = (q: readonly number[], c: Course) => {
  let best = { d: Infinity, rho: 0 };
  for (let i = 0; i + 1 < c.pts.length; i++) {
    const a = c.pts[i]!, b = c.pts[i + 1]!, bx = b[0] - a[0], by = b[1] - a[1], bb = bx * bx + by * by, t = bb ? Math.min(1, Math.max(0, ((q[0]! - a[0]) * bx + (q[1]! - a[1]) * by) / bb)) : 0;
    const d = Math.hypot(q[0]! - a[0] - t * bx, q[1]! - a[1] - t * by);
    if (d < best.d) best = { d, rho: c.rho[i]! + (c.rho[i + 1]! - c.rho[i]!) * t };
  }
  return best;
};
const radiusAt = (rho: number) => DUCT_R * lyTaper(rho);
const wallOf = (c: Course, rho: number) => sinRadius(c.kind as 's0', rho);
const close = (a: readonly number[], b: readonly number[], t: number) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!) < t;
const lt = net.courses.filter((c) => c.kind === 'lt');
const onLt = (p: readonly number[]) => lt.some((c) => c.pts.some((q) => close(q, p, 1e-9)));
/** The first stretch of a first-generation channel that begins on a terminal lymphatic is its reach across the inlet venule to the sinusoid (0.12 R at most). */
const inReach = (c: Course, i: number) => {
  if (c.lvl !== 0 || !onLt(c.pts[0]!)) return false;
  let a = 0; for (let k = 1; k <= i; k++) a += Math.hypot(c.pts[k]![0] - c.pts[k - 1]![0], c.pts[k]![1] - c.pts[k - 1]![1]);
  return a < 0.12;
};


test('a tube on each side of every sinusoid: both sides of all 84 sinusoids carry lymph, along most of their length', () => {
  assert.equal(sins.length, 84);
  for (const s of sins) for (const side of [1, -1]) {
    const runs = ly.filter((c) => c.sib === s.id && c.sign === side);
    assert.ok(runs.length >= 1, `sinusoid ${s.id} has no lymph on side ${side}`);
    const covered = runs.reduce((a, c) => a + c.len, 0) / s.len;
    assert.ok(covered > 0.3, `sinusoid ${s.id} side ${side}: only ${(covered * 100).toFixed(0)} % of its length`);
  }
  // and the two sides lie on opposite sides of the axis (the sign is the side of its way)
  for (const c of ly) {
    const s = byId.get(c.sib!)!, m = c.pts[Math.floor(c.pts.length / 2)]!;
    let bi = 0, bd = Infinity; s.pts.forEach((p, i) => { const d = Math.hypot(p[0] - m[0], p[1] - m[1]); if (d < bd) { bd = d; bi = i; } });
    const a = s.pts[Math.max(0, bi - 1)]!, b = s.pts[Math.min(s.pts.length - 1, bi + 1)]!, cross = (b[0] - a[0]) * (m[1] - s.pts[bi]![1]) - (b[1] - a[1]) * (m[0] - s.pts[bi]![0]);
    assert.equal(Math.sign(cross), c.sign, `course ${c.id} is on side ${c.sign} of its sinusoid`);
  }
});

test('the tubes HUG: one gap off the wall all along (the wall plus the hug share of the tube\'s own radius), and never inside any blood vessel\'s wall', () => {
  let held = 0, total = 0;
  for (const c of ly) {
    const s = byId.get(c.sib!)!;
    c.pts.forEach((q, i) => {
      const r = radiusAt(c.rho[i]!);
      if (i < 2 || i >= c.pts.length - 2 || inReach(c, i)) return;
      const n = near(q, s); total++;
      if (Math.abs(n.d - (wallOf(s, n.rho) + HUG * r)) < 1e-6 + 0.05 * (wallOf(s, n.rho) + HUG * r)) held++;
    });
  }
  assert.ok(held / total > 0.95, `${held} of ${total} samples hug their sinusoid at one gap`);
});

test('not independent like bile: no lymph strays from its own sinusoid (further than a tube\'s own width off its wall), except the reach of a first channel to the terminal lymphatic and the one point where an outer line runs on into the trunk\'s', () => {
  for (const c of ly) {
    const s = byId.get(c.sib!)!;
    c.pts.forEach((q, i) => {
      if (inReach(c, i) || i >= c.pts.length - 1) return;
      const n = near(q, s), off = n.d - wallOf(s, n.rho);
      assert.ok(off <= 2 * DUCT_R + 1e-9, `course ${c.id} sample ${i} is ${off.toFixed(4)} off its sinusoid's wall (a tube is ${(2 * DUCT_R).toFixed(4)} wide)`);
    });
  }
});

test('it splits where the sinusoids split: at every merge each of the trunk\'s two lines runs on from a branch\'s outer line, and the inner lines stay on their own walls and stop', () => {
  let lines = 0, joined = 0;
  for (const par of net.courses.filter((c) => c.kind === 's1' || c.kind === 's2')) {
    const node = par.pts[0]!, kids = net.courses.filter((c) => c.parent === par.id);
    assert.equal(kids.length, 2, `a trunk of two branches (${par.kind} ${par.id})`);
    for (const side of [1, -1]) {
      const run = ly.find((r) => r.sib === par.id && r.sign === side && close(r.pts[0]!, node, 0.05));
      assert.ok(run, `trunk ${par.id} has a line on side ${side} from its start`);
      lines++;
      if (ly.some((o) => kids.some((k) => k.id === o.sib) && close(o.pts[o.pts.length - 1]!, run.pts[0]!, 1e-5))) joined++;
    }
    // exactly one line of each branch runs on into the trunk (its outer one); the other ends free, a thread
    for (const k of kids) {
      const mine = ly.filter((r) => r.sib === k.id), onward = mine.filter((r) => !(r.free ?? [true, true])[1]);
      assert.equal(onward.length, 1, `branch ${k.id}: one line runs on into the trunk, the inner one ends at the crotch`);
      assert.equal(mine.length, 2);
    }
  }
  assert.equal(joined, lines, 'every trunk line continues a branch line');
});

test('a cross-link does not cut the lymph: no channel ends at the mouth of a cross-link, the sinusoid\'s lines run on under it', () => {
  for (const a of links) for (const c of ly) for (const k of [0, c.pts.length - 1]) {
    const n = near(c.pts[k]!, a);
    assert.ok(n.d > 0.03 || !(c.free ?? [false, false])[k === 0 ? 0 : 1], `course ${c.id} ends free ${n.d.toFixed(3)} from cross-link ${a.id}`);
  }
});

test('no blunt stubs: every channel end either lies on the terminal lymphatic, runs on into another channel, or tapers to a thread', () => {
  let free = 0;
  for (const c of ly) for (const [k, end] of [[0, c.pts[0]!], [c.pts.length - 1, c.pts[c.pts.length - 1]!]] as const) {
    const flagged = (c.free ?? [true, true])[k === 0 ? 0 : 1];
    const joined = onLt(end) || ly.some((o) => o !== c && [o.pts[0]!, o.pts[o.pts.length - 1]!].some((p) => close(p, end, 1e-5)));
    if (joined) continue;   // (an inner line that ends where its sibling's outer line runs into the trunk is flagged free and tapers anyway)
    assert.ok(flagged, `course ${c.id} ends bluntly at ${end.map((v) => v.toFixed(3))}, joined to nothing and not tapering`);
    assert.ok(endTaper(c, k) <= END_THREAD + 1e-9, 'it narrows to a thread at that end');
    assert.ok(endTaper(c, Math.floor(c.pts.length / 2)) > endTaper(c, k), 'and widens smoothly away from it');
    free++;
  }
  assert.ok(free > 0, 'some ends do taper');
});

test('the taper: a fixed thin width (the 2D thin ductule, not an area), whole from rho 0.42 out and nothing by about 90 % of the way to the central vein; none enters the vein', () => {
  assert.ok(Math.abs(DUCT_R - RS0 * 0.31) < 1e-12);
  assert.ok(DUCT_R < sinRadius('s0', 1) * 0.5, 'thinner than half a sinusoid');
  assert.ok(Math.max(...ly.map((c) => Math.max(...c.rho.map(radiusAt)))) <= DUCT_R + 1e-12);
  assert.equal(radiusAt(0.13), 0); assert.equal(radiusAt(0.42), DUCT_R);
  assert.ok(ly.every((c) => c.rho.every((r, i) => i === 0 || r > net.rcv0 * 0.999 || c.lvl === 0 && r > 0.9)), 'no lymph inside the central vein');
});

test('the lines come from geometry, not a list: a single straight sinusoid gets one tube each side at the same gap; a Y runs the outer lines through and ends the inner ones at the crotch', () => {
  const mk = (id: number, pts: [number, number][], parent?: number): Course => ({ id, kind: 's0', pts, len: 1, rho: pts.map(([x, y]) => Math.hypot(x, y)), ...(parent != null ? { parent } : {}) });
  const wall = () => 0.0064, radius = () => 0.004, rcv = 0.07;
  const straight = mk(0, Array.from({ length: 30 }, (_, i) => [0.3 + i * 0.02, 0]));
  const one = lymphRuns({ carry: [straight], wall, radius, rcv, join: () => null });
  assert.equal(one.length, 2);
  assert.deepEqual(one.map((r) => r.side).sort(), [-1, 1]);
  for (const r of one) for (const p of r.pts) assert.ok(Math.abs(Math.abs(p[1]) - (0.0064 + HUG * 0.004)) < 1e-9, 'one gap each side');
  assert.ok(one.every((r) => r.pts.length > 100), 'whole length');
  // a Y: two arms merge into a trunk at (0.3, 0)
  const line = (x0: number, y0: number, x1: number, y1: number, n = 60) => Array.from({ length: n }, (_, i) => [x0 + ((x1 - x0) * i) / (n - 1), y0 + ((y1 - y0) * i) / (n - 1)] as [number, number]);
  const up = { ...mk(1, line(0.8, 0.25, 0.3, 0), 3), kind: 's1' as const }, lo = { ...mk(2, line(0.8, -0.25, 0.3, 0), 3), kind: 's1' as const }, trunk = { ...mk(3, line(0.3, 0, 0.1, 0, 20)), kind: 's2' as const };
  const y = lymphRuns({ carry: [up, lo, trunk], wall, radius, rcv, join: () => null });
  const of = (id: number, side: number) => y.find((r) => r.sib === id && r.side === side)!;
  for (const id of [1, 2, 3]) for (const side of [1, -1]) assert.ok(of(id, side), `arm/trunk ${id} side ${side}`);
  // the trunk's two lines begin where an arm's outer line ends; that arm's outer line is the one away from its sibling
  assert.ok(close(of(1, -1).pts.at(-1)!, of(3, -1).pts[0]!, 1e-9) && close(of(2, 1).pts.at(-1)!, of(3, 1).pts[0]!, 1e-9) || close(of(1, 1).pts.at(-1)!, of(3, 1).pts[0]!, 1e-9) && close(of(2, -1).pts.at(-1)!, of(3, -1).pts[0]!, 1e-9), 'outer lines run on into the trunk');
  const inner = y.filter((r) => r.sib !== 3 && r.freeTail);
  assert.equal(inner.length, 2, 'the two inner lines end free (a thread), the outer two do not');
  for (const r of inner) assert.ok(close(r.pts.at(-1)!, [0.3, 0], 0.03), 'at the crotch');
  assert.ok(resampleRun([[0, 0], [1, 0]]).pts.length >= 40, 'tubes are sampled at about one tube-width and a half');
});

test('a channel passes UNDER a blood vessel, never through it: the cover eases from 0 beside a vessel to 1 inside its footprint, and a hugging tube never dips', () => {
  const axis = Array.from({ length: 20 }, (_, i) => [0.5, i * 0.05] as [number, number]);
  const cover = [{ pts: axis, rad: axis.map(() => 0.015), band: 3 }, { pts: axis.map(([x, y]) => [x + 1, y] as [number, number]), rad: axis.map(() => 0.0064), band: 0.4 }];
  const r = () => 0.004, xs = [0.5, 0.5 + 0.01, 0.5 + 0.015, 0.5 + 0.02, 0.5 + 0.027, 0.5 + 0.03, 0.6];
  const c = lymphCover(xs.map((x) => [x, 0.5] as [number, number]), r, cover);
  assert.equal(c[0], 1); assert.equal(c[1], 1, 'inside the footprint: wholly beneath');
  for (let i = 1; i < c.length; i++) assert.ok(c[i]! <= c[i - 1]! + 1e-12, 'it only rises away from the vessel');
  assert.ok(c[3]! > 0 && c[3]! < 1, 'a gentle way between');
  assert.equal(c[c.length - 1], 0, 'clear of it, at the level beside the sinusoids');
  const hug = lymphCover([[1 + 0.0064 + HUG * 0.004, 0.5]], r, cover);
  assert.equal(hug[0], 0);
});

test('every first-generation channel reaches the terminal lymphatic along its own axis: both sides of every first sinusoid begin ON the lymphatic, continuous with it, not stopping short in a blunt stub', () => {
  const l0 = ly.filter((c) => c.lvl === 0);
  for (const s of net.courses.filter((c) => c.kind === 's0')) for (const side of [1, -1]) assert.ok(l0.some((r) => r.sib === s.id && r.sign === side && onLt(r.pts[0]!)), `sinusoid ${s.id} side ${side} does not begin on a terminal lymphatic`);
});

// ---- the drawn triangles (the part the scene builds), not only the lines they come from ----------------------------------------------------------------------------------------------------------------------------
const R = 3, l3 = new Lobule3D(new LobuleView(createShared()), createShared());
l3.buildForTest('light');
const part = l3.partsForTest.find((p) => p.toonMesh.name === 'lobule3d/lymph-channels')!;
const pos = (part.geometry.getAttribute('position') as BufferAttribute).array, swell = (part.geometry.getAttribute('swell') as BufferAttribute).array, idx = part.geometry.index!.array;
/** the lobule-radius plan position of vertex v (the scene is scaled by R and flipped in y) */
const vx = (v: number): [number, number] => [pos[3 * v]! / R, -pos[3 * v + 1]! / R];
const ltBoxes = lt.flatMap((c) => c.pts);
const nearLt = (p: readonly number[]) => ltBoxes.some((q) => Math.hypot(q[0] - p[0]!, q[1] - p[1]!) < 0.16);

test('drawn: no lymph vertex is farther than a tube\'s width from its sinusoid\'s wall (no daylight, no strays), except the reach from the terminal lymphatic', () => {
  let n = 0, worst = 0;
  for (let v = 0; v < pos.length / 3; v++) {
    const p = vx(v);
    if (nearLt(p)) continue;
    let best = Infinity;
    for (const o of blood) { const q = near(p, o); best = Math.min(best, q.d - wallOf(o, q.rho)); }
    worst = Math.max(worst, best); n++;
    assert.ok(best <= 2 * DUCT_R + 1e-6, `vertex ${v} at ${p.map((a) => a.toFixed(3))} is ${best.toFixed(4)} off the nearest vessel wall (a tube is ${(2 * DUCT_R).toFixed(4)} wide)`);
  }
  assert.ok(n > 1000, `${n} vertices checked`);
});

test('drawn: no wedges: the planform area of the lymph around each sinusoid is at most two tubes of fixed width along its length (2 x 2r x L), never an area', () => {
  // the part's triangles, front and back faces both counted (so the planform is half the sum), each given to the sinusoid whose wall is nearest its centre
  const area = new Map<number, number>();
  for (let t = 0; t < idx.length; t += 3) {
    const a = vx(idx[t]!), b = vx(idx[t + 1]!), c = vx(idx[t + 2]!), ar = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2 / 2;
    const m: [number, number] = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
    if (nearLt(m)) continue;
    let best = Infinity, who = -1;
    for (const o of blood) { const q = near(m, o); const off = q.d - wallOf(o, q.rho); if (off < best) { best = off; who = o.id; } }
    area.set(who, (area.get(who) ?? 0) + ar);
  }
  let worst = 0;
  for (const s of sins) {
    const a = area.get(s.id) ?? 0, cap = 2 * (2 * DUCT_R) * s.len * 1.15;
    worst = Math.max(worst, a / cap);
    assert.ok(a <= cap, `sinusoid ${s.id}: lymph planform ${a.toFixed(5)} > ${cap.toFixed(5)} (two tubes of width ${(2 * DUCT_R).toFixed(4)} along ${s.len.toFixed(3)})`);
  }
  assert.ok(worst > 0.2, `the cap is not vacuous (worst ${worst.toFixed(2)} of it)`);
});

test('drawn: the tubes are thin and whole, and thin out to nothing toward the central vein', () => {
  let rmax = 0, nearCv = 0, midMax = 0;
  for (let v = 0; v < swell.length / 2; v++) {
    const p = vx(v), rho = Math.hypot(p[0], p[1]), r = swell[2 * v]!;
    rmax = Math.max(rmax, r);
    if (rho < 0.12) nearCv = Math.max(nearCv, r);
    if (rho > 0.5 && rho < 0.9) midMax = Math.max(midMax, r);
  }
  assert.ok(Math.abs(rmax - DUCT_R * R) < 1e-9, `widest tube ${rmax}`);
  assert.ok(nearCv <= DUCT_R * R * 0.05, `${nearCv} at the vein`);
  assert.ok(Math.abs(midMax - DUCT_R * R) < 1e-9, 'whole in the middle');
});
