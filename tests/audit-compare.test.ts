// Step (c) of docs/audit.md: a run says what is new, what is still there and what is fixed since the last run of the same request, by finding id. "Fixed" is said only when it can be known.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareRuns, earlierRun, pickEarlier, type EarlierRun } from '../src/ui/debug/request/compare.ts';
import { withIds, type Finding, type FindingInput } from '../src/ui/debug/request/finding.ts';
import { bundleFiles, zipBytes, type RunResult } from '../src/ui/debug/request/bundle.ts';
import { zipFile, zipText } from '../src/ui/debug/request/read-zip.ts';
import { parseRequest } from '../src/ui/debug/request/grammar.ts';
import { resolveRequest, type Scope } from '../src/ui/debug/request/resolve.ts';
import { zipNames } from '../src/ui/capture/zip.ts';
import { readWorld } from '../scripts/audit/world.mjs';

const input = (target: string, o: Partial<FindingInput> = {}): FindingInput => ({
  rule: 'test-fails', check: 'junctions', severity: 'high', target, owner: 'tests/x.test.ts', where: '', message: `${target} fails`, repro: 'node --test tests/x.test.ts', section: 'feature:junctions', ...o,
});
const A = 'tests/a.test.ts > one', B = 'tests/b.test.ts > two', C = 'tests/c.test.ts > three';
const ids = (fs: Finding[]) => fs.map((f) => f.id);
const earlier = (fs: Finding[], o: Partial<EarlierRun> = {}): EarlierRun => ({ zip: '/audits/audit-1.zip', request: 'feature:junctions', build: 'abc12345', startedAt: '2026-11-28T03:00:00.000Z', ran: ['junctions', 'motion'], findings: fs, ...o });

test('new, still there and fixed: a finding is the same finding when its id is the same', () => {
  const before = withIds([input(A), input(B)]), now = withIds([input(B), input(C)]);
  const c = compareRuns(earlier(before), now, ['junctions', 'motion'], 'feature:junctions');
  assert.deepEqual(c.new, ids(now.filter((f) => f.target === C)));
  assert.deepEqual(c.still, ids(now.filter((f) => f.target === B)));
  assert.deepEqual(c.fixed.map((f) => f.target), [A]);
  assert.deepEqual(c.unverified, []);
  assert.ok(c.sameRequest);
  assert.equal(c.against.findings, 2);
});

test('a fix is said only when it can be known: not when its check did not run, not when the request was another', () => {
  const before = withIds([input(A), input(B, { check: 'numbers' })]);
  const c = compareRuns(earlier(before), [], ['junctions'], 'feature:junctions');
  assert.deepEqual(c.fixed.map((f) => f.target), [A]);
  assert.equal(c.unverified.length, 1);
  assert.equal(c.unverified[0]!.finding.target, B);
  assert.match(c.unverified[0]!.why, /numbers did not run this time/);
  const other = compareRuns(earlier(before, { request: 'deck:shunts' }), [], ['junctions', 'numbers'], 'feature:junctions');
  assert.equal(other.fixed.length, 0, 'another request: nothing is fixed');
  assert.equal(other.unverified.length, 2);
  assert.match(other.unverified[0]!.why, /another request \(deck:shunts\)/);
  assert.ok(!other.sameRequest);
});

test('the same fault found in the same place has the same id in the next run, whatever else changed', () => {
  const a = withIds([input(A, { message: 'it differs by 5.7 px', where: 'line 4', severity: 'high' })])[0]!;
  const b = withIds([input(A, { message: 'it differs by 6.2 px', where: 'line 9' })])[0]!;
  assert.equal(a.id, b.id);
  const c = compareRuns(earlier([a]), [b], ['junctions'], 'feature:junctions');
  assert.deepEqual(c.still, [a.id]);
  assert.deepEqual(c.fixed, []);
  assert.deepEqual(c.new, []);
});

test('the earlier run is the newest of the same request that started before this one; none is none, never another request\'s', () => {
  const r = (zip: string, request: string, startedAt: string) => earlier([], { zip, request, startedAt });
  const runs = [r('a', 'feature:junctions', '2026-11-28T01:00:00Z'), r('b', 'feature:junctions', '2026-11-28T02:00:00Z'), r('c', 'deck:x', '2026-11-28T02:30:00Z'), r('d', 'feature:junctions', '2026-11-28T04:00:00Z')];
  assert.equal(pickEarlier(runs, 'feature:junctions', '2026-11-28T03:00:00Z')?.zip, 'b');
  assert.equal(pickEarlier(runs, 'feature:junctions', '2026-11-28T01:00:00Z'), null, 'not itself, not a later one');
  assert.equal(pickEarlier(runs, 'app', '2026-11-28T05:00:00Z'), null);
});

test('an earlier run is read from its findings.json and manifest.json; a file that is not ours is not one', () => {
  const f = JSON.stringify({ schema: 1, findings: [{ id: 'F-1', rule: 'r', check: 'lint', severity: 'medium', target: 't', message: 'm', extra: 1 }] });
  const m = JSON.stringify({ schema: 1, request: 'app', build: { commit: 'deadbeef00' }, startedAt: 'x', checks: [{ id: 'lint', ran: true }, { id: 'pictures', ran: false }] });
  const e = earlierRun('z.zip', f, m)!;
  assert.deepEqual(e.ran, ['lint']);
  assert.equal(e.build, 'deadbeef00');
  assert.deepEqual(Object.keys(e.findings[0]!).sort(), ['check', 'id', 'message', 'rule', 'severity', 'target']);
  assert.equal(earlierRun('z.zip', '{"schema":2,"findings":[]}', m), null);
  assert.equal(earlierRun('z.zip', 'not json', m), null);
  assert.equal(earlierRun('z.zip', f, '{"schema":1}'), null);
});

