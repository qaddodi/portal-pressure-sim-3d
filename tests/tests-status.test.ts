import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { MAX_FAILURES, createTapReader, failureLines, parseTapFailures, parseTapSummary, testsNote } from '../scripts/tests-status.mjs';
import { parseBuildInfo, namesCommit, verdict } from '../scripts/preview-live.mjs';

test('the TAP summary gives the totals; a cancelled test counts as failing; no summary is no result', () => {
  assert.deepEqual(parseTapSummary('ok 1 - a\n# tests 845\n# suites 3\n# pass 831\n# fail 14\n# cancelled 0\n# skipped 0\n'), { total: 845, failing: 14 });
  assert.deepEqual(parseTapSummary('# tests 10\n# pass 7\n# fail 2\n# cancelled 1\n'), { total: 10, failing: 3 });
  assert.equal(parseTapSummary('ok 1 - a\nnot ok 2 - b\n'), null);
});

test('the daily run\'s log line says how many tests fail and at which commit the run was, adds the day once the run is old, and says nothing without a run', () => {
  const now = Date.parse('2026-11-25T12:00:00Z');
  assert.equal(testsNote({ failing: 14, date: '2026-11-25T03:00:00Z' }, now), 'tests: 14 failing');
  assert.equal(testsNote({ failing: 0, date: '2026-11-25T03:00:00Z' }, now), 'tests: 0 failing');
  assert.equal(testsNote({ failing: 3, date: '2026-11-22T03:00:00Z' }, now), 'tests: 3 failing (22 Nov)');
  assert.equal(testsNote({ failing: 16, date: '2026-11-25T17:47:00Z', commit: '0d79f780' }, now), 'tests: 16 failing (at 0d79f780)', 'the count belongs to the commit it ran on');
  assert.equal(testsNote({ failing: 3, date: '2026-11-22T03:00:00Z', commit: '0d79f780' }, now), 'tests: 3 failing (at 0d79f780 on 22 Nov)');
  assert.equal(testsNote({ failing: 3, date: '2026-11-25T03:00:00Z', commit: 'not a hash' }, now), 'tests: 3 failing');
  assert.equal(testsNote(null, now), ''); assert.equal(testsNote({ failing: 'x' }, now), '');
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

// C1 (27 Nov review): the daily run printed "5 failing of 6730" and the names were thrown away. The reader keeps the failing tests only, as the output arrives.
const TAP = `TAP version 13
# Subtest: passes
ok 1 - passes
  ---
  duration_ms: 1
  ...
# Subtest: fails flat
not ok 2 - fails flat
  ---
  location: '/repo/tests/a.test.ts:3:1'
  failureType: 'testCodeFailure'
  error: '1 == 2'
  ...
# Subtest: parent
    # Subtest: child ok
    ok 1 - child ok
    # Subtest: child bad
    not ok 2 - child bad
      ---
      location: '/repo/tests/a.test.ts:4:75'
      failureType: 'testCodeFailure'
      ...
    1..2
not ok 3 - parent
  ---
  location: '/repo/tests/a.test.ts:4:1'
  failureType: 'subtestsFailed'
  ...
# Subtest: b.test.ts
not ok 4 - b.test.ts
  ---
  location: '/repo/tests/b.test.ts:1:1'
  failureType: 'testCodeFailure'
  exitCode: 1
  ...
# Subtest: skipme
ok 5 - skipme # SKIP
# Subtest: todo
not ok 6 - todo # TODO
  ---
  location: '/repo/tests/c.test.ts:2:43'
  ...
1..6
# tests 9
# pass 3
# fail 4
# cancelled 1
`;

test('the daily run names the failing tests: leaves with their parent, a crashed file by its file, no skip or todo, no parent that only failed for its child', () => {
  const r = parseTapFailures(TAP, '/repo/');
  assert.deepEqual(r.failures.map((f: { file: string; line: number; name: string }) => `${f.file}:${f.line} ${f.name}`), ['tests/a.test.ts:3 fails flat', 'tests/a.test.ts:4 parent > child bad', 'tests/b.test.ts:1 b.test.ts']);
  assert.deepEqual(r.summary, { total: 9, failing: 5 }, 'the count is still node\'s own');
  assert.deepEqual(failureLines(r.failures), ['FAIL tests/a.test.ts:3  fails flat', 'FAIL tests/a.test.ts:4  parent > child bad', 'FAIL tests/b.test.ts:1  b.test.ts']);
});

test('the reader gives the same names however the output is cut into chunks, and keeps only the failures', () => {
  for (const size of [1, 7, 64, 100000]) {
    const r = createTapReader('/repo/');
    for (let i = 0; i < TAP.length; i += size) r.write(TAP.slice(i, i + size));
    const got = r.end();
    assert.equal(got.failures.length, 3, `chunk ${size}`);
    assert.deepEqual(got.summary, { total: 9, failing: 5 });
  }
  assert.equal(parseTapFailures('ok 1 - a\nnot ok 2 - b\n').summary, null, 'no summary is still no result');
});

test('a long list is cut in the log with a closing count, and the file keeps at most MAX_FAILURES', () => {
  const many = Array.from({ length: MAX_FAILURES + 5 }, (_, i) => ({ file: 'tests/x.test.ts', line: i, name: `t${i}`, kind: 'failed' }));
  const lines = failureLines(many);
  assert.equal(lines.length, MAX_FAILURES + 1); assert.equal(lines.at(-1), '... and 5 more');
});

test('it reads what node:test really prints (a flat failure, a failing subtest, a crashed file, a todo)', () => {
  const dir = mkdtempSync(`${tmpdir()}/tap-`);
  writeFileSync(`${dir}/a.test.mjs`, "import test from 'node:test'; import assert from 'node:assert';\ntest('passes', () => {});\ntest('fails flat', () => { assert.equal(1, 2); });\ntest('parent', async (t) => { await t.test('child ok', () => {}); await t.test('child bad', () => { throw new Error('x'); }); });\n");
  writeFileSync(`${dir}/b.test.mjs`, "throw new Error('file level');\n");
  writeFileSync(`${dir}/c.test.mjs`, "import test from 'node:test';\ntest('todo', { todo: true }, () => { throw new Error('t'); });\ntest('ok', () => {});\n");
  const run = spawnSync(process.execPath, ['--test', '--test-force-exit', '--test-reporter=tap', 'a.test.mjs', 'b.test.mjs', 'c.test.mjs'], { cwd: dir, encoding: 'utf8', env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_TEST_CONTEXT')) });
  const got = parseTapFailures(run.stdout, `${dir}/`);
  assert.deepEqual(got.failures.map((f: { file: string; name: string }) => `${f.file} ${f.name}`).sort(), ['a.test.mjs fails flat', 'a.test.mjs parent > child bad', 'b.test.mjs b.test.mjs']);
  assert.ok(got.summary && got.summary.failing >= 3);
});
