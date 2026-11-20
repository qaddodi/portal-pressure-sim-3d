// Landings on a host's WALL (spec 10.1, src/scene/vessels/skin/wall.ts): every growing end that is not an arm of a node's skin is found, named, and either welded as a virtual `wall:` node or kept on the fork method by name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK } from '../src/scene/vessels/network.ts';
import { wallJunctions, wallLandings } from '../src/scene/vessels/skin/wall.ts';

test('wall landings: the paraumbilical collateral (C3), the umbilical (REX), the shunts and the azygos pair land on named hosts, each virtual node holds the host\'s two sides and its growers', () => {
  const ls = wallLandings(new Set());
  const key = (l: { v: { id: string }; end: number; host: { id: string } }) => `${l.v.id}:${l.end}->${l.host.id}`;
  const names = ls.map(key);
  for (const want of ['C3:0->PVH_L_1', 'REX:1->PVH_L_1', 'S_PC:1->IVC_IS_1', 'C9:0->IVC_IS_1', 'DIPS:1->IVC_IS', 'S_MC:1->ILI_IVC_1', 'C1b:1->AZY_SVC', 'C9:1->AZY_SVC']) assert.ok(names.includes(want), `${want} is found (${names.join(' ')})`);
  assert.ok(NETWORK.length > 0);
  const { junctions, skipped } = wallJunctions(ls);
  for (const j of junctions) {
    assert.ok(j.node.startsWith('wall:'), j.node);
    assert.ok(j.arms.filter((a) => a.side).length === 2, `${j.node}: the host's two sides`);
    assert.ok(j.arms.filter((a) => a.grow).length >= 1, `${j.node}: a grower`);
  }
  // every landing is either a junction's grower or named as skipped: none is lost
  const placed = junctions.flatMap((j) => j.arms.filter((a) => a.grow).map((a) => `${a.vesselId}:${a.end}`)).concat(skipped.map((l) => `${l.v.id}:${l.end}`));
  assert.deepEqual(placed.sort(), ls.map((l) => `${l.v.id}:${l.end}`).sort());
});
// (a wall node that crowds another skin is a named failure in planSkins and the other skin stays as it was: the pinned `dropped` list in tests/skin-grow.test.ts, and the IVCI/LPV_A calibre tests in tests/skin-through.test.ts)
