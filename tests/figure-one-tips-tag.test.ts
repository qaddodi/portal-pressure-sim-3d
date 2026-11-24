import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Two-inflows 9 (audit f9a5d2e0) showed "TIPS" and "TIPS 8 mm" on the same stent: the slide's mark and the stent's caliper said the name twice.
test('a mark that only repeats the name of a vessel a caliper crosses is not drawn', () => {
  const src = readFileSync(new URL('../src/ui/deck/figure-calls.ts', import.meta.url), 'utf8');
  assert.match(src, /text === m\.edges\[0\] && plan\.calipers\.some\(\(c\) => c\.edge === m\.edges\[0\]\)/);
});
