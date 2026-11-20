// The running stitch at a surgical shunt's sewn ends (2D anastomoses): a ring of thread dashes where the shunt meets its host's wall; nothing where the shunt is the vein itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEWN_IDS, seamsFor, seamsOf } from '../src/scene/vessels/seams.ts';

test('every sewn shunt has a stitch ring a few units in from each end, never past the middle of the shunt', () => {
  for (const id of SEWN_IDS) {
    const [a, b] = seamsOf(id);
    assert.ok(Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0 && a < 80 && b < 80, `${id}: ${a}, ${b}`);
  }
});

test('the Warren shunt\'s start and an end-to-side portocaval shunt\'s start carry no stitches (the vein itself); a side-to-side portocaval shunt is sewn at both', () => {
  assert.equal(seamsFor('S_DSR', false)[0], 0); assert.ok(seamsFor('S_DSR', false)[1] > 0);
  assert.equal(seamsFor('S_PC', false)[0], 0); assert.ok(seamsFor('S_PC', true)[0] > 0);
  assert.ok(seamsFor('S_MC', false)[0] > 0 && seamsFor('S_MC', false)[1] > 0);
});
