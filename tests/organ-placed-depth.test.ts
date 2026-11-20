// Rule #1 sweep (20 Nov 2026, the scope outside the oesophagus): the organs are drawn moved along z by ORGAN_Z, so any code that reads an organ's raw mesh (ORGAN_MESHES) for a
// placement must add that shift. This fails a file that reads the raw mesh without referring to ORGAN_Z.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|js)$/.test(f) ? [p] : []; });

test('every reader of an organ\'s raw mesh applies its ORGAN_Z shift', () => {
  const bad = walk('src').filter((f) => !f.endsWith('organs/meshes.ts')).filter((f) => { const s = readFileSync(f, 'utf8'); return /ORGAN_MESHES\s*(\.|\[)/.test(s) && !/ORGAN_Z/.test(s); });
  assert.deepEqual(bad, []);
});
