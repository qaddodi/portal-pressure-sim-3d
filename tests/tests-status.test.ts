import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTapSummary, testsNote } from '../scripts/tests-status.mjs';
import { parseBuildInfo, namesCommit, verdict } from '../scripts/preview-live.mjs';
import { checksFailed } from '../src/ui/shell/build-pill.ts';

test('the TAP summary gives the totals; a cancelled test counts as failing; no summary is no result', () => {
  assert.deepEqual(parseTapSummary('ok 1 - a\n# tests 845\n# suites 3\n# pass 831\n# fail 14\n# cancelled 0\n# skipped 0\n'), { total: 845, failing: 14 });
  assert.deepEqual(parseTapSummary('# tests 10\n# pass 7\n# fail 2\n# cancelled 1\n'), { total: 10, failing: 3 });
  assert.equal(parseTapSummary('ok 1 - a\nnot ok 2 - b\n'), null);
});

test('the pill says how many tests fail, adds the day once the run is old, and says nothing without a run', () => {
  const now = Date.parse('2026-11-25T12:00:00Z');
  assert.equal(testsNote({ failing: 14, date: '2026-11-25T03:00:00Z' }, now), 'tests: 14 failing');
  assert.equal(testsNote({ failing: 0, date: '2026-11-25T03:00:00Z' }, now), 'tests: 0 failing');
  assert.equal(testsNote({ failing: 3, date: '2026-11-22T03:00:00Z' }, now), 'tests: 3 failing (22 Nov)');
  assert.equal(testsNote(null, now), ''); assert.equal(testsNote({ failing: 'x' }, now), '');
});

test('a clean suite leaves the pill orange; a failing test, type error or lint failure makes it red', () => {
  assert.equal(checksFailed('tests: 0 failing'), false);
  assert.equal(checksFailed(''), false); assert.equal(checksFailed(undefined), false);
  assert.equal(checksFailed('tests: 14 failing'), true);
  assert.equal(checksFailed('types: 3 errors, tests: 0 failing'), true);
  assert.equal(checksFailed('lint failed, tests: 0 failing'), true);
});

test('live is only ever said when build-info.txt names the commit', () => {
  const info: Record<string, string> = parseBuildInfo('version 1.0.0-beta.1\nbranch claude/project-thread-ge1swr\ncommit 68f9aa30\nbuilt 2026-11-25T10:13:00.000Z\nchecks ok\n');
  assert.equal(info.commit, '68f9aa30');
  assert.equal(verdict(info, '68f9aa30', 0).live, true);
  assert.match(verdict(info, '68f9aa30', 0).line, /^live: 68f9aa30/);
  const behind = verdict(info, 'ee227bc7', 5);
  assert.equal(behind.live, false); assert.match(behind.line, /^NOT LIVE after 5 min: preview serves 68f9aa30 .*expected ee227bc7/);
  assert.equal(verdict({}, 'ee227bc7', 5).live, false); assert.match(verdict({}, 'ee227bc7', 5).line, /could not be read/);
  // a later build that carries the commit (git says so) is live too; an unrelated one is not
  const later = verdict({ commit: '83b21ca3', built: '2026-11-25T18:10:26.449Z', checks: 'ok' }, 'eee0a8f4', 1, true);
  assert.equal(later.live, true); assert.match(later.line, /^live: eee0a8f4 is inside the served build 83b21ca3/);
  assert.equal(verdict({ commit: '83b21ca3' }, 'eee0a8f4', 5, false).live, false);
  assert.equal(namesCommit('68f9aa30', '68f9aa30cafe1234'), true); assert.equal(namesCommit('', ''), false); assert.equal(namesCommit('abc', 'abc'), false);
});
