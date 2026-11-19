// The Circuit's change has one owner of the anatomy's visibility (DiseaseLayer.setFade): the organs, the lines on them, and every overlay that lies on the anatomy
// (strands, clots, the bleed, the ascites pool, the dye) dissolve together, and what is made while the anatomy is away stays away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { presetState } from './b4-presets.ts';

type StrandsPriv = { strands: { host: string; obj: import('../src/scene/materials/cel.ts').CelObject | null; on: boolean }[] };
const shown = (s: CelScene) => (s.disease.strands as unknown as StrandsPriv).strands.filter((x) => x.obj?.group.visible).length;
const wanted = (s: CelScene) => (s.disease.strands as unknown as StrandsPriv).strands.filter((x) => x.on).length;
const fades = (s: CelScene) => (s.disease.strands as unknown as StrandsPriv).strands.filter((x) => x.obj).map((x) => x.obj!.fade);

test('Anatomy to Circuit to Anatomy: the strands dissolve with the body, a preset change in the Circuit draws none, and the way back restores them', async () => {
  const s = new CelScene(); const d = s.disease;
  const f = (await presetState('cirr-decomp')).frame;
  const ctx = { instant: true, presence: () => 1, recruit: () => 1 };
  d.feed(f as never, {}, null, ctx, true); d.update(1000);
  const n = shown(s);
  assert.ok(n > 4, 'strands are drawn on the anatomy');
  assert.ok(fades(s).every((x) => x === 1));

  d.setFade(0.5);   // mid-change
  assert.equal(shown(s), n, 'still drawn, half dissolved');
  assert.ok(fades(s).every((x) => x === 0.5), 'every strand dissolves with the body');

  d.setFade(0);   // in the Circuit
  assert.equal(shown(s), 0, 'no strand on the map');
  assert.ok(wanted(s) >= n, 'the model still wants them');

  // a new patient while the Circuit is on: strands made now are made away
  d.feed((await presetState('cirr-decomp')).frame as never, {}, null, { ...ctx, recruit: () => 0.9 }, true); d.update(2000);
  assert.equal(shown(s), 0, 'a strand made while the anatomy is away stays away');
  assert.ok(fades(s).every((x) => x === 0), 'and is made already dissolved');

  d.setFade(0.3);   // the way back, reversed part-way
  d.setFade(0.2);
  d.setFade(1);
  d.update(3000);
  assert.equal(shown(s), wanted(s), 'back on the anatomy every wanted strand is drawn');
  assert.ok(shown(s) > 0 && fades(s).every((x) => x === 1));
  s.dispose?.();
});

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

test('strands first made while the Circuit is on are made away, and come when the anatomy returns', async () => {
  const s = new CelScene(); const d = s.disease;
  d.setFade(0);
  d.feed((await presetState('cirr-decomp')).frame as never, {}, null, { instant: true, presence: () => 1, recruit: () => 1 }, true); d.update(1000);
  assert.equal(shown(s), 0);
  assert.ok(wanted(s) > 4);
  assert.ok(fades(s).length > 4 && fades(s).every((x) => x === 0), 'built dissolved');
  d.setFade(1);
  assert.equal(shown(s), wanted(s));
  s.dispose?.();
});
