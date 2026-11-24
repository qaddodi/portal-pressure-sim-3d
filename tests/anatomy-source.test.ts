// Phase 1 of the anatomy integration (plan approved by Mohammad, 24 Nov 2026): every reader of the anatomy goes through src/scene/anatomy/source.ts, and what each reader gets is frozen here.
// While the source holds today's placement, nothing may move: any difference fails and names the reader. When the new placement lands (the cut-over), the file is written again in the
// same push (`ANATOMY_DUMP_WRITE=1 node --test tests/anatomy-source.test.ts`) and the push report lists what moved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { anatomyDump } from './anatomy/dump.ts';
import { ANATOMY_ID } from '../src/scene/anatomy/source.ts';

const FILE = new URL('./fixtures/anatomy-today.json', import.meta.url);

test('every reader of the anatomy gets exactly what it got before (the frozen dump)', () => {
  const now = anatomyDump();
  if (process.env.ANATOMY_DUMP_WRITE === '1' || !existsSync(FILE)) { writeFileSync(FILE, JSON.stringify({ anatomy: ANATOMY_ID, items: now })); return; }
  const was = JSON.parse(readFileSync(FILE, 'utf8')) as { anatomy: string; items: Record<string, unknown> };
  assert.equal(ANATOMY_ID, was.anatomy, 'the dump was frozen for another placement: write it again in the cut-over push');
  const moved = [...new Set([...Object.keys(was.items), ...Object.keys(now)])].filter((k) => JSON.stringify(was.items[k]) !== JSON.stringify(now[k]));
  assert.deepEqual(moved, [], `readers that moved: ${moved.join(', ')}`);
});
