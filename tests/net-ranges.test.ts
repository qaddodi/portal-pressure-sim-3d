// There is no bake-radius rule (plan owner, 22 Nov): the fillets are built at the skeleton's own radii and every region carries keys from its real states. What this pins: the factor is 1 for every arm (the acceptance on the real figure measured what
// any other factor costs: a rest-radii start folds a fillet from about 1.1 of the baked radius up, and `max / 1.2` put the permanent arms at 1.2 in every state: 319 fold cases in 9 regions).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARM_RANGE, bakeScaleOf } from '../src/scene/vessels/net/ranges.ts';

test('every arm is baked at the skeleton\'s own radius (factor 1), there is no range-dependent rule', () => {
  for (const id of [...Object.keys(ARM_RANGE), 'NO_SUCH_EDGE', 'PVH_R#1']) assert.equal(bakeScaleOf(id), 1, id);
});
