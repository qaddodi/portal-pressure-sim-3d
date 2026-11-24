import test from 'node:test';
import assert from 'node:assert/strict';
import { ctxOf } from '../src/ui/tests/fibro/ctx.ts';

test('a slide card judges its context from the slide\'s settled state, not the live metrics still easing up (Stiffness 3: "Vascular disease" under "Fibrosis stiffens the liver")', () => {
  const settled = { lsm: 12.4, scar: 0.4, fhvp: 4, ppg: 8 }, easing = { lsm: 12.4, scar: 0.05, fhvp: 4, ppg: 8 };
  assert.equal(ctxOf(null, easing), 'vascular');
  assert.equal(ctxOf(settled, easing), null);
  assert.equal(ctxOf({ lsm: 12.4 }, easing), 'vascular');
});
