// A stent lies wholly inside its vessel (owner, 20 Nov: "100 % inside their vessels in 3D", at the vessel's own depth): every wire, the graft and the gold bands stay under the lumen's radius along the whole
// course, at the tapered ends and with the waist and end stenosis the engine can give.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CatmullRomCurve3, Vector3 } from 'three';
import { vesselFit } from '../src/scene/devices/stent/fit.ts';
import { buildStent, lumenShare, WIRE_MAX_R, type StentSpec } from '../src/scene/devices/stent/stent-build.ts';
import { courseOf } from '../src/scene/vessels/network.ts';

const INSET = 2 / 300;

function specOf(id: string, R: number, geom: StentSpec['geom'], s: number, site: number): { spec: StentSpec; curve: CatmullRomCurve3; L: number } {
  const fit = vesselFit(id), curve = new CatmullRomCurve3(fit.pts.map((p) => new Vector3(...p)), false, 'centripetal'), L = curve.getLength();
  const spec: StentSpec = {
    at: (a, out) => curve.getPointAt(Math.min(1, Math.max(0, (INSET + a) / L)), out), tan: (a, out) => curve.getTangentAt(Math.min(1, Math.max(0, (INSET + a) / L)), out),
    A: L - 2 * INSET, R, lenCm: 8, geom, s, site, covered: true, fit: (a) => fit.at(Math.min(1, Math.max(0, (INSET + a) / L))),
  };
  return { spec, curve, L };
}

test('the fit reads the vessel\'s own course (its depth) and its radius along it, 1 in the body of the vessel', () => {
  for (const id of ['TIPS', 'DIPS']) {
    const f = vesselFit(id);
    assert.ok(f.pts.length >= 2 && f.pts.every((p) => p.every(Number.isFinite)), id);
    assert.ok(Math.abs(f.at(0.5) - 1) < 1e-9, `${id} middle`);
    for (let u = 0; u <= 1; u += 0.05) assert.ok(f.at(u) > 0 && f.at(u) < 3, `${id} ${u}: ${f.at(u)}`);
  }
});

test('every wire, the graft and the bands stay under the vessel\'s lumen at every station, for a clean stent, a waisted one and an end stenosis', () => {
  for (const id of ['TIPS', 'DIPS']) {
    for (const [geom, s, site] of [[{ len: 8, waist: 0, trans: 0, red: 0 }, 0, 0], [{ len: 8, waist: 0.4, trans: 1, red: 0.4 }, 0.3, 0], [{ len: 8, waist: 0, trans: 1, red: 0 }, 0.5, 1]] as const) {
      const R = 0.0105, { spec, curve, L } = specOf(id, R, geom, s, site), p = buildStent(spec);
      const dense: { c: Vector3; u: number }[] = [];
      for (let i = 0; i <= 600; i++) dense.push({ c: curve.getPointAt(i / 600), u: i / 600 });
      let worst = 0, n = 0;
      const check = (c: Vector3, r: number) => {
        let best = Infinity, u = 0;
        for (const d of dense) { const q = d.c.distanceTo(c); if (q < best) { best = q; u = d.u; } }
        if (u * L < INSET || u * L > L - INSET) return;   // (the stent starts 2 units in)
        const a = u * L - INSET, lumen = R * lumenShare(spec, Math.min(1, Math.max(0, a / spec.A))) * spec.fit!(a);
        worst = Math.max(worst, (best + r) / lumen); n++;
      };
      for (const w of p.wires) for (const q of w) check(q.c, Math.min(p.wireR, WIRE_MAX_R));
      for (const q of p.band) check(q.c, 2.2 * Math.min(p.wireR, WIRE_MAX_R));
      for (const q of p.graft) check(q.c, q.r);
      assert.ok(n > 100, `${id}: ${n} stations`);
      assert.ok(worst <= 0.99, `${id} (${JSON.stringify(geom)}): the widest reach is ${worst.toFixed(3)} of the lumen`);
    }
  }
  assert.ok(courseOf('TIPS').length > 1);
});
