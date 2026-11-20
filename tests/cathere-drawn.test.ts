// The callouts' tip and "ahead" points are the DRAWN catheter's (20 Nov 2026): the slice catheter's old curve is not drawn any more, and "ahead" was a fixed 0.4 scene units on from it, far off the vein.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the label layer reads the catheter points from the procedure layer, not from the slice catheter\'s curve', () => {
  const src = readFileSync(new URL('../src/scene/labels/LabelLayer.tsx', import.meta.url), 'utf8');
  const at = src.indexOf('cathere:');
  const body = src.slice(at, src.indexOf('};', at));
  assert.ok(body.includes("procPoints('hvpg'"), 'cathere asks procPoints');
  assert.ok(!body.includes('getTangentAt') && !body.includes('getPointAt'), 'cathere never reads the old curve');
});
