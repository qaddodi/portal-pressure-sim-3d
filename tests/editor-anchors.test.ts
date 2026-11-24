// Anatomy editor re-anchoring (docs/editor-plan.md WS-D): with empty overrides every re-anchored consumer reads exactly what it read before; with a node and an organ
// moved, the label anchors, organ names, catheter and scope inputs and the catheter shots follow, and none reads the reference geometry.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setOverridesForTest } from '../src/editor/store.ts';
import { EMPTY, type Overrides } from '../src/editor/types.ts';
import { EDGE_PATH_2D, NODE_POS_2D } from '../src/scene/vessels/paths.copied.ts';
import { x3, y3, UNITS_PER_SCENE as U } from '../src/scene/frame2d.ts';

const SAMPLE: Overrides = { version: 1, nodes: { CONF: { dx: 20, dy: -30, dz: 0.05 } }, organs: { liver: { move: [0.05, 0, 0] }, stomach: { move: [0.02, -0.03, 0], rotY: 0.2, scale: 1.1 } } };

test('empty overrides: every anchor is the reference value itself (child process, nothing edited)', () => {
  const code = `
    import assert from 'node:assert/strict';
    const A = await import('./src/scene/editor-anchors.ts');
    const P = await import('./src/scene/vessels/paths.copied.ts');
    const F = await import('./src/scene/frame2d.ts');
    const { editedPlan } = await import('./src/editor/vessel-plan.ts');
    assert.equal(editedPlan(), P.EDGE_PATH_2D);
    for (const id of Object.keys(P.NODE_POS_2D)) assert.equal(A.nodePos2D(id), P.NODE_POS_2D[id], id);
    assert.deepEqual(A.nodeFollow2D(560, 250), [0, 0]);
    assert.equal(A.withOrgan('liver', [1, 2])[0], 1);
    const { SHOTS } = await import('./src/scene/camera/shots.ts');
    assert.deepEqual(SHOTS.route.target, [F.x3(560), F.y3(70), -0.3]);
    assert.deepEqual(SHOTS.free.target, [F.x3(560), F.y3(260), -0.2]);
    assert.deepEqual(SHOTS.wedge.target, [F.x3(540), F.y3(250), -0.25]);
    assert.deepEqual(SHOTS.hvpg.target, SHOTS.wedge.target);
    const { catheterRoute } = await import('./src/scene/catheter-route.ts');
    assert.ok(catheterRoute().length > 10);
    const { STATIONS } = await import('./src/scene/labels/stations.ts');
    const co = STATIONS.find((s) => s.id === 'organ:liver');
    assert.deepEqual([...co.at2d], [...(await import('./src/scene/labels/names.copied.ts')).LABEL_NAMES.ORGAN_AT['Liver']]);
    const q = [880, 395];
    assert.equal(A.withOrgan('stomach', q), q);
    assert.equal(A.followOrganAt(q), q);
    assert.equal(A.organMap('liver'), null);
    assert.equal(A.zAtPoint('RHV_IVC', 3, 10, 0.123), 0.123);
    const { scopeWay } = await import('./src/scene/devices/probes/scope.ts');
    const w = scopeWay();
    assert.ok(w.total > 100 && Number.isFinite(w.hvD));
    const AP = await import('./src/scene/disease/ascites-pool.ts');
    const AB = await import('./src/scene/disease/copied/anatomy-b4.ts');
    for (const st of [0, 3, AB.ABDOMEN_OUTLINES.length - 1]) assert.deepEqual(AP.polyOf(st), AP.bellyPolygon(AP.outlinePolygon(AB.ABDOMEN_OUTLINES[st])));
    assert.equal(A.wallFollow(q), q);
    const { glueTarget3 } = await import('./src/scene/devices/glue-cast.ts');
    const { EUS_GLUE_TARGET } = await import('./src/scene/devices/probes/copied/eus-scope.copied.js');
    const { NETWORK_BY_ID } = await import('./src/scene/vessels/network.ts');
    assert.equal(glueTarget3().z, F.TIER_Z[NETWORK_BY_ID.get(EUS_GLUE_TARGET[0]).tier]);
    console.log('ok');
  `;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /ok/);
});

