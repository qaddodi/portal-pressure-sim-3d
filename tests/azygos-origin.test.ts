// "The junction itself sucks" (Mohammad, 22 Nov, the ascending lumbar vein and the esophageal varices into the azygos). Plan 16D. ROOT CAUSE: the 3D drew two collaterals meeting the azygos's carried-on start from OPPOSITE sides at one point (a "+"), the lumbar
// vein ending at the node 78 units from where 2D ends it, on a trunk strand 3D does not draw, so the lumbar vein and the arch were two tubes of two tiers at one spot, with a skin whose arms were both. Anatomy: the azygos BEGINS from the right ascending
// lumbar vein, and the esophageal veins drain into its SIDE higher up. So the lumbar vein now runs ON into the arch's start (starts.ts RUNS_INTO: its last quarter is one smooth curve, tangent-continuous), the pair are mates (a run-on: no cap, one ring,
// the live widths eased to one), the arch's start is solid as far as the lumbar vein is drawn (eased), and the varices land on the arch's wall alone (`wall:AZY_SVC:C1b1`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { NETWORK_BY_ID, collateralOpen } from '../src/scene/vessels/network.ts';
import { DEPTH_SLOPE_CAP, REST, coursesOf, tubularOf } from '../src/scene/vessels/shape.ts';
import { buildTubes } from '../src/scene/vessels/tubes.ts';
import { SMOOTH, joinSwell } from '../src/scene/vessels/smooth-joins.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { fadeOf } from '../src/scene/vessels/fades.ts';
import { originsOf, runsInto } from '../src/scene/vessels/starts.ts';
import { PresenceTracks } from '../src/scene/vessels/presence-track.ts';
import { findSkinJunctions } from '../src/scene/vessels/skin/inventory.ts';
import { wallJunctions, wallLandings } from '../src/scene/vessels/skin/wall.ts';
import { swellOf } from './skin-live-lib.ts';
// (placed: the courses have their own depth, so a bend and an angle are measured in 3D; the flat figure's x and y are its 3D, z one plane)
const Z = 1;

setSmoothJoins(true);
const PX = 700;   // px per scene unit, the gate's screen
const PRESETS = ['normal', 'csph', 'cirr-comp', 'cirr-decomp', 'schisto', 'ncph', 'budd-chiari', 'ivc-web'];
const deg = (a: number): number => (a * 180) / Math.PI;

const ends = () => {
  const c9 = NETWORK_BY_ID.get('C9')!, az = NETWORK_BY_ID.get('AZY_SVC')!;
  const build = (v: typeof c9) => { const { runs, geometry } = buildTubes(coursesOf(v, REST), tubularOf(v), v.radius), r = runs[0]!, rk = geometry.attributes.rk!; return { curve: r.curve, rad: (k: number) => rk.getX(k * (r.radial + 1)) * v.radius, n: r.tubular }; };
  return { a: build(c9), b: build(az), c9, az };
};

test('the lumbar vein runs on into the azygos start: one ring (centre, radius, tangent), a mate pair with no cap, the azygos start solid with it', () => {
  assert.equal(runsInto('C9'), 'AZY_SVC');
  assert.deepEqual([...originsOf('AZY_SVC')], ['C9']);
  const { a, b, c9, az } = ends();
  const pa = a.curve.getPointAt(1), pb = b.curve.getPointAt(0);
  assert.ok(pa.distanceTo(pb) * PX <= 0.5, `the two end rings' centres are ${(pa.distanceTo(pb) * PX).toFixed(3)} px apart`);
  const dr = Math.abs(a.rad(a.n) - b.rad(0)) * PX;
  assert.ok(dr <= 0.5, `the two end rings' radii differ by ${dr.toFixed(3)} px at rest`);
  const ta = a.curve.getTangentAt(1), tb = b.curve.getTangentAt(0), ang = deg(Math.acos(Math.min(1, ta.dot(tb))));
  assert.ok(ang <= 2, `the two end tangents differ by ${ang.toFixed(2)} degrees`);
  assert.deepEqual([SMOOTH.get('C9')!.mate[1], SMOOTH.get('AZY_SVC')!.mate[0]], ['AZY_SVC', 'C9']);
  assert.deepEqual([SMOOTH.get('C9')!.joined[1], SMOOTH.get('AZY_SVC')!.joined[0]], [true, true], 'a run-on: no cap at the join');
  assert.deepEqual([...fadeOf('AZY_SVC', false)!.connect], ['C9'], 'the arch start is solid while the lumbar vein is drawn');
  assert.equal(c9.to, 'AZY'); assert.equal(az.from, 'AZY');
});

