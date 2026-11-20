import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { VESSEL_LAYER } from '../src/scene/layers.ts';

// The scene draws two passes (organs, then the vessels over cleared depth). A device left on layer 0 is covered by the vessels' pass: a stent with no wires, a catheter "behind" its vein.
const off = (root: Object3D): string[] => { const bad: string[] = []; root.traverse((c) => { if (c.layers.mask !== 1 << VESSEL_LAYER) bad.push(c.name || c.type); }); return bad; };

test('every stent, vein stent, tamponade, band and glue part, and the Tests probes, draw in the vessels\' pass', () => {
  const s = new CelScene();
  assert.ok(s.procs.stents.size > 0);
  for (const [id, st] of s.procs.stents) assert.deepEqual(off(st.group), [], `stent ${id}`);
  for (const [id, st] of (s.procs as unknown as { veinStents: Map<string, { group: Object3D }> }).veinStents) assert.deepEqual(off(st.group), [], `vein stent ${id}`);
  assert.deepEqual(off(s.procs.tamponade.group), []);
  assert.deepEqual(off(s.procs.bands.group).filter((n) => n !== 'Group'), []);
  assert.deepEqual(off(s.probes.group), []);
});
