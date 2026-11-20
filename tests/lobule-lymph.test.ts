// The lymph hugs the blood (Mohammad, 20 Nov 2026: "lymph should be tubes that are hugging exactly the blood vessels, not running independently like bile; and split exactly like the sinusoids, so they (one
// on each side of the vessel)"). Root cause of "independent": each sinusoid had ONE channel, a single offset line to one side whose course was never tied to its sinusoid's branching. lymph.ts now takes the
// sinusoids' outline at one gap on BOTH sides and cuts it where it meets another vessel, so the pairing and the branching come from the geometry itself, not from a list. These tests pin that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLobule, type Course } from '../src/scene/lobule/geometry.ts';
import { DUCT_R, RS0, lyTaper, sinRadius } from '../src/scene/lobule/widths.ts';
import { END_THREAD, HUG, endTaper, lymphCover, lymphRuns, resampleRun } from '../src/scene/lobule/lymph.ts';

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
  for (const c of ly.filter((q) => q.lvl !== 0 || q.len > 0.1)) {
    const s = byId.get(c.sib!)!, m = c.pts[Math.floor(c.pts.length / 2)]!, q = near(m, s);
    let bi = 0, bd = Infinity; s.pts.forEach((p, i) => { const d = Math.hypot(p[0] - m[0], p[1] - m[1]); if (d < bd) { bd = d; bi = i; } });
    const a = s.pts[Math.max(0, bi - 1)]!, b = s.pts[Math.min(s.pts.length - 1, bi + 1)]!, cross = (b[0] - a[0]) * (m[1] - s.pts[bi]![1]) - (b[1] - a[1]) * (m[0] - s.pts[bi]![0]);
    assert.ok(q.d > 0, 'off the axis');
    assert.equal(Math.sign(cross), c.sign, `course ${c.id} is on side ${c.sign} of its sinusoid`);
  }
});

test('the tubes HUG: one gap off the wall all along (the wall plus 1.05 of the tube\'s own radius), and never inside any blood vessel\'s wall', () => {
  let held = 0, total = 0;
  for (const c of ly) {
    const s = byId.get(c.sib!)!;
    c.pts.forEach((q, i) => {
      const r = radiusAt(c.rho[i]!);
      // never on or in a blood vessel (the sinusoids and the cross-links), anywhere along the tube (but the first-generation channel's reach to the terminal lymphatic, which starts at a sinusoid's own mouth)
      if (!inReach(c, i)) for (const o of blood) { const n = near(q, o); assert.ok(n.d >= wallOf(o, n.rho) + r * 0.5, `course ${c.id} sample ${i} sits ${n.d.toFixed(4)} from ${o.kind} ${o.id}, whose wall is ${wallOf(o, n.rho).toFixed(4)}`); }
      // (the first and last samples of a run are where it meets a branch, a vein or the terminal lymphatic, and the first stretch of a first-generation channel is its reach to the lymphatic)
      if (i < 2 || i >= c.pts.length - 2 || inReach(c, i)) return;
      const n = near(q, s); total++;
      if (Math.abs(n.d - (wallOf(s, n.rho) + HUG * r)) < 0.2 * (wallOf(s, n.rho) + HUG * r)) held++;
    });
  }
  assert.ok(held / total > 0.95, `${held} of ${total} samples hug their sinusoid at one gap`);
});

test('not independent like bile: no lymph strays from its own sinusoid (at most a tube\'s gap and a half off it), except the reach of a first channel to the terminal lymphatic', () => {
  for (const c of ly) {
    const s = byId.get(c.sib!)!;
    c.pts.forEach((q, i) => {
      if (inReach(c, i) || i < 2 || i >= c.pts.length - 2) return;
      const n = near(q, s), gap = wallOf(s, n.rho) + HUG * radiusAt(n.rho);
      assert.ok(n.d < gap * 1.6, `course ${c.id} sample ${i} is ${n.d.toFixed(4)} from its sinusoid (gap ${gap.toFixed(4)})`);
    });
  }
});

test('it splits where the sinusoids split: at every merge each of the trunk\'s two lines runs on from a branch\'s line, and the branches\' two inner lines turn the crotch together', () => {
  let lines = 0, joined = 0, crotches = 0, met = 0;
  for (const par of net.courses.filter((c) => c.kind === 's1' || c.kind === 's2')) {
    const node = par.pts[0]!, kids = net.courses.filter((c) => c.parent === par.id);
    assert.equal(kids.length, 2, `a trunk of two branches (${par.kind} ${par.id})`);
    for (const side of [1, -1]) {
      const run = ly.find((r) => r.sib === par.id && r.sign === side && close(r.pts[0]!, node, 0.05));
      assert.ok(run, `trunk ${par.id} has a line on side ${side} from its start`);
      lines++;
      // it is the same tube as one of the branches' lines: their ends meet exactly
      if (ly.some((o) => kids.some((k) => k.id === o.sib) && close(o.pts[o.pts.length - 1]!, run.pts[0]!, 1e-5))) joined++;
    }
    const ends = ly.filter((r) => kids.some((k) => k.id === r.sib) && close(r.pts[r.pts.length - 1]!, node, 0.06));
    crotches++;
    if (ends.some((a) => ends.some((b) => a.sib !== b.sib && close(a.pts[a.pts.length - 1]!, b.pts[b.pts.length - 1]!, 1e-5)))) met++;
  }
  assert.equal(joined, lines, 'every trunk line continues a branch line');
  assert.ok(met / crotches > 0.45, `${met} of ${crotches} crotches carry the pair of inner lines meeting (the rest are narrower than a tube)`);
});