test('with a node and an organ moved, the anchors follow and the reference is untouched', async () => {
  setOverridesForTest(SAMPLE);
  const A = await import('../src/scene/editor-anchors.ts');
  const ref = NODE_POS_2D.CONF!;
  assert.deepEqual(A.nodePos2D('CONF'), [ref[0] + 20, ref[1] - 30]);
  assert.deepEqual(A.nodePos2D('SV'), NODE_POS_2D.SV, 'an unmoved node keeps its place');
  assert.deepEqual(NODE_POS_2D.CONF, ref, 'the reference table is never written');
  assert.equal(A.organMap('spleen'), null);
  assert.equal(A.withOrgan('spleen', [1, 2])[0], 1);
  // framing: a point at the moved node follows it fully, a far one not at all
  const here = A.nodeFollow2D(ref[0], ref[1]);
  assert.ok(Math.abs(here[0] - 20) < 1e-9 && Math.abs(here[1] + 30) < 1e-9);
  assert.deepEqual(A.nodeFollow2D(ref[0] + 400, ref[1]), [0, 0]);
  const L = A.withOrgan('liver', [100, 100]);
  assert.ok(Math.abs(L[0] - 115) < 1e-9 && L[1] === 100);

  // the shots follow the nodes near their target (the catheter shots look at the hepatic veins, far from CONF: they stay), the whole-figure shots stay
  const { SHOTS } = await import('../src/scene/camera/shots.ts');
  assert.deepEqual(SHOTS.title.target, [x3(740), y3(480), 0]);
  const f = A.pointShift(560, 260, ['RHV_IVC', 'RHV_IVC_1', 'MHV_IVC', 'LHV_IVC']);
  assert.deepEqual(SHOTS.free.target, [x3(560 + f[0]), y3(260 + f[1]), -0.2 + f[2]]);

  // station dots and organ names stand on the moved node and organ
  const { STATIONS } = await import('../src/scene/labels/stations.ts');
  const { Vector3 } = await import('three');
  const o = new Vector3();
  const liver = STATIONS.find((s) => s.id === 'organ:liver')!;
  const { LABEL_NAMES } = await import('../src/scene/labels/names.copied.ts');
  const at = (LABEL_NAMES.ORGAN_AT as Record<string, readonly [number, number]>)['Liver']!;
  assert.ok(Math.abs(liver.at2d![0] - (at[0] + 0.05 * U)) < 1e-9);
  liver.at(0.5, o);
  assert.ok(Math.abs(o.x - x3(at[0] + 0.05 * U)) < 1e-9);
  const { anchorPoint } = await import('../src/scene/labels/figure-cards.ts');
  anchorPoint({ node: 'CONF' }, o);
  assert.ok(Math.abs(o.x - x3(ref[0] + 20)) < 1e-9 && Math.abs(o.y - y3(ref[1] - 30)) < 1e-9);

  // the catheter and scope read the figure's built course, never EDGE_PATH_2D, once anything is edited
  assert.equal(A.planEdited(), true);
  const built = (await import('../src/scene/vessels/network.ts')).NETWORK_BY_ID.get('RHV_IVC')!.plan as { base: readonly unknown[] };
  const { editedPlan } = await import('../src/editor/vessel-plan.ts');
  assert.ok(built.base.length > 1);
  assert.notEqual(editedPlan(), EDGE_PATH_2D, 'the plan the consumers read is the edited one');
  assert.deepEqual(EDGE_PATH_2D.RHV_IVC, EDGE_PATH_2D.RHV_IVC, 'the reference table is never written');

  // organ rotation and scale are carried by the same arithmetic as applyOrganEdit: a point at the centre only moves, one off it turns and scales
  const { organPointMap } = await import('../src/editor/organ-apply.ts');
  const c: [number, number, number] = [0.1, 0.2, -0.06];
  const map = organPointMap({ move: [0.02, -0.03, 0], rotY: 0.2, scale: 1.1 }, c)!;
  const m0 = map(c);
  assert.ok(Math.abs(m0[0] - 0.12) < 1e-12 && Math.abs(m0[1] - 0.17) < 1e-12 && Math.abs(m0[2] + 0.06) < 1e-12);
  const m1 = map([c[0] + 1, c[1], c[2]]);
  assert.ok(Math.abs(m1[0] - (c[0] + 1.1 * Math.cos(0.2) + 0.02)) < 1e-12 && Math.abs(m1[2] - (c[2] - 1.1 * Math.sin(0.2))) < 1e-12);
  assert.equal(organPointMap({}, c), null);
  const sto = A.withOrgan('stomach', [880, 395]);
  assert.ok(Math.hypot(sto[0] - 880, sto[1] - 395) > 1, 'a stomach point follows the stomach');
  assert.deepEqual(A.followOrganAt([0, 0]), [0, 0], 'a point on no edited organ stays');

  // depth: a node's dz is in the vessel's built course ONCE (network.ts courseOf); the anchors add it to the node's tier depth once, and never to the course again
  const { NETWORK, NODE_Z, courseOf } = await import('../src/scene/vessels/network.ts');
  const { TIER_Z } = await import('../src/scene/frame2d.ts');
  const v = NETWORK.find((q) => !q.feeder && (q.from === 'CONF' || q.to === 'CONF') && q.plan?.kind === 'coil')!;
  const course = courseOf(v.id), end = v.to === 'CONF' ? course.length - 1 : 0;
  assert.ok(Math.abs(course[end]![2] - (TIER_Z[v.tier] + 0.05)) < 1e-9, 'the course carries dz once');
  assert.equal(A.zAtPoint(v.id, end, course.length, TIER_Z[v.tier]), course[end]![2], 'zAtPoint reads the course, adding nothing');
  anchorPoint({ node: 'CONF' }, o);
  assert.ok(Math.abs(o.z - (NODE_Z.get('CONF')! + 0.05)) < 1e-9, 'the node anchor adds dz to the node depth once');
  setOverridesForTest(EMPTY);
});

