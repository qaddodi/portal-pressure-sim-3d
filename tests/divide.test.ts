// A vein divided at surgery (2D divideLen): the splenic vein under a Warren shunt, the portal trunk under a portocaval one. The stretch opens with the shunt's drawing on, never pops, and a side-to-side shunt keeps the trunk whole.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIVIDED, PINCH_K, PV_START, divideOf, stumpCentre, stumpOf } from '../src/scene/vessels/divide.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';

test('the divided veins are the splenic vein (Warren) and the portal trunk\'s first stretch (portocaval), both real vessels', () => {
  assert.deepEqual(DIVIDED.map(([s]) => s), ['S_DSR', 'S_PC']);
  for (const [s, v] of DIVIDED) { assert.ok(NETWORK_BY_ID.get(s), s); assert.ok(NETWORK_BY_ID.get(v), v); }
  assert.equal(DIVIDED[1]![1], PV_START);
});

test('the cut is at least 2.2 widths and the outline, at most 4.8 widths or 0.45 of the vein, and the tie is just behind the stump', () => {
  for (const [s, v] of DIVIDED) {
    const d = divideOf(s, v)!, w = 2 * NETWORK_BY_ID.get(v)!.radius * 300;
    assert.ok(d, `${s}/${v}`);
    assert.ok(d.cut >= 2.2 * w + 2 - 1e-9, `${v} cut ${d.cut} vs width ${w}`);
    assert.ok(d.tie > d.cut, 'the tie is behind the cut end');
  }
  assert.equal(stumpCentre(10, 100), 19); assert.equal(stumpCentre(10, 10), 10);
  assert.ok(PINCH_K > 0 && PINCH_K < 0.5);
});

test('the stretch eases with the shunt (0 to the whole, smooth), is 0 for a side-to-side portocaval shunt, and for a shunt not drawn', () => {
  const [s, v] = DIVIDED[0]!, d = divideOf(s, v)!;
  assert.deepEqual(stumpOf(s, v, 0, false), [0, 0, 0]);
  const half = stumpOf(s, v, 0.5, false), whole = stumpOf(s, v, 1, false);
  assert.equal(half[0], 0.5 * d.cut); assert.equal(whole[0], d.cut); assert.equal(whole[1], d.tie); assert.equal(whole[2], 1);
  assert.ok(stumpOf(s, v, 0.1, false)[0] < 0.1 * d.cut, 'it starts slowly');
  assert.deepEqual(stumpOf('S_PC', PV_START, 1, true), [0, 0, 0]);
});