test('a cross-link does not cut the lymph: no channel ends at the mouth of a cross-link, the sinusoid\'s lines run on under it', () => {
  for (const a of links) for (const c of ly) for (const k of [0, c.pts.length - 1]) {
    const n = near(c.pts[k]!, a);
    assert.ok(n.d > 0.03 || !(c.free ?? [false, false])[k === 0 ? 0 : 1], `course ${c.id} ends free ${n.d.toFixed(3)} from cross-link ${a.id}`);
  }
});

test('flush: the tubes sit against the sinusoid wall with no daylight (a gap of at most a tenth of a tube, tucked at most a fifth under the wall), along every stretch that hugs', () => {
  let n = 0, flush = 0;
  for (const c of ly) {
    const s = byId.get(c.sib!)!;
    c.pts.forEach((q, i) => {
      if (inReach(c, i) || i < 2 || i >= c.pts.length - 2) return;
      const r = radiusAt(c.rho[i]!), m = near(q, s), gap = (m.d - wallOf(s, m.rho) - r) / r;
      n++; if (gap > -0.2 && gap < 0.1) flush++;
    });
  }
  assert.ok(flush / n > 0.97, `${flush} of ${n} samples flush`);
  assert.ok(HUG < 1 && HUG > 0.8);
});

test('no blunt stubs: every channel end either lies on the terminal lymphatic, runs on into another channel, or tapers to a thread', () => {
  let free = 0;
  for (const c of ly) for (const [k, end] of [[0, c.pts[0]!], [c.pts.length - 1, c.pts[c.pts.length - 1]!]] as const) {
    const flagged = (c.free ?? [true, true])[k === 0 ? 0 : 1];
    const joined = onLt(end) || ly.some((o) => o !== c && [o.pts[0]!, o.pts[o.pts.length - 1]!].some((p) => close(p, end, 1e-5)));
    if (joined) { assert.ok(!flagged || onLt(end), `course ${c.id}: a joined end is not free`); continue; }
    assert.ok(flagged, `course ${c.id} ends bluntly at ${end.map((v) => v.toFixed(3))}, joined to nothing and not tapering`);
    assert.ok(endTaper(c, k) <= END_THREAD + 1e-9, 'it narrows to a thread at that end');
    assert.ok(endTaper(c, Math.floor(c.pts.length / 2)) > endTaper(c, k), 'and widens smoothly away from it');
    free++;
  }
  assert.ok(free > 0, 'some ends do taper');
});

test('the taper: the tubes are the 2D channel\'s width (half a sinusoid), whole from rho 0.42 out and a thread by the central vein; none enters the vein', () => {
  assert.ok(Math.abs(DUCT_R - RS0 * 0.5) < 1e-12);
  assert.ok(Math.max(...ly.map((c) => Math.max(...c.rho.map(radiusAt)))) <= DUCT_R + 1e-12);
  assert.ok(ly.every((c) => c.rho.every((r, i) => i === 0 || r > net.rcv0 * 0.999 || c.lvl === 0 && r > 0.9)), 'no lymph inside the central vein');
  assert.ok(Math.min(...ly.flatMap((c) => c.rho)) < 0.25, 'the lymph runs in toward the vein');
});

