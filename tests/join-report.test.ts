// The inspector's Joins report (src/scene/vessels/skin/join-report.ts; Mohammad 20 Nov: "all possible shunts ... mesh welded and connect correctly"): every tube end that meets other tubes and is not welded is listed with the reason and its place,
// so the debug page can mark it. The pure part runs on the real network with stand-in answers; the real part builds the real skins (as tests/skin-grow.test.ts does) and holds the report to what they say.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { NETWORK } from '../src/scene/vessels/network.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';
import { GROWER_KINDS } from '../src/scene/vessels/skin/inventory.ts';
import { WHY_COLOUR, WHY_TEXT, droppedAt, joinsReport, splitDropped, unweldedEnds } from '../src/scene/vessels/skin/join-report.ts';

test('a dropped arm is "NODE:VESSEL" and a vessel id may hold a colon', () => {
  assert.deepEqual(splitDropped('IVCI:S_PC'), { node: 'IVCI', id: 'S_PC' });
  assert.deepEqual(splitDropped('N:A:B'), { node: 'N', id: 'A:B' });
});

test('with no skin at all, every growing end is listed (a collateral or shunt always joins something) and a run-on pair of permanent tubes never is', () => {
  const u = unweldedEnds({ endsOf: () => [false, false], dropped: [], fellBack: [] });
  const ids = new Set(u.map((e) => e.id));
  for (const v of NETWORK) if (!v.feeder && !v.id.includes('~F') && GROWER_KINDS.has(v.kind)) assert.ok(ids.has(v.id), `${v.id} is a growing tube with no skin on it`);
  for (const e of u) {
    assert.ok(e.pos.every(Number.isFinite), `${e.id} has a place`);
    assert.ok(e.why in WHY_COLOUR && e.why in WHY_TEXT, `${e.why} has a colour and words`);
  }
  // a permanent tube is listed only where three or more permanent tubes meet
  const at = new Map<string, number>();
  for (const v of NETWORK) if (!GROWER_KINDS.has(v.kind) && !v.feeder && !v.id.includes('~F')) for (const n of [v.from, v.to]) at.set(n, (at.get(n) ?? 0) + 1);
  for (const e of u) if (!GROWER_KINDS.has(e.kind)) assert.ok((at.get(e.node) ?? 0) >= 3, `${e.id} at ${e.node}: a pair is a run-on, not an unwelded junction`);
});

test('the real skins: every growing arm they leave out is named "dropped", the nodes that fell back are named, and no junction of three tubes is left unskinned and unexplained', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' }), parent = new Group();
  try {
    const set = new SkinSet({
      vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
      make: (m, ax, arms) => new SkinObject(m, arms[0]!, ax, arms), add: (o: Object3D) => parent.add(o), remove: (o: Object3D) => parent.remove(o), warn: () => {},
    });
    set.build(2);
    const r = joinsReport({ endsOf: (id) => set.endsOf(id), dropped: set.dropped, fellBack: set.fellBack, built: set.nodes, circuitFellBack: [] });
    assert.ok(r.built.length >= 10, 'the skins are built');
    assert.deepEqual(r.dropped.map((d) => `${d.node}:${d.id}`).sort(), [...set.dropped].sort());
    for (const d of set.dropped) {
      const { node, id } = splitDropped(d);
      // (a growing arm one skin drops can be welded by another: S_PC and C9 above IVCI are arms of a wall node's skin, so that end is skinned and not unwelded; a wall node is a virtual node of the host's wall, named by the key)
      const v = NETWORK_BY_ID.get(id), ends = ([0, 1] as const).filter((e) => (node.startsWith('wall:') ? droppedAt(d, node, id, e) : !!v && node === (e === 0 ? v.from : v.to)));   // (a plain node names the end of the vessel that is AT it: the lumbar vein's other end is the azygos's start, a run-on, Plan 16D)
      assert.ok(ends.length, `${d}: an end of ${id} is named by the key`);
      for (const e of ends) {
        if (set.endsOf(id)[e]) assert.ok(!r.unwelded.some((u) => u.id === id && u.end === e), `${d} is dropped here but welded by another skin: not listed as unwelded`);
        else assert.ok(r.unwelded.some((u) => u.id === id && u.end === e && u.why === 'dropped'), `${d} is listed as dropped`);
      }
    }
    for (const n of set.fellBack) assert.ok(r.unwelded.some((u) => u.node === n && u.why === 'fell-back'), `${n} fell back and its tubes are listed`);
    assert.deepEqual(r.unwelded.filter((u) => u.why === 'no-skin').map((u) => `${u.id}/${u.end}@${u.node}`), [], 'every junction of three permanent tubes has a skin or a named reason');
    for (const u of r.unwelded) assert.ok(!set.endsOf(u.id)[u.end], `${u.id} end ${u.end} is skinned, so it is welded`);
  } finally { scene.dispose(); setSmoothJoins(was); }
});

test('a dropped key splits at its vessel: a wall node (wall:host:arms) and a fork child (~F:b) keep their colons', () => {
  assert.deepEqual(splitDropped('IVCI:S_PC'), { node: 'IVCI', id: 'S_PC' });
  assert.deepEqual(splitDropped('wall:PVH_L_1:REX1:REX'), { node: 'wall:PVH_L_1:REX1', id: 'REX' });
  assert.deepEqual(splitDropped('RPV_T:PVH_R_2~F:b'), { node: 'RPV_T', id: 'PVH_R_2~F:b' });
  assert.deepEqual(splitDropped('N:A:B'), { node: 'N', id: 'A:B' });
  assert.ok(droppedAt('wall:IVC_IS_1:S_PC1,C90:C9', 'IVCI', 'C9', 0) && !droppedAt('wall:IVC_IS_1:S_PC1,C90:C9', 'IVCI', 'C9', 1));
});
