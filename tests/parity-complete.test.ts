// The tracker is not allowed to hide gaps. A ratchet: this test FAILS when the number of rows with no claim rises above tests/fixtures/parity-missing-max.json
// (so a deleted or broken claim file cannot pass), and is strict (fails on any unclaimed row) once that number is 0. Lower the number when you claim rows.
// tests/parity-score.test.ts only prints the score. Present-but-not-wired rows are counted in the output, not failed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { score, type Claimed, type Row } from '../src/parity/score.ts';
import { B4_ROWS } from '../src/parity/b4-rows.ts';

const root = fileURLToPath(new URL('..', import.meta.url));

test('the unclaimed rows of the 2D inventory never go up (and reach 0)', async () => {
  const inv = JSON.parse(readFileSync(join(root, 'parity/inventory.json'), 'utf8')) as { rows: Row[] };
  const claimed: Claimed[] = [];
  for (const f of readdirSync(join(root, 'src/parity')).filter((x) => /^b\d+[a-z]?\.ts$|^s\d\.ts$/.test(x)).sort()) {
    const m = (await import(pathToFileURL(join(root, 'src/parity', f)).href)) as { claims?: readonly { id: string; wired: boolean }[] };
    for (const c of m.claims ?? []) claimed.push({ id: c.id, wired: c.wired, file: f });
  }
  const sc = score([...inv.rows, ...B4_ROWS], claimed);
  const missing = sc.byArea.flatMap((g) => g.rows.filter((r) => r.state === 'missing').map((r) => `${r.area} ${r.batch}: ${r.id}`));
  const present = sc.total.x - sc.total.w;
  console.log(`parity-complete: ${sc.total.y - missing.length} of ${sc.total.y} claimed, ${missing.length} missing, ${present} present but not wired`);
  const { maxMissing } = JSON.parse(readFileSync(join(root, 'tests/fixtures/parity-missing-max.json'), 'utf8')) as { maxMissing: number };
  if (missing.length < maxMissing) console.log(`parity-complete: ${maxMissing - missing.length} fewer unclaimed than the ratchet: lower maxMissing in tests/fixtures/parity-missing-max.json to ${missing.length}`);
  assert.ok(missing.length <= maxMissing, `${missing.length} rows have no claim (the ratchet allows ${maxMissing}):\n${missing.slice(0, 60).join('\n')}${missing.length > 60 ? `\n... and ${missing.length - 60} more (node scripts/parity-rows.ts --list missing)` : ''}`);
});
