// The approved anatomy placement (docs/approved/anatomy-placement.md) is the frozen round, byte for byte: art/anatomy-placement/ holds the files whose checksums SOURCE.json records, and the
// typed copy the app reads (src/scene/anatomy/placement.generated.ts) is made from them. A hand edit of either fails here; a new round comes in only through scripts/copy-placement.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PLACED_COURSES, PLACED_VESSELS, PLACEMENT_ROUND, PLACED_CAUDATE } from '../src/scene/anatomy/placement.generated.ts';

const art = (f: string) => readFileSync(new URL(`../art/anatomy-placement/${f}`, import.meta.url));

test('the placement data is the frozen round, and the typed copy is made from it', () => {
  const src = JSON.parse(art('SOURCE.json').toString()) as { round: number; files: Record<string, string> };
  for (const [f, sum] of Object.entries(src.files)) assert.equal(createHash('sha256').update(art(f)).digest('hex'), sum, `${f} is not the frozen file`);
  assert.equal(PLACEMENT_ROUND, src.round);
  const D = JSON.parse(art('placement-data.json').toString());
  assert.deepEqual(PLACED_COURSES, D.A); assert.deepEqual(PLACED_VESSELS, D.vessels); assert.deepEqual(PLACED_CAUDATE, D.caudate);
  for (const [id, pts] of Object.entries(PLACED_COURSES)) assert.ok(PLACED_VESSELS[id] && pts.length >= 2 && pts.every((p) => p.length === 3 && p.every(Number.isFinite)), id);
});
