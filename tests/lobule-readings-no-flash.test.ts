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
  assert.match(src, /readingSig\(m, onSlide\(\)\)/);
  assert.match(src, /else if \(alpha > 0\) refreshReadings\(\)/);
});

// The Circuit's captions had the same cause: resistor ratios rounded to a tenth, and the drawn widths as raw floats, in the layout signature.
import { resSig } from '../src/scene/circuit/res-model.ts';
test('the circuit signature holds a resistor reading\'s width, not its value, and writes the text in place', () => {
  assert.equal(resSig({ rLiver: 3.1, rColl: 1.2 }), resSig({ rLiver: 3.2, rColl: 1.3 }));
  assert.notEqual(resSig({ rLiver: 9.9 }), resSig({ rLiver: 10.4 }));
  const src = readFileSync('src/scene/circuit/CircuitCaptions.tsx', 'utf8');
  assert.match(src, /resSig\(res\)/);
  assert.doesNotMatch(src, /Math\.round\(\(v \?\? 0\) \* 10\)/);
  assert.match(src, /m\?\.kind === 'res'/);
});

// ...and the Sinusoid's names re-solved their places for every tenth.
import { readingOf, readingsSig } from '../src/scene/sinusoid/captions.ts';
test('the sinusoid signature holds the readings\' widths, never their values, and the text is written in place', () => {
  const a = { P1: 7.7, P2: 7.4, P3: 5.8, lymph: 0.9, lyProt: 0.87 }, b = { P1: 7.8, P2: 7.3, P3: 5.9, lymph: 0.91, lyProt: 0.88 };
  assert.equal(readingsSig(a), readingsSig(b));
  assert.notEqual(readingsSig(a), readingsSig({ ...a, P1: 10.2 }));
  assert.equal(readingOf('in', b, 0.5, false), '7.8');
  assert.equal(readingOf('hep', b, 0.5, false), null);
  const src = readFileSync('src/scene/sinusoid/SinusoidCaptions.tsx', 'utf8');
  assert.doesNotMatch(src, /toFixed\(1\)/);
  assert.match(src, /else refreshReadings\(\)/);
});

// The real trigger of the flash (measured on the preview with ?capwhy: every re-place logged `sig  => ...`, an EMPTY old signature): the captions' store subscriptions called gate.invalidate() /
// `sig = ''` on ANY change of the shell store, which changes all the time, so the placed words were thrown away and faded out and in again and again. A store change only asks for a frame now;
// the layout signature (compared at rest) sees whatever matters. Only a font or the type variables force a new placement.
test('no caption layer forces a new placement from a store subscription', () => {
  for (const f of ['src/scene/lobule/LobuleCaptions.tsx', 'src/scene/circuit/CircuitCaptions.tsx', 'src/scene/sinusoid/SinusoidCaptions.tsx']) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(use\w+)\.subscribe\(([^;]*)\);/g)) {
      assert.doesNotMatch(m[0], /gate\.invalidate|sig = ''/, `${f}: ${m[1]}.subscribe forces a placement`);
    }
    assert.doesNotMatch(src, /const wake = \(\) => \{ (gate\.invalidate|sig = '')/, `${f}: wake forces a placement`);
  }
  assert.doesNotMatch(readFileSync('src/scene/circuit/CircuitCaptions.tsx', 'utf8'), /const readWalls = \(\) => \{[^}]*gate\.invalidate/);
});
test('a font still forces one', () => {
  assert.match(readFileSync('src/scene/lobule/LobuleCaptions.tsx', 'utf8'), /fonts\?\.ready\.then\(refont\)/);
  assert.match(readFileSync('src/scene/sinusoid/SinusoidCaptions.tsx', 'utf8'), /fonts\?\.ready\.then\(refont\)/);
});
