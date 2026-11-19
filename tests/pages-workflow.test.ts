import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const wf = readFileSync('.github/workflows/pages.yml', 'utf8');

test('Pages builds main to / and the integration branch to /preview/ in one workflow, with no tests', () => {
  assert.match(wf, /ref: main\n\s+path: live/);
  assert.match(wf, /ref: claude\/project-thread-ge1swr\n\s+path: preview/);
  assert.match(wf, /cp -r dist \.\.\/site\/preview/);
  assert.match(wf, /VITE_CHANNEL: preview/);
  assert.doesNotMatch(wf, /npm (run )?test|npm run check|playwright/i, 'build only');
  assert.equal((wf.match(/^  [a-z-]+:\n    runs-on/gm) ?? []).length, 1, 'one job');
});

test('only the preview copy shows the build pill', () => {
  const app = readFileSync('src/App.tsx', 'utf8');
  assert.match(app, /VITE_CHANNEL === 'preview' && <BuildPill/);
});
