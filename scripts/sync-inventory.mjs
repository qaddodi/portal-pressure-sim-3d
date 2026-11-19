#!/usr/bin/env node
// Copies the 2D app's parity inventory (everything a person can see, read, tap or change there) into parity/inventory.json.
//
//   node scripts/sync-inventory.mjs --from <2D checkout> [--check]
//
// Runs the 2D repo's read-only scripts/parity-inventory.mjs (branch claude/b1-inventory-preview until it merges) and writes its file here.
// --check writes nothing and exits 1 when the copy differs. The test tests/parity-score.test.ts reads parity/inventory.json and prints
// "x of y" per batch (docs/parity.md).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const from = args.includes('--from') ? resolve(args[args.indexOf('--from') + 1]) : null;
if (!from) { console.error('usage: node scripts/sync-inventory.mjs --from <2D checkout> [--check]'); process.exit(2); }
const dir = mkdtempSync(join(tmpdir(), 'inv-'));
try {
  const tmp = join(dir, 'inventory.json');
  execFileSync(process.execPath, [join(from, 'scripts/parity-inventory.mjs'), '--out', tmp], { cwd: from, stdio: ['ignore', 'ignore', 'inherit'] });
  const next = readFileSync(tmp, 'utf8');
  const dest = resolve(here, '../parity/inventory.json');
  if (args.includes('--check')) {
    let have = ''; try { have = readFileSync(dest, 'utf8'); } catch { /* none */ }
    if (have !== next) { console.error('parity/inventory.json differs from the 2D app; run npm run sync:inventory -- --from <2D checkout>'); process.exit(1); }
    console.log('parity/inventory.json is current');
  } else { writeFileSync(dest, next); console.log(`parity/inventory.json written (${JSON.parse(next).rows.length} rows)`); }
} finally { rmSync(dir, { recursive: true, force: true }); }
