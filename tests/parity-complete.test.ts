// The tracker is not allowed to hide gaps: this test FAILS while any row of the 2D inventory has no claim from a 3D batch (it lists them by area).
// tests/parity-score.test.ts only prints the score; this one is the bar. Present-but-not-wired rows are listed in the output (not failed) so they stay visible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { score, type Claimed, type Row } from '../src/parity/score.ts';
import { B4_ROWS } from '../src/parity/b4-rows.ts';

const root = fileURLToPath(new URL('..', import.meta.url));

test('every row of the 2D inventory is claimed by a 3D batch (no missing rows)', async () => {
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
  assert.equal(missing.length, 0, `${missing.length} rows have no claim:\n${missing.slice(0, 60).join('\n')}${missing.length > 60 ? `\n... and ${missing.length - 60} more (node scripts/parity-rows.ts --list missing)` : ''}`);
});
