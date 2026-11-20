// The inspector's overlap finder (src/scene/vessels/overlaps.ts; Mohammad 20 Nov: "without too much overlap, and if there is we should be able to fix"): two tubes whose centrelines come closer than 0.8 of their radii together are listed,
// the ends of every vessel and the pieces of one host are not, and a vessel that is not drawn is never in it. Pure, on the real network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK } from '../src/scene/vessels/network.ts';
import { END_ZONE, OVERLAP_K, findOverlaps } from '../src/scene/vessels/overlaps.ts';

test('the real network, everything drawn: a short list, worst first, every pair two different hosts with a point and a depth inside 0..1', () => {
  const o = findOverlaps();
  assert.ok(o.length > 0 && o.length < 60, `${o.length} pairs`);
  const by = new Map(NETWORK.map((v) => [v.id, v]));
  for (const x of o) {
    assert.notEqual(by.get(x.a)!.host, by.get(x.b)!.host, `${x.a} and ${x.b} are pieces of one vein`);
    assert.ok(x.depth > 0 && x.depth <= 1 && x.gap < x.limit && x.at.every(Number.isFinite) && x.length > 0, `${x.a} x ${x.b}`);
    assert.ok(Math.abs(x.limit - OVERLAP_K * (by.get(x.a)!.radius + by.get(x.b)!.radius)) < 1e-9, 'the limit is 0.8 of the radii together');
  }
  for (let i = 1; i < o.length; i++) assert.ok(o[i - 1]!.depth * o[i - 1]!.length >= o[i]!.depth * o[i]!.length, 'worst first');
  assert.ok(END_ZONE >= 2, 'the ends are left to the skins');
});

test('a vessel that is not drawn is in no pair, and with only one vessel drawn there are none', () => {
  const all = findOverlaps();
  assert.ok(all.length > 0);
  const a = all[0]!.a;
  assert.ok(findOverlaps({ drawn: (id) => id !== a }).every((x) => x.a !== a && x.b !== a));
  assert.deepEqual(findOverlaps({ drawn: (id) => id === a }), []);
  assert.deepEqual(findOverlaps({ drawn: () => false }), []);
});

test('two copies of one tube are an overlap at every point but its ends, and the ends are not counted', () => {
  const v = NETWORK.find((n) => !n.feeder && !n.id.includes('~F') && n.kind === 'vein')!;
  const twin = { ...v, id: `${v.id}_twin`, host: `${v.host}_twin` };
  const o = findOverlaps({ network: [v, twin] });
  assert.equal(o.length, 1);
  assert.ok(o[0]!.depth > 0.99, 'on top of each other');
});
