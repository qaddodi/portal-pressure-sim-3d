// Landings on a host's WALL (src/scene/vessels/skin/wall.ts, FINAL-WELD-PLAN.md): every growing end that is not an arm of a node's skin is FOUND and named with its host; those that build are STATIC full-size arms of a virtual node (tests/skin-grow.test.ts), the rest stay flared. It is no arm of a skin and no virtual node (those are gone: a skin
// morphed between a closed and an open shape folded at every crowded landing): the end is the tube's own sunk and flared profile (shunt-ends.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wallLandings } from '../src/scene/vessels/skin/wall.ts';
import * as wall from '../src/scene/vessels/skin/wall.ts';
import { findSkinJunctions } from '../src/scene/vessels/skin/inventory.ts';

test('wall landings: the paraumbilical collateral (C3), the umbilical (REX), the shunts and the azygos pair land on named hosts (node arms on the cut host veins, a wall landing on the azygos)', () => {
  const ls = wallLandings(new Set());
  const key = (l: { v: { id: string }; end: number; host: { id: string } }) => `${l.v.id}:${l.end}->${l.host.id}`;
  const names = ls.map(key);
  assert.ok(names.includes('C1b:1->AZY_SVC'), `C1b:1->AZY_SVC is found (${names.join(' ')})`);
  // The host veins are cut into pieces at the nodes (LPV_U, LPV_X, IVC_IS_*, ILI_IVC), so the collateral and shunt ends that land there are ARMS of that node's skin, between the host's two pieces, not wall landings
  // (8965e53b: every shunt and collateral leaves its host at its node). The paraumbilical vein C3 arises from the LEFT PORTAL VEIN (PVH_L | PVH_L_1 at LPV_U), the Rex shunt joins it at LPV_X (PVH_L_1 | PVH_L_2).
  const js = findSkinJunctions();
  const armsOf = (v: string, end: number) => js.filter((j) => j.arms.some((a) => a.vesselId === v && a.end === end)).map((j) => j.arms.map((a) => `${a.vesselId}:${a.end}`));
  for (const [v, end, hostPair] of [['C3', 0, ['PVH_L:1', 'PVH_L_1:0']], ['REX', 1, ['PVH_L_1:1', 'PVH_L_2:0']], ['S_PC', 1, ['IVC_IS_2:1', 'IVC_IS_3:0']], ['C9', 0, ['IVC_IS_1:1', 'IVC_IS_2:0']], ['S_MC', 1, ['ILI_IVC_1:1', 'ILI_IVC_2:0']]] as const) {
    const found = armsOf(v, end);
    assert.equal(found.length, 1, `${v}:${end} is an arm of exactly one node skin (${JSON.stringify(found)})`);
    for (const h of hostPair) assert.ok(found[0]!.includes(h), `${v}:${end} leaves its host between its two pieces (${found[0]!.join(' ')} has ${h})`);
    assert.ok(!names.some((n) => n.startsWith(`${v}:${end}->`)), `${v}:${end} is an arm of its host's node, not a wall landing`);
  }
  // (the DIPS's cava end is no wall landing on the placed anatomy: it ends at IVC_D, the node the cava is cut at, an arm of that node's skin; tests/skin-shunts.test.ts pins it welded at both ends)
  assert.ok(!names.some((n) => n.startsWith('DIPS:1->')), 'the DIPS ends at the cava\'s node IVC_D, not on its wall');
  assert.ok(!names.includes('C9:1->AZY_SVC'), 'the lumbar vein is the azygos\'s start (Plan 16D, starts.ts RUNS_INTO), not a landing on its wall');
  assert.equal(typeof wall.wallJunctions, 'function', 'the virtual nodes are back, for STATIC full-size growers (the weld hands over at growth 0.9 to 1)');
  assert.equal(typeof wall.attachNear, 'function');
  assert.equal(wall.WALL_GROWERS, 2, 'two growers on one spot (the azygos pair) are one static skin: no closed shape needs to hold the other open');
});
