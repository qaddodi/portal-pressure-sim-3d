import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plateKey, plateQuantizer, type PlateState } from '../src/scene/lobule/plate.ts';

const st = (fibPre: number): PlateState => ({ congU: 0, septU: 0, fibSin: 0, act: 0, fibPre, fibPost: 0 });

test('a live goal sitting on the line between two 1/32 steps keeps one plate key (the portal-tract bands flickered: Mohammad 22 Nov)', () => {
  const q = plateQuantizer(), boundary = 20.5 / 32;
  const keys = new Set<string>();
  // the model's value wobbles by a hair either side of the line every frame, as a live one does
  for (let i = 0; i < 200; i++) keys.add(plateKey(q(st(boundary + (i % 2 ? 1 : -1) * 1e-4 * (1 + (i % 7)))), 'light' as never));
  assert.equal(keys.size, 1, `one key, not ${[...keys].join(' and ')}`);
  // plain rounding (what the key did before) flips on the same input
  const plain = new Set<number>(); for (let i = 0; i < 200; i++) plain.add(Math.round((boundary + (i % 2 ? 1 : -1) * 1e-4) * 32));
  assert.equal(plain.size, 2, 'the plain rounding flips between two steps');
});

test('the quantiser still follows a value that really moves, to within a step, and 0 and 1 are exact', () => {
  const q = plateQuantizer();
  let prev = -1, flips = 0;
  for (let i = 0; i <= 320; i++) {
    const v = i / 320, got = q(st(v)).fibPre;
    assert.ok(Math.abs(got - v) <= 0.75 / 32 + 1e-9, `within a step at ${v} (${got})`);
    if (got !== prev) flips++; prev = got;
  }
  assert.ok(flips <= 33, `a steady rise steps at most once per 1/32 (${flips})`);
  assert.equal(q(st(1)).fibPre, 1); assert.equal(q(st(0)).fibPre, 0);
  // a steady fall comes back down the same way, no sticking above zero
  for (let i = 320; i >= 0; i--) q(st(i / 320));
  assert.equal(q(st(0)).fibPre, 0);
});

test('the plate shader mixes the incoming plate in ONE sampling (a second see-through layer left a quarter of the page showing mid-fade: a flash on every swap)', async () => {
  const { LOBULE_PLATE_FS } = await import('../src/scene/lobule/plate.ts');
  assert.match(LOBULE_PLATE_FS, /uniform sampler2D mapB;/);
  assert.match(LOBULE_PLATE_FS, /mix\(a, texture2D\(mapB, uv\), mixB\)/, 'both plates are sampled and mixed (premultiplied) before the cel step');
  assert.match(LOBULE_PLATE_FS, /vec4 p = plateTex\(vUv\);/);
});
