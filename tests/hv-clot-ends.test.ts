// plan 34c: a Budd-Chiari clot (hepatic vein thrombosis) is anchored at the vein's ostium: its cap's tip at the IVCS skin's seam, growing upstream. Run: node --test tests/hv-clot-ends.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { SkinSet, type SkinSetDeps } from '../src/scene/vessels/skin/skin-set.ts';
import { drawnHost, cavaWallShare, radiusAtShare } from '../src/scene/disease/host.ts';
import { clotRange, CLOT_CAP_LEN } from '../src/scene/disease/clot-field.ts';
import { clotUniforms, clotAnchor, seamShare } from '../src/scene/disease/clots.ts';

test('plan 34c: the anchor is a table: the hepatic veins are ostium, every other vein is mid', () => {
  for (const id of ['RHV_IVC', 'MHV_IVC', 'LHV_IVC']) assert.equal(clotAnchor(id), 'ostium');
  for (const id of ['PV_TRUNK', 'SV_CONF', 'LRV_IVC', 'RRV_IVC']) assert.equal(clotAnchor(id), 'mid');
});
test('plan 34c: an ostium clot ends with its cap at the skin seam, b is the same at every v, a falls', () => {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' }), parent = new Group();
  try {
    const deps: SkinSetDeps = {
      vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
      make: (mesh) => ({ mesh, object: new Group(), setArm() {}, setArc() {}, setPres() {}, setArmCopy() {}, setTransparent() {}, dispose() {} }) as never,
      add: (o: Object3D) => parent.add(o), remove: (o: Object3D) => parent.remove(o), warn: () => {},
    };
    const set = new SkinSet(deps); set.build(2);
    let n = 0;
    for (const id of ['RHV_IVC', 'MHV_IVC', 'LHV_IVC']) {
      const h = drawnHost(id); if (!h) continue;
      const u = set.seamU(id, 1); assert.ok(u != null, `${id} has an IVCS seam`);
      const seam = seamShare(h, u)!, wall = cavaWallShare(h)!;
      assert.ok(seam < wall, `${id}: the seam ${seam} is before the IVC wall ${wall}`);
      const cap = CLOT_CAP_LEN * radiusAtShare(h, seam) / h.length;
      let prevA = Infinity; const bs: number[] = [];
      for (const v of [0.3, 0.66, 1]) {
        const { a, b } = clotRange(v, seam - cap);
        console.log(`${id} v=${v}: a ${a.toFixed(3)} b ${b.toFixed(3)} seam ${seam.toFixed(3)} wall ${wall.toFixed(3)}; cap tip to seam ${((seam - b - cap) * h.length).toExponential(1)}, to the IVC wall ${((wall - b - cap) * h.length).toFixed(3)} units`);
        assert.ok(Math.abs(seam - (b + cap)) * h.length < 1e-9, `${id} v=${v}: the cap's tip is at the seam, never past it`);
        assert.ok(b > 0.5, `${id} v=${v}: the proximal end b ${b} is in the cava half`);
        assert.ok(a < prevA && a >= 0, `${id}: a falls as v rises`); prevA = a; bs.push(b);
        const us = clotUniforms(h, v, 1, id, u), last = us[us.length - 1]!;
        assert.ok(last.f0 + last.df >= 1 - 1e-9, `${id} v=${v}: the clot is over by the vein's end`);
        n++;
      }
      assert.ok(bs.every((b) => b === bs[0]), `${id}: the proximal end stays put`);
    }
    assert.ok(n > 0);
  } finally { setSmoothJoins(was); }
});
test('plan 34c: a mid vein keeps clotSpan whatever the seam; a short vein never gets b before a', () => {
  assert.deepEqual(clotRange(0.66, null), { a: 0.4 - 0.22 * 0.66, b: 0.6 + 0.22 * 0.66 });
  const h = drawnHost('LRV_IVC');
  if (h) assert.deepEqual(clotUniforms(h, 1, 1, 'LRV_IVC', 0.9), clotUniforms(h, 1, 1, 'LRV_IVC', null));
  const r = clotRange(1, 0.2); assert.ok(r.b === 0.2 && r.a >= 0 && r.b > r.a);
  assert.ok(clotRange(1, -0.1).b >= clotRange(1, -0.1).a);
});
