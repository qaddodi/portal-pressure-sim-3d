// One command for every debug tool: `npm run debug -- <verb>` (scripts/debug.mjs). Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { plan, links, PREVIEW, testFiles } from '../scripts/debug.mjs';

const run = (...a: string[]) => spawnSync('node', ['scripts/debug.mjs', ...a], { encoding: 'utf8' });

test('a verb that fronts a script names it; the others are in-process', () => {
  assert.deepEqual(plan('doc', ['--check']), [{ file: 'debug-doc.mjs', args: ['--check'] }]);
  assert.deepEqual(plan('scan'), [{ file: 'lint.mjs', args: [] }]);
  assert.equal(plan('rules'), null); assert.equal(plan('nope'), null);
  for (const v of ['doc', 'scan']) for (const s of plan(v) as { file: string }[]) assert.ok(readFileSync(new URL(`../scripts/${s.file}`, import.meta.url), 'utf8').length > 0, s.file);
});

test('test runs only the fast debug, a11y and feedback tests', () => {
  const f: string[] = testFiles();
  for (const k of ['tests/debug-command.test.ts', 'tests/a11y.test.ts', 'tests/feedback-short.test.ts', 'tests/debug-ledger.test.ts']) assert.ok(f.includes(k), k);
  assert.ok(f.every((x) => /^tests\/(debug-|a11y|feedback-short)/.test(x)));
});

test('rules lists every rule with its owner and why, by family; limits and flags print their tables', () => {
  const all = run('rules'); assert.equal(all.status, 0); assert.match(all.stdout, /^\d+ rules/); assert.match(all.stdout, /fit-small\s+state\s+src\/ui\/DeckUi\.tsx: /);
  const fit = run('rules', '--family', 'fit'); assert.match(fit.stdout, /rules? in family fit/);
  for (const line of fit.stdout.split('\n').slice(2).filter(Boolean)) assert.match(line, /^fit-/, 'only the fit family');
  const js = JSON.parse(run('rules', '--json').stdout); assert.ok(js.length > 10 && js.every((r: Record<string, string>) => r.id && r.owner && r.why && r.family));
  const lim = run('limits'); assert.equal(lim.status, 0); assert.match(lim.stdout, /words-floor\s+12\s+px\s+since 17 Nov 2026/);
  const fl = run('flags'); assert.equal(fl.status, 0); assert.match(fl.stdout, /\?perf\s+live/); assert.match(fl.stdout, /\?watch\s+local/); assert.match(fl.stdout, /\?debug\s+local[\s\S]*device frame/);
});

test('links prints the Mac addresses: the debug page, the checks, a Sweep, each device frame', () => {
  const l: { label: string; url: string }[] = links({ sweep: 'slide:hvpg', look: 'light,dark', only: 'views' });
  const url = (re: RegExp) => l.find((x) => re.test(x.label))!.url;
  assert.equal(url(/^Debug page/), `${PREVIEW}?debug`);
  assert.equal(url(/^Phone check/), `${PREVIEW}?debug=check&only=views`);
  assert.equal(url(/^Full check/), `${PREVIEW}?debug=full&only=views`);
  assert.equal(url(/^Sweep: slide/), `${PREVIEW}?debug&sweep=slide:hvpg&look=light,dark`);
  assert.equal(url(/frame: iphone-landscape/), `${PREVIEW}?debug=frame&device=iphone-landscape`);
  assert.ok(l.every((x) => x.url.startsWith(PREVIEW)));
  const out = run('links', '--base', 'http://localhost:5173/'); assert.equal(out.status, 0); assert.match(out.stdout, /http:\/\/localhost:5173\/\?debug=frame&device=ipad\n/);
});

test('packet show and report show read a pasted block; a block that changed on its way is refused', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dbg-'));
  const { buildPacket, packetText } = await import('../src/ui/debug/core/packet.copied.js');
  const p = buildPacket({ state: { v: 1, preset: 'csph', x: {} }, link: 'https://x.test/?preset=csph', screen: { v: 1 }, screenText: 'Screen: 390x844', history: null, findings: [{ rule: 'fit-small', what: 'a small line', where: 'card teach' }], watchFindings: [], device: { screen: '390x844' }, build: { commit: 'abc1234' }, health: {} }, { note: 'small' });
  const f = join(dir, 'p.txt'); writeFileSync(f, packetText(p));
  const show = run('packet', 'show', f); assert.equal(show.status, 0); assert.match(show.stdout, /^PPS BUG PACKET/); assert.match(show.stdout, /1\. fit-small: a small line/);
  const rep = run('report', 'show', f); assert.equal(rep.status, 0); assert.match(rep.stdout, /fit-small/);
  const cmp = run('report', 'compare', f, f); assert.equal(cmp.status, 0); assert.match(cmp.stdout, /^NOT-FIXED/);
  const bad = join(dir, 'bad.txt'); writeFileSync(bad, packetText(p).replace('a small line', 'a changed line').replace('"a small line"', '"a changed line"'));
  const refused = run('packet', 'show', bad); assert.equal(refused.status, 1); assert.match(refused.stderr, /changed on its way/);
  const link = run('packet', 'link', 'https://x.test/p/?preset=csph'); assert.equal(link.status, 0); assert.equal(JSON.parse(link.stdout).preset, 'csph');
});

test('help lists the verbs (exit 0); an unknown verb says so and exits 2; --print runs nothing', () => {
  const h = run(); assert.equal(h.status, 0); for (const v of ['rules', 'limits', 'flags', 'report', 'packet', 'links', 'test', 'scan', 'doc']) assert.match(h.stdout, new RegExp(`debug -- ${v}`));
  const bad = run('nope'); assert.equal(bad.status, 2); assert.match(bad.stderr, /no verb "nope"/);
  const p = run('doc', '--check', '--print'); assert.equal(p.status, 0); assert.equal(p.stdout.trim(), 'node scripts/debug-doc.mjs --check');
});
