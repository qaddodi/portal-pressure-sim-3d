// Every pressure label on the approved placement (PPS_ANATOMY=placed, `?anatomy=new`) hangs on its own drawn vessel, where that vessel is the one seen. The placed vessels cross in depth, so a dot
// chosen only by its distance from the other dots stood under another vessel and its leader pointed at that one: "Lower IVC" on the left portal vein, "Hepatic artery" on the portal vein (the
// artery's trunk runs behind it, 0.034 from its centreline where the radii make 0.033), "IVC" at the hepatic veins' mouth, "Right sinusoids" at a node nothing drawn marks, and a slide's card
// at today's 2D place of its node (owner's iPhone, Anatomy and the Circulation deck, 24 Nov). Root: stations.ts `spreadAtRest` and the solver's slides knew the other dots, not the other
// vessels. Pinned here, in the free view and under every slide's way of naming stations (presenting), on a phone and a Mac, with the figure's base vessels and with every collateral and shunt drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.PPS_ANATOMY = 'placed';
const { PLACED, placedNode } = await import('../src/scene/anatomy/source.ts');
const { STATIONS, UNSEEN_STATIONS, SEEN_MARGIN, SEEN_BEHIND, nodeAt } = await import('../src/scene/labels/stations.ts');
const { MAPPED, NETWORK_BY_ID } = await import('../src/scene/vessels/network.ts');
const { REST, coursesOf } = await import('../src/scene/vessels/shape.ts');
const { anchorPoint } = await import('../src/scene/labels/figure-cards.ts');
const { SHOTS } = await import('../src/scene/camera/shots.ts');
const { CameraRig } = await import('../src/scene/camera/rig.ts');
const { planLayout, BAR } = await import('../src/ui/layout/plan.ts');
const { LabelController, NO_STATE, GHOST } = await import('../src/scene/labels/controller.ts');
const { rectToBox } = await import('../src/scene/labels/geometry.ts');
const { Vector3 } = await import('three');
type LabelDeps = import('../src/scene/labels/controller.ts').LabelDeps;
type NetVessel = import('../src/scene/vessels/network.ts').NetVessel;

type P3 = readonly number[];
const course = new Map(MAPPED.map((v) => [v.id, coursesOf(v, REST)[0]!.pts as readonly P3[]]));
/** Nearest point of a polyline: its 3D distance, and its front-view distance and depth at the front view's nearest point. */
function near3(p: InstanceType<typeof Vector3>, pts: readonly P3[]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!, ab = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], l2 = ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a[0]!) * ab[0]! + (p.y - a[1]!) * ab[1]! + (p.z - a[2]!) * ab[2]!) / l2)) : 0;
    best = Math.min(best, Math.hypot(a[0]! + t * ab[0]! - p.x, a[1]! + t * ab[1]! - p.y, a[2]! + t * ab[2]! - p.z));
  }
  return best;
}
function nearXY(p: InstanceType<typeof Vector3>, pts: readonly P3[]): { d: number; z: number } {
  let best = { d: Infinity, z: 0 };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!, dx = b[0]! - a[0]!, dy = b[1]! - a[1]!, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a[0]!) * dx + (p.y - a[1]!) * dy) / l2)) : 0;
    const d = Math.hypot(a[0]! + t * dx - p.x, a[1]! + t * dy - p.y);
    if (d < best.d) best = { d, z: a[2]! + t * (b[2]! - a[2]!) };
  }
  return best;
}
/** The vessels that cover a dot on `own` in the front view: another vein's centreline within both radii (and the margin), not behind the dot. */
function covering(own: NetVessel, p: InstanceType<typeof Vector3>, drawn: (v: NetVessel) => boolean): string[] {
  const out: string[] = [];
  for (const v of MAPPED) {
    if (v.host === own.host || !drawn(v)) continue;
    const n = nearXY(p, course.get(v.id)!);
    if (n.d < v.radius + own.radius + SEEN_MARGIN && n.z >= p.z - SEEN_BEHIND) out.push(`${v.id} (${n.d.toFixed(3)} off, ${(n.z - p.z).toFixed(3)} in front)`);
  }
  return out;
}
const BASE = (v: NetVessel) => v.kind !== 'collateral' && v.kind !== 'shunt';
const ALL = () => true;

