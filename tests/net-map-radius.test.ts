// The Circuit's line width under ?geom=net must be 2D's exactly. A bone's map radius (skeleton.ts) already IS the map's own half-width, so the live swell on the map is the live width over that radius (the edge's `mapBase`),
// never over the body's `radius`: over `radius` every line came out mapBase / radius (1.4 to 2.3 for the veins) times too fat on Mohammad's iPhone (22 Nov, "the circuit view isn't good thickness").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NETWORK } from '../src/scene/vessels/network.ts';
import { circuitWidthMap, mapRadiusOf } from '../src/scene/circuit/width.ts';
import { MAP_K } from '../src/scene/circuit/map.ts';
import { EDGE_LAYOUT } from '../src/scene/vessels/net/edge-state.ts';

const shaders = readFileSync(new URL('../src/scene/vessels/net/shaders.ts', import.meta.url), 'utf8');

test('the live map width over the map base is 2D\'s width, for every vessel at the engine\'s own diameter and boost 1', () => {
  for (const v of NETWORK) {
    const base = mapRadiusOf(v), live = 0.5 * circuitWidthMap(v.widthKind, v.baseD, 1, v.circFine ?? 1) * MAP_K;   // (what circSwellNet's wc gives at boost 1 with d = baseD)
    const swell = live / base;
    assert.ok(Math.abs(swell - 1) < 1e-9, `${v.id}: swell ${swell}`);
    // the bone's map radius (the taper's factor 1 mid-vessel) times that swell is the 2D line's half width; the old divisor `radius` made it this many times too fat
    const old = live / v.radius;
    if (v.widthKind === 0) assert.ok(old > 1.2, `${v.id}: the old rule would draw ${old.toFixed(2)}x`);
  }
});

test('the shader divides the map width by mapBase, and the rows carry it', () => {
  const fn = /float circSwellNet\(\) \{[\s\S]*?\n\}/.exec(shaders)![0];
  assert.match(fn, /CIRC_MAPK \/ max\(mapBase, 1e-6\)/);
  assert.doesNotMatch(fn, /max\(radius/);
  assert.ok(EDGE_LAYOUT.has('mapBase'));
  assert.match(readFileSync(new URL('../src/scene/vessels/net/rows.ts', import.meta.url), 'utf8'), /'mapBase', mapRadiusOf/);
  assert.match(shaders, /'radius', 'mapBase', 'circW'/);
});
