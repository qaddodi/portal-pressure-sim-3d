import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { ShuntGuide } from '../src/scene/shunt-guide.ts';
import { VESSEL_LAYER } from '../src/scene/layers.ts';

// 2D stage-hover.js shuntMove: a dashed guide from the vessel the shunt starts at follows the pointer; the target under it stands out and its shunt's name follows it (Mohammad, 20 Nov).
test('the guide is one dashed quad from the vessel to the pointer, on the vessels\' pass, 2.5 px wide and round-dashed in the colour it is given', () => {
  const g = new ShuntGuide();
  assert.equal(g.shown, false);
  assert.equal(g.mesh.layers.mask, 1 << VESSEL_LAYER);
  g.set(new Vector3(0, 0, 0.02), new Vector3(0.3, 0.4, 0.02), 1000, '#d64545');
  assert.equal(g.shown, true);
  assert.ok(Math.abs(g.mesh.scale.x - 0.5) < 1e-9, 'as long as the line');
  assert.ok(Math.abs(g.mesh.position.x - 0.15) < 1e-9 && Math.abs(g.mesh.position.y - 0.2) < 1e-9, 'centred between the two ends');
  assert.ok(Math.abs(g.mesh.rotation.z - Math.atan2(0.4, 0.3)) < 1e-9);
  const u = (g.mesh.material as unknown as { uniforms: Record<string, { value: unknown }> }).uniforms;
  assert.ok(Math.abs((u.lenPx!.value as number) - 500) < 1e-6, 'its dashes are cut in screen pixels');
  g.set(new Vector3(0, 0, 0), new Vector3(0, 0, 0), 1000, '#fff');
  assert.equal(g.shown, false, 'a line of no length is not drawn');
});

test('the Add shunt interaction aims: a guide from the vessel, the target under the pointer stands out, its shunt\'s name follows, and a frame is asked for only when the pointer moved', () => {
  const src = readFileSync(new URL('../src/ui/action/shunt.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('sceneApi.shunt.guide(src') && src.includes('sceneApi.shunt.hover(hover)') && src.includes('targets.get(over!)!.label'));
  assert.ok(src.includes("if (key === done) return;"), 'no frame is asked for while the pointer rests');
  assert.ok(src.includes('release.push(aim(from, targets))'), 'it is put away with the shunt (Esc, a drop, Cancel)');
  assert.ok(src.includes("sceneApi.shunt.guide(null, 0, 0, '')"), 'the guide goes with the shunt');
});
