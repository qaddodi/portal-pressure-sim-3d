// ?audit, the self-test: its judges, the walk (driven by a fake app) and the report are pure, so this runs in Node in a second.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameStats, timeline, fadeEpisodes, fadeFindings, layoutFindings, INSTANT_MS, type LayoutRead } from '../src/ui/debug/audit/judge.ts';
import { runAudit, judgeStep, type Step, type Reads } from '../src/ui/debug/audit/run.ts';
import { renderText, renderJson, groupFindings, type Bundle, type AuditData } from '../src/ui/debug/audit/report.ts';
import { childSrc, sizesOf, DEFAULT_SIZES } from '../src/ui/debug/audit/outer.ts';
import { auditPage } from '../src/ui/debug/flags.ts';
import type { Sample } from '../src/ui/debug/watch/motion-rules.ts';

// a card "teach" whose alpha is the given series, one row per 33 ms
const card = (alphas: number[], id = 'teach'): Sample[] => alphas.map((a, i) => ({ t: i * 33, K: [[id, 16, 100, 300, 200, a]], W: [1], L: [], c: null }));

test('frame stats: fps while moving, hitches over 25 ms and stalls over 50 ms; nothing drawn is null, not zero', () => {
  const s = frameStats([16, 17, 16, 17, 40, 16, 120]);
  assert.equal(s.frames, 7); assert.equal(s.hitches, 2); assert.equal(s.stalls, 1); assert.equal(s.worstGap, 120);
  assert.ok(s.fps! > 15 && s.fps! < 30);
  assert.equal(frameStats([]).fps, null); assert.equal(frameStats([16, 16]).fps, null);
  assert.equal(frameStats([0, 16.7, 16.7, 16.7, 16.7]).frames, 4);   // (the first frame after the loop woke has no gap and is left out)
});

test('fades: an eased card is measured from 0.1 to 0.9; one that goes gone to shown in a single row is a snap and fails', () => {
  const eased = fadeEpisodes(card([0, 0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.95, 1, 1]));
  assert.equal(eased.length, 1); assert.equal(eased[0]!.dir, 'in'); assert.equal(eased[0]!.ms, 198);   // (last row at most 0.1 to first row at least 0.9: six 33 ms steps)
  assert.deepEqual(fadeFindings(eased), []);
  const snap = fadeEpisodes(card([0, 0, 1, 1]));
  assert.equal(snap[0]!.ms, 33); assert.ok(snap[0]!.ms < INSTANT_MS);
  assert.equal(fadeFindings(snap)[0]!.kind, 'fade-instant');
  const out = fadeEpisodes(card([1, 1, 0.6, 0.2, 0, 0]));
  assert.equal(out[0]!.dir, 'out');
  const gone = fadeEpisodes([{ t: 0, K: [['teach', 0, 0, 9, 9, 1]], L: [] }, { t: 33, K: [], L: [] }, { t: 66, K: [], L: [] }]);   // (taken out of the page at once)
  assert.equal(gone[0]!.dir, 'out'); assert.equal(fadeFindings(gone)[0]!.kind, 'fade-instant');
  assert.equal(fadeFindings([{ kind: 'card', key: 'x', dir: 'in', ms: 2500 }])[0]!.kind, 'fade-slow');
});

test('timeline: when the cards stopped changing', () => {
  const rows = card([0, 0.3, 0.7, 1, 1, 1, 1]);
  const t = timeline(rows);
  assert.equal(t.cardEndMs, 99); assert.equal(t.settledMs, 99);
  assert.equal(timeline(card([1, 1, 1])).cardEndMs, null);
});

const read = (over: Partial<LayoutRead> = {}): LayoutRead => ({ vw: 390, vh: 844, cards: [], bars: [], labels: [], ...over });