test('the switch is on for this file', () => assert.equal(PLACED, true));

test('no station is named twice, and every placed station has a label (none is left without a seen vessel)', () => {
  const ids = STATIONS.map((s) => s.id);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
  assert.deepEqual([...UNSEEN_STATIONS], []);
});

test('each vessel station rests on its own drawn centreline, nearer to it than to any other vessel (3D)', () => {
  for (const s of STATIONS) {
    if (s.kind !== 'vessel') continue;
    const own = NETWORK_BY_ID.get(s.vessel!)!, p = s.at(s.u0, new Vector3());
    const d = near3(p, course.get(own.id)!);
    assert.ok(d <= own.radius, `${s.id}: ${d.toFixed(4)} from ${own.id}'s centreline (radius ${own.radius})`);
    for (const v of MAPPED) if (v.host !== own.host) { const o = near3(p, course.get(v.id)!); assert.ok(o > d, `${s.id}: nearer ${v.id} (${o.toFixed(4)}) than its own ${own.id} (${d.toFixed(4)})`); }
  }
});

test('each vessel station rests where its own vessel is the one seen from the front: no other vein over it, with the base vessels and, where the course allows, with every collateral and shunt', () => {
  for (const s of STATIONS) {
    if (s.kind !== 'vessel') continue;
    const own = NETWORK_BY_ID.get(s.vessel!)!, p = s.at(s.u0, new Vector3());
    assert.deepEqual(covering(own, p, BASE), [], `${s.id} on ${own.id} at u ${s.u0}`);
  }
  // the lower cava, with the TIPS and the DIPS drawn ("Lower IVC 5.2" on the portal vein, Healthy with TIPS and DIPS)
  const ivci = STATIONS.find((s) => s.id === 'IVCI')!;
  assert.deepEqual(covering(NETWORK_BY_ID.get(ivci.vessel!)!, ivci.at(ivci.u0, new Vector3()), ALL), []);
});

test('the hepatic artery is named on a stretch of its tree that is seen (its trunk runs behind the portal vein all along), and the sinusoids on their drawn beds', () => {
  const ha = STATIONS.find((s) => s.id === 'HA')!;
  assert.ok(['A_HEP', 'A_HR', 'A_HL'].includes(ha.vessel!), ha.vessel!);
  for (const id of ['SIN_R', 'SIN_L']) { const s = STATIONS.find((x) => x.id === id)!; assert.equal(s.kind, 'vessel', id); assert.equal(NETWORK_BY_ID.get(s.vessel!)!.kind, 'liver', id); }
});

test("a slide's card at a node or a plate point stands at the placed place, not today's 2D one", () => {
  for (const n of ['RA', 'CONF', 'IVCS', 'RHV', 'SIN_R', 'PVH']) {
    const want = placedNode(n)!, got = anchorPoint({ node: n }, new Vector3())!;
    assert.ok(got && Math.hypot(got.x - want[0], got.y - want[1], got.z - want[2]) < 1e-9, n);
    const a = nodeAt(n); assert.ok(Math.hypot(a[0] - want[0], a[1] - want[1], a[2] - want[2]) < 1e-9, n);
  }
});

