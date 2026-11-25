// A circuit caption's shorter form is never another station's whole name (capture f23a4c59, Circuit 2, iPhone, card tucked: "Lower IVC 5.0" shortened to "IVC 5.0" beside the cava's own "IVC 4.0").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abbrOf } from '../src/scene/circuit/captions.ts';
import { CIRCUIT_LABELS } from '../src/scene/circuit/data.copied.ts';
import { LABEL_NAMES } from '../src/scene/labels/names.copied.ts';

test('no station of the circuit is shortened to the name another station carries', () => {
  const names = LABEL_NAMES.SHORT as Record<string, string>;
  const clash: string[] = [];
  for (const id of Object.keys(CIRCUIT_LABELS)) { const a = abbrOf(id); if (a && Object.entries(names).some(([o, n]) => o !== id && n === a)) clash.push(`${id} -> ${a}`); }
  assert.deepEqual(clash, []);
  assert.equal(abbrOf('IVCI'), null, 'the lower IVC keeps its whole name or its dot');
  assert.equal(abbrOf('RHV'), 'RHV', 'an abbreviation of its own stays');
});
