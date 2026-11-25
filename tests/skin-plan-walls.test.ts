// cuts.ts planSkins: a landing on a host's WALL (a virtual `wall:` node) that crowds a node's skin abuts it on one ring. It used to be marked done with that ONE neighbour and never compared again, so a second skin it
// crowded (the host's other node, on the far side of the landing) kept two seams a ring apart on the host: two skins crowding one vein, the very thing rule 1c forbids. Now every skin a wall crowds is checked: it abuts each
// one it can (the host is skin all the way along), and when it cannot it keeps the tube's own flared end, named, and the other skins stay as they were. And a merged skin's growing arms over SKIN_GROWERS are named in `dropped`.
// Synthetic straight tubes, the hull rule accepting every set: only the planner's bookkeeping is judged here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { MIN_RINGS_BETWEEN, MIN_STUB_R, planSkins, stubLengthR, type ArmTube, type SkinPlan } from '../src/scene/vessels/skin/cuts.ts';
import { SKIN_GROWERS, type SkinArm, type SkinJunction, type Vec3 } from '../src/scene/vessels/skin/types.ts';
import { TUBE_RADIAL } from '../src/scene/vessels/tubes.ts';

const R = 0.02;
/** A straight tube from `p0` along unit `d`, `len` long, `tubular` segments, ring k's vertex j at position index k * (RADIAL + 1) + j (buildTubes' layout). */
function tube(p0: Vec3, d: Vec3, len: number, tubular: number): ArmTube {
  const a: Vec3 = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const n1: Vec3 = [d[1] * a[2] - d[2] * a[1], d[2] * a[0] - d[0] * a[2], d[0] * a[1] - d[1] * a[0]], l1 = Math.hypot(...n1);
  const u: Vec3 = [n1[0] / l1, n1[1] / l1, n1[2] / l1], v: Vec3 = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
  const pos: number[] = [];
  for (let k = 0; k <= tubular; k++) for (let j = 0; j <= TUBE_RADIAL; j++) {
    const t = (len * k) / tubular, th = (2 * Math.PI * j) / TUBE_RADIAL, c = Math.cos(th) * R, s = Math.sin(th) * R;
    for (let q = 0; q < 3; q++) pos.push(p0[q]! + d[q]! * t + u[q]! * c + v[q]! * s);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  return { geometry: g, tubular };
}
const arm = (vesselId: string, end: 0 | 1, extra: Partial<SkinArm> = {}): SkinArm => ({ vesselId, end, courseIndex: 0, dataIndex: 0, lensIndex: 0, baseD: 1, widthKind: 0, restR: R, ...extra });
const h = Math.SQRT1_2;
const accept = () => true;

/** A host H from A (x 0) to B (x L), two branches at each node, and a collateral G landing on H's wall half way. */
function scene(L: number, grow: string[] = ['G']) {
  const T = Math.round(L / 0.005);
  const tubes = new Map<string, ArmTube>([
    ['H', tube([0, 0, 0], [1, 0, 0], L, T)],
    ['A1', tube([0, 0, 0], [-h, h, 0], 0.2, 40)], ['A2', tube([0, 0, 0], [-h, -h, 0], 0.2, 40)],
    ['B1', tube([L, 0, 0], [h, h, 0], 0.2, 40)], ['B2', tube([L, 0, 0], [h, -h, 0], 0.2, 40)],
  ]);
  grow.forEach((g, i) => tubes.set(g, tube([L / 2, 0, 0], [0, i ? -h : 0, i ? h : 1], 0.2, 40)));
  const js: SkinJunction[] = [
    { node: 'A', J: [0, 0, 0], arms: [arm('H', 0), arm('A1', 0), arm('A2', 0)] },
    { node: 'B', J: [L, 0, 0], arms: [arm('H', 1), arm('B1', 0), arm('B2', 0)] },
    { node: `wall:H:${grow.map((g) => `${g}0`).join(',')}`, J: [L / 2, 0, 0], arms: [arm('H', 1, { side: { u: 0.5, dir: -1 } }), arm('H', 0, { side: { u: 0.5, dir: 1 } }), ...grow.map((g) => arm(g, 0, { grow: true }))] },
  ];
  return { js, tubes };
}
/** Every pair of plans that crowd on a vessel without abutting on one ring (rule 1c). */
function crowded(plans: readonly SkinPlan[], tubes: ReadonlyMap<string, ArmTube>): string[] {
  const out: string[] = [];
  for (let i = 0; i < plans.length; i++) for (let k = i + 1; k < plans.length; k++) for (const ca of plans[i]!.cuts) {
    const cb = plans[k]!.cuts.find((c) => c.vesselId === ca.vesselId && c.end !== ca.end);
    if (!cb || cb.ring === ca.ring) continue;
    const lo = ca.end === 0 ? ca : cb, hi = ca.end === 0 ? cb : ca;
    if (hi.ring - lo.ring - 1 < MIN_RINGS_BETWEEN || stubLengthR(tubes.get(ca.vesselId)!, lo.ring, hi.ring, R) < MIN_STUB_R) out.push(`${plans[i]!.junction.node}/${plans[k]!.junction.node} on ${ca.vesselId}`);
  }
  return out;
}

test('a wall landing that crowds the skins on both sides of it abuts both (it was checked against the first one only)', () => {
  const { js, tubes } = scene(0.2);
  const { plans, failures } = planSkins(js, tubes, () => accept);
  assert.deepEqual(failures, []);
  assert.deepEqual(plans.map((p) => p.junction.node).sort(), ['A', 'B', 'wall:H:G0']);
  assert.deepEqual(crowded(plans, tubes), [], 'no two skins crowd one vessel');
  const wall = plans.find((p) => p.junction.node.startsWith('wall:'))!, at = (n: string, end: 0 | 1) => plans.find((p) => p.junction.node === n)!.cuts.find((c) => c.vesselId === 'H' && c.end === end)!.ring;
  assert.equal(wall.cuts.find((c) => c.side === -1)!.ring, at('A', 0), 'abuts A');
  assert.equal(wall.cuts.find((c) => c.side === 1)!.ring, at('B', 1), 'abuts B');
});

test('a wall landing that abuts one skin and crowds another it cannot abut keeps its flared end, named, and both skins stay', () => {
  const { js, tubes } = scene(0.2);
  // (B drawn short of the host's end, at x 0.13, with a hair-thin host arm: its seam on H stands at ring 25, inside the wall's own (ring 30): the two cross, and no one ring can take both)
  const B = js[1]!, short: SkinJunction = { ...B, J: [0.13, 0, 0], arms: B.arms.map((a) => (a.vesselId === 'H' ? { ...a, restR: 0.0001, jointR: 0.0001 } : a)) };
  const { plans, failures } = planSkins([js[0]!, short, js[2]!], tubes, () => accept);
  assert.ok(plans.find((p) => p.junction.node === 'B')!.cuts.find((c) => c.vesselId === 'H')!.ring < 30, 'B\'s seam stands inside the wall\'s');
  assert.deepEqual(crowded(plans, tubes), [], 'no two skins crowd one vessel');
  const named = failures.filter((f) => f.node === 'wall:H:G0');
  assert.ok(plans.some((p) => p.junction.node === 'A') && plans.some((p) => p.junction.node === 'B'), 'both node skins stay');
  assert.ok(!plans.some((p) => p.junction.node.startsWith('wall:')) && named.length === 1 && /crowds the skin of B/.test(named[0]!.message), `the wall is named: ${failures.map((f) => f.message).join('; ')}`);
});

test('a merged skin names the growing arms it cannot carry (over SKIN_GROWERS), never silently leaving one out', () => {
  // (two node skins on one vein, a ring apart: they merge; each brings growing arms, more than SKIN_GROWERS together)
  const L = 0.1, T = 20, gs = Array.from({ length: SKIN_GROWERS + 1 }, (_, i) => `G${i}`);
  const tubes = new Map<string, ArmTube>([['H', tube([0, 0, 0], [1, 0, 0], L, T)], ['A1', tube([0, 0, 0], [-h, h, 0], 0.2, 40)], ['A2', tube([0, 0, 0], [-h, -h, 0], 0.2, 40)], ['B1', tube([L, 0, 0], [h, h, 0], 0.2, 40)]]);
  gs.forEach((g, i) => tubes.set(g, tube(i % 2 ? [L, 0, 0] : [0, 0, 0], [0, Math.cos(i), Math.sin(i)], 0.2, 40)));
  const js: SkinJunction[] = [
    { node: 'A', J: [0, 0, 0], arms: [arm('H', 0), arm('A1', 0), arm('A2', 0), ...gs.filter((_, i) => !(i % 2)).map((g, i) => arm(g, 0, { grow: true, restR: R * (1 - 0.1 * i) }))] },
    { node: 'B', J: [L, 0, 0], arms: [arm('H', 1), arm('B1', 0), ...gs.filter((_, i) => i % 2).map((g, i) => arm(g, 0, { grow: true, restR: R * (0.95 - 0.1 * i) }))] },
  ];
  const { plans, dropped } = planSkins(js, tubes, () => accept, 99);
  const merged = plans.find((p) => p.merged);
  assert.ok(merged, 'the two nodes merge'); assert.equal(merged.junction.arms.filter((a) => a.grow).length, SKIN_GROWERS);
  assert.equal(dropped.length, gs.length - SKIN_GROWERS, `the arms over the cap are named: ${JSON.stringify(dropped)}`);
  const narrowest = js.flatMap((j) => j.arms.filter((a) => a.grow).map((a) => ({ node: j.node, a }))).sort((x, y) => x.a.restR - y.a.restR)[0]!;
  assert.deepEqual(dropped.map((d) => `${d.node}:${d.id}`), [`${narrowest.node}:${narrowest.a.vesselId}`], 'the narrowest goes, under its own node');
});
