// The true-3D lobule (Settings > Figure depth > 3D lobule and sinusoid): its geometry builds, is finite, faces the right way, stays in budget, and its widths are 2D's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { type BufferAttribute, Vector3 } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { LOBULE_R } from '../src/scene/lobule/shots.ts';
import { sinRadius, DISC_R } from '../src/scene/lobule/widths.ts';
import { Lobule3D, LZ, OVER_Z, TUBE_SEG, skipFirstFills } from '../src/scene/micro3d/lobule3d.ts';
import { buildBile } from '../src/scene/lobule/bile.ts';
import { PLATE_BOX } from '../src/scene/lobule/plate.ts';
import { lookColours } from '../src/scene/lobule/lz-colours.ts';

const shared = createShared();
const flat = new LobuleView(shared);
const l3 = new Lobule3D(flat, shared);
l3.buildForTest('light');

test('the 3D lobule builds every part, finite, in budget (well under 300k vertices)', () => {
  const n = l3.vertexCount;
  assert.ok(n > 50_000 && n < 260_000, `vertices ${n}`);
  for (const p of l3.partsForTest) {
    const a = p.geometry.getAttribute('position') as BufferAttribute;
    assert.ok(a && a.count > 0, `${p.toonMesh.name} has geometry`);
    for (const v of a.array as Float32Array) assert.ok(Number.isFinite(v), `${p.toonMesh.name} is finite`);
  }
});

test('every triangle faces the way its normals do (nothing is culled or lit inside out)', () => {
  const A = new Vector3(), B = new Vector3(), C = new Vector3(), e1 = new Vector3(), e2 = new Vector3(), fn = new Vector3(), vn = new Vector3(), t = new Vector3();
  for (const p of l3.partsForTest) {
    const g = p.geometry, pos = g.getAttribute('position') as BufferAttribute, nor = g.getAttribute('normal') as BufferAttribute, ix = g.getIndex()!;
    let bad = 0, tot = 0;
    for (let i = 0; i < ix.count; i += 3) {
      const i0 = ix.getX(i), i1 = ix.getX(i + 1), i2 = ix.getX(i + 2);
      A.fromBufferAttribute(pos, i0); B.fromBufferAttribute(pos, i1); C.fromBufferAttribute(pos, i2);
      fn.crossVectors(e1.subVectors(B, A), e2.subVectors(C, A));
      if (fn.lengthSq() < 1e-24) continue;
      vn.fromBufferAttribute(nor, i0).add(t.fromBufferAttribute(nor, i1)).add(t.fromBufferAttribute(nor, i2));
      tot++; if (fn.dot(vn) < 0) bad++;
    }
    // (the space of Disse's sleeve is drawn both ways on purpose: one winding each side)
    if (p.toonMesh.name === 'lobule3d/disse') assert.ok(bad <= tot / 2 + 1); else assert.equal(bad, 0, `${p.toonMesh.name}: ${bad} of ${tot} triangles inside out`);
  }
});

test('the sinusoids are 2D\'s width: a tube\'s first ring is sinRadius x R (never wider)', () => {
  const part = l3.partsForTest.find((p) => p.toonMesh.name === 'lobule3d/sinusoids-0')!;
  const pos = part.geometry.getAttribute('position') as BufferAttribute;
  const c = flat.net.courses.find((k) => k.kind === 's0')!;
  const cx = c.pts[0]![0] * LOBULE_R, cy = -c.pts[0]![1] * LOBULE_R;
  let r = 0;
  for (let v = 0; v < TUBE_SEG; v++) r = Math.max(r, Math.hypot(pos.getX(v) - cx, pos.getY(v) - cy, pos.getZ(v) - OVER_Z));
  assert.ok(Math.abs(r - sinRadius('s0', c.rho[0]!) * LOBULE_R) < 1e-5, `radius ${r}`);
});

test('the central vein is a smooth round mouth: its lip is a circle of 2D\'s radius, 64 segments', () => {
  const part = l3.partsForTest.find((p) => p.toonMesh.name === 'lobule3d/central-vein')!;
  const pos = part.geometry.getAttribute('position') as BufferAttribute;
  const cv = flat.net.courses.find((k) => k.kind === 'cv')!, o = cv.pts[Math.floor(cv.pts.length / 2)]!, ox = o[0] * LOBULE_R, oy = -o[1] * LOBULE_R;
  let max = 0;
  for (let v = 0; v < pos.count; v++) max = Math.max(max, Math.hypot(pos.getX(v) - ox, pos.getY(v) - oy));
  assert.ok(Math.abs(max - DISC_R.cv * LOBULE_R) < 1e-4, `lip radius ${max} against ${DISC_R.cv * LOBULE_R}`);
  assert.ok(pos.count >= 64 * 9);
});