test('at every live swell the presets give the pair, the two end rings share one radius (the mean of their live widths, as the vertex stage eases them)', async () => {
  const { a, b } = ends();
  const out: { type: string }[] = [], core = createCore((m: { type: string }) => out.push(m));
  await core.handle({ type: 'init' });
  const c9 = NETWORK_BY_ID.get('C9')!, az = NETWORK_BY_ID.get('AZY_SVC')!;
  let worst = 0, pairs = 0;
  const idx = (v: typeof c9) => coursesOf(v, REST) && (v.lensId as string);
  void idx;
  const { indexOf } = await import('../src/engine/vessel-data.ts');
  for (const p of PRESETS) {
    out.length = 0; await core.handle({ type: 'preset', id: p, reqId: 1 });
    const fr = out.filter((m) => m.type === 'frame').at(-1) as unknown as { D: ArrayLike<number> };
    const s9 = swellOf(fr.D[indexOf(c9.lensId)]!, c9.baseD, c9.widthKind), sA = swellOf(fr.D[indexOf(az.lensId)]!, az.baseD, az.widthKind);
    const r9 = a.rad(a.n) * joinSwell(s9, sA, 1, 1), rA = b.rad(0) * joinSwell(sA, s9, 0, 0);
    worst = Math.max(worst, Math.abs(r9 - rA) * PX); pairs++;
  }
  core.dispose();
  assert.equal(pairs, PRESETS.length);
  assert.ok(worst <= 0.5, `the rings differ by ${worst.toFixed(3)} px at the worst of the presets' swells`);
});

test('the lumbar vein dives no steeper than DEPTH_SLOPE_CAP anywhere along its course', () => {
  const c = coursesOf(NETWORK_BY_ID.get('C9')!, REST)[0]!.pts;
  let worst = 0;
  for (let i = 1; i < c.length; i++) { const run = Math.hypot(c[i]![0] - c[i - 1]![0], c[i]![1] - c[i - 1]![1]); if (run > 1e-6) worst = Math.max(worst, Math.abs(c[i]![2] - c[i - 1]![2]) / run); }
  assert.ok(worst <= DEPTH_SLOPE_CAP, `steepest depth slope ${worst.toFixed(3)} against the cap ${DEPTH_SLOPE_CAP}`);
});

test('the lumbar vein is one smooth curve into the arch: it turns nowhere sharper than six of the vein\'s radii', () => {
  const c9 = NETWORK_BY_ID.get('C9')!, c = coursesOf(c9, REST)[0]!.pts, az = NETWORK_BY_ID.get('AZY_SVC')!;
  let minR = Infinity;
  for (let i = Math.max(1, c.length - 120); i < c.length - 1; i++) {
    const a = c[i - 1]!, b = c[i]!, d = c[i + 1]!, u = [b[0] - a[0], b[1] - a[1], Z * (b[2] - a[2])], v = [d[0] - b[0], d[1] - b[1], Z * (d[2] - b[2])], lu = Math.hypot(u[0]!, u[1]!, u[2]!), lv = Math.hypot(v[0]!, v[1]!, v[2]!);
    if (lu < 1e-9 || lv < 1e-9) continue;
    const turn = Math.acos(Math.min(1, Math.max(-1, (u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!) / (lu * lv))));
    if (turn > 1e-6) minR = Math.min(minR, ((lu + lv) / 2) / turn);
  }
  assert.ok(minR >= 6 * az.radius, `the tightest bend is ${(minR / az.radius).toFixed(1)} radii of the arch`);
});

