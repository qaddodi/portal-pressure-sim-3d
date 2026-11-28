// The audit's one zip format and its stable finding ids (src/ui/debug/request/bundle.ts, finding.ts). The same files come from every runner; a fixing thread can say "F-xxxxxx is fixed".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findingId, plainState, withIds, type FindingInput } from '../src/ui/debug/request/finding.ts';
import { bundleFiles, sectionNames, zipBytes, SCHEMA, type RunResult, type Item } from '../src/ui/debug/request/bundle.ts';
import { parseRequest } from '../src/ui/debug/request/grammar.ts';
import { resolveRequest, type Scope } from '../src/ui/debug/request/resolve.ts';
import { zipNames } from '../src/ui/capture/zip.ts';
import { readWorld } from '../scripts/audit/world.mjs';

const input = (o: Partial<FindingInput> = {}): FindingInput => ({
  rule: 'test-fails', check: 'junctions', severity: 'high', target: 'tests/skin-agreement.test.ts > the outline steps at a seam', owner: 'tests/skin-agreement.test.ts', where: 'tests/skin-agreement.test.ts',
  message: 'the arm\'s ink is 5.7 px off the tube\'s', repro: 'node --test tests/skin-agreement.test.ts', section: 'feature:junctions', ...o,
});

test('a finding\'s id is made from its rule, its target and its state, never from where or when it was seen', () => {
  const a = withIds([input()])[0]!;
  assert.match(a.id, /^F-[0-9a-f]{6}$/);
  const again = withIds([input({ where: 'a different line', message: 'the arm\'s ink is 6.1 px off', repro: 'something else', owner: 'elsewhere' })])[0]!;
  assert.equal(again.id, a.id, 'the message, the place and the numbers in them are not the id');
  assert.notEqual(withIds([input({ rule: 'other' })])[0]!.id, a.id);
  assert.notEqual(withIds([input({ target: 'tests/x.test.ts > y' })])[0]!.id, a.id);
  assert.notEqual(withIds([input({ state: 'the other way' })])[0]!.id, a.id);
  assert.equal(findingId('r', 't', 's'), findingId('r', 't', 's'));
  assert.equal(plainState('update 52 ms > 50 on shapes 70.6'), 'update # ms > # on shapes #', 'the run\'s own numbers are taken out of a state');
});

test('two findings alike get .2 and .3 in order, and a rerun in the same order gives the same ids; worst first', () => {
  const run = () => withIds([input({ severity: 'low', target: 'a' }), input({ target: 'b' }), input({ target: 'b' }), input({ target: 'b' })]);
  const x = run(), y = run();
  assert.deepEqual(x.map((f) => f.id), y.map((f) => f.id));
  assert.deepEqual(x.map((f) => f.severity), ['high', 'high', 'high', 'low']);
  const bs = x.filter((f) => f.target === 'b').map((f) => f.id).sort();
  assert.match(bs[1]!, /\.2$/);
  assert.match(bs[2]!, /\.3$/);
  assert.equal(new Set(x.map((f) => f.id)).size, 4);
});

async function result(line: string, over: Partial<RunResult> = {}): Promise<RunResult> {
  const p = parseRequest(line);
  assert.ok(p.ok);
  const r = resolveRequest((p as { request: Parameters<typeof resolveRequest>[0] }).request, await readWorld());
  assert.ok(r.ok);
  const scope = (r as { scope: Scope }).scope;
  const findings = withIds([input(), input({ rule: 'scene:pop', check: 'motion', severity: 'medium', target: 'scene:view -> circuit:cavaWhole', section: 'scene', owner: 'scripts/scene-audit.mjs' })]);
  const items: Item[] = [
    { section: 'feature:junctions', id: 'skin-agreement.test.ts', label: 'tests/skin-agreement.test.ts (3 pass, 1 fail)', checks: { junctions: 'fail' }, findings: [findings.find((f) => f.rule === 'test-fails')!.id] },
    { section: 'deck:shunts', id: 'shunts:1', label: 'slide 1', checks: { numbers: 'pass' }, findings: [] },
    { section: 'scene', id: 'view -> circuit', label: 'view -> circuit (max 4 ms)', checks: { motion: 'fail' }, findings: [findings.find((f) => f.rule === 'scene:pop')!.id] },
    { section: 'code', id: 'lint', label: 'Lint', checks: { lint: 'pass' }, findings: [] },
  ];
  return {
    info: { build: { commit: 'abcdef0123456789', branch: 'claude/x', engine: 'a97104613cec', dirty: false }, runner: 'node', startedAt: '2026-11-28T03:00:00.000Z', seconds: 12.4, device: 'node v22, linux x64' },
    scope, checks: [{ id: 'junctions', ran: true, seconds: 5, summary: '1 test files' }, { id: 'pictures', ran: false, why: 'the node runner takes no pictures', seconds: 0, summary: '' }],
    items, findings, validity: ['Node CPU, no GPU.'], notJudged: ['pictures: none.'], pictures: [], ...over,
  };
}

test('the zip has the same files from every runner: README-FIRST, REPORT, sections, findings.json, manifest.json', async () => {
  const r = await result('random:4@4471/deck');
  const files = bundleFiles(r), names = files.map((f) => f.name);
  assert.deepEqual(names.slice(0, 2), ['README-FIRST.md', 'REPORT.md']);
  assert.deepEqual(names.slice(-2), ['findings.json', 'manifest.json']);
  const sec = names.filter((n) => n.startsWith('sections/'));
  assert.deepEqual(sec, ['sections/01-feature-junctions.md', 'sections/02-deck-shunts.md', 'sections/03-scene.md', 'sections/04-code.md'], 'features first, then talks, the scene, the code; numbered');
  const zip = zipNames(zipBytes(files, new Date(2026, 10, 28)));
  assert.deepEqual(zip.map((z) => z.name), names, 'the zip holds the files, in order');
  assert.ok(zip.every((z) => z.size > 0));
});

