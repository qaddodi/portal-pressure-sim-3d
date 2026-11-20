// The FibroScan probe rests ON the organ's silhouette edge, its beam going in (owner, 20 Nov 2026: "the fibroscanners are NOT on top of the organs... floating on top in front of it", liver and spleen),
// its waves are see-through strokes as 2D's packets are, and the scope's tip is one tube with its shaft ("the tip is disconnected from its body"). Root cause of the first: the tip was a fraction of the
// mesh's box, and a fraction of a 3D mesh's box is not on its outline. It is now found on the baked silhouette, at the organ's size now.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Box3, Matrix4, Vector3 } from 'three';
import { organsReady, setOrganData, ORGAN_MESHES } from '../src/scene/organs/meshes.ts';
import { bakeMask, covers, edgeOnLine, maskOf, EDGE_CELL } from '../src/scene/devices/probes/organ-edge.ts';
import { FibroProbe, fibroPlace, fadeOf, WAVE_ARCS, WAVE_STROKE_A } from '../src/scene/devices/probes/fibro-probe.ts';
import { SCAN } from '../src/scene/devices/probes/copied/scan-probe.copied.js';
import { EndoScope, SCOPE_UP, scopeWay, workD } from '../src/scene/devices/probes/scope.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { len3 } from '../src/scene/frame2d.ts';
import type { DeviceObject } from '../src/scene/devices/device-object.ts';

const file = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);

/** A disc of radius r at the origin as a triangle fan, z from -0.1 to 0.1. */
function disc(r: number): { pos: number[]; index: number[] } {
  const pos: number[] = [], index: number[] = [], n = 64;
  for (const z of [-0.1, 0.1]) { pos.push(0, 0, z); for (let i = 0; i < n; i++) pos.push(r * Math.cos((i / n) * 2 * Math.PI), r * Math.sin((i / n) * 2 * Math.PI), z); }
  for (const o of [0, n + 1]) for (let i = 0; i < n; i++) index.push(o, o + 1 + i, o + 1 + ((i + 1) % n));
  return { pos, index };
}

test('the silhouette walk finds the edge from inside and from outside, at the organ\'s size and place now', () => {
  const { pos, index } = disc(0.5), m = bakeMask(pos, index), I = new Matrix4(), out = new Vector3();
  // from inside, looking out against the aim (the probe's body is outside, its beam goes in)
  assert.equal(edgeOnLine(m, I, new Vector3(0.1, 0.1, 0), new Vector3(-1, -1, 0).normalize(), out), true);
  assert.ok(Math.abs(Math.hypot(out.x, out.y) - 0.5) < 2 * EDGE_CELL, `radius ${Math.hypot(out.x, out.y)}`);
  assert.ok(covers(m, out.x, out.y), 'on the covered side of the edge');
  // from outside, walking in along the aim
  assert.equal(edgeOnLine(m, I, new Vector3(0.9, 0, 0), new Vector3(-1, 0, 0), out), true);
  assert.ok(Math.abs(out.x - 0.5) < 2 * EDGE_CELL);
  // a grown organ (a spleen at 1.6 about a pivot): the mask is baked once, the edge follows the matrix
  const M = new Matrix4().makeTranslation(0.2, -0.1, 0).multiply(new Matrix4().makeScale(1.6, 1.6, 1.6));
  assert.equal(edgeOnLine(m, M, new Vector3(0.2, -0.1, 0), new Vector3(-1, 0, 0), out), true);   // (the aim goes in from the +x side)
  assert.ok(Math.abs(out.x - (0.2 + 0.8)) < 3 * EDGE_CELL * 1.6, `grown edge at ${out.x}`);
  // a line that never meets the organ
  assert.equal(edgeOnLine(m, I, new Vector3(3, 3, 0), new Vector3(1, 0, 0), out, 2), false);
});

for (const organ of ['liver', 'spleen'] as const) {
  test(`${organ}: the probe's tip lies on the organ's silhouette, at its size now, with the body outside and the beam inward`, async () => {
    await organsReady;
    const g = ORGAN_MESHES[organ]!(), mask = maskOf(g);
    for (const scale of [1, 1.7]) {
      const world = new Matrix4().makeScale(scale, scale, scale);
      const box = new Box3().setFromBufferAttribute(g.getAttribute('position') as never).applyMatrix4(world);
      const edge = (_o: string, a: Vector3, d: Vector3, out: Vector3) => edgeOnLine(mask, world, a, d, out);
      const p = fibroPlace(box, organ, undefined, edge);
      const inv = world.clone().invert(), local = p.tip.clone().applyMatrix4(inv);
      assert.ok(covers(mask, local.x, local.y), `${organ} x${scale}: the tip is on the organ`);
      const out2 = local.clone().addScaledVector(p.dir.clone().transformDirection(inv), -3 * EDGE_CELL), in2 = local.clone().addScaledVector(p.dir.clone().transformDirection(inv), 3 * EDGE_CELL);
      assert.equal(covers(mask, out2.x, out2.y), false, `${organ} x${scale}: behind the tip (where the body is) is outside the organ`);
      assert.equal(covers(mask, in2.x, in2.y), true, `${organ} x${scale}: the beam goes into the organ`);
    }
  });
}

