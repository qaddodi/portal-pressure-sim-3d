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

test('the tube geometry keeps every attribute the build makes (a fan\'s colour stretch and fading tip were dropped by withRk: a pink-to-violet step at every fork, no fade)', async () => {
  const { withRk, TUBE_ATTRIBUTES } = await import('../src/scene/vessels/vessel-object.ts');
  const { geometry } = buildTubes(fan, fan.map(() => 16), fanV.radius);
  for (const name of Object.keys(geometry.attributes)) assert.ok((TUBE_ATTRIBUTES as readonly string[]).includes(name), `${name} is carried through withRk`);
  const kept = withRk(geometry);
  for (const name of ['lensR', 'tipK']) assert.deepEqual([...kept.getAttribute(name).array], [...geometry.getAttribute(name).array], name);
  const lensR = kept.getAttribute('lensR');
  let spanned = 0;
  for (let i = 0; i < lensR.count; i++) if (lensR.getY(i) > 0) spanned++;
  assert.equal(spanned, lensR.count, 'every vertex of the fan wears its own stretch of the ramp');
});

test('a free tip of the fan narrows to a point and eases to transparent; the rest of the tree keeps its alpha', async () => {
  const { tipK } = await import('../src/scene/vessels/tubes.ts');
  const { fanTips, FAN_TIP_FROM } = await import('../src/scene/vessels/feeder-fan.ts');
  const tips = fanTips(fan);
  assert.ok(tips.filter(Boolean).length >= 10, 'the fan has its tips');
  assert.ok(tips.filter((t) => !t).length >= 10, 'and its inner courses');
  fan.forEach((c, i) => {
    assert.equal(c.tipFade, tips[i] ? FAN_TIP_FROM : undefined);
    assert.equal(!!c.point?.[1], tips[i]);
  });
  assert.equal(tipK(FAN_TIP_FROM, 0), 0);
  assert.equal(tipK(FAN_TIP_FROM, FAN_TIP_FROM), 0);
  assert.equal(tipK(FAN_TIP_FROM, 1), 1, 'nothing at the tip');
  let last = 0;
  for (let k = 0; k <= 100; k++) { const t = tipK(FAN_TIP_FROM, k / 100); assert.ok(t >= last - 1e-12, 'monotone'); last = t; }
  assert.equal(tipK(undefined, 1), 0);
  const { geometry, runs } = buildTubes(fan, fan.map(() => 16), fanV.radius);
  const tk = geometry.getAttribute('tipK');
  fan.forEach((c, i) => {
    const r = runs[i]!, ring = r.radial + 1;
    assert.equal(tk.getX(r.tubeStart), 0, 'a course starts whole');
    assert.equal(tk.getX(r.tubeStart + r.tubular * ring), tips[i] ? 1 : 0, 'and ends at nothing only at a free tip');
  });
});

test('the caput fan is drawn over every other vessel (a depth offset, nothing moves), and the navel ring is gone', async () => {
  const { readFileSync } = await import('node:fs');
  const { FAN_FRONT, CAPUT_FAN_ID } = await import('../src/scene/vessels/feeder-fan.ts');
  assert.equal(CAPUT_FAN_ID, 'C3~F:caput');
  assert.ok(NETWORK_BY_ID.has(CAPUT_FAN_ID));
  assert.ok(FAN_FRONT > 0.01 && FAN_FRONT < 0.1);
  const { NETWORK } = await import('../src/scene/vessels/network.ts');
  // the epigastric veins reach the fan's own depth at the navel, so a depth tie went to the wider tube: the offset is what puts the fan over them
  let tie = 0;
  for (const v of NETWORK) {
    if (v.feeder) continue;
    for (const c of coursesOf(v, { ...REST, live: 1 })) for (const p of c.pts) for (const f of fan) for (const q of f.pts) if (Math.hypot(p[0] - q[0], p[1] - q[1]) < c.radius + f.radius && p[2] > q[2] - 0.2 * FAN_FRONT) tie++;
  }
  assert.ok(tie > 0, 'there are crossings that tie in depth');
  assert.match(readFileSync(new URL('../src/scene/scene.ts', import.meta.url), 'utf8'), /def\.id === CAPUT_FAN_ID\) o\.setFrontDepth\(FAN_FRONT\)/);
  assert.match(readFileSync(new URL('../src/scene/vessels/shaders.ts', import.meta.url), 'utf8'), /c\.z -= frontDepth \* \(-projectionMatrix\[3\]\[2\]\) \/ c\.w;/);
  const { Landmarks } = await import('../src/scene/disease/landmarks.ts');
  const l = new Landmarks();
  l.setCaput(1, 0.016, true);
  assert.equal(l.group.children.length, 1, 'only the flank line: no ring or disc at the navel');
});