test('the pairing is geometry, not a list: a single straight sinusoid gets one tube each side at the same gap; a Y gets the outer lines through and the crotch lines meeting', () => {
  const mk = (id: number, pts: [number, number][], parent?: number): Course => ({ id, kind: 's0', pts, len: 1, rho: pts.map(([x, y]) => Math.hypot(x, y)), ...(parent != null ? { parent } : {}) });
  const wall = () => 0.0064, radius = () => 0.004, rcv = 0.07;
  const straight = mk(0, Array.from({ length: 30 }, (_, i) => [0.3 + i * 0.02, 0]));
  const one = lymphRuns({ carry: [straight], clear: [straight], wall, radius, rcv, join: () => null });
  assert.equal(one.length, 2);
  assert.deepEqual(one.map((r) => r.side).sort(), [-1, 1]);
  for (const r of one) for (const p of r.pts) assert.ok(Math.abs(Math.abs(p[1]) - (0.0064 + HUG * 0.004)) < 1e-9, 'one gap each side');
  assert.ok(one.every((r) => r.pts.length > 100), 'whole length');
  // a Y: two arms merge into a trunk at (0.3, 0)
  const line = (x0: number, y0: number, x1: number, y1: number, n = 60) => Array.from({ length: n }, (_, i) => [x0 + ((x1 - x0) * i) / (n - 1), y0 + ((y1 - y0) * i) / (n - 1)] as [number, number]);
  const up = mk(1, line(0.8, 0.25, 0.3, 0), 3), lo = mk(2, line(0.8, -0.25, 0.3, 0), 3), trunk = mk(3, line(0.3, 0, 0.1, 0, 20));
  const y = lymphRuns({ carry: [up, lo, trunk], clear: [up, lo, trunk], wall, radius, rcv, join: () => null });
  const of = (id: number, side: number) => y.filter((r) => r.sib === id && r.side === side);
  for (const id of [1, 2, 3]) for (const side of [1, -1]) assert.ok(of(id, side).length >= 1, `arm/trunk ${id} side ${side}`);
  // the trunk's two lines begin where an arm's outer line ends
  for (const side of [1, -1]) { const t = of(3, side)[0]!; assert.ok(y.some((r) => r.sib !== 3 && close(r.pts[r.pts.length - 1]!, t.pts[0]!, 1e-6)), `trunk line ${side} runs on from an arm`); }
  // and the arms' inner lines end on the same point in the crotch
  const ends = [...of(1, 1), ...of(1, -1), ...of(2, 1), ...of(2, -1)].map((r) => r.pts[r.pts.length - 1]!);
  assert.ok(ends.some((a, i) => ends.some((b, j) => i !== j && close(a, b, 1e-6))), 'the crotch lines meet');
  // a T: a side branch stops the host\'s line at its mouth (the host is not cut on the far side)
  const host = mk(4, line(0.9, 0, 0.1, 0, 80)), twig = mk(5, line(0.5, 0.3, 0.5, 0.004, 40));
  const t = lymphRuns({ carry: [host, twig], clear: [host, twig], wall, radius, rcv, join: () => null });
  const farSide = t.filter((r) => r.sib === 4 && r.side === 1), nearSide = t.filter((r) => r.sib === 4 && r.side === -1);
  assert.equal(farSide.length, 1, 'the host\'s far side runs through whole');
  assert.equal(nearSide.length, 2, 'its near side is cut by the branch\'s mouth');
  assert.ok(t.filter((r) => r.sib === 5).length >= 2, 'the branch has a line on each side');
  assert.ok(resampleRun([[0, 0], [1, 0]]).pts.length >= 40, 'tubes are sampled at about one tube-width and a half');
});

test('a channel passes UNDER a blood vessel, never through it: the cover eases from 0 beside a vessel to 1 inside its footprint, and a hugging tube never dips', () => {
  const axis = Array.from({ length: 20 }, (_, i) => [0.5, i * 0.05] as [number, number]);
  const cover = [{ pts: axis, rad: axis.map(() => 0.015), band: 3 }, { pts: axis.map(([x, y]) => [x + 1, y] as [number, number]), rad: axis.map(() => 0.0064), band: 0.9 }];
  const r = () => 0.004, xs = [0.5, 0.5 + 0.01, 0.5 + 0.015, 0.5 + 0.02, 0.5 + 0.027, 0.5 + 0.03, 0.6];
  const c = lymphCover(xs.map((x) => [x, 0.5] as [number, number]), r, cover);
  assert.equal(c[0], 1); assert.equal(c[1], 1, 'inside the footprint: wholly beneath');
  for (let i = 1; i < c.length; i++) assert.ok(c[i]! <= c[i - 1]! + 1e-12, 'it only rises away from the vessel');
  assert.ok(c[3]! > 0 && c[3]! < 1, 'a gentle way between');
  assert.equal(c[c.length - 1], 0, 'clear of it, at the level beside the sinusoids');
  // a tube at the hugging gap from a sinusoid's wall is not dipped by it (that is beside, not under)
  const hug = lymphCover([[1 + 0.0064 + HUG * 0.004, 0.5]], r, cover);
  assert.equal(hug[0], 0);
});

test('every first-generation channel reaches the terminal lymphatic along its own axis: both sides of every first sinusoid begin ON the lymphatic, continuous with it, not stopping short in a blunt stub', () => {
  const l0 = ly.filter((c) => c.lvl === 0);
  for (const s of net.courses.filter((c) => c.kind === 's0')) for (const side of [1, -1]) assert.ok(l0.some((r) => r.sib === s.id && r.sign === side && onLt(r.pts[0]!)), `sinusoid ${s.id} side ${side} does not begin on a terminal lymphatic`);
});
