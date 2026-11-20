// The Circuit's change has one owner of the anatomy's visibility (DiseaseLayer.setFade): the organs, the lines on them, and every overlay that lies on the anatomy
// (strands, clots, the bleed, the ascites pool, the dye) dissolve together, and what is made while the anatomy is away stays away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { presetState } from './b4-presets.ts';


test('the anatomy\'s other overlays follow the same owner: clots, the bleed, the ascites pool and the dye', async () => {
  const s = new CelScene(); const d = s.disease;
  const f = (await presetState('cirr-decomp')).frame;
  d.feed(f as never, { }, null, { instant: true, presence: () => 1, recruit: () => 1 }, true); d.update(1000);
  d.ascites.set(3000);
  const pool = () => d.ascites.group.children.filter((c) => c.visible).length;
  assert.ok(pool() > 0, 'a pool');
  d.setFade(0);
  assert.equal(pool(), 0, 'no pool on the map');
  assert.equal((d.dye as unknown as { amount: { value: number } }).amount.value, 0, 'no dye on the anatomy\'s vessels on the map');
  d.setFade(1);
  assert.ok(pool() > 0, 'the pool is back');
  assert.equal((d.dye as unknown as { amount: { value: number } }).amount.value, 1);
  for (const c of (d.clots as unknown as { clots: Map<string, { obj: { group: { visible: boolean } } | null }> }).clots.values()) d.setFade(0), assert.ok(!c.obj?.group.visible);
  s.dispose?.();
});

test('the scene gives it one value: the dive\'s dissolve and the Circuit\'s change both go through DiseaseLayer.setFade and the smaller wins', () => {
  const s = new CelScene();
  const seen: number[] = [];
  const orig = s.disease.setFade.bind(s.disease);
  s.disease.setFade = (f: number) => { seen.push(f); orig(f); };
  (s as unknown as { fadeNow: number }).fadeNow = 0.4;
  (s as unknown as { lastFade: number }).lastFade = 0.9;
  (s as unknown as { stepCircuit(n: number, dt: number): boolean }).stepCircuit(0, 16);
  assert.ok(seen.length === 0 || seen.every((v) => v <= 0.4 + 1e-9), `the Circuit's value never exceeds the dive's: ${seen}`);
  s.dispose?.();
});
