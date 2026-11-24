import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CatmullRomCurve3, TubeGeometry, Vector3 } from 'three';
import { setOverridesForTest } from '../src/editor/store.ts';
import { EMPTY } from '../src/editor/types.ts';
import { endVesselPreview, previewVesselEdits, setVesselPreviewHost } from '../src/scene/vessels/edit-preview.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';

test('live preview: a control point at u = 0.5 peaks at the middle of the vessel by ARC LENGTH, whatever the spacing of the built points', () => {
  setOverridesForTest(EMPTY);
  const v = NETWORK_BY_ID.get('V_SPL')!;
  // the course resampled unevenly (bunched toward the start): index fractions and arc fractions then disagree
  const raw = v.pts.map((p) => new Vector3(p[0], p[1], p[2])), curve = new CatmullRomCurve3(raw);
  const pts = Array.from({ length: 40 }, (_, i) => curve.getPointAt(Math.pow(i / 39, 2.2)));
  const geo = new TubeGeometry(new CatmullRomCurve3(pts), 120, 0.005, 8, false);
  const rest = (geo.getAttribute('position').array as Float32Array).slice();
  // the preview ties vertices to the network's own course, so give it that same unevenness through the tube we hand over: nearest-point tying is by place, not by index
  setVesselPreviewHost(() => ({ tubes: new Map([['V_SPL', geo]]), skins: [] }));
  previewVesselEdits({ version: 1, vessels: { V_SPL: { pts: [{ u: 0.5, dx: 30, dy: 0 }] } } });
  const pos = geo.getAttribute('position').array as Float32Array;
  const lift = (i: number): number => Math.hypot(pos[3 * i]! - rest[3 * i]!, pos[3 * i + 1]! - rest[3 * i + 1]!, pos[3 * i + 2]! - rest[3 * i + 2]!);
  // the vertex at the vessel's arc-length middle (on the network's own course)
  let tot = 0; const cum = [0];
  for (let i = 1; i < v.pts.length; i++) { tot += Math.hypot(v.pts[i]![0] - v.pts[i - 1]![0], v.pts[i]![1] - v.pts[i - 1]![1], v.pts[i]![2] - v.pts[i - 1]![2]); cum.push(tot); }
  let k = 0; while (cum[k + 1]! < tot / 2) k++;
  const mid = v.pts[k]!;
  let best = 0, bd = Infinity, peak = 0;
  for (let i = 0; i < pos.length / 3; i++) {
    peak = Math.max(peak, lift(i));
    const d = Math.hypot(rest[3 * i]! - mid[0], rest[3 * i + 1]! - mid[1], rest[3 * i + 2]! - mid[2]);
    if (d < bd) { bd = d; best = i; }
  }
  assert.ok(peak > 0, 'the edit moved something');
  assert.ok(lift(best) > 0.85 * peak, `the vertex at the arc middle lifts ${lift(best)} of a peak ${peak}`);
  endVesselPreview();
  setVesselPreviewHost(null);
});