test('the probe follows the organ\'s edge as the organ grows, and a probe with no edge keeps the 2D box fraction', async () => {
  await organsReady;
  const g = ORGAN_MESHES.spleen!(), mask = maskOf(g), sh = createShared();
  let s = 1;
  const box = () => new Box3().setFromBufferAttribute(g.getAttribute('position') as never).applyMatrix4(new Matrix4().makeScale(s, s, s));
  const edge = (_o: string, a: Vector3, d: Vector3, out: Vector3) => edgeOnLine(mask, new Matrix4().makeScale(s, s, s), a, d, out);
  const f = new FibroProbe(sh);
  let now = 0;
  const run = (n: number) => { for (let i = 0; i < n; i++) { now += 16; f.update(16, now, true, 'spleen', box, 9, null, edge); } };
  run(60);
  const t1 = f.placement.tip.clone();
  s = 1.8; run(3);
  const t2 = f.placement.tip.clone();
  assert.ok(t2.distanceTo(t1) > 0.05, 'the tip moved out with the organ');
  const loc = t2.clone().multiplyScalar(1 / s);
  assert.ok(covers(mask, loc.x, loc.y), 'and is on the grown organ');
  f.dispose();
  const bare = fibroPlace(new Box3(new Vector3(-1, -0.5, -0.2), new Vector3(1, 0.5, 0.2)), 'spleen');
  assert.ok(Math.abs(bare.tip.x - (-1 + 2 * (SCAN.AT.spleen as number[])[0]!)) < 1e-9);
});

test('the waves are see-through strokes: 2D\'s packet (a ripple, the crest, a ripple), never fully opaque, in from nothing', () => {
  assert.equal(WAVE_ARCS, 3); assert.deepEqual([...WAVE_STROKE_A], [0.35, 0.95, 0.35]);
  const peak = Math.max(...Array.from({ length: 101 }, (_, i) => fadeOf(i / 100)));
  assert.ok(fadeOf(0) < 0.1 && peak > 0.8 && peak <= 1 && fadeOf(1) < 0.01, 'in from nothing, nearly full in the middle, gone at the end');
  const sh = createShared(), f = new FibroProbe(sh), box = () => new Box3(new Vector3(-1, -0.5, -0.2), new Vector3(1, 0.5, 0.2));
  for (let i = 0; i < 90; i++) f.update(16, i * 16, true, 'liver', box, 12);
  const waves = (f as unknown as { waves: { part: DeviceObject }[] }).waves, seen = waves.filter((w) => w.part.group.visible);
  assert.ok(seen.length >= WAVE_ARCS, 'fronts are out');
  for (const w of seen) { const a = w.part.toon.uniforms.alpha!.value as number; assert.ok(a < 0.96, `alpha ${a}`); }
  assert.ok(waves.every((w) => w.part.toon.uniforms.fatPx!.value === 0), 'a stroke is its own width');
  f.dispose();
});

test('the scope\'s tip is one tube with its shaft: the shaft\'s width, starting inside it, and the plain scope stops higher', () => {
  const sc = new EndoScope(createShared());
  for (let t = 0; t < 8000; t += 16) sc.update(16, true, 'scope', 'pv');
  const k = sc as unknown as { shaft: { rings: { c: Vector3; r: number }[] }; tip: { rings: { c: Vector3; r: number }[] } };
  const R = k.shaft.rings[0]!.r, first = k.tip.rings[0]!, last = k.tip.rings[k.tip.rings.length - 1]!;
  assert.ok(k.tip.rings.every((r) => r.r === R), 'the tip is as wide as the shaft from end to end');
  const n = sc.pose.shaftRings, next = k.shaft.rings[n + 1]!;
  assert.ok(first.c.distanceTo(next.c) < len3(1.2 * 3), `the tip starts at the shaft (${first.c.distanceTo(next.c)})`);
  assert.ok(first.c.distanceTo(last.c) > 0.01);
  assert.ok(SCOPE_UP > 40 && Math.abs(workD('scope', 'pv') - (scopeWay().cardiaD - SCOPE_UP)) < 1e-9);
  sc.dispose();
});
