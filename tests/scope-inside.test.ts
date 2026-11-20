// The scope runs through the middle of the oesophagus and stomach (owner, 20 Nov 2026: "when we're scoping the scope should be INSIDE the lumen, not outside the entire structure"): its depth is
// the organ's own middle at each point of its way, smooth along it, and never beyond the organ's faces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { organsReady, setOrganData, ORGAN_MESHES } from '../src/scene/organs/meshes.ts';
import { bakeGeometry, centreAt, bakeCentre } from '../src/scene/organs/centre-z.ts';
import { scopeWay, glueScopeWay, scopeZ } from '../src/scene/devices/probes/scope.ts';
import { x3, y3 } from '../src/scene/frame2d.ts';

const file = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);

test('the middle of a slab is its centre, and a point past its edge takes the nearest', () => {
  // two triangles at z = 0.1 and z = 0.3 over the same square: middle 0.2
  const pos = [0, 0, 0.1, 1, 0, 0.1, 0, 1, 0.1, 0, 0, 0.3, 1, 0, 0.3, 0, 1, 0.3];
  const g = bakeCentre(pos, [0, 1, 2, 3, 4, 5]);
  assert.ok(Math.abs(centreAt(g, 0.2, 0.2) - 0.2) < 1e-6);
  assert.ok(Math.abs(centreAt(g, 5, 5) - 0.2) < 1e-6);
});