test('the varices land on the arch\'s side wall alone, well apart from the lumbar vein\'s mouth: one wall skin, no skin at the lumbar vein', () => {
  const nodes = findSkinJunctions(), welded = new Set<string>();
  for (const j of nodes) for (const a of j.arms) welded.add(`${a.vesselId}:${a.end}`);
  const ls = wallLandings(welded).filter((l) => l.host.id === 'AZY_SVC');
  assert.deepEqual(ls.map((l) => `${l.v.id}:${l.end}`), ['C1b:1'], 'only the varices land on the arch (the lumbar vein is its start)');
  assert.deepEqual(wallJunctions(ls).junctions.map((j) => j.node), ['wall:AZY_SVC:C1b1']);
  const az = NETWORK_BY_ID.get('AZY_SVC')!, c9 = NETWORK_BY_ID.get('C9')!, c1b = NETWORK_BY_ID.get('C1b')!;
  const p = coursesOf(az, REST)[0]!.pts, cb = coursesOf(c1b, REST)[0]!.pts, c9p = coursesOf(c9, REST)[0]!.pts;
  const mouth = cb[cb.length - 1]!, at = c9p[c9p.length - 1]!, apart = Math.hypot(mouth[0] - at[0], mouth[1] - at[1], mouth[2] - at[2]) / (2 * az.radius);
  assert.ok(apart >= 1.5, `the varices' mouth is ${apart.toFixed(2)} arch diameters from the lumbar vein's mouth`);
  // the angle the varices meet the arch's axis at (the arch's own heading where they land)
  let best = Infinity, ang = 0;
  for (let i = 1; i < p.length; i++) { const a = p[i - 1]!, b = p[i]!, d = Math.hypot(mouth[0] - b[0], mouth[1] - b[1]); if (d < best) { best = d; const h = [b[0] - a[0], b[1] - a[1], Z * (b[2] - a[2])], l = Math.hypot(h[0]!, h[1]!, h[2]!), t = [mouth[0] - cb[cb.length - 5]![0], mouth[1] - cb[cb.length - 5]![1], Z * (mouth[2] - cb[cb.length - 5]![2])], lt = Math.hypot(t[0]!, t[1]!, t[2]!); ang = deg(Math.acos(Math.abs((h[0]! * t[0]! + h[1]! * t[1]! + h[2]! * t[2]!) / (l * lt)))); } }
  assert.ok(ang >= 40 && ang <= 80, `the varices meet the arch at ${ang.toFixed(1)} degrees`);
});

test('the arch\'s start is solid as far as the lumbar vein is drawn, and never steps: it eases with the drawing both ways (no pop, at most 0.1 a frame, at 60 Hz and at 30 frames a sweep)', () => {
  const objs = ['C9'].map((id) => ({ edge: { id }, group: { visible: true }, setDotted() {}, setReveal() {} }));
  const run = (frames: number): number => {
    const t = new PresenceTracks(objs as never);
    t.set('C9', 'hidden', true);
    const ms = 1150, dt = ms / frames;   // (the collateral's draw-on time, collateral in PRESENCE_TIMES)
    let last = t.solidAmountOf('C9'), worst = 0;
    t.set('C9', 'shown');
    for (let f = 0; f < frames + 2; f++) { t.step(dt); const a = t.solidAmountOf('C9'); worst = Math.max(worst, Math.abs(a - last)); last = a; }
    assert.equal(last, 1);
    t.set('C9', 'hidden');
    for (let f = 0; f < frames + 2; f++) { t.step(dt); const a = t.solidAmountOf('C9'); worst = Math.max(worst, Math.abs(a - last)); last = a; }
    assert.equal(last, 0);
    return worst;
  };
  for (const frames of [69, 30]) { const w = run(frames); assert.ok(w <= 0.1, `${frames} frames a sweep: the largest step in one frame is ${w.toFixed(3)}`); }
});

test('nothing else of the engine moves: the lumbar vein is the same collateral at the same flow (engine numbers are the 2D app\'s)', async () => {
  // (the change is only in the drawing: collateralOpen reads the engine frame)
  const out: { type: string }[] = [], core = createCore((m: { type: string }) => out.push(m));
  await core.handle({ type: 'init' }); await core.handle({ type: 'preset', id: 'budd-chiari', reqId: 1 });
  const fr = out.filter((m) => m.type === 'frame').at(-1) as never;
  core.dispose();
  assert.equal(collateralOpen('C9', fr), true, 'the lumbar vein is open in Budd-Chiari');
});
