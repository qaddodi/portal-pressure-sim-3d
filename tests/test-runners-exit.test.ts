// A test file whose process does not end (a clock hold left mid-ease in a test's own made-up time, 27 Nov: dive-always-to-the-liver waited half an hour and held the whole TAP run, whose report
// is in file order) must never stall the suite: every way the suite is run asks node to end a file's process once its tests are done.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('every runner of the test files passes --test-force-exit', () => {
  const read = (p: string): string => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  for (const p of ['package.json', 'scripts/pre-push.mjs', 'scripts/tests-daily.mjs', 'scripts/test-time.mjs']) assert.ok(read(p).includes('--test-force-exit'), `${p} runs node --test without --test-force-exit`);
});