test('layout: words past their card, off the screen, or under a bar are named with the card and the words', () => {
  const ok = read({ cards: [{ id: 'teach', box: [16, 400, 374, 700], kids: [{ what: 'fine', box: [32, 410, 300, 430] }] }] });
  assert.deepEqual(layoutFindings(ok), []);
  const spill = read({ cards: [{ id: 'teach', box: [16, 400, 374, 700], kids: [{ what: 'HVPG 11.1 mmHg pill', box: [300, 410, 392, 430] }] }] });
  const f = layoutFindings(spill);
  assert.equal(f[0]!.kind, 'spill'); assert.match(f[0]!.what, /HVPG 11\.1 mmHg pill/); assert.match(f[0]!.what, /18 px/);
  const covered = read({ cards: [{ id: 'teach', box: [16, 400, 374, 700], kids: [{ what: 'last line', box: [32, 660, 300, 690] }] }], bars: [{ id: 'presenter bar', box: [200, 650, 370, 700] }] });
  assert.equal(layoutFindings(covered).find((x) => x.kind === 'covered')!.sev, 'fail');
  const label = read({ labels: [{ name: 'Portal vein', box: [10, 800, 90, 820], alpha: 1 }], bars: [{ id: 'dock', box: [0, 790, 390, 844] }] });
  assert.equal(layoutFindings(label)[0]!.kind, 'covered');
  assert.deepEqual(layoutFindings(read({ labels: [{ name: 'faint', box: [10, 800, 90, 820], alpha: 0.2 }], bars: [{ id: 'dock', box: [0, 790, 390, 844] }] })), []);   // (a label that is not shown cannot be covered)
});

const reads = (over: Partial<Reads> = {}): Reads => ({ samples: card([0, 0.3, 0.7, 1, 1]), gaps: [16, 17, 16, 17, 16, 17], work: { p95: 4, max: 6 }, layout: read(), problems: [], console: [], hidden: false, ...over });
const stepOf = (id: string, over: Partial<Step> = {}): Step => ({ group: 'Talk', id, label: id, run: () => undefined, ...over });

test('a step is judged into one row: slow, unsettled, low fps, stalls, a hidden tab and the screen rules all show', () => {
  const clean = judgeStep(stepOf('a'), 'a', reads(), 900, true);
  assert.deepEqual(clean.flags, []); assert.ok(clean.frames.fps! > 55); assert.equal(clean.fadeIn, 99);
  const bad = judgeStep(stepOf('b'), 'b', reads({ gaps: Array(12).fill(60), problems: [{ kind: 'fit-off', text: 'Card teach stands partly off the screen', where: 'card teach' }, { kind: 'a11y-name', text: 'x' }], hidden: true }), 6000, false);
  const kinds = bad.flags.map((f) => f.kind);
  for (const k of ['unsettled', 'low-fps', 'stall', 'tab-hidden', 'fit-off', 'a11y-name']) assert.ok(kinds.includes(k), k);
  assert.equal(bad.flags.find((f) => f.kind === 'fit-off')!.sev, 'fail'); assert.equal(bad.flags.find((f) => f.kind === 'a11y-name')!.sev, 'warn');
  assert.equal(judgeStep(stepOf('c'), 'c', reads(), 5000, true).flags[0]!.kind, 'slow-load');
});

test('the walk runs each step in order, waits for the page, keeps a failing step as a finding and goes on, and can be stopped', async () => {
  const log: string[] = []; let clock = 0;
  const steps: Step[] = [stepOf('one', { run: () => { log.push('one'); return 'one (landed)'; } }), stepOf('two', { run: () => { throw new Error('no such slide'); } }), stepOf('three', { run: () => { log.push('three'); } })];
  const deps = { size: { id: 'iphone', w: 390, h: 844, dpr: 3 }, mark: () => { log.push('mark'); return 0; }, settle: async () => { log.push('settle'); clock += 1000; return { settled: true, ms: 1000 }; }, read: () => reads(), now: () => clock, quietMs: 600 };
  const d = await runAudit(steps, deps, { depth: 'full' });
  assert.equal(d.rows.length, 3); assert.equal(d.rows[0]!.label, 'one (landed)');
  assert.equal(d.rows[1]!.flags[0]!.kind, 'step-failed'); assert.match(d.rows[1]!.flags[0]!.what, /no such slide/);
  assert.deepEqual(log.slice(0, 4), ['mark', 'one', 'settle', 'mark']);
  assert.equal(d.rows[0]!.busyMs, 400);   // (1000 ms of waiting, less the 600 ms quiet window)
  const gen = async function* () { yield stepOf('a'); yield stepOf('b'); yield stepOf('c'); };
  let n = 0;
  const s = await runAudit(gen(), deps, { depth: 'quick', shouldStop: () => n++ >= 1 });
  assert.equal(s.stopped, true); assert.equal(s.rows.length, 1);
});

