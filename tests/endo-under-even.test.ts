// The Scope's field is drawn into a square of device pixels; an odd side puts a row of pixels exactly on the field's centre line (xy.y = 0), which drew a hairline across the lumen on the Mac (eyes, 20 Nov).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the field square is always an even number of device pixels', () => {
  const src = readFileSync(new URL('../src/ui/tests/endo/endo-under.ts', import.meta.url), 'utf8');
  assert.match(src, /side = Math\.max\(2, 2 \* Math\.round\(\(pw - 8 \* k\) \/ 2\)\)/);
  for (const [pw, k] of [[447, 1], [894, 2], [1341, 3], [390, 1], [333, 1.1]] as const) {
    const side = Math.max(2, 2 * Math.round((pw - 8 * k) / 2));
    assert.equal(side % 2, 0);
    assert.ok(Math.abs(side - (pw - 8 * k)) <= 1);
  }
});
