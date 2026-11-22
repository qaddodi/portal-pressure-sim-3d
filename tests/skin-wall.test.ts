// Landings on a host's WALL (src/scene/vessels/skin/wall.ts, FINAL-WELD-PLAN.md): every growing end that is not an arm of a node's skin is FOUND and named with its host; those that build are STATIC full-size arms of a virtual node (tests/skin-grow.test.ts), the rest stay flared. It is no arm of a skin and no virtual node (those are gone: a skin
// morphed between a closed and an open shape folded at every crowded landing): the end is the tube's own sunk and flared profile (shunt-ends.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wallLandings } from '../src/scene/vessels/skin/wall.ts';
import * as wall from '../src/scene/vessels/skin/wall.ts';

test('wall landings: the paraumbilical collateral (C3), the umbilical (REX), the shunts and the azygos pair land on named hosts', () => {
  const ls = wallLandings(new Set());
  const key = (l: { v: { id: string }; end: number; host: { id: string } }) => `${l.v.id}:${l.end}->${l.host.id}`;
  const names = ls.map(key);
  for (const want of ['C3:0->PVH_L_1', 'REX:1->PVH_L_1', 'S_PC:1->IVC_IS_1', 'C9:0->IVC_IS_1', 'DIPS:1->IVC_IS', 'S_MC:1->ILI_IVC_1', 'C1b:1->AZY_SVC']) assert.ok(names.includes(want), `${want} is found (${names.join(' ')})`);
  assert.ok(!names.includes('C9:1->AZY_SVC'), 'the lumbar vein is the azygos\'s start (Plan 16D, starts.ts RUNS_INTO), not a landing on its wall');
  assert.equal(typeof wall.wallJunctions, 'function', 'the virtual nodes are back, for STATIC full-size growers (the weld hands over at growth 0.9 to 1)');
  assert.equal(typeof wall.attachNear, 'function');
  assert.equal(wall.WALL_GROWERS, 2, 'two growers on one spot (the azygos pair) are one static skin: no closed shape needs to hold the other open');
});
