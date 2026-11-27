// The portal blood's split card on the figure (owner W19, 27 Nov): where no blood bypasses the liver there is no card ("0% bypasses the liver" stood on the portal vein of 23.2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitCardOf } from '../src/ui/deck/figure-calls.ts';

const site = { kicker: 'Portal blood', node: 'PV' };
test('no card for a split of 0% (rounded as the card prints it), nor before a reading exists', () => {
  assert.equal(splitCardOf('split', site, { shunt: 0 }), null);
  assert.equal(splitCardOf('split', site, { shunt: 0.004 }), null, 'the card prints whole percents: 0.4% is 0%');
  assert.equal(splitCardOf('split', site, {}), null);
  assert.equal(splitCardOf('split', site, null), null);
});
test('a split that bypasses any of the liver has its card, with the two shares adding to 100', () => {
  const c = splitCardOf('split', site, { shunt: 0.3 })!;
  assert.equal(c.kind, 'split');
  assert.deepEqual([c.split!.shunt, c.split!.liver], [30, 70]);
  assert.equal(splitCardOf('split', site, { shunt: 0.006 })!.split!.shunt, 1);
});
