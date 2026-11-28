// Production review P-01 (owner, 28 Nov): main ships only a commit whose full-suite result is on record and green (scripts/release-gate.mjs; `npm run release:check` writes the record).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gateProblem } from '../scripts/release-gate.mjs';

const ok = { commit: 'abcd1234', total: 5000, failing: 0 };

test('a green record for this commit, or for the commit before the record\'s own, lets main ship', () => {
  assert.equal(gateProblem(ok, 'abcd1234', []), '');
  assert.equal(gateProblem(ok, 'ffff0000', ['tests-status.json']), '', 'the record\'s own commit is the one allowed after the run');
});

test('no record, a red record, an unreadable one or a stale one stops it, each with a reason', () => {
  assert.match(gateProblem(null, 'abcd1234', []), /missing/);
  assert.match(gateProblem({}, 'abcd1234', []), /not a full-suite result/);
  assert.match(gateProblem({ ...ok, failing: 3 }, 'abcd1234', []), /3 failing/);
  assert.match(gateProblem({ ...ok, total: 0 }, 'abcd1234', []), /no tests/);
  assert.match(gateProblem(ok, 'ffff0000', ['src/a.ts', 'tests-status.json']), /1 file\(s\) changed since \(first: src\/a\.ts\)/);
  assert.match(gateProblem(ok, 'ffff0000', null), /shallow/);
});

test('the build on main runs the gate, the live checkout has its history, and there is no /beta/ (owner, 28 Nov: the preview is the beta)', () => {
  assert.match(readFileSync('scripts/build.mjs', 'utf8'), /if \(onMain\) \{ const why = checkRoot\(root\)/);
  const wf = readFileSync('.github/workflows/pages.yml', 'utf8');
  assert.match(wf, /fetch-depth: 0/);
  assert.match(wf, /branches: \[main, claude\/project-thread-ge1swr\]/);
  assert.doesNotMatch(wf, /beta/i);
  assert.equal(JSON.parse(readFileSync('package.json', 'utf8')).scripts['release:check'], 'node scripts/release-check.mjs');
});