test('the Bile layer\'s courses are the flat view\'s own', () => {
  assert.equal(buildBile(flat.net).length, (flat as unknown as { bilePick: unknown[] }).bilePick.length);
});

test('the marks plate leaves out exactly 2D\'s ground fills', () => {
  let fills = 0;
  const ctx = { fill() { fills++; }, fillStyle: '' } as unknown as CanvasRenderingContext2D;
  const p = skipFirstFills(ctx, 2);
  p.fill(); p.fill(); p.fill(); p.fill();
  assert.equal(fills, 2);
  p.fillStyle = 'red';
  assert.equal(ctx.fillStyle, 'red');
});

test('every look has the colours the tiles read', () => {
  for (const look of ['light', 'dark', 'soft', 'navy', 'black'] as const) {
    const L = lookColours(look);
    assert.ok(L.text('--og-liver-1') && L.text('--og-liver-2') && L.text('--lz-nodule-ink'), look);
    l3.buildForTest(look);
  }
});

test('on the sinusoid (landed), the whole lobule stands aside, 3D and flat; back on the lobule it shows again', () => {
  const sh = createShared(), lv = new LobuleView(sh), l = new Lobule3D(lv, sh);
  lv.setVisible(true);
  l.update(true, 0.5);
  assert.equal(l.group.visible, true, 'half way down it is still there, dissolving');
  l.update(true, 1);
  assert.equal(l.group.visible, false); assert.equal(lv.group.visible, false);
  l.update(true, 0);
  assert.equal(l.group.visible, true); assert.equal(lv.group.visible, true);
  l.update(true, 1); l.update(false, 0);
  assert.equal(lv.group.visible, true);
});

test('no vessel over the plates is buried under the tiles (a buried one shows only in the gaps, as floating pieces): every sinusoid, cross-link and twig tops the tiles', () => {
  for (const name of ['lobule3d/sinusoids-0', 'lobule3d/sinusoids-1', 'lobule3d/sinusoids-2', 'lobule3d/sinusoids-links', 'lobule3d/arteriole-twigs']) {
    const part = l3.partsForTest.find((p) => p.toonMesh.name === name)!;
    const pos = part.geometry.getAttribute('position') as BufferAttribute;
    let top = -Infinity;
    for (let v = 0; v < Math.min(pos.count, TUBE_SEG); v++) top = Math.max(top, pos.getZ(v));
    assert.ok(top > LZ.cellTop, `${name}: its top ${top.toFixed(4)} is over the tiles' ${LZ.cellTop}`);
  }
});

test('every bile course runs from the central vein out toward its tract (its arrowheads point out, against the blood)', () => {
  const net = new LobuleView(createShared()).net;
  for (const c of buildBile(net)) { const a = c.pts[0]!, z = c.pts[c.pts.length - 1]!; assert.ok(Math.hypot(z[0], z[1]) > Math.hypot(a[0], a[1]), c.kind); }
});

test('the lobule\'s vessels are inked as the Anatomy\'s (a deep tone of their own colour), the hepatocytes with the tissue\'s line', () => {
  const flat = new LobuleView(createShared()); flat.setVisible(true);
  const l3 = new Lobule3D(flat, createShared()); l3.update(true);
  const inks: { name: string; own: number }[] = [];
  l3.group.traverse((o) => { const u = ((o as unknown as { material?: { uniforms?: Record<string, { value: unknown }> } }).material)?.uniforms; if (o.name.endsWith('/ink') && u?.uOwn) inks.push({ name: o.name, own: u.uOwn.value as number }); });
  for (const n of ['sinusoids-0', 'inlets', 'portal-venules', 'central-vein', 'canaliculi']) assert.ok(inks.find((i) => i.name.endsWith(`${n}/ink`))!.own > 0.5, n);
  assert.equal(inks.find((i) => i.name.endsWith('hepatocytes/ink'))!.own, 0);
});

test('the plate reaches past every portal tract\'s whole scar (it was cut off at the hexagon)', () => {
  assert.ok(PLATE_BOX >= 1 + 0.1 * 1.7 * 1.08 + 0.02);
});

