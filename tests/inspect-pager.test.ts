// The inspector's custom-shunt pager (src/ui/debug/inspect/pager.ts; Mohammad 20 Nov: "show all the possible shunts at once"): every custom shunt the engine has is reachable by paging, a page never holds more than asked, the patient's own open shunts
// are kept and given back, and the pages together cover every shunt exactly once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import { CIRCUIT_ROOM, CUSTOM_DIAMETER, CUSTOM_SHUNTS, GROUPS, PAGE_SIZES, customRecord, inGroup, pageCount, pageOf } from '../src/ui/debug/inspect/pager.ts';
import { CUSTOM_EDGES } from '../src/scene/circuit/data.copied.ts';

test('the pager knows every custom shunt the engine has, and the Circuit has a course for each of them', () => {
  const engineIds = (EDGES as { id: string; shunt?: string }[]).filter((e) => e.shunt === 'custom').map((e) => e.id);
  assert.deepEqual(CUSTOM_SHUNTS.map((s) => s.id), engineIds);
  assert.ok(CUSTOM_SHUNTS.length > 100, `${CUSTOM_SHUNTS.length} shunts`);
  const circuit = new Set((CUSTOM_EDGES as readonly (readonly [string, ...unknown[]])[]).map((c) => c[0]));
  for (const s of CUSTOM_SHUNTS) assert.ok(circuit.has(s.id), `${s.id} has a place on the Circuit map`);
});

test('for every group and every page size the pages cover the group exactly once, and none is longer than asked', () => {
  for (const g of GROUPS) {
    const list = inGroup(g.id);
    assert.ok(list.length > 0, g.label);
    for (const size of PAGE_SIZES) {
      const seen: string[] = [];
      for (let p = 0; p < pageCount(list.length, size); p++) { const page = pageOf(list, size, p); assert.ok(page.length >= 1 && page.length <= size); seen.push(...page.map((x) => x.id)); }
      assert.deepEqual(seen, list.map((x) => x.id), `${g.id} at ${size}`);
    }
  }
  assert.equal(inGroup('systemic').length + inGroup('portal').length, CUSTOM_SHUNTS.length, 'systemic and portal-to-portal together are all of them');
  assert.ok(inGroup('liver').every((s) => !s.portal), 'a liver stent goes to a hepatic vein');
});

test('paging wraps round in both directions', () => {
  const list = inGroup('all'), n = pageCount(list.length, 6);
  assert.deepEqual(pageOf(list, 6, -1), pageOf(list, 6, n - 1));
  assert.deepEqual(pageOf(list, 6, n), pageOf(list, 6, 0));
  assert.ok(Math.max(...PAGE_SIZES) <= CIRCUIT_ROOM, 'the biggest page fits in what the Circuit routes');
});

test('opening a page keeps the patient\'s own shunts at their own diameter and gives the others the stent tool\'s 10 mm', () => {
  const ids = CUSTOM_SHUNTS.slice(0, 3).map((s) => s.id), mine = { [ids[1]!]: 7, X_ELSE: 5 };
  const rec = customRecord(mine, ids);
  assert.equal(rec[ids[0]!], CUSTOM_DIAMETER);
  assert.equal(rec[ids[1]!], 7);
  assert.equal(rec.X_ELSE, 5);
  assert.deepEqual(mine, { [ids[1]!]: 7, X_ELSE: 5 }, 'the patient\'s own record is not edited');
  assert.deepEqual(customRecord(mine, []), mine, 'nothing shown: the patient\'s own');
});