// The controller as the app runs it: every label it draws stands at a dot on a seen stretch of its own vessel, and no id is drawn twice (a ghost is the picture a label leaves, never a second label).
const SCREENS = { phone: { w: 393, h: 852, safe: { top: 59, right: 0, bottom: 34, left: 0 } }, deckPhone: { w: 440, h: 736, safe: { top: 0, right: 0, bottom: 0, left: 0 } }, mac: { w: 1280, h: 800, safe: { top: 0, right: 0, bottom: 0, left: 0 } } } as const;
const measure: LabelDeps['measure'] = (t, size, _w, track = 0) => [...t].reduce((w, c) => w + size * (c === '.' || c === '1' ? 0.3 : c === ' ' ? 0.25 : 0.56), 0) + track * t.length;
function run(screen: keyof typeof SCREENS, shot: keyof typeof SHOTS, state: Partial<typeof NO_STATE>, drawn: (v: NetVessel) => boolean) {
  const vp = SCREENS[screen], plan = planLayout(vp, [], 'words');
  const rig = new CameraRig(SHOTS[shot], plan.free); rig.resize(vp.w, vp.h); rig.update(0);
  let t = 1000;
  const deps: LabelDeps = {
    now: () => t, project: (p, o) => rig.project(p, o), cameraMoving: () => rig.isMoving,
    free: () => rectToBox(plan.free), view: () => ({ x0: vp.safe.left, y0: vp.safe.top + BAR, x1: vp.w - vp.safe.right, y1: vp.h - vp.safe.bottom }),
    vp: () => vp, reversed: () => false, words: () => null, blockers: () => [], measure,
    pressure: () => 5, reading: () => null, cathere: () => 0, drawn: (v) => drawn(v as NetVessel), level: () => 'all', zoom: () => 1,
  };
  const ctl = new LabelController(deps);
  ctl.setState({ ...NO_STATE, ...state });
  for (let i = 0; i < 400; i++) { t += 16.67; rig.update(t); ctl.tick(); }
  return { ctl, rig };
}
const CASES: [keyof typeof SCREENS, keyof typeof SHOTS, string, Partial<typeof NO_STATE>, (v: NetVessel) => boolean][] = [];
const every = new Set(STATIONS.filter((s) => s.kind !== 'organ').map((s) => s.id));
for (const screen of Object.keys(SCREENS) as (keyof typeof SCREENS)[]) {
  CASES.push([screen, 'free', 'free play, base vessels', {}, BASE], [screen, 'free', 'free play, every collateral and shunt', {}, ALL]);
  CASES.push([screen, 'route', 'a slide naming every station', { presenting: true, named: every }, BASE]);
  for (const set of [['CONF', 'SIN_R', 'RHV', 'RA', 'IVCS'], ['SIN_R', 'CONF'], ['LHV', 'SIN_L', 'LPV'], ['IVCI', 'HA', 'CONF']]) CASES.push([screen, 'route', `a slide naming ${set.join(', ')}`, { presenting: true, named: new Set(set) }, BASE]);
}
for (const [screen, shot, what, state, drawn] of CASES) {
  test(`${screen}, ${what}: every drawn label's dot is on a seen stretch of its own vessel, and no label is drawn twice`, () => {
    const { ctl, rig } = run(screen, shot, state, drawn);
    const ids = ctl.out.filter((o) => !o.ghost).map((o) => o.id);
    assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], 'an id drawn twice');
    assert.ok(ids.length > 0, 'no label drawn');   // (the slide camera without its region frames some dots off the view: they are hidden, as today)
    for (const o of ctl.out) {
      if (o.ghost || o.kind !== 'station' || !o.anchor) continue;
      const s = STATIONS.find((x) => x.id === o.id.replace(GHOST, ''));
      if (!s || s.kind !== 'vessel') continue;
      // the course point the dot stands at (the nearest of 1001 along it, on the screen)
      let bu = 0, bd = Infinity; const q = new Vector3();
      for (let i = 0; i <= 1000; i++) { const a = rig.project(s.at(i / 1000, q), { x: 0, y: 0 }); const d = Math.hypot(a.x - o.anchor.x, a.y - o.anchor.y); if (d < bd) { bd = d; bu = i / 1000; } }
      assert.ok(bd < 1, `${s.id}: its dot is ${bd.toFixed(1)} px off its own vessel ${s.vessel}`);
      assert.ok(s.rests!(bu), `${s.id}: its dot stands at u ${bu} of ${s.vessel}, under another vessel: ${covering(NETWORK_BY_ID.get(s.vessel!)!, s.at(bu, q), BASE).join('; ')}`);
    }
  });
}
