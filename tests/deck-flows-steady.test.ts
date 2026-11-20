import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The deck's flow bar reads the slide's own fingerprint (fp.at.Q) and the healthy one for its mark, as 2D's tool-flows does. The live frame's
// flows pulse with every beat, which made the "Hepatic inflow" bar jump between 57 % and 81 % on a still slide (play-test, 20 Nov).
const src = readFileSync(new URL('../src/ui/talk/ToolCardBody.tsx', import.meta.url), 'utf8');

test('the flows card is fed by the slide fingerprint, not by the live frame', () => {
  const line = src.split('\n').find((l) => l.includes("case 'flows':"))!;
  assert.ok(line.includes('flowsInputOf(fp'), line);
  assert.ok(line.includes('healthy={flowsInputOf(healthy'), 'the Healthy mark is given');
  assert.ok(!/frame\.Q/.test(line), 'no live frame flows');
});

test('flows is not a framed kind (it must not re-render with every engine frame)', () => {
  const m = /const FRAMED = new Set\(\[([^\]]*)\]\)/.exec(src)!;
  assert.ok(!m[1]!.includes("'flows'"));
});
