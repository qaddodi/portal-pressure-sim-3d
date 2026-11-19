import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the first slice\'s placeholder organs and torso plate are gone (2D draws neither; the organs are the 2D outlines with depth)', () => {
  const ph = readFileSync('src/scene/anatomy/placeholder.ts', 'utf8'), scene = readFileSync('src/scene/scene.ts', 'utf8');
  for (const gone of ['ORGANS', 'VARICES', 'bodyPlateGeometry', 'BODY_PLATE_Z', 'sbPoints']) assert.ok(!ph.includes(gone) && !scene.includes(gone), gone);
  assert.ok(!/this\.plate\b/.test(scene), 'the scene has no torso plate');
});
