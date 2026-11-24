import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CatmullRomCurve3, TubeGeometry, Vector3 } from 'three';
import { setOverridesForTest } from '../src/editor/store.ts';
import { EMPTY } from '../src/editor/types.ts';
import { endVesselPreview, previewRigCount, previewVesselEdits, setVesselPreviewHost } from '../src/scene/vessels/edit-preview.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { x3 } from '../src/scene/frame2d.ts';

test('live preview: zero displacement leaves the buffers, a node move moves the arm-end ring by the node delta, release restores', () => {
  setOverridesForTest(EMPTY);
  const v = NETWORK_BY_ID.get('PV_TRUNK')!, seg = 80, radial = 14;
  const geo = new TubeGeometry(new CatmullRomCurve3(v.pts.map((p) => new Vector3(p[0], p[1], p[2]))), seg, 0.01, radial, false);
  const arr = (): Float32Array => geo.getAttribute('position').array as Float32Array;
  const before = arr().slice();
  setVesselPreviewHost(() => ({ tubes: new Map([['PV_TRUNK', geo]]), skins: [] }));
  previewVesselEdits(EMPTY);
  assert.equal(previewRigCount(), 0);
  assert.deepEqual([...arr()], [...before]);

  previewVesselEdits({ version: 1, nodes: { [v.from]: { dx: 15, dy: 0 } } });
  assert.equal(previewRigCount(), 1);
  const ring = (k: number, a: ArrayLike<number>): number[] => {
    const c = [0, 0, 0];
    for (let j = 0; j < radial; j++) for (let q = 0; q < 3; q++) c[q]! += a[3 * (k * (radial + 1) + j) + q]! / radial;
    return c;
  };
  const d0 = ring(0, arr()).map((x, i) => x - ring(0, before)[i]!), dN = ring(seg, arr()).map((x, i) => x - ring(seg, before)[i]!);
  const want = x3(15) - x3(0);
  assert.ok(Math.abs(d0[0]! - want) < 0.03 * Math.abs(want), `the arm-end ring moved ${d0[0]}, the node moved ${want}`);
  assert.ok(Math.hypot(dN[0]!, dN[1]!, dN[2]!) < 1e-4, 'the far end stays');
  const mid = ring(seg >> 1, arr()).map((x, i) => x - ring(seg >> 1, before)[i]!);
  assert.ok(Math.hypot(mid[0]!, mid[1]!, mid[2]!) < Math.abs(want), 'the move eases away along the arm');

  endVesselPreview();
  assert.deepEqual([...arr()], [...before]);
  assert.equal(previewRigCount(), 0);
  setVesselPreviewHost(null);
});
