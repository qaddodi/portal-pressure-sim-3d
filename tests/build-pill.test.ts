// The build pill says the 2D app's words and reloads as the 2D pill does (2D: scripts/preview-badge.mjs, tests/preview-badge.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLabel, buildChecks, cachePrefix, reloadUrl, BADGE_H } from '../src/ui/shell/build-pill.ts';

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

test('the reload carries what is on the screen, not where the page started: the talk and slide now, or the patient\'s share link; other query words stay', () => {
  const base = 'https://x.github.io/portal-pressure-sim-3d/';
  // a page opened plain, now on slide 7 of a talk: the reload opens that talk at that slide
  const a = new URL(reloadUrl(`${base}?perf`, 5, `${base}?script=circulation&slide=7`));
  assert.equal(a.searchParams.get('script'), 'circulation'); assert.equal(a.searchParams.get('slide'), '7'); assert.ok(a.searchParams.has('perf')); assert.equal(a.hash, '');
  // opened on slide 3, moved on to 9: the old slide is replaced, not kept beside the new one
  const b = new URL(reloadUrl(`${base}?script=circulation&slide=3&r=1`, 6, `${base}?script=circulation&slide=9`));
  assert.deepEqual(b.searchParams.getAll('slide'), ['9']); assert.deepEqual(b.searchParams.getAll('script'), ['circulation']);
  // in free play: a talk's old words go, the share link's patient and settings (in the hash) come
  const c = new URL(reloadUrl(`${base}?script=circulation&slide=3`, 7, `${base}#s=abc123`));
  assert.ok(!c.searchParams.has('script') && !c.searchParams.has('slide')); assert.equal(c.hash, '#s=abc123');
  // a talk after a share link: the stale hash goes
  const d = new URL(reloadUrl(`${base}#s=abc123`, 8, `${base}?script=hvpg&slide=2`));
  assert.equal(d.hash, ''); assert.equal(d.searchParams.get('script'), 'hvpg');
  // no state to carry (the app was not up): the page's own address, as before
  assert.equal(new URL(reloadUrl(`${base}?script=x&slide=2`, 9, null)).searchParams.get('slide'), '2');
});

test('the pill reads the screen\'s address when it leaves, through the one link the app already makes', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/ui/shell/BuildPill.tsx', import.meta.url), 'utf8');
  assert.match(src, /shareLinkNow\(\)/); assert.match(src, /reloadUrl\(location\.href, Date\.now\(\), state\)/);
});

test('the pill carries what the build\'s own checks found, and nothing when they were clean', () => {
  assert.equal(buildChecks('types: 3 errors, lint failed'), 'types: 3 errors, lint failed');
  assert.equal(buildChecks(''), '');
  assert.equal(buildChecks(undefined), '');
});
