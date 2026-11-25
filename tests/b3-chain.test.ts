import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import { INFO, NO_CHAIN, StreamChain } from '../src/scene/blood/chain.ts';
import type { Streams } from '../src/scene/blood/streams.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';

const ids = (EDGES as { id: string }[]).map((e) => e.id);
const still = (v: number) => ({ stream: () => ({ D: 0, vd: 0, vSlow: v, sgn: 1 }), flowOf: () => 5, moving: true }) as unknown as Streams;

test('the vessels that chain are the drawn veins: arteries, feeder fans and the cava below the hepatic veins keep their own pattern', () => {
  for (const id of NO_CHAIN) assert.equal(INFO[ids.indexOf(id)], null, id);
  assert.equal(INFO[ids.indexOf('HA')] ?? null, null);
  assert.ok(INFO[ids.indexOf('PV_TRUNK')]);
  assert.ok(INFO.filter(Boolean).length > 40);
});

test('with blood running along every vein, links form: a vessel is carried on from the vessel that ends where it begins, and the heads run through the chained ends', () => {
  const c = new StreamChain();
  const drawn = (id: string) => INFO.some((i) => i?.id === id);
  for (let t = 0; t < 3000; t += 16) c.step(t, still(3), drawn);
  const k = ids.indexOf('PV_TRUNK');
  const linked = INFO.map((_, i) => i).filter((i) => c.weightOf(i) > 0.99);
  assert.ok(linked.length > 10, `${linked.length} vessels linked`);
  for (const i of linked) { const p = c.parentOf(i); assert.ok(p >= 0 && p !== i, `${ids[i]}'s parent`); assert.ok(INFO[p], `${ids[p]} chains`); }
  // the ends a link runs through carry its weight: row 1 of the texture, the parent's downstream end
  const d = c.texture.image.data as Float32Array;
  const NE = ids.length;
  const through = INFO.map((_, i) => i).filter((i) => d[NE * 4 + i * 4]! > 0 || d[NE * 4 + i * 4 + 1]! > 0);
  // (row 1 holds both ends of a link: the child's entry end and the PARENT's exit end (chain.ts, "the parent's exit end by the straightest of its children"), so a parent that is a root, not linked itself,
  //  keeps an end too, and the count can pass the links' (the placed network has more straight run-ons from roots: 41 ends for 39 links). What must hold: an end is kept only by a link, as its child or its parent)
  const parents = new Set(linked.map((i) => c.parentOf(i)));
  assert.ok(through.length >= 4, `${through.length} ends kept: the ones that run on straight (a turn at a fork gives them up, chain.ts TURN_NONE_COS)`);
  for (const i of through) assert.ok(linked.includes(i) || parents.has(i) || c.weightOf(i) > 0, `${ids[i]} keeps an end with no link through it`);
  assert.ok(k >= 0);
});

test('a vessel that is not drawn takes no part, and a link that breaks eases out rather than cutting', () => {
  const none = new StreamChain();
  none.step(0, still(3), () => false);
  assert.ok(INFO.every((_, i) => none.weightOf(i) === 0));
  const c = new StreamChain();
  const drawn = (id: string) => INFO.some((i) => i?.id === id);
  c.step(0, still(3), drawn);
  const k = INFO.map((_, i) => i).find((i) => c.weightOf(i) === 1)!;
  assert.ok(k >= 0);
  // the blood in every vein but this one now runs ten times as fast: its link's speed ratio leaves the bounds, and its weight falls over a few frames, not at once
  const fast = { stream: (i: number) => ({ D: 0, vd: 0, vSlow: i === k ? 0.3 : 30, sgn: 1 }), flowOf: () => 5, moving: true } as unknown as Streams;
  c.step(16, fast, drawn);
  const w = c.weightOf(k);
  assert.ok(w < 1 && w > 0, `weight ${w}`);
});

test('the shader places a head by A + B s along the root stream, and runs it through a chained end', () => {
  assert.match(VESSEL_FS, /vec2 chevOne\(/);
  assert.match(VESSEL_FS, /chevOne\(s, Lw, c4\.y \+ c4\.z \* s, c4\.z, rootD/);
  assert.match(VESSEL_FS, /clamp\(ends\.x, 0\.0, 1\.0\)/);
  assert.match(VESSEL_FS, /uniform sampler2D chainTex;/);
});
