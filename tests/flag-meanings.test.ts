// The ?flag table is split in two so the boot entry stays small (tests/boot-entry.test.ts holds flags.ts to a stub): src/ui/debug/flags.ts has the rows the page reads at boot (id, group, gate,
// old spelling), src/ui/debug/flag-meanings.ts has the prose the doc table and `npm run debug -- flags` print. The rule: one set of ids in both, and no prose in the boot table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FLAGS } from '../src/ui/debug/flags.ts';
import { FLAG_MEANINGS, knownFlags } from '../src/ui/debug/flag-meanings.ts';

test('every flag has its words, and no words are left for a flag that is gone', () => {
  const ids = FLAGS.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length, 'a flag is one row');
  assert.deepEqual(Object.keys(FLAG_MEANINGS).sort(), [...ids].sort(), 'flags.ts and flag-meanings.ts name the same flags');
  for (const f of knownFlags()) assert.ok(f.meaning.length > 20, `?${f.id} says what it does`);
});

test('the boot table carries no prose: a new flag adds a short row, its words go in flag-meanings.ts', () => {
  const src = readFileSync(new URL('../src/ui/debug/flags.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\bmeaning:/, 'a row of FLAGS has no meaning field');
  for (const f of FLAGS) assert.deepEqual(Object.keys(f).filter((k) => !['id', 'group', 'gate', 'alias'].includes(k)), [], `?${f.id}`);
});