test('findings.json and manifest.json carry the schema, the build, the request, the seed and every item, so a program can read them', async () => {
  const r = await result('random:4@4471/deck');
  const f = Object.fromEntries(bundleFiles(r).map((x) => [x.name, x.text]));
  const fj = JSON.parse(f['findings.json']!), mj = JSON.parse(f['manifest.json']!);
  assert.equal(fj.schema, SCHEMA);
  assert.equal(fj.request, 'random:4@4471/deck');
  assert.equal(fj.findings.length, 2);
  for (const x of fj.findings) for (const k of ['id', 'rule', 'check', 'severity', 'target', 'owner', 'where', 'message', 'repro', 'section']) assert.ok(k in x, k);
  assert.equal(mj.schema, SCHEMA);
  assert.deepEqual(mj.random.picked, r.scope.random!.picked);
  assert.equal(mj.random.seed, 4471);
  assert.equal(mj.build.commit, 'abcdef0123456789');
  assert.equal(mj.items.length, 4);
  assert.equal(mj.counts.findings, 2);
  assert.deepEqual(mj.skipped, []);
});

test('the REPORT states the request, the seed and how to ask for the same slides again, and lists findings worst first', async () => {
  const r = await result('random:4@4471/deck');
  const rep = bundleFiles(r).find((x) => x.name === 'REPORT.md')!.text;
  assert.match(rep, /Request: `random:4@4471\/deck`/);
  assert.match(rep, /seed 4471/);
  assert.match(rep, /`random:4@4471\/deck`\. Slides: /);
  assert.ok(rep.indexOf(r.findings[0]!.id) < rep.indexOf(r.findings[1]!.id) && r.findings[0]!.severity === 'high');
  assert.match(rep, /\| pictures \| no \| - \| the node runner takes no pictures \|/, 'a check that did not run says so; it is never a pass');
  assert.match(rep, /sections\/01-feature-junctions\.md/);
});

test('the README-FIRST tells the fixing thread the rules, how to read the zip, how valid the run is and what it could not judge', async () => {
  const r = await result('app checks=pictures,types');
  const md = bundleFiles(r).find((x) => x.name === 'README-FIRST.md')!.text;
  for (const must of [/root cause/i, /headless browser or a GPU capture without the owner/, /npm run gen:departures/, /F-xxxxxx/, /Node CPU, no GPU\./, /pictures: asked for, not done: the node runner takes no pictures/, /pictures: none\./, /npm run audit -- "app checks=pictures,types"/]) assert.match(md, must);
  const none = bundleFiles(await result('app', { validity: [], notJudged: [] })).find((x) => x.name === 'README-FIRST.md')!.text;
  assert.match(none, /this runner stated nothing/, 'a run that states nothing says so');
});

test('a section lists every item with its state per check and its findings in full, with how to see each again', async () => {
  const r = await result('app');
  const sec = bundleFiles(r).find((x) => x.name === 'sections/01-feature-junctions.md')!.text;
  const id = r.findings.find((f) => f.rule === 'test-fails')!.id;
  assert.match(sec, /\| tests\/skin-agreement\.test\.ts \(3 pass, 1 fail\) \| FAIL \| F-/);
  assert.match(sec, new RegExp(`### ${id} \\(high, junctions\\)`));
  assert.match(sec, /See it again: `node --test tests\/skin-agreement\.test\.ts`/);
  assert.deepEqual(sectionNames([]).length, 0);
});

test('npm run audit reads a request and says what it means without running anything (--print); a request it cannot read exits 2 and names the fault', () => {
  const run = (...a: string[]) => spawnSync(process.execPath, ['scripts/audit.mjs', ...a], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  const ok = run('--print', 'random:6@4471/deck', 'checks=numbers');
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /request +random:6@4471\/deck checks=numbers/);
  assert.match(ok.stdout, /random +6 @ seed 4471 spread: /);
  assert.match(ok.stdout, /decks-rw-numbers\.test\.ts|decks-hp-numbers\.test\.ts/);
  const bad = run('--print', 'deck:nope');
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /no talk "nope"/);
  const gpu = run('--print', 'app runner=gpu');
  assert.equal(gpu.status, 2);
  assert.match(gpu.stderr, /this is the node runner/);
});

test('the node runner writes one zip in the format, with no browser: a check that needs no test and no scene (lint) runs end to end', () => {
  const out = mkdtempSync(join(tmpdir(), 'audit-'));
  try {
    const r = spawnSync(process.execPath, ['scripts/audit.mjs', 'app', 'checks=lint', '--out', out, '--json'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const sum = JSON.parse(r.stdout);
    const zips = readdirSync(out).filter((f) => f.endsWith('.zip'));
    assert.equal(zips.length, 1);
    assert.equal(sum.zip, join(out, zips[0]!));
    const names = zipNames(new Uint8Array(readFileSync(join(out, zips[0]!)))).map((z) => z.name);
    for (const n of ['README-FIRST.md', 'REPORT.md', 'findings.json', 'manifest.json', 'sections/01-code.md']) assert.ok(names.includes(n), n);
    assert.equal(sum.findings, sum.counts.high + sum.counts.medium + sum.counts.low + sum.counts.info, 'the summary adds up');
  } finally { rmSync(out, { recursive: true, force: true }); }
});