test('the scope\'s way runs on the oesophagus and stomach\'s middle, smoothly, inside their faces', async () => {
  await organsReady;
  const geo = ORGAN_MESHES.stomach!(), pa = geo.getAttribute('position').array;
  let zmin = Infinity, zmax = -Infinity;
  for (let i = 2; i < pa.length; i += 3) { zmin = Math.min(zmin, pa[i]!); zmax = Math.max(zmax, pa[i]!); }
  const grid = bakeGeometry(geo);
  for (const way of [scopeWay(), glueScopeWay()]) {
    let prev: number | null = null, worst = 0, minZ = Infinity, maxZ = -Infinity;
    for (const p of way.pts) {
      const z = scopeZ(x3(p[0]), y3(p[1]));
      assert.ok(Math.abs(z - centreAt(grid, x3(p[0]), y3(p[1]))) < 1e-9);
      if (prev !== null) worst = Math.max(worst, Math.abs(z - prev));
      prev = z; minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    assert.ok(minZ >= zmin && maxZ <= zmax, `the middle stays between the organ's faces (${minZ.toFixed(3)}..${maxZ.toFixed(3)} of ${zmin.toFixed(3)}..${zmax.toFixed(3)})`);
    assert.ok(worst < 0.02, `no jump along the way (largest step ${worst.toFixed(4)})`);
  }
});

test('a device draws its ink before its fill (no depth test: the ink hull drawn last covered the whole device in outline colour), and the scope\'s shaft is not the outline colour', () => {
  const dev = readFileSync(new URL('../src/scene/devices/device-object.ts', import.meta.url), 'utf8');
  assert.match(dev, /2 \* \(o\.order \?\? 0\) \+ \(c === this\.toonMesh \? 1 : 0\)/);
  const scope = readFileSync(new URL('../src/scene/devices/probes/scope.ts', import.meta.url), 'utf8');
  assert.match(scope, /sh = mk\('poly', \(t\) => SCOPE_TUBE\(t\),/);   // (2D's black polymer, --dev-scope; it was the grey steel)
  assert.ok(!/sh = mk\('poly', \(t\) => t\.polyEdge/.test(scope));
});

test('every device object puts its ink under its fill, whatever its order', async () => {
  const { DeviceObject } = await import('../src/scene/devices/device-object.ts');
  const { allocTube } = await import('../src/scene/devices/tube-rings.ts');
  const { createShared } = await import('../src/scene/materials/cel.ts');
  const shared = createShared();
  for (const order of [0, 1, 4]) {
    const o = new DeviceObject(allocTube(8, 8), 'poly', shared, { order }, 'ink');
    const ink = o.group.children.find((c: any) => c !== o.toonMesh)!;
    assert.ok(ink.renderOrder < o.toonMesh.renderOrder, `order ${order}: ink ${ink.renderOrder} under fill ${o.toonMesh.renderOrder}`);
  }
  const a = new DeviceObject(allocTube(8, 8), 'poly', shared, { order: 1 }, 'ink'), b = new DeviceObject(allocTube(8, 8), 'poly', shared, { order: 2 }, 'ink');
  assert.ok(a.toonMesh.renderOrder < (b.group.children.find((c: any) => c !== b.toonMesh)!).renderOrder, 'a higher device order still draws wholly over a lower one');
});

test('a device grows by a pixel or so each side, the fill first and the outline outside it, so a thin catheter always shows its colour', async () => {
  const { DeviceObject, FAT_PX } = await import('../src/scene/devices/device-object.ts');
  const { allocTube } = await import('../src/scene/devices/tube-rings.ts');
  const { createShared } = await import('../src/scene/materials/cel.ts');
  const o = new DeviceObject(allocTube(8, 8), 'poly', createShared(), {}, 'ink');
  assert.ok(FAT_PX >= 0.75);
  assert.match(o.toon.vertexShader, /gp\.xy \+= fatN \* fatPx \* 2\.0 \/ res \* gp\.w/);
  assert.match(o.ink.vertexShader, /\(px \+ fatPx \+ hiPx \* vHi\)/);
  assert.equal((o.toon.uniforms.fatPx as { value: number }).value, FAT_PX);
  assert.equal((o.ink.uniforms.fatPx as { value: number }).value, FAT_PX);
});

test('devices draw in the blended list, after the whole opaque one (the organs\' wash and a fading vessel end were drawn over them), at any fade', async () => {
  const { DeviceObject } = await import('../src/scene/devices/device-object.ts');
  const { allocTube } = await import('../src/scene/devices/tube-rings.ts');
  const { createShared } = await import('../src/scene/materials/cel.ts');
  const o = new DeviceObject(allocTube(8, 8), 'poly', createShared(), {}, 'ink');
  for (const a of [1, 0.5, 1]) { o.setAlpha(a); assert.equal(o.toon.transparent, true); assert.equal(o.ink.transparent, true); assert.equal(o.toon.depthWrite, false); }
});

test('a free end fades out as a gradient: the scope\'s top and a catheter\'s lead-in take the tail fade, and the plain scope stops above the junction', async () => {
  const { DeviceObject, TAIL_UNITS } = await import('../src/scene/devices/device-object.ts');
  const { allocTube } = await import('../src/scene/devices/tube-rings.ts');
  const { createShared } = await import('../src/scene/materials/cel.ts');
  const { workD, scopeWay, SCOPE_UP } = await import('../src/scene/devices/probes/scope.ts');
  const o = new DeviceObject(allocTube(8, 8), 'poly', createShared(), {}, 'ink');
  assert.match(o.toon.fragmentShader, /alpha \* tailK\(vUv\.x\)/);
  assert.match(o.ink.fragmentShader, /\* alpha \* tailK\(vU\)/);
  o.setTailFade(0.2);
  assert.equal((o.toon.uniforms.tailFade as { value: number }).value, 0.2);
  assert.equal((o.ink.uniforms.tailFade as { value: number }).value, 0.2);
  o.setTailFade(5); assert.equal((o.toon.uniforms.tailFade as { value: number }).value, 1);
  assert.ok(TAIL_UNITS >= 80);
  assert.ok(Math.abs(workD('scope', 'pv') - (scopeWay().cardiaD - SCOPE_UP)) < 1e-6);
  const src = (p: string) => readFileSync(new URL(`../src/scene/devices/${p}`, import.meta.url), 'utf8');
  assert.match(src('probes/scope.ts'), /shaft\.setTailFade\(/);
  assert.match(src('catheters/proc-catheter.ts'), /\[this\.shaft, this\.needle, this\.wire\]\) o\.setTailFade\(/);
});

test('a soft light at the scope\'s tip fades in over about a second and follows the tip', async () => {
  const { EndoScope, GLOW_MS, GLOW_R, workD } = await import('../src/scene/devices/probes/scope.ts');
  const { createShared } = await import('../src/scene/materials/cel.ts');
  const sc = new EndoScope(createShared());
  const glow = () => (sc as unknown as { glowMesh: { visible: boolean }; glowMat: { opacity: number } });
  for (let t = 0; t < 12000 && !(Math.abs(sc.d - workD('scope', 'pv')) < 1e-3); t += 16) sc.update(16, true, 'scope', 'pv');
  const early = glow().glowMat.opacity;
  for (let t = 0; t < GLOW_MS + 100; t += 16) sc.update(16, true, 'scope', 'pv');
  assert.ok(glow().glowMesh.visible, 'the light is shown on the figure');
  assert.ok(glow().glowMat.opacity > 0.99, `fully up after ${GLOW_MS} ms (was ${early.toFixed(2)})`);
  assert.ok(GLOW_R > 6, 'wider than the scope');
});
