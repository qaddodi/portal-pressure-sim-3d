// PLAN 12: the outer edge of a plain tube is cut to the true circle, and ONLY where plainHere() says the hull is wider than the circle for the polygon's sake alone.
// (1) the list of reasons for "not plain" is in one function and every reason is there; (2) a raster twin at 1 sample a pixel of the 14-sided hull against the circle: the
// edge lands within 0.6 px of the circle at the 99th percentile (it stood up to 1.5 px out), and no pixel inside circle + 0.5 px is lost.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VESSEL_FS, TUBE_SAG, PLAIN_EDGE_PX } from '../src/scene/vessels/shaders.ts';
import { TUBE_RADIAL } from '../src/scene/vessels/tubes.ts';

const fn = (): string => { const i = VESSEL_FS.indexOf('bool plainHere('); assert.ok(i > 0); return VESSEL_FS.slice(i, VESSEL_FS.indexOf('\n}', i)); };

test('plainHere() names every reason the hull is legitimately wider than the circle', () => {
  const f = fn();
  for (const r of ['circT', 'vHi', 'stump.x', 'dotted', 'inflate', 'nbrOn', 'cavaCut', 'vNbr.y', 'buryK', 'mate0', 'mate1', 'skinStartCut()', 'skinCut.y', 'skinHole.', 'skinHole2.']) assert.ok(f.includes(r), `plainHere() is missing: ${r}`);
  assert.ok(PLAIN_EDGE_PX >= 3.5, 'the end reach must cover the skin seam pad (1.5 px) and the 2 px of the plan');
});

test('the cut is a single hard test on the true outer circle, after the shadow and glow programs have returned', () => {
  const i = VESSEL_FS.indexOf('if (plainHere(wpc0))');
  assert.ok(i > VESSEL_FS.indexOf('#ifdef SHADOW') && i > 0);
  assert.match(VESSEL_FS.slice(i, i + 600), /dLat > outerPx \+ 0\.5\) DROP\(13\)/);
});

test('raster twin: a plain stretch edge lands on the circle (99th percentile <= 0.6 px, from 1.5), nothing inside the circle is lost', () => {
  const sag = TUBE_SAG;
  const n = TUBE_RADIAL;
  for (const outer of [3, 6, 12, 25, 60, 120]) {   // outer radius in device px (lumen + line), hairline to the PV trunk on a 3x phone
    const hullR = (a: number): number => { const sector = (2 * Math.PI) / n; const t = ((a % sector) + sector) % sector - sector / 2; return outer * (1 + sag) * Math.cos(Math.PI / n) / Math.cos(t); };   // the polygon's flats at the circle, corners outside it
    const before: number[] = [], after: number[] = [];
    let lost = 0;
    for (let k = 0; k < 4000; k++) {
      const a = (k / 4000) * 2 * Math.PI;
      // march a pixel centre outward along the ray: the last pixel drawn is the hull's edge on this ray
      const edgeOld = hullR(a);
      const edgeNew = Math.min(edgeOld, outer + 0.5);
      before.push(Math.abs(edgeOld - outer)); after.push(Math.abs(edgeNew - outer));
      if (edgeNew < Math.min(edgeOld, outer + 0.5) - 1e-9) lost++;
      assert.ok(edgeNew >= Math.min(outer, edgeOld) - 1e-9, 'a pixel inside the circle was lost');
    }
    const p99 = (v: number[]): number => v.slice().sort((x, y) => x - y)[Math.floor(v.length * 0.99)]!;
    assert.equal(lost, 0);
    assert.ok(p99(after) <= 0.6 + 1e-9, `outer ${outer}: after p99 ${p99(after)}`);
    if (outer >= 25) assert.ok(p99(before) > 0.6, `outer ${outer}: before p99 ${p99(before)} (the sag the cut removes)`);
  }
});
