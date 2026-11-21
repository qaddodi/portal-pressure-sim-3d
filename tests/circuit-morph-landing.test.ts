// During the Anatomy <-> Circuit change nothing of the map shows ahead of the vessel it belongs to (Mohammad, 21 Nov, iPhone: dots, bars and a vessel group "flying out and off
// screen"): the station dots ride the flow peel from the anatomy to the map as 2D's nodePos does, and the map's skins and the tubes' map cut follow the peel's share, not the whole change's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dotAt } from '../src/scene/circuit/map-layer.ts';
import { MAP_CENTRE } from '../src/scene/circuit/map.ts';

const final: [number, number, number] = [10, -4, 0.2];
const anat: [number, number, number] = [MAP_CENTRE.x + 300, MAP_CENTRE.y - 80, MAP_CENTRE.z + 5];

test('a dot is at its anatomy place before its share starts, and at its map place when landed, both directions and both turns', () => {
  for (const rr of [0, 1]) {
    for (const rank of [0, 0.5, 1]) {
      const start = dotAt(anat, final, 0, rr, rank), end = dotAt(anat, final, 1, rr, rank);
      // anatomy place, in the layer's turned-back frame: turn the layer's point forward and it is the anatomy's world place
      const a = (Math.PI / 2) * rr, c = Math.cos(a), s = Math.sin(a);
      assert.ok(Math.abs(MAP_CENTRE.x + c * start[0] - s * start[1] - anat[0]) < 1e-6);
      assert.ok(Math.abs(MAP_CENTRE.y + s * start[0] + c * start[1] - anat[1]) < 1e-6);
      assert.deepEqual(end, final);
    }
  }
});

test('a heart-end dot is still near the anatomy while a gut-end one has landed', () => {
  const gut = dotAt(anat, final, 0.7, 0, 0), heart = dotAt(anat, final, 0.7, 0, 1);
  assert.ok(Math.hypot(gut[0] - final[0], gut[1] - final[1]) < 1e-6, 'gut end landed');
  assert.ok(Math.hypot(heart[0] - final[0], heart[1] - final[1]) > 50, 'heart end not yet');
});

test('the map skin and the tubes\' map cut read the peel share', () => {
  const sk = readFileSync(new URL('../src/scene/vessels/skin/shaders.ts', import.meta.url), 'utf8');
  const tb = readFileSync(new URL('../src/scene/vessels/shaders.ts', import.meta.url), 'utf8');
  assert.ok(/smoothstep\(\$\{F\(SKIN_CIRC_IN\)\}, 1\.0, skinShare\)/.test(sk));
  assert.ok(/smoothstep\(\$\{F\(SKIN_CIRC_IN\)\}, 1\.0, vCircShare\)/.test(tb));
  assert.ok(!/SKIN_CIRC_IN\)\}, 1\.0, circT\)/.test(sk + tb));
});
