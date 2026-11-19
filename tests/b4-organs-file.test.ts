// The organs the layer draws are the 2D figure's: with the real organs file loaded the scene builds all nine, in the patient's state, and a repeat build adds none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { organsReady, setOrganData } from '../src/scene/organs/meshes.ts';
import { CelScene } from '../src/scene/scene.ts';
import { bodyTargets } from '../src/scene/disease/targets.ts';
import { presetState } from './b4-presets.ts';

test('the organ layer builds the 2D figure\'s organs once the organs file is in, already in the patient\'s state', async () => {
  const s = new CelScene();
  assert.equal(s.disease.organs.ids.length, 0, 'nothing before the file is in');
  const p = await presetState('cirr-decomp');
  s.disease.organs.setBody(bodyTargets(p.frame, p.params, p.healthyP), true);
  const b = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
  setOrganData(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  await organsReady; await new Promise((r) => setTimeout(r, 0));
  const ids = s.disease.organs.ids;
  for (const id of ['heart', 'heart-ra', 'liver', 'spleen', 'stomach', 'duodenum', 'kidney-l', 'bowel', 'colon']) assert.ok(ids.includes(id), id);
  s.disease.organs.update(1000);
  assert.ok(s.disease.organs.byId.get('spleen')!.group.scale.x > 1.5, 'the spleen is built big at once, not eased in');
  assert.ok(s.disease.organs.byId.get('liver')!.group.scale.x < 1, 'and the liver small');
  s.disease.organs.build(); assert.equal(s.disease.organs.ids.length, ids.length, 'a second build adds nothing');
  s.dispose?.();
});
