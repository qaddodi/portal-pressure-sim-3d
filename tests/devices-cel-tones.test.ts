// Every device tube wears the figure's one cel style (Mohammad, 20 Nov 2026): the vessels' three screen-lit tones on a shaft, a wire, a balloon, a column; the spheres, cylinders and discs keep the world-lit bands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CylinderGeometry, SphereGeometry } from 'three';
import { DeviceObject, withAlpha } from '../src/scene/devices/device-object.ts';
import { allocTube, mergeTubes, makeRings } from '../src/scene/devices/tube-rings.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { TOON_FS } from '../src/scene/materials/shaders.ts';
import { CEL_STYLE } from '../src/scene/cel-style.ts';

const shared = createShared();
const has = (o: DeviceObject) => 'TUBE_TONES' in (o.toon.defines ?? {});

test('a device built on a ring tube (allocTube, mergeTubes) wears the three tones; a sphere or a cylinder does not', () => {
  assert.ok(has(new DeviceObject(allocTube(8, 8), 'poly', shared)));
  assert.ok(has(new DeviceObject(mergeTubes([makeRings(4), makeRings(4)], 6), 'stentWire', shared)));
  assert.ok(has(new DeviceObject(mergeTubes([], 6), 'gold', shared)), 'an empty wire set is still a tube');
  assert.ok(!has(new DeviceObject(new SphereGeometry(1, 8, 6), 'poly', shared)));
  assert.ok(!has(new DeviceObject(new CylinderGeometry(1, 1, 1, 8), 'platinum', shared)));
  assert.ok(!has(new DeviceObject(allocTube(8, 8), 'poly', shared, { tubeTones: false })), 'and a part can opt out');
});

test('the tube tones read their thresholds and strengths from the one cel style, and a device keeps its fade and its ink', () => {
  for (const n of [CEL_STYLE.VESSEL_STEP_AT, CEL_STYLE.SHADE]) assert.ok(TOON_FS.includes(String(n)), String(n));
  const o = new DeviceObject(allocTube(8, 8), 'poly', shared);
  assert.match(o.toon.fragmentShader, /gl_FragColor = vec4\(c, alpha\)/);
  assert.match(o.ink.fragmentShader, /mix\(inkA, 1\.0, clamp\(vHi, 0\.0, 1\.0\)\) \* alpha/, 'the ink fades with the device (a fade that matched nothing left the outline whole)');
  assert.throws(() => withAlpha('void main() {}', 'gl_FragColor', 'x'));
  const src = readFileSync(new URL('../src/scene/catheter.ts', import.meta.url), 'utf8');
  assert.match(src, /px: 0\.9, tubeTones: true/, 'the plain catheter\'s shaft too');
});
