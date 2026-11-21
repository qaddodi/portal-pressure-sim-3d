// The caput medusae fan (C3~F:caput) is a tree of courses; at every fork the colour is a gradient (a child begins in the colour its parent ends in), only one round cap stands at each point where ends meet, and the paraumbilical vein
// that feeds the hub narrows to the width of the roots that leave it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { coursesOf, REST } from '../src/scene/vessels/shape.ts';
import { fanCaps, fanLensRanges } from '../src/scene/vessels/feeder-fan.ts';
import { buildTubes } from '../src/scene/vessels/tubes.ts';

const fanV = NETWORK_BY_ID.get('C3~F:caput')!;
const fan = coursesOf(fanV, REST);
const d3 = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

test('no colour step across any fork of the fan', () => {
  assert.ok(fan.length > 10);
  fan.forEach((c) => assert.ok(c.lens, 'every course wears its own stretch of the ramp'));
  let forks = 0;
  fan.forEach((p, i) => fan.forEach((c, j) => {
    if (i === j || d3(p.pts.at(-1)!, c.pts[0]!) > 1e-4) return;
    forks++;
    assert.ok(Math.abs(p.lens![1] - c.lens![0]) < 1e-9, `course ${j} begins where ${i} ends in colour`);
  }));
  assert.ok(forks > 20, 'the fan has its forks');
  for (const c of fan) { assert.ok(c.lens![0] >= 0 && c.lens![1] <= 1 + 1e-9 && c.lens![1] > c.lens![0]); }
});

test('one round cap where ends meet: the widest keeps it, the others run into it', () => {
  const caps = fanCaps(fan);
  const at = (c: number, e: 0 | 1) => fan[c]!.pts[e ? fan[c]!.pts.length - 1 : 0]!;
  for (let a = 0; a < fan.length; a++) for (const ea of [0, 1] as const) {
    const group: { c: number; e: 0 | 1 }[] = [];
    for (let b = 0; b < fan.length; b++) for (const eb of [0, 1] as const) if (d3(at(a, ea), at(b, eb)) < 1e-4) group.push({ c: b, e: eb });
    const kept = group.filter((g) => caps[g.c]![g.e]);
    assert.equal(kept.length, 1, `one cap at a meeting of ${group.length} ends`);
    for (const g of group) assert.ok(fan[g.c]!.radius <= fan[kept[0]!.c]!.radius + 1e-12);
  }
  // (the geometry carries it: a capless end is built as a hair)
  const lens = fanLensRanges(fan);
  assert.equal(lens.filter((l) => l && l[0] === 0).length, 5, 'five roots at the umbilical hub');
  const { geometry } = buildTubes(fan, fan.map(() => 16), fanV.radius);
  assert.ok(geometry.getAttribute('lensR'), 'the colour stretch is a vertex attribute');
});

test('the paraumbilical vein narrows to the hub roots', () => {
  const c3 = coursesOf(NETWORK_BY_ID.get('C3')!, { ...REST, live: 1 })[0]!, roots = fan.filter((c) => c.lens![0] === 0);
  const w = Math.max(...roots.map((c) => c.radius));
  assert.ok(d3(c3.pts.at(-1)!, roots[0]!.pts[0]!) < 1e-4, 'it ends at the hub');
  assert.ok(c3.radius * c3.taper![1]! <= w + 1e-9, 'its end is no wider than the widest root');
});

test('a braid landing on a host: the strands together make the trunk width there, not each of them (no bulb)', async () => {
  const { radiusAtU } = await import('../src/scene/vessels/tubes.ts');
  for (const id of ['C7', 'C2', 'C1a']) {
    const v = NETWORK_BY_ID.get(id)!, cs = coursesOf(v, { ...REST, strandsOn: true, wig: 3, spr: 1, rec: 1 }), strands = cs.slice(1), n = strands.length;
    assert.ok(n > 1, id);
    const sewn = [0, 1].filter((e) => cs[0]!.sewn?.[e]);
    assert.ok(sewn.length, `${id} lands on a host`);
    for (const c of strands) {
      const len = c.pts.reduce((a, p, k) => (k ? a + d3(p, c.pts[k - 1]!) : 0), 0);
      for (const e of sewn) assert.ok(radiusAtU(c, e, len) * Math.sqrt(n) <= v.radius * (1 + 1e-9), `${id} strand end ${e} is its share of the trunk`);
    }
  }
});
