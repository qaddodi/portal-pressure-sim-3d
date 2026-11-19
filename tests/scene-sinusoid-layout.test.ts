// The sinusoid's cells, pores, nuclei and canaliculi stand where the 2D app puts them: the values below were read from the 2D file (sinusoid-gl.js) at b3058ef3.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SEED, UM, canaliculusAt, cellEdge, cellOf, edgeAt, h1, nucAt, poreAt, poreOpenness } from '../src/scene/sinusoid/layout.ts';

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test('the shared hash and the placements equal the 2D app\'s', () => {
  close(h1(0, 29), 0.6422045826911926); close(h1(5, 71), 0.5854834318161011); close(h1(17, 3), 0.9185378551483154);
  [0.9954320788383484, 27.02842628955841, 46.37658083438873, 70.41881895065308, 97.42042011022568].forEach((v, j) => close(cellEdge(j, SEED.plateUp), v));
  [-2.6489572933523506, 23.930288848978954, 46.568528994707705].forEach((v, j) => close(canaliculusAt(j, SEED.plateDn), v));
  close(nucAt(0, SEED.nucUp), 12.41739547252655); close(nucAt(1, SEED.nucDn), 54.75271391868591);
  const c = cellOf(1, SEED.plateUp);
  close(c.x0, 27.02842628955841); close(c.x1, 46.37658083438873); close(c.nu, 0.5722951889038086); close(c.nv, 0.5778601765632629); close(c.nr, 3.0512488543987275); assert.equal(c.bi, false);
});

test('a sieve plate is five evenly spaced pores that close from the ends in', () => {
  const pores = Array.from({ length: 15 }, (_, j) => poreAt(j, SEED.poreUp));
  assert.deepEqual(pores.map((p) => p?.x ?? null), [null, null, null, 3.5, 4.5, 5.5, 6.5, 7.5, null, null, null, null, null, 13.5, 14.5]);
  const [a, b, c] = [pores[3]!, pores[4]!, pores[5]!];
  close(c.th, 0.25101047158241274);
  assert.ok(c.th < b.th && b.th < a.th, 'the middle pore is the last to close');
  assert.equal(poreOpenness(0.3, 1), 1); assert.equal(poreOpenness(0.3, 0), 0);
});

test('cell borders are tilted and bent lines: neighbours share them, and they sit within the cell pitch', () => {
  for (let j = 0; j < 5; j++) for (const v of [0, UM.hep / 2, UM.hep]) {
    const x = edgeAt(j, SEED.plateUp, v), nx = edgeAt(j + 1, SEED.plateUp, v);
    assert.ok(nx - x > 10 && nx - x < 40, `cell ${j} at depth ${v} is ${(nx - x).toFixed(1)} µm wide`);
  }
});
