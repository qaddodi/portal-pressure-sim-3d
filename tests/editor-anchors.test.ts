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

const SAMPLE: Overrides = { version: 1, nodes: { CONF: { dx: 20, dy: -30 } }, organs: { liver: { move: [0.05, 0, 0] } } };

test('empty overrides: every anchor is the reference value itself (child process, nothing edited)', () => {
  const code = `
    import assert from 'node:assert/strict';
    const A = await import('./src/scene/editor-anchors.ts');
    const P = await import('./src/scene/vessels/paths.copied.ts');
    const F = await import('./src/scene/frame2d.ts');
    for (const id of Object.keys(P.EDGE_PATH_2D)) assert.equal(A.path2D(id), P.EDGE_PATH_2D[id], id);
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
  assert.deepEqual(A.organShift2D('liver'), [0.05 * U, -0]);
  assert.equal(A.organShift2D('spleen'), null);
  // framing: a point at the moved node follows it fully, a far one not at all
  const here = A.nodeFollow2D(ref[0], ref[1]);
  assert.ok(Math.abs(here[0] - 20) < 1e-9 && Math.abs(here[1] + 30) < 1e-9);
  assert.deepEqual(A.nodeFollow2D(ref[0] + 400, ref[1]), [0, 0]);
  const L = A.withOrgan('liver', [100, 100]);
  assert.ok(Math.abs(L[0] - 115) < 1e-9 && L[1] === 100);

  // the shots follow the nodes near their target (the catheter shots look at the hepatic veins, far from CONF: they stay), the whole-figure shots stay
  const { SHOTS } = await import('../src/scene/camera/shots.ts');
  assert.deepEqual(SHOTS.title.target, [x3(740), y3(480), 0]);
  const f = A.nodeFollow2D(560, 260);
  assert.deepEqual(SHOTS.free.target, [x3(560 + f[0]), y3(260 + f[1]), -0.2]);

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
  const built = (await import('../src/scene/vessels/network.ts')).NETWORK_BY_ID.get('RHV_IVC')!.plan as { base: unknown };
  assert.equal(A.path2D('RHV_IVC'), built.base);
  assert.notEqual(A.path2D('RHV_IVC'), EDGE_PATH_2D.RHV_IVC);
  setOverridesForTest(EMPTY);
});

test('no anchored consumer imports the reference plan or reads the copied GEO2D any more', () => {
  const files = ['src/scene/catheter-route.ts', 'src/scene/labels/stations.ts', 'src/scene/labels/figure-cards.ts', 'src/scene/devices/probes/scope.ts', 'src/scene/procedures/route.ts'];
  for (const f of files) {
    const s = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/NODE_POS_2D\s*\[/.test(s), `${f} indexes NODE_POS_2D`);
    if (f !== 'src/scene/procedures/route.ts') assert.ok(!/EDGE_PATH_2D/.test(s), `${f} reads EDGE_PATH_2D`);
  }
});