test('no anchored consumer imports the reference plan or reads the copied GEO2D any more', () => {
  const files = ['src/scene/catheter-route.ts', 'src/scene/labels/stations.ts', 'src/scene/labels/figure-cards.ts', 'src/scene/devices/probes/scope.ts', 'src/scene/procedures/route.ts', 'src/decks/ag/shots.ts', 'src/decks/rw/cams.ts'];
  for (const f of files) {
    const s = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/NODE_POS_2D\s*\[/.test(s), `${f} indexes NODE_POS_2D`);
    assert.ok(!/EDGE_PATH_2D/.test(s), `${f} reads EDGE_PATH_2D`);
  }
});

test('a point map and strokeDisplace give the place the mesh vertex at that place goes to (liquify, move, turn and scale)', async () => {
  const { SphereGeometry } = await import('three');
  const { applyOrganEdit, organCentroid, organPointMap, strokeDisplace } = await import('../src/editor/organ-apply.ts');
  const edit = { move: [0.04, -0.02, 0.01], rotY: 0.2, scale: 1.08, strokes: [{ at: [0.3, 0.1, 0.05], radius: 0.4, by: [0.03, 0.02, 0.01] }, { at: [-0.2, 0.2, 0], radius: 0.3, by: [-0.02, 0.03, 0] }] } as const;
  const make = () => { const g = new SphereGeometry(0.5, 12, 8); g.translate(0.1, 0.2, -0.05); return g; };
  const ref = make(), g = make(), c = organCentroid(ref);
  applyOrganEdit(g, edit);
  const map = organPointMap(edit, c)!, a = ref.getAttribute('position').array, b = g.getAttribute('position').array;
  for (let i = 0; i < a.length; i += 3) {
    const q = map([a[i]!, a[i + 1]!, a[i + 2]!]);
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(q[k]! - b[i + k]!) < 1e-6, `vertex ${i / 3} axis ${k}`);
  }
  // strokes alone: the pull is exactly the vertex's move, clamped
  const only = { strokes: edit.strokes }, g2 = make();
  applyOrganEdit(g2, only);
  const b2 = g2.getAttribute('position').array;
  let moved = 0;
  for (let i = 0; i < a.length; i += 3) {
    const d = strokeDisplace(only, [a[i]!, a[i + 1]!, a[i + 2]!]);
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(a[i + k]! + d[k]! - b2[i + k]!) < 1e-6);
    if (Math.hypot(...d) > 1e-4) moved++;
  }
  assert.ok(moved > 3, 'some vertices are pulled');
  assert.deepEqual(strokeDisplace({ move: [0.1, 0, 0] }, [0, 0, 0]), [0, 0, 0]);
  assert.equal(organPointMap({ strokes: [] }, c), null);
});

test('the ascites wall follows the organs that bound it, near them and fading away', async () => {
  const { LABEL_NAMES } = await import('../src/scene/labels/names.copied.ts');
  setOverridesForTest({ version: 1, organs: { liver: { move: [0.06, 0.03, 0], strokes: [{ at: [-0.6, 0, 0.03], radius: 0.4, by: [0.02, 0, 0] }] } } });
  const A = await import('../src/scene/editor-anchors.ts');
  const AP = await import('../src/scene/disease/ascites-pool.ts');
  const AB = await import('../src/scene/disease/copied/anatomy-b4.ts');
  const step = AB.ABDOMEN_OUTLINES.length - 1, base = AP.bellyPolygon(AP.outlinePolygon(AB.ABDOMEN_OUTLINES[step]!)), now = AP.polyOf(step);
  assert.equal(now.length, base.length);
  let near = 0, far = 0;
  for (let i = 0; i < base.length; i++) {
    const d = Math.hypot(now[i]![0] - base[i]![0], now[i]![1] - base[i]![1]);
    assert.ok(Number.isFinite(d) && d <= 0.2 * 300 + 1e-6, 'never further than the organ moved');
    if (d > 1) near++; else if (d === 0) far++;
  }
  assert.ok(near > 0, 'the wall by the liver moves');
  assert.ok(far > 0, 'the wall far from every edited organ does not');
  assert.ok(LABEL_NAMES);
  assert.deepEqual(A.wallFollow([1400, 1000]), [1400, 1000]);
  setOverridesForTest(EMPTY);
  const back = AP.polyOf(step);
  assert.deepEqual(back, base, 'the cache follows the overrides');
});

