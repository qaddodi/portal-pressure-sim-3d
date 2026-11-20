// The true-3D lobule (Settings > Figure depth > 3D lobule and sinusoid): its geometry builds, is finite, faces the right way, stays in budget, and its widths are 2D's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { type BufferAttribute, Vector3 } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { LOBULE_R } from '../src/scene/lobule/shots.ts';
import { sinRadius, DISC_R } from '../src/scene/lobule/widths.ts';
import { Lobule3D, LZ, OVER_Z, TUBE_SEG, bileCourses, skipFirstFills } from '../src/scene/micro3d/lobule3d.ts';
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
  assert.ok(pos.count >= 64 * 10);
});

test('the Bile layer\'s courses are the flat view\'s own', () => {
  assert.equal(bileCourses(flat.net).length, (flat as unknown as { bilePick: unknown[] }).bilePick.length);
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