test('the marks (the periportal scar) and the vessels draw after the see-through field of neighbour lobules, so the scar is never cut off at the hexagon', () => {
  const sh = createShared(), lv = new LobuleView(sh), l = new Lobule3D(lv, sh);
  let marks: import('three').Mesh | null = null, field: import('three').Mesh | null = null;
  l.group.traverse((o) => { if (o.name === 'lobule3d/marks') marks = o as import('three').Mesh; });
  lv.group.traverse((o) => { if (o.name === 'lobule/field') field = o as import('three').Mesh; });
  const m = marks as unknown as import('three').Mesh, f = field as unknown as import('three').Mesh | null;
  assert.ok((m.material as import('three').Material).transparent, 'in the see-through list');
  if (f) assert.ok(m.renderOrder > f.renderOrder, 'after the field');
  l.group.traverse((o) => { if (o.name.startsWith('lobule3d/sinusoids-0') && (o as import('three').Mesh).isMesh) { assert.ok(o.renderOrder > m.renderOrder); assert.ok(((o as import('three').Mesh).material as import('three').Material).depthWrite); } });
});

test('every end-on vessel is a pool full to the brim with its colour: one flat top at the height of the tubes that run into it, no rim, no drop', async () => {
  const { mouth } = await import('../src/scene/micro3d/lobule3d.ts');
  const { MeshBuilder } = await import('../src/scene/micro3d/cel3d.ts');
  const b = new MeshBuilder(), K: number[] = [];
  mouth(b, 0, 0, 0.2, 0.03, 0.05, K, 32, true, 0.06);
  assert.ok(K.every((k) => k === 1), 'one colour, no darker rim or floor');
  const g = b.build(), pos = g.getAttribute('position') as BufferAttribute;
  let zMax = -1; for (let v = 0; v < pos.count; v++) zMax = Math.max(zMax, pos.getZ(v));
  assert.ok(Math.abs(zMax - 0.06) < 1e-6, 'its top is the given height');
  const src = (await import('node:fs')).readFileSync('src/scene/micro3d/lobule3d.ts', 'utf8');
  for (const k of ['Pv', 'Ha', 'Bd', 'Lv', 'Cv']) assert.match(src, new RegExp(`mouths\\(this\\.mouth${k}, [^\\n]*, true, `), k);
});

test('every fluid of the 3D lobule is seen to move at the fit: streaks in every vessel (the blood\'s with Settings > Blood streaks), dark heads fading with the view', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/scene/micro3d/lobule3d.ts', import.meta.url), 'utf8');
  assert.match(src, /const bs = useSettings\.getState\(\)\.particles \? soft\(0\.6\) : 0;/);
  for (const part of ['this.inlets', 'this.twigs', 'this.sin.an']) assert.match(src, new RegExp(`${part.replace(/\./g, '\\.')}\\.setFlow\\([^;]*, soft\\(1\\), bs,`));
  assert.match(src, /this\.lt\.setFlow\([^;]*soft\(0\.8\)/);
  assert.match(src, /this\.bile\.setFlow\([^;]*soft\(0\.85\)/);
});

test('the wedge\'s wash (HVPG slide 5) is drawn on the 3D lobule\'s sinusoids and central vein, a front from the centre out, easing in and back out', async () => {
  const { WASH_DELAY_MS, WASH_MS } = await import('../src/scene/lobule/wash.ts');
  const sh = createShared(), host = new LobuleView(sh), m3 = new Lobule3D(host, sh);
  const parts = (m3 as unknown as { sin: Record<string, { mats: { toon: { uniforms: Record<string, { value: unknown }> } } }> }).sin;
  const wash = () => (parts.s1!.mats.toon.uniforms.uWash!.value as { x: number; w: number });
  host.setVisible(true);
  let t = 0; const run = (ms: number) => { for (const end = t + ms; t < end; t += 16) { host.update(t); m3.update(true, 0, t, 1); } };
  run(500);
  assert.equal(wash().x, 0, 'no wash on a plain slide');
  host.startWash(t); run(WASH_DELAY_MS + WASH_MS * 0.5);
  const mid = { ...wash() };
  assert.ok(mid.x > 0.5, `the amber is in (${mid.x})`);
  assert.equal(parts.s1!.mats.toon.uniforms.uWashR!.value, LOBULE_R, 'a radial front, in lobule radii');
  run(WASH_MS);
  assert.ok(wash().w > mid.w && wash().w > 1, 'the front runs out past the portal edge');
  host.stopWash(); run(32);
  assert.ok(wash().x > 0.3, 'it goes away gradually, never at once');
  run(3000);
  assert.ok(wash().x < 1e-3, 'and is gone');
  assert.ok((m3 as unknown as { mouthCv: { mats: { toon: { uniforms: Record<string, { value: { x: number } }> } } } }).mouthCv.mats.toon.uniforms.uWash!.value.x < 1e-3);
});
