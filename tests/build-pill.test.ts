// The build pill says the 2D app's words and reloads as the 2D pill does (2D: scripts/preview-badge.mjs, tests/preview-badge.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLabel, cachePrefix, reloadUrl, BADGE_H } from '../src/ui/shell/build-pill.ts';

test('the label is the short commit the deploy stamped in', () => {
  assert.equal(buildLabel('claude/project-thread-ge1swr@56cb768a'), '56cb768a');
  assert.equal(buildLabel('main@abc12345'), 'abc12345');
  assert.equal(buildLabel(undefined), '');
  assert.equal(buildLabel('unknown@local'), '', 'a local run shows the bare word');
});
test('a reload keeps the page\'s own query (talk, slide, patient) and busts the cache', () => {
  const u = new URL(reloadUrl('https://x.github.io/portal-pressure-sim-3d/?script=hvpg&slide=3', 1700000000000));
  assert.equal(u.searchParams.get('script'), 'hvpg');
  assert.equal(u.searchParams.get('slide'), '3');
  assert.equal(u.searchParams.get('r'), '1700000000000');
});
test('only this copy\'s caches are dropped', () => {
  assert.equal(cachePrefix('https://x.github.io/portal-pressure-sim-3d/?a=1'), 'pps3d@/portal-pressure-sim-3d/@');
  assert.equal(BADGE_H, 16);
});
