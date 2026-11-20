// The lobule's names flashed (Mohammad, 20 Nov): the layout signature held each pressure to a tenth, so every tenth the pulse or a treatment moved sent every name through a fade out, a new
// solve and a fade in. The signature holds only how wide each reading prints; the numbers are written in place.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readingSig } from '../src/scene/lobule/captions.ts';

const m = (P1: number, P2: number, P3: number, lymph: number) => ({ P1, P2, P3, lymph });

test('a reading that moves a tenth leaves the signature alone', () => {
  assert.equal(readingSig(m(22.1, 21.7, 6.4, 5.6)), readingSig(m(22.2, 21.6, 6.5, 5.7)));
  assert.equal(readingSig(m(22.1, 21.7, 6.4, 5.6)), readingSig(m(23.9, 20.0, 5.0, 2.2)));
});
test('a reading that gains a character does change it (the words need room again)', () => {
  assert.notEqual(readingSig(m(9.9, 8.0, 5.0, 0.6)), readingSig(m(10.0, 8.0, 5.0, 0.6)));
  assert.notEqual(readingSig(m(9.9, 8.0, 5.0, 0.6)), readingSig(m(9.9, 8.0, 5.0, 0.7)));
});
test('the caption layer reads no pressure into its layout signature, and writes the numbers in place', () => {
  const src = readFileSync('src/scene/lobule/LobuleCaptions.tsx', 'utf8');
  assert.doesNotMatch(src, /toFixed\(1\)/);
  assert.match(src, /readingSig\(m\)/);
  assert.match(src, /else if \(alpha > 0\) refreshReadings\(\)/);
});