test('a file is read back out of a zip the app wrote, and a missing one is null', () => {
  const zip = zipBytes([{ name: 'a.txt', text: 'one' }, { name: 'sections/b.md', text: 'two ü' }], new Date(2026, 10, 28));
  assert.equal(zipText(zip, 'a.txt'), 'one');
  assert.equal(zipText(zip, 'sections/b.md'), 'two ü');
  assert.equal(zipFile(zip, 'nope'), null);
  assert.equal(zipFile(new Uint8Array(10), 'a.txt'), null);
  assert.deepEqual(zipNames(zip).map((z) => z.name), ['a.txt', 'sections/b.md']);
});

async function runWith(findings: Finding[], comparison: ReturnType<typeof compareRuns> | undefined): Promise<RunResult> {
  const p = parseRequest('feature:junctions');
  assert.ok(p.ok);
  const r = resolveRequest((p as { request: Parameters<typeof resolveRequest>[0] }).request, await readWorld());
  assert.ok(r.ok);
  return {
    info: { build: { commit: 'abcdef0123456789', branch: 'b', engine: 'a97104613cec', dirty: false }, runner: 'node', startedAt: '2026-11-28T03:30:00.000Z', seconds: 3, device: 'node' },
    scope: (r as { scope: Scope }).scope, checks: [{ id: 'junctions', ran: true, seconds: 1, summary: 's' }], findings, validity: [], notJudged: [], pictures: [], comparison,
    items: [{ section: 'feature:junctions', id: 'a', label: 'tests/a.test.ts', checks: { junctions: 'fail' }, findings: ids(findings) }],
  };
}

test('REPORT.md and findings.json say what changed since the last run, and a run with no earlier one says nothing about it', async () => {
  const before = withIds([input(A), input(B)]), now = withIds([input(B), input(C)]);
  const cmp = compareRuns(earlier(before), now, ['junctions'], 'feature:junctions');
  const files = Object.fromEntries(bundleFiles(await runWith(now, cmp)).map((f) => [f.name, f.text]));
  const rep = files['REPORT.md']!;
  assert.match(rep, /## Since the last run/);
  assert.match(rep, /Compared with `audit-1\.zip` \(build `abc12345`/);
  assert.match(rep, new RegExp(`\\*\\*1 new\\*\\*: ${ids(now.filter((f) => f.target === C))[0]}`));
  assert.match(rep, /\*\*1 still there\*\*/);
  assert.match(rep, new RegExp(`\\*\\*1 fixed\\*\\*:\\n  - ${ids(before.filter((f) => f.target === A))[0]} \\(high, junctions\\)`));
  assert.match(rep, /\| Id \| Since last run \| Severity/);
  assert.match(rep, /\| new \| high/);
  assert.match(rep, /\| still there \| high/);
  const fj = JSON.parse(files['findings.json']!);
  assert.deepEqual(fj.findings.map((f: { status: string }) => f.status).sort(), ['new', 'still']);
  assert.equal(fj.comparison.fixed.length, 1);
  assert.match(files['sections/01-feature-junctions.md']!, /\(high, junctions, (new|still there)\)/);
  assert.deepEqual(JSON.parse(files['manifest.json']!).comparison, { against: cmp.against, new: 1, still: 1, fixed: 1, unverified: 0 });
  const none = Object.fromEntries(bundleFiles(await runWith(now, undefined)).map((f) => [f.name, f.text]));
  assert.ok(!/Since the last run/.test(none['REPORT.md']!));
  assert.equal(JSON.parse(none['manifest.json']!).comparison, null);
  assert.ok(!('status' in JSON.parse(none['findings.json']!).findings[0]));
});

test('the node runner compares a run with the last run of the same request in its folder, and --no-compare and --against do what they say', () => {
  const out = mkdtempSync(join(tmpdir(), 'audit-cmp-'));
  const run = (...a: string[]) => spawnSync(process.execPath, ['scripts/audit.mjs', ...a, '--out', out, '--json'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  try {
    const first = run('app', 'checks=lint');
    assert.equal(first.status, 0, first.stderr);
    assert.equal(JSON.parse(first.stdout).comparison, null, 'the first run has nothing to compare with');
    const firstZip = readdirSync(out).filter((n) => n.endsWith('.zip'))[0]!;
    // (a second run in the same second would sort before it: the stamp is the start time, so wait one)
    const wait = Date.now() + 1100; while (Date.now() < wait) { /* a second apart */ }
    const second = run('app', 'checks=lint');
    assert.equal(second.status, 0, second.stderr);
    const s = JSON.parse(second.stdout);
    assert.ok(s.comparison, 'the second run is compared');
    assert.equal(s.comparison.new + s.comparison.still, s.findings, 'every finding is new or still there');
    assert.equal(s.comparison.new, 0, 'the same repo: nothing is new');
    const zip = new Uint8Array(readFileSync(s.zip));
    assert.match(zipText(zip, 'REPORT.md')!, new RegExp(`Compared with \`${firstZip.replace(/[.]/g, '\\.')}\``));
    const noc = run('app', 'checks=lint', '--no-compare');
    assert.equal(JSON.parse(noc.stdout).comparison, null);
    const other = run('app', 'checks=types', '--against', join(out, firstZip));
    const o = JSON.parse(other.stdout);
    assert.ok(o.comparison && o.comparison.fixed === 0, 'against another request nothing is called fixed');
    const junk = join(out, 'audit-junk.zip'); writeFileSync(junk, 'not a zip');
    const bad = run('app', 'checks=lint', '--against', junk);
    assert.equal(bad.status, 0);
    assert.match(bad.stderr, /not an audit zip of this format; not compared/);
  } finally { rmSync(out, { recursive: true, force: true }); }
});
