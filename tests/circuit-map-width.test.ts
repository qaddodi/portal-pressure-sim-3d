// The Circuit draws a vessel one width along its length (2D stage-tubes.js widthAt at t = 1). The body's tubes taper, flare, bead and funnel for the 3D figure (rk); the map's width must not inherit them (root cause of the
// hepatic veins and the upper portal branch pinching to a wedge at their nodes in the Circuit, 20 Nov: a branching vein's through branch tapers to half its width over its WHOLE length, and the map squeezes that length onto a 20 unit stub).
import test from 'node:test';
import assert from 'node:assert/strict';
import { NETWORK } from '../src/scene/vessels/network.ts';
import { buildTubes } from '../src/scene/vessels/tubes.ts';
import { REST, coursesOf, tubularOf } from '../src/scene/vessels/shape.ts';
import { slicesFor } from '../src/scene/circuit/geometry.ts';
import { VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { CIRCUIT_VS_HEAD } from '../src/scene/circuit/shader.ts';

test('every tube carries the map\'s own radius share (rkc): the course\'s radius against the vessel\'s, with none of the body\'s tapers, collars or beads', () => {
  let tapered = 0;
  for (const def of NETWORK) {
    const courses = coursesOf(def, REST), b = buildTubes(courses, tubularOf(def, slicesFor(def.id)), def.radius);
    const rk = b.geometry.getAttribute('rk'), rkc = b.geometry.getAttribute('rkc');
    assert.ok(rkc, `${def.id} has rkc`);
    assert.equal(rkc.count, rk.count, `${def.id}: one per vertex`);
    // every tube vertex carries its course's own share; a cap is that share or none (an end that carries on has no cap)
    let at = 0;
    courses.forEach((c, i) => {
      const run = b.runs[i]!, want = c.radius > 0 ? c.radius / def.radius : 0;
      for (let k = 0; k < run.tubeCount; k++) assert.ok(Math.abs(rkc.getX(at + k) - want) < 1e-6, `${def.id} course ${i}: rkc ${rkc.getX(at + k)} against ${want}`);
      for (let k = 0; k < 2 * run.capCount; k++) { const v = rkc.getX(at + run.tubeCount + k); assert.ok(v === 0 || Math.abs(v - want) < 1e-6, `${def.id} course ${i}: cap rkc ${v}`); }
      at += run.tubeCount + 2 * run.capCount;
      for (let k = 0; k < run.tubeCount; k++) if (Math.abs(rk.getX(run.tubeStart + k) - want) > 0.02) { tapered++; break; }
    });
  }
  assert.ok(tapered >= 4, `${tapered} courses taper or flare in the body, and the map ignores it (the branching veins among them)`);
});

test('a branching vein tapers in the body and not on the map (the right hepatic vein\'s first piece: half its width at the liver end, whole at its node)', () => {
  const def = NETWORK.find((v) => v.id === 'RHV_IVC_1')!, b = buildTubes(coursesOf(def, REST), tubularOf(def, slicesFor(def.id)), def.radius);
  const rk = b.geometry.getAttribute('rk'), rkc = b.geometry.getAttribute('rkc'), n = b.runs[0]!.tubeCount;
  const first = Math.min(...Array.from({ length: n }, (_, k) => rk.getX(k))), last = Math.max(...Array.from({ length: n }, (_, k) => rk.getX(k)));
  assert.ok(first < 0.6 && last > 0.99, `the body tapers ${first} to ${last}`);
  for (let k = 0; k < n; k++) assert.ok(Math.abs(rkc.getX(k) - 1) < 1e-6, `the map keeps the whole width at vertex ${k}`);
});

test('the shader draws the map with rkc, and joins a run-on\'s map width to its mate\'s in one smoothstep (circuit-taper.test.ts)', () => {
  assert.equal((VESSEL_VS.match(/attribute float rkc;/g) ?? []).length, 1, 'rkc is declared once');
  assert.match(CIRCUIT_VS_HEAD, /P = cen \+ radius \* mix\(rk, rkc, w\) \* off;/);
  assert.match(VESSEL_VS, /float rkE = mix\(rk, rkc, circShare\);/);
  assert.match(VESSEL_VS, /vR = radius \* rkE \* swell \* narrowK \* vU;/);
  assert.match(VESSEL_VS, /vec3 cenW = aPos - aNor \* \(radius \* rkE\);/);
  assert.match(VESSEL_VS, /wc \+= \(max\(circMateWidth\(cmate0\), circMateMin\(cmate0\) \* circPerPx\) - wc\) \* \(1\.0 - smoothstep\(-cease\.x, cease\.x, circAt\)\);/);
  assert.match(VESSEL_VS, /wc \+= \(max\(circMateWidth\(cmate1\), circMateMin\(cmate1\) \* circPerPx\) - wc\) \* \(1\.0 - smoothstep\(-cease\.y, cease\.y, circTo\)\);/);
});
