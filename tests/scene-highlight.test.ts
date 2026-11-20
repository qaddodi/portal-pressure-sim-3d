import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeHighlight, outlineStrength, DEFAULT_RANGE, Highlight } from '../src/scene/highlight.ts';
import { CelScene } from '../src/scene/scene.ts';

const edges = (() => { const s = new CelScene(); const e = s.vessels.map((o) => o.edge!); s.dispose(); return e; })();

test('a picked vessel is always on, whole, and a vein the engine cuts in pieces is one vein', () => {
  const m = computeHighlight(['PV_TRUNK_1', 'PV_TRUNK'], edges);
  assert.deepEqual(m.get('PV_TRUNK'), { dir: 0, offset: 0 });
  assert.deepEqual(m.get('PV_TRUNK_1'), { dir: 0, offset: 0 });
  assert.equal(outlineStrength({ dir: 0, offset: 0 }, 0.5, 1), 1);
});

test('the outline runs on downstream through both portal branches', () => {
  const m = computeHighlight(['PV_TRUNK_1', 'PV_TRUNK'], edges);
  assert.equal(m.get('PVH_R')?.dir, 1);
  assert.equal(m.get('PVH_L')?.dir, 1);
  assert.equal(m.get('PVH_R')?.offset, 0);
  assert.ok(m.get('PVH_R_1')!.offset > 0, 'the next piece starts where the first ends');
});

test('and reaches only a short way upstream: the three feeding veins, nothing further', () => {
  const m = computeHighlight(['PV_TRUNK_1', 'PV_TRUNK'], edges);
  for (const id of ['SV_CONF', 'SMV_CONF', 'LGV_CONF']) assert.equal(m.get(id)?.dir, -1, id);
  assert.equal(m.has('SV_MID'), false, 'the mid splenic vein is further back than "short behind"');
});

test('long ahead, short behind: the same distance is stronger ahead than behind', () => {
  const d = 0.15;
  const ahead = outlineStrength({ dir: 1, offset: 0 }, d, 5);
  const behind = outlineStrength({ dir: -1, offset: 0 }, 5 - d, 5);
  assert.ok(ahead > 0.75 && behind < 0.2, `ahead ${ahead.toFixed(2)} behind ${behind.toFixed(2)}`);
});

test('the outline fades to nothing by the end of its range', () => {
  assert.ok(outlineStrength({ dir: 1, offset: DEFAULT_RANGE.ahead }, 0, 1) < 0.001);
  assert.ok(outlineStrength({ dir: 1, offset: 0 }, 0, 1) > 0.999);
  const a = outlineStrength({ dir: 1, offset: 0 }, 0.1, 5), b = outlineStrength({ dir: 1, offset: 0 }, 0.3, 5);
  assert.ok(a > b, 'monotone fade');
});

test('a hepatic vein pick runs on into the cava and the atrium', () => {
  const m = computeHighlight(['RHV_IVC_1', 'RHV_IVC'], edges);
  assert.equal(m.get('IVCS_RA')?.dir, 1);
});

test('nothing else is dimmed: only outline and lift uniforms ever change', () => {
  const s = new CelScene();
  const toonBefore = s.vessels.map((o) => [o.toon.uniforms.color.value.getHex(), o.toon.uniforms.shade.value.getHex()]);
  s.pick('PV_TRUNK');
  assert.equal(s.highlight.picked, 'PV_TRUNK');
  let t = 0; while (s.highlight.step(16)) t += 16; assert.ok(t < 600);
  const toonAfter = s.vessels.map((o) => [o.toon.uniforms.color.value.getHex(), o.toon.uniforms.shade.value.getHex()]);
  assert.deepEqual(toonAfter, toonBefore);
  const pv = s.vessels.find((o) => o.edge!.id === 'PV_TRUNK')!;
  assert.ok(pv.toon.uniforms.inflate.value > 0, 'the pick lifts a hair');
  assert.equal(pv.ink.uniforms.hiOn.value, 1);
  const first = s.vessels.find((o) => o.edge!.id === 'PV_TRUNK_1')!;
  assert.equal(first.ink.uniforms.hiOn.value, 1, 'picking either piece picks the whole vein');
  const other = s.vessels.find((o) => o.edge!.id === 'V_KID_L')!;   // (a vein on no flow path from the portal trunk; the hepatic veins lie within its range at the 2D figure's own scale)
  assert.equal(other.ink.uniforms.hiOn.value, 0);
  s.pick(null);
  while (s.highlight.step(16)) { /* fade out */ }
  assert.equal(pv.ink.uniforms.hiOn.value, 0);
  assert.equal(pv.toon.uniforms.inflate.value, 0);
  s.dispose();
});

test('the highlight reports motion only while fading, so a still scene draws nothing', () => {
  const s = new CelScene();
  assert.equal(s.highlight.step(16), false);
  s.highlight.set('PV_TRUNK');
  assert.equal(s.highlight.step(16), true);
  while (s.highlight.step(16)) { /* settle */ }
  assert.equal(s.highlight.step(16), false);
  s.dispose();
});

test('Highlight ignores ids it does not draw', () => {
  const s = new CelScene();
  const h = new Highlight(s.vessels);
  h.set('NOT_A_VESSEL');
  assert.equal(h.picked, null);
  s.dispose();
});
