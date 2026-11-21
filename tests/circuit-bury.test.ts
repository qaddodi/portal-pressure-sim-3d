// The map's own tubes (the liver's branches, the caudate lane) end INSIDE the vessel they leave or reach, as every declared branch of the body does, so their outline is not drawn there (the body's rule, scene.ts applyMates:
// a child's outline is not drawn where it lies inside its parent's lumen). Run: node --test tests/circuit-bury.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Vector2 } from 'three';
import { CIRCUIT_TREES } from '../src/scene/circuit/data.copied.ts';
import { CircuitTubes, treeRunOn, treeRunOns } from '../src/scene/circuit/tubes.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { createLensShared } from '../src/scene/vessels/vessel-object.ts';
import { createCircuitShared } from '../src/scene/circuit/uniforms.ts';

const tubes = () => new CircuitTubes(createShared(), createLensShared(), { streamTex: { value: null as never }, chainTex: { value: null as never }, routeTex: { value: null as never }, projY: { value: 1 }, dpr: { value: 1 }, streakAmt: { value: 0 }, dustP: { value: new Float32Array(52) } }, createCircuitShared(8));
const buryOf = (o: { toon: { uniforms: Record<string, { value: unknown }> } }): [number, number] => { const v = o.toon.uniforms.bury!.value as Vector2; return [v.x, v.y]; };

test('a liver branch is buried at its start (in the lane it leaves) and free at its tip; a branch of a branch is buried less than a branch of the lane', () => {
  const t = tubes(), objs = t.objects, ids = t.ids;
  const trees = ids.map((e, i) => ({ ...e, bury: buryOf(objs[i]!) })).filter((e) => e.kind === 'tree');
  assert.ok(trees.length >= 24, `${trees.length} branches`);
  for (const e of trees) {
    const [lane, i] = e.id.split('#') as [string, string];
    // (a start that lies at the END of another tube, the portal venules' tips running on into the sinusoid lanes, is a run-on: its ring keeps its whole outline)
    if (treeRunOn(lane, Number(i))) assert.equal(e.bury[0], 0, `${e.id}: a run-on's ring keeps its ink`);
    else assert.ok(e.bury[0] > 0, `${e.id}: its start lies inside its parent`);
    assert.equal(e.bury[1], 0, `${e.id}: its tip is free`);
  }
  const list = CIRCUIT_TREES.PRE_R!, first = trees.find((e) => e.id === 'PRE_R#0')!, second = trees.find((e) => e.id === 'PRE_R#1')!;
  assert.ok(list[1]!.k < list[0]!.k && second.bury[0] < first.bury[0], `PRE_R#1 leaves PRE_R#0, a narrower tube than the lane (${second.bury[0]} < ${first.bury[0]})`);
  t.dispose();
});

test('the caudate lane is buried at both ends (in the sinusoid vein it leaves and in the cava it enters); the code applies it where the tubes are made', () => {
  const t = tubes(), i = t.ids.findIndex((e) => e.id === 'CAUD');
  if (i >= 0) { const [a, b] = buryOf(t.objects[i]!); assert.ok(a > 0 && b > 0, `CAUD buried ${a}, ${b}`); }
  t.dispose();
  const src = readFileSync(new URL('../src/scene/circuit/tubes.ts', import.meta.url), 'utf8');
  assert.match(src, /buryOf\(trunkRadius\('CV_R'\), trunkRadius\('IVCS'\)\)/);
  assert.match(src, /if \(bury\) o\.setBury\(bury\[0\], bury\[1\]\)/);
});

test('the lanes that run on into one another (portal venules into sinusoids at x = 800) keep their ink at the seam and run on a hair: no notch, tick or cap line across the lane', () => {
  const t = tubes(), ro = treeRunOns();
  const starts = [...ro].filter(([, v]) => v[0]).map(([k]) => k), ends = [...ro].filter(([, v]) => v[1]).map(([k]) => k);
  // every sinusoid lane starts on a portal venule's tip (SIN_RR, SIN_LL: 6 each) and each of those tips is the end that carries on
  assert.deepEqual(starts.filter((k) => k.startsWith('SIN_')).length, 12, 'the 12 sinusoid starts');
  assert.equal(ends.filter((k) => k.startsWith('PRE_')).length, 12, 'the 12 venule tips');
  for (const k of ro.keys()) if (k.startsWith('PRE_')) assert.equal(ro.get(k)![0], false, `${k} starts on its lane: a side branch`);
  const ids = t.ids, objs = t.objects;
  for (let n = 0; n < ids.length; n++) {
    const id = ids[n]!.id, m = ro.get(id);
    if (!m) continue;
    const u = objs[n]!.toon.uniforms as Record<string, { value: { x: number } }>;
    assert.equal(u.mate0!.value.x >= 0, m[0], `${id}: start mate`);
    assert.equal(u.mate1!.value.x >= 0, m[1], `${id}: end mate`);
  }
  t.dispose();
});