test('the glue target follows a vessel\'s dz, once (a fresh process: the network is built from the overrides at import)', () => {
  const code = `
    import assert from 'node:assert/strict';
    const { setOverridesForTest } = await import('./src/editor/store.ts');
    const { EUS_GLUE_TARGET } = await import('./src/scene/devices/probes/copied/eus-scope.copied.js');
    const id = EUS_GLUE_TARGET[0];
    setOverridesForTest({ version: 1, vessels: { [id]: { pts: [{ u: EUS_GLUE_TARGET[1], dx: 0, dy: 0, dz: 0.05 }] } } });
    const A = await import('./src/scene/editor-anchors.ts');
    const { NETWORK_BY_ID } = await import('./src/scene/vessels/network.ts');
    const { TIER_Z } = await import('./src/scene/frame2d.ts');
    const { glueTarget3 } = await import('./src/scene/devices/glue-cast.ts');
    const tier = TIER_Z[NETWORK_BY_ID.get(id).tier], z = glueTarget3().z;
    assert.ok(Math.abs(z - A.zAtArc(id, EUS_GLUE_TARGET[1], tier)) < 1e-12);
    assert.ok(z > tier + 0.03 && z < tier + 0.051, 'dz in once: ' + (z - tier));
    console.log('ok');
  `;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('a node dz reaches the scope and glue targets by the eased arm amount (fresh process)', () => {
  const code = `
    import assert from 'node:assert/strict';
    const { setOverridesForTest } = await import('./src/editor/store.ts');
    const { EUS_TARGETS } = await import('./src/scene/devices/probes/copied/eus-scope.copied.js');
    const [id, f] = EUS_TARGETS.pv;
    const { EDGES } = await import('./src/engine/hales/portal/topology.js');
    const ed = EDGES.find((q) => q.id === id);
    const o = { version: 1, nodes: { [ed.to]: { dx: 0, dy: 0, dz: 0.08 } } };
    setOverridesForTest(o);
    const A = await import('./src/scene/editor-anchors.ts');
    const V = await import('./src/editor/vessel-apply.ts');
    const { EDGE_PATH_2D } = await import('./src/scene/vessels/paths.copied.ts');
    const { editedPlan } = await import('./src/editor/vessel-plan.ts');
    const { TIER_Z } = await import('./src/scene/frame2d.ts');
    const { NETWORK_BY_ID } = await import('./src/scene/vessels/network.ts');
    const tier = TIER_Z[NETWORK_BY_ID.get(id).tier];
    const z = A.zAtArc(id, f, tier);
    // the eased arm amount, straight from vessel-apply, at the same place along the course
    const p = editedPlan()[id];
    const ap = V.applyVesselOverrides(ed, EDGE_PATH_2D[id], o);
    assert.ok(ap.dz, 'the arm carries a depth offset');
    let tot = 0; const cum = [0];
    for (let i = 1; i < p.length; i++) { tot += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); cum.push(tot); }
    const s = f * tot; let i = 1; while (i < p.length - 1 && cum[i] < s) i++;
    const u = (cum[i] - cum[i - 1]) > 0 ? (s - cum[i - 1]) / (cum[i] - cum[i - 1]) : 0;
    const want = V.dzAt(ap.dz, (i - 1 + u) / (p.length - 1));
    assert.ok(want > 0.001 && want < 0.08, 'eased: part of the move: ' + want);
    assert.ok(Math.abs(z - (tier + want)) < 1e-9, 'target shifted by the eased amount ' + (z - tier) + ' vs ' + want);
    console.log('ok');
  `;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: process.cwd(), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('every slide camera region is anchored to an organ or vessel, or listed as fixed; the anchors follow edits (audit 9)', async () => {
  const { REGIONS_2D } = await import('../src/decks/ag/regions.generated.ts');
  const { REGION_ANCHORS, UNANCHORED_REGIONS } = await import('../src/scene/editor-anchors.ts');
  for (const n of Object.keys(REGIONS_2D)) assert.ok(REGION_ANCHORS[n] || UNANCHORED_REGIONS.includes(n), `region "${n}" has no anchor and is not listed as fixed`);
  const { UNANCHORED_SHOTS } = await import('../src/scene/camera/shots.ts');
  assert.deepEqual([...UNANCHORED_SHOTS], ['title', 'play', 'pick']);
});

test('slide cameras and catheter shots follow vessel, depth and organ edits (fresh process); unedited they are the reference', () => {
  const run = (o: string) => {
    const code = `
      const { setOverridesForTest } = await import('./src/editor/store.ts');
      setOverridesForTest(${o});
      const { SHOTS } = await import('./src/scene/camera/shots.ts');
      const { regionBox, shotOfCam } = await import('./src/decks/ag/shots.ts');
      const { REGIONS_2D } = await import('./src/decks/ag/regions.generated.ts');
      const { boxOf } = await import('./src/decks/rw/cams.ts');
      const F = await import('./src/scene/frame2d.ts');
      console.log(JSON.stringify({ free: SHOTS.free.target, route: SHOTS.route.target, liver: regionBox('liver'), hep: regionBox('hepatic'), rw: boxOf('liver'), shot: shotOfCam('liver').shot.target, ref: REGIONS_2D.liver, refFree: [F.x3(560), F.y3(260), -0.2] }));
    `;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: process.cwd(), encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout.trim().split('\n').pop()!);
  };
  const a = run('{ version: 1 }');
  assert.deepEqual(a.free, a.refFree);
  assert.deepEqual(a.liver, a.ref);
  assert.deepEqual(a.rw, a.ref);
  // the liver moved 0.05 right: its region and its shot move 15 figure units / 0.05 scene units
  const b = run('{ version: 1, organs: { liver: { move: [0.05, 0, 0] } } }');
  assert.ok(Math.abs(b.liver[0] - (a.liver[0] + 15)) < 1e-6 && Math.abs(b.rw[2] - (a.rw[2] + 15)) < 1e-6);
  assert.ok(Math.abs(b.shot[0] - (a.shot[0] + 0.05)) < 1e-6);
  assert.ok(b.free.every((v: number) => Number.isFinite(v)), 'the hepatic-vein shots stay finite (the veins inside the liver follow it)');
  // a vessel bend and a depth edit on the middle hepatic vein carry the catheter shots that look at it
  const c = run("{ version: 1, vessels: { MHV_IVC: { pts: [{ u: 0.25, dx: 0, dy: -12, dz: 0.04 }] } } }");
  assert.ok(c.free[1] !== a.free[1] || c.free[2] !== a.free[2], 'the free shot follows the edited vein');
  assert.ok(c.free[2] > a.free[2], 'and its depth');
});

test('the lobule and sinusoid dive stands on the liver point carried by the liver edit (audit 10)', () => {
  const run = (o: string) => {
    const code = `
      const { setOverridesForTest } = await import('./src/editor/store.ts');
      setOverridesForTest(${o});
      const F = await import('./src/scene/lobule/frames.ts');
      const A = await import('./src/scene/editor-anchors.ts');
      const ref = [(F.LIVER_2D.x - 700) / 300, -(F.LIVER_2D.y - 556) / 300, F.LIVER_Z];
      const L = F.lobuleWorld([0, 0, 0]);
      console.log(JSON.stringify({ p: F.LIVER_POINT, ref, lobule: L, sin: F.SIN_POINT, viaMap: A.organPoint('liver', ref) }));
    `;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: process.cwd(), encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout.trim().split('\n').pop()!);
  };
  const a = run('{ version: 1 }');
  assert.deepEqual(a.p, a.ref, 'unedited: the fixed point');
  const b = run('{ version: 1, organs: { liver: { move: [0.05, -0.02, 0.01], rotY: 0.2, scale: 1.1, strokes: [{ at: [-0.6, 0.8, -0.15], radius: 0.5, by: [0.02, 0.01, 0] }] } } }');
  assert.deepEqual(b.p, b.viaMap, 'edited: the liver point carried by the liver\'s own map');
  assert.ok(Math.hypot(b.p[0] - b.ref[0], b.p[1] - b.ref[1], b.p[2] - b.ref[2]) > 0.02, 'it moved');
  assert.ok(Math.abs(b.lobule[0] - b.p[0]) < 1e-12 && Math.abs(b.sin[0] - b.p[0]) < 0.01, 'the lobule and the sinusoid stand on it');
});
