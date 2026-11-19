import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import { VESSELS, buildVessel, vesselPoints } from '../src/scene/anatomy/vessels.ts';
import { EDGE_IDS, hasVessel, indexOf } from '../src/engine/vessel-data.ts';
import { CelScene } from '../src/scene/scene.ts';

const edges = EDGES as { id: string; from: string; to: string; d?: number }[];

test('every drawn vessel is named by a topology edge, with the same end nodes', () => {
  for (const v of VESSELS) {
    const e = edges.find((x) => x.id === v.id);
    assert.ok(e, `${v.id} is not an engine edge`);
    assert.equal(e.from, v.from, `${v.id} from`);
    assert.equal(e.to, v.to, `${v.id} to`);
    assert.ok(hasVessel(v.id));
  }
});

test('vessel names are unique and each has its own data texel', () => {
  const ids = VESSELS.map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(ids.map(indexOf)).size, ids.length);
  assert.ok(ids.every((id) => EDGE_IDS.includes(id)));
});

test('centrelines run with the flow: each vessel starts where its upstream neighbour ends', () => {
  const end = (id: string) => { const p = vesselPoints(VESSELS.find((v) => v.id === id)!); return p[p.length - 1]!; };
  const start = (id: string) => vesselPoints(VESSELS.find((v) => v.id === id)!)[0]!;
  for (const [a, b] of [['V_SPL', 'SV_MID'], ['SV_MID', 'SV_CONF'], ['PV_TRUNK', 'PVH_R'], ['PV_TRUNK', 'PVH_L'], ['IVC_IS', 'IVCS_RA']] as const) {
    assert.ok(end(a).distanceTo(start(b)) < 0.02, `${a} end to ${b} start: ${end(a).distanceTo(start(b)).toFixed(3)}`);
  }
  for (const id of ['SV_CONF', 'SMV_CONF', 'LGV_CONF']) assert.ok(end(id).distanceTo(start('PV_TRUNK')) < 0.02, `${id} meets the confluence`);
  for (const id of ['RHV_IVC', 'MHV_IVC', 'LHV_IVC']) assert.ok(end(id).distanceTo(start('IVCS_RA')) < 0.7, `${id} reaches the cava`);
});

test('a vessel is one geometry with uv.x along the flow from 0 to 1 and a tangent per vertex', () => {
  const g = buildVessel(VESSELS[0]!).geometry;
  const uv = g.attributes.uv!;
  let min = 1, max = 0;
  for (let i = 0; i < uv.count; i++) { min = Math.min(min, uv.getX(i)); max = Math.max(max, uv.getX(i)); }
  assert.ok(min <= 0.001 && max >= 0.999);
  assert.equal(g.attributes.tang!.count, g.attributes.position!.count);
});

test('the scene stays inside the draw-call budget (spec: under 100)', () => {
  const s = new CelScene();
  let meshes = 0;
  s.scene.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh) meshes++; });
  assert.ok(meshes < 100, `${meshes} draw calls`);
  s.dispose();
});

test('every vessel object knows its edge and its data texel', () => {
  const s = new CelScene();
  for (const o of s.vessels) assert.equal(o.toon.uniforms.vindex.value, indexOf(o.edge!.id));
  s.dispose();
});