test('the report leads with what it cannot see, folds the same finding on many steps into one line, and the JSON holds every step', async () => {
  const mk = (size: string, ids: string[]): AuditData => ({ size: { id: size, w: 390, h: 844, dpr: 3 }, build: 'b1', ms: 61000, depth: 'full', stopped: false, console: size === 'iphone' ? [{ level: 'error', text: 'boom', at: 'at 3 s' }, { level: 'error', text: 'boom', at: 'at 9 s' }] : [], notes: [],
    rows: ids.map((id) => judgeStep(stepOf(id), id, reads({ layout: read({ cards: [{ id: 'teach', box: [16, 400, 374, 700], kids: [{ what: 'wide pill', box: [300, 410, 392, 430] }] }] }) }), 800, true)) });
  const b: Bundle = { build: 'b1', device: 'test', at: '2026-11-21T00:00:00Z', depth: 'full', framed: true, parts: [mk('iphone', ['s1', 's2', 's3']), mk('mac', ['s1'])], failed: [{ size: 'ipad', why: 'silent' }] };
  const t = renderText(b);
  assert.ok(t.indexOf('OPEN FIRST') < t.indexOf('RESULT')); assert.match(t, /Taste/); assert.match(t, /SIZES THAT DID NOT FINISH/);
  const g = groupFindings(b); assert.equal(g.length, 1); assert.equal(g[0]!.places.length, 4);
  assert.match(t, /\(4 places\)/); assert.match(t, /iphone Talk > s1/); assert.match(t, /2x \[error\] boom/);
  assert.equal((JSON.parse(renderJson(b)) as Bundle).parts[0]!.rows.length, 3);
  assert.ok(t.length < 6000, 'short enough to paste');
});

test('the frames page: sizes from the address (unknown names dropped), the child address keeps the rest and drops the audit flags, bare ?audit is frames only where a mouse is', () => {
  assert.deepEqual(sizesOf(null), DEFAULT_SIZES); assert.deepEqual(sizesOf('iphone,nope,mac'), ['iphone', 'mac']); assert.deepEqual(sizesOf('nope'), DEFAULT_SIZES);
  assert.equal(childSrc('/preview/', '?audit&sizes=iphone&depth=quick&look=dark', 'quick'), '/preview/?audit=run&depth=quick&look=dark');
  const loc = (search: string) => ({ search, pathname: '/preview/', hostname: 'qaddodi.github.io' });
  assert.equal(auditPage(loc('?audit'), true), 'frames'); assert.equal(auditPage(loc('?audit'), false), 'here');
  assert.equal(auditPage(loc('?audit=here'), true), 'here'); assert.equal(auditPage(loc('?audit=run'), true), 'run'); assert.equal(auditPage(loc('?x'), true), null);
  assert.equal(auditPage({ search: '?audit', pathname: '/portal-pressure-sim-3d/', hostname: 'qaddodi.github.io' }, true), null);   // (the live site never runs it)
});

test('every page that is not the app lifts the loading cover and sets its own colour scheme (the cover took every click on ?audit; the saved look made its controls dark)', async () => {
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  assert.match(main, /ppsBootLift\?\.\(\)/); assert.match(main, /colorScheme = dark\.matches/);
  for (const call of ['bootFrame()', 'bootOuter()', 'bootLookBoard()']) assert.match(main, new RegExp(`plainPage\\(\\);\\s*${call.replace(/[()]/g, '\\$&')}`), `${call} is called after plainPage()`);
});
