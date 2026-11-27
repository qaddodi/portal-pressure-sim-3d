import { readFileSync } from 'node:fs';
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
  assert.ok(t.indexOf('SUMMARY:') < t.indexOf('FAILING') && t.indexOf('FAILING') < t.indexOf('EVERY STEP') && t.indexOf('EVERY STEP') < t.indexOf('CHECKS RUN')); assert.match(t, /Taste/); assert.match(t, /SIZES THAT DID NOT FINISH/);
  const g = groupFindings(b); assert.equal(g.length, 1); assert.equal(g[0]!.places.length, 4);
  assert.match(t, /\(4 places\)/); assert.match(t, /iphone Talk > s1/); assert.match(t, /2x \[error\] boom/);
  assert.equal((JSON.parse(renderJson(b)) as Bundle).parts[0]!.rows.length, 3);
  assert.ok(renderText(b, { short: true }).length < 5000, 'the short one is short enough to paste'); assert.ok(!/EVERY STEP/.test(renderText(b, { short: true })));
  assert.equal((t.match(/^iphone Talk > s\d \|/gm) ?? []).length, 3, 'the full report lists every step, not just failing ones');
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
  const main = readFileSync(new URL('../src/entry.ts', import.meta.url), 'utf8');   // (the page's entry opens every page that is not the app, before the app is fetched)
  assert.match(main, /ppsBootLift\?\.\(\)/); assert.match(main, /colorScheme = window\.matchMedia\('\(prefers-color-scheme: dark\)'\)\.matches/); assert.match(main, /root\.style\.display = 'none'/);   // (the empty fixed #root otherwise sits over the page and takes its clicks)
  for (const call of ['bootFrame()', 'bootOuter()', 'bootLookBoard()']) assert.match(main, new RegExp(`plainPage\\(\\);\\s*${call.replace(/[()]/g, '\\$&')}`), `${call} is called after plainPage()`);
});

test('a callout that is not on is gone, whatever its own element says (the audit called hidden callouts f and w overlapping labels on every screen)', async () => {
  const { labelAlpha } = await import('../src/ui/debug/screen/raw.ts');
  assert.equal(labelAlpha(false, 1, [1, 1]), 0);   // (cath-dom hides a pill by removing data-on and fading its pieces: the element's own opacity stays 1)
  assert.equal(labelAlpha(true, 1, [0.25, 0.6]), 0.6);
  assert.equal(labelAlpha(true, 0.7, []), 0.7);
});

test('a faded dock is not a bar (the audit called every iPhone talk card covered by it)', async () => {
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../src/ui/debug/audit/app.ts', import.meta.url), 'utf8');
  // the dock's own box never fades (its face and bars do): the bar is its painted face, read through every ancestor's opacity
  assert.doesNotMatch(app, /\['dock', '\.vdock'\]/);
  assert.match(app, /\['dock', '\.vd-face'\]/);
  assert.match(app, /seen\(win, el\) > 0\.5\) bars\.push/);
});

test('the report opens with the run time, says when a parallel run makes the speed numbers invalid, and names every stop the walk could not reach', () => {
  const part = (id: string): AuditData => ({ size: { id, w: 390, h: 844, dpr: 3 }, build: 'b', ms: 120000, depth: 'full', stopped: false, rows: [], console: [], notes: [],
    coverage: [{ deck: 'Measuring HVPG', reached: 14, total: 15, missed: [9] }, { deck: 'TIPS', reached: 8, total: 8, missed: [] }] });
  const seq = renderText({ build: 'b', device: 'd', at: 'x', depth: 'full', framed: true, wallMs: 250000, parts: [part('iphone'), part('mac')], failed: [] });
  assert.match(seq, /^AUDIT v2[^\n]*\nSUMMARY: [^\n]*run time 4\.2 min/);
  assert.match(seq, /one after the other, 4\.2 min in all/); assert.match(seq, /COVERAGE iphone: 22 of 23 stops in 2 talks/); assert.match(seq, /NOT REACHED in "Measuring HVPG": 1 of 15 stops \(stop 9\)/);
  const par = renderText({ build: 'b', device: 'd', at: 'x', depth: 'full', framed: true, parallel: true, wallMs: 130000, parts: [part('iphone'), part('mac')], failed: [] });
  assert.match(par, /sizes ran at the same time/); assert.match(par, /PARALLEL RUN: .*NOT valid/);
});

test('words that only a screen reader hears are not words on the card (the iPhone summary table: every cell\'s sr-only text reaches past the card, so the report named an edge cut and words off the screen)', async () => {
  const { readFileSync } = await import('node:fs');
  const { clipsAway } = await import('../src/ui/debug/screen/raw.ts');
  assert.equal(clipsAway(1, 1, 'hidden'), true);    // .sr-only: 1 px box, overflow hidden, its nowrap text laid out whole from the corner
  assert.equal(clipsAway(1, 1, 'visible'), false);
  assert.equal(clipsAway(120, 18, 'hidden'), false);   // a real label that clips is still read
  const raw = readFileSync(new URL('../src/ui/debug/screen/raw.ts', import.meta.url), 'utf8');
  assert.match(raw, /hiddenFromEyes\(win, p, card\)\) continue/);
  // (every card's cells that carry the hidden words are the table's, drawn in TableCard)
  assert.match(readFileSync(new URL('../src/ui/cards/TableCard.tsx', import.meta.url), 'utf8'), /className="sr-only"/);
});

test('the registry holds one talk at boot and the rest lazily, so every tool that walks the talks loads them first (the audit, the Phone check and the Sweep walked one talk)', async () => {
  const { builtinDecks, lazyDecks, loadBuiltin } = await import('../src/decks/registry.ts');
  const lazy = lazyDecks();
  assert.ok(lazy.length > 5, 'many talks are lazy');
  assert.equal(builtinDecks().length, 1, 'only HVPG is in at boot, so builtinDecks() alone is not the list of talks');
  await Promise.all(lazy.map((l) => loadBuiltin(l.id)));
  assert.equal(builtinDecks().length, lazy.length + 1);
  const { readFileSync } = await import('node:fs');
  for (const f of ['src/ui/debug/audit/page.ts', 'src/ui/debug/page/page.ts']) assert.match(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), /await loadAllDecks\(\)/, `${f} loads every talk first`);
});

// ── the generic sweep (scan.ts read the page; scan-judge.ts judges plain numbers) ──
import { judgeScan, CHECKS, GAPS } from '../src/ui/debug/audit/scan-judge.ts';
import { animInventory } from '../src/ui/debug/audit/report.ts';
import type { RawScan, ScanItem } from '../src/ui/debug/audit/scan.ts';

const item = (o: Partial<ScanItem> & { what: string; box: ScanItem['box'] }): ScanItem => ({ kind: 'text', clip: null, scrolls: false, opacity: 1, px: 14, bold: false, fg: 'rgba(20, 20, 20, 1)', bg: 'rgba(255, 255, 255, 1)', ...o });
const scan = (o: Partial<RawScan> = {}): RawScan => ({ vw: 390, vh: 844, items: [], zero: [], broken: [], covered: [], counts: { texts: 0, media: 0, hit: 0, capped: false }, ...o });

test('a chart that runs past its card is a failing finding named by the card\'s title (the "HVPG and ascites over the month" plot cut by the card\'s bottom edge)', () => {
  const f = layoutFindings(read({ cards: [{ id: 'trend', title: 'HVPG and ascites over the month', box: [16, 100, 374, 600], kids: [], charts: [{ what: 'chart', box: [24, 300, 366, 640], clip: [16, 100, 374, 600] }] }] }));
  assert.equal(f.length, 1); assert.equal(f[0]!.kind, 'chart-clipped'); assert.equal(f[0]!.sev, 'fail');
  assert.match(f[0]!.what, /"HVPG and ascites over the month"/); assert.match(f[0]!.what, /40 px at the bottom/);
  assert.deepEqual(layoutFindings(read({ cards: [{ id: 'trend', title: 'x', box: [16, 100, 374, 600], kids: [], charts: [{ what: 'chart', box: [24, 300, 366, 598], clip: [16, 100, 374, 600] }] }] })), []);
});

test('the sweep: text or a picture cut by a clipping ancestor, past the screen, overlapping other words, covered, too small, too pale, empty, broken', () => {
  const k = (s: RawScan) => judgeScan(s).map((f) => f.kind);
  assert.deepEqual(k(scan({ items: [item({ what: 'Ascites', box: [20, 90, 120, 130], clip: [16, 100, 374, 600] })] })), ['clipped']);
  assert.deepEqual(k(scan({ items: [item({ kind: 'svg', what: 'chart', box: [20, 300, 360, 640], clip: [16, 100, 374, 600] })] })), ['clipped']);
  assert.deepEqual(k(scan({ items: [item({ what: 'Wide', box: [300, 100, 420, 120] })] })), ['off-screen']);
  assert.deepEqual(k(scan({ items: [item({ what: 'Inside a scroller', box: [20, 900, 120, 920], clip: [0, 0, 390, 844], scrolls: true })] })), []);
  assert.deepEqual(k(scan({ items: [item({ what: 'Alpha', box: [20, 100, 120, 118] }), item({ what: 'Beta', box: [60, 104, 160, 122] })] })), ['text-overlap']);
  assert.deepEqual(k(scan({ items: [item({ what: 'Same', box: [20, 100, 120, 118] }), item({ what: 'Same', box: [21, 101, 121, 119] })] })), [], 'the same words twice is a halo, not an overlap');
  assert.deepEqual(k(scan({ items: [item({ what: 'tiny', box: [20, 100, 60, 108], px: 7 })] })), ['small-text']);
  assert.deepEqual(k(scan({ items: [item({ what: 'fitted', box: [20, 100, 60, 108], px: 10.5, fitted: true })] })), [], 'a card the app zoomed down to fit keeps its shrink (22 Nov: keep shrink)');
  assert.deepEqual(k(scan({ items: [item({ what: 'pale', box: [20, 100, 60, 118], fg: 'rgba(200, 200, 200, 1)' })] })), ['low-contrast']);
  assert.deepEqual(k(scan({ items: [item({ what: 'mid-fade', box: [20, 100, 60, 118], fg: 'rgba(200, 200, 200, 1)', opacity: 0.5, fading: true })] })), [], 'text under a running fade is judged when it lands');
  assert.deepEqual(k(scan({ items: [item({ what: 'dim at rest', box: [20, 100, 60, 118], fg: 'rgba(200, 200, 200, 1)', opacity: 0.5 })] })), ['low-contrast'], 'text translucent at rest is still judged');
  // (a pale word names where it stands and how translucent it is: the 21 Nov run gave "WHVP" and "2" at 3.24:1 with nothing to find them by)
  const pale = judgeScan(scan({ items: [item({ what: 'WHVP', box: [20, 100, 60, 118], fg: 'rgba(90, 83, 71, 1)', bg: 'rgb(252, 249, 243)', opacity: 0.65, by: 'li.step < ol.hvpg' })] }))[0]!;
  assert.match(pale.what, /drawn at 65% opacity \(in li\.step < ol\.hvpg\)/);
  assert.deepEqual(k(scan({ items: [item({ what: 'fine', box: [20, 100, 60, 118] })] })), []);
  assert.deepEqual(k(scan({ covered: [{ what: 'button "Next"', by: 'div.dock', points: 4 }], zero: [{ what: 'svg.plot', why: 'has no size' }], broken: [{ what: 'img logo.png' }] })), ['covered-by', 'zero-size', 'broken-image']);
  assert.ok(judgeScan(scan({ items: Array.from({ length: 40 }, (_, i) => item({ what: `t${i}`, box: [20, 100 + i * 20, 60, 118 + i * 20], px: 6 })) })).some((f) => f.sev === 'note'), 'a flood is capped and says how many more');
  assert.ok(CHECKS.length >= 15 && GAPS.length >= 4);
});

test('a step with a sweep: its findings join the row once (a card word the card reader already named is not named twice), the row keeps the animations and the sweep counts', () => {
  const layout = read({ cards: [{ id: 'teach', title: 'Teach', box: [16, 400, 374, 700], kids: [{ what: 'wide pill', box: [300, 410, 392, 430] }] }] });
  const sc = scan({ items: [item({ what: 'Wide', box: [300, 100, 420, 120] }), item({ what: 'wide pill', box: [300, 410, 392, 430], clip: [16, 400, 374, 700] })], counts: { texts: 2, media: 0, hit: 0, capped: false } });
  const anims = [{ sel: 'div.dk-card', prop: 'opacity', kind: 'transition' as const, startMs: 10, plannedMs: 250, delayMs: 0, easing: 'ease', ended: 'end' as const, actualMs: 252 }];
  const row = judgeStep(stepOf('x'), 'x', reads({ layout, scan: sc, anims, generic: [{ kind: 'generic-pop', sev: 'warn', what: 'div.x appeared at full opacity in one frame', where: 'div.x' }] }), 900, true);
  const kinds = row.flags.map((f) => f.kind);
  assert.ok(kinds.includes('generic-pop') && kinds.includes('off-screen'));
  assert.equal(row.flags.filter((f) => /wide pill/.test(f.what)).length, 1);
  assert.equal(row.animN, 1); assert.equal(row.scan!.texts, 2);
});

test('the report lists every kind of animation with its planned lengths and how it ended, so a snap shows in the inventory', () => {
  const a = (sel: string, prop: string, plannedMs: number, ended: 'end' | 'cancel' = 'end') => ({ sel, prop, kind: 'transition' as const, startMs: 0, plannedMs, delayMs: 0, easing: 'ease', ended, actualMs: plannedMs });
  const row = { ...judgeStep(stepOf('s'), 's', reads(), 800, true), anims: [a('div.dk-card', 'opacity', 250), a('div.dk-card', 'opacity', 30, 'cancel'), a('div.pill', 'transform', 400)], animN: 3 };
  const b: Bundle = { build: 'b', device: 'd', at: 'x', depth: 'full', framed: false, parts: [{ size: { id: 'mac', w: 1440, h: 900, dpr: 2 }, ms: 1000, depth: 'full', stopped: false, console: [], notes: [], rows: [row] }], failed: [] };
  const inv = animInventory(b);
  assert.equal(inv.length, 2); assert.match(inv[0]!, /^2x transition div\.dk-card opacity: planned 30\/250\/250 ms/); assert.match(inv[0]!, /cancelled 1/);
  assert.match(renderText(b), /ANIMATIONS \(3 runs of 2 kinds/);
});

// ── the false positives of the first full run (Mohammad's v2 report: 5764 failing) ──
import { lineBoxes } from '../src/ui/debug/audit/scan-judge.ts';
import { TIMING_KINDS } from '../src/ui/debug/audit/report.ts';

test('words are judged line by line, so a number standing in a paragraph\'s gap is not "over" the paragraph (text-overlap 7597: one box for a whole wrapped paragraph held every inline number in it)', () => {
  // a 3-line paragraph 300 wide; the union box is [0,0,300,60]; a number sits at the end of line 1 (x 250-290, y 2-18)
  const lines = lineBoxes([{ left: 0, top: 0, right: 300, bottom: 20 }, { left: 0, top: 20, right: 300, bottom: 40 }, { left: 0, top: 40, right: 120, bottom: 60 }]);
  assert.equal(lines.length, 3);
  const number = item({ what: '12 mmHg', box: lineBoxes([{ left: 250, top: 22, right: 290, bottom: 40 }])[0]! });
  const para = lines.map((b, i) => item({ what: 'paragraph', box: b }));
  assert.deepEqual(judgeScan(scan({ items: [...para.slice(0, 1), para[2]!, number] })).map((f) => f.kind), [], 'the number is on line 2 only; lines 1 and 3 do not touch it');
  assert.equal(lineBoxes([{ left: 0, top: 0, right: 0, bottom: 10 }, { left: NaN, top: 0, right: 5, bottom: 5 }]).length, 0, 'no size, or NaN: no box');
  const b = lineBoxes([{ left: 0, top: 0, right: 50, bottom: 20 }])[0]!; assert.ok(b[1] > 2 && b[3] < 18, 'trimmed to the letters, not the font\'s whole content area');
  // a line box that pokes 2 px past a clip at its top and foot (tight line-height) is not words cut off
  assert.deepEqual(judgeScan(scan({ items: [item({ what: '11.1', box: lineBoxes([{ left: 20, top: 98, right: 60, bottom: 122 }])[0]!, clip: [16, 100, 374, 120] })] })), []);
});

test('a measured fade of 66 ms is two sampler rows, not a snap; one row (33 ms) is', () => {
  const two = fadeEpisodes(card([0, 0, 0.5, 1, 1])), one = fadeEpisodes(card([0, 0, 1, 1]));
  assert.equal(two[0]!.ms, 66); assert.deepEqual(fadeFindings(two), []);
  assert.equal(fadeFindings(one)[0]!.kind, 'fade-instant');
});

test('a run with the sizes at the same time leaves its timing findings out of the findings (and says how many)', () => {
  const rowOf = (k: string) => ({ ...judgeStep(stepOf('s'), 's', reads(), 800, true), flags: [{ kind: k, sev: 'fail' as const, what: `${k} here`, where: '' }] });
  const b: Bundle = { build: 'b', device: 'd', at: 'x', depth: 'full', framed: true, parallel: true, parts: [{ size: { id: 'mac', w: 1440, h: 900, dpr: 2 }, ms: 1000, depth: 'full', stopped: false, console: [], notes: [], rows: [rowOf('stall'), rowOf('low-fps'), rowOf('text-overlap')] }], failed: [] };
  assert.deepEqual(groupFindings(b).map((g) => g.kind), ['text-overlap']);
  assert.ok(TIMING_KINDS.has('stall') && TIMING_KINDS.has('slow-load') && !TIMING_KINDS.has('generic-snap'));
  assert.match(renderText(b), /2 timing findings .* are left out/);
  assert.equal(groupFindings({ ...b, parallel: false }).length, 3);
});

test('what stands under a faded-out part of a card is not seen, so a tucked data card\'s chart and table are not "cut off by the card" (every chart-clipped finding of the first run was in the ladder card: its inner part is opacity 0 while it is docked)', async () => {
  const { seenMemo } = await import('../src/ui/debug/audit/app.ts');
  const root = { parentElement: null, ownerDocument: { documentElement: {} } } as never, doc = (root as { ownerDocument: { documentElement: unknown } }).ownerDocument;
  const mk = (op: number, parent: unknown) => ({ op, parentElement: parent, ownerDocument: doc });
  const card = mk(1, null), inner = mk(0, card), chart = mk(1, inner), shown = mk(1, card);
  const win = { getComputedStyle: (e: { op: number }) => ({ opacity: String(e.op) }) } as never;
  const vis = seenMemo(win);
  assert.equal(vis(chart as never), 0); assert.equal(vis(inner as never), 0); assert.equal(vis(shown as never), 1);
});

test('the on-device banner (?audit=here) has the same speed list as the frames page, chosen before the run', () => {
  const pg = readFileSync(new URL('../src/ui/debug/audit/page.ts', import.meta.url), 'utf8');
  assert.match(pg, /import \{ SPEEDS \} from '\.\/outer\.ts'/); assert.match(pg, /mode === 'here' \? speed : undefined/);
});

test('fade-slow is not judged above FRAME_LIMIT_SPEED (the sampler sees a fade as two ticks: about 2.08 s on 179 iPhone rows at 20x)', async () => {
  const { FRAME_LIMITED_KINDS, FRAME_LIMIT_SPEED } = await import('../src/ui/debug/audit/speed.ts');
  const { dropsFinding } = await import('../src/ui/debug/audit/report.ts');
  assert.ok(FRAME_LIMITED_KINDS.has('fade-slow'));
  assert.equal(dropsFinding({ speed: 20 } as never, 'fade-slow'), true);
  assert.equal(dropsFinding({ speed: FRAME_LIMIT_SPEED } as never, 'fade-slow'), false);
});

test('slow-load is not judged above FRAME_LIMIT_SPEED (a step needs a few drawn frames to settle: 224 of 224 iPhone steps read "5.9 to 27 s" at 20x, the Anatomy "11 s" was 0.55 s of wall time)', async () => {
  const { FRAME_LIMITED_KINDS, FRAME_LIMIT_SPEED } = await import('../src/ui/debug/audit/speed.ts');
  const { dropsFinding } = await import('../src/ui/debug/audit/report.ts');
  assert.ok(FRAME_LIMITED_KINDS.has('slow-load'));
  assert.equal(dropsFinding({ speed: 20 } as never, 'slow-load'), true);
  assert.equal(dropsFinding({ speed: FRAME_LIMIT_SPEED } as never, 'slow-load'), false);
  assert.equal(dropsFinding({} as never, 'slow-load'), false);
});

test('words for a screen reader alone are found by their clip, not by their size: the chart\'s hidden table (a table never shrinks to 1 px) was read as ~950 cut-off words on the 21 Nov iPhone audit, in all three readers', async () => {
  const { readFileSync } = await import('node:fs');
  const { srOnlyStyle } = await import('../src/ui/debug/sr-only.ts');
  const base = { position: 'static', clip: 'auto', clipPath: 'none', overflow: 'visible', width: '300px', height: '20px' };
  // deck-ui.css and a11y.css `.sr-only`, as a browser computes them
  assert.equal(srOnlyStyle({ ...base, position: 'absolute', clipPath: 'inset(50%)', overflow: 'hidden', width: '1px', height: '1px' }), true);
  assert.equal(srOnlyStyle({ ...base, position: 'absolute', clip: 'rect(0px, 0px, 0px, 0px)', overflow: 'hidden', width: '420px', height: '90px' }), true);   // a table: wide, yet clipped to nothing
  assert.equal(srOnlyStyle({ ...base, overflow: 'hidden', width: '1px', height: '1px' }), true);
  assert.equal(srOnlyStyle(base), false);
  assert.equal(srOnlyStyle({ ...base, overflow: 'hidden' }), false);   // a real label that clips is still read
  assert.equal(srOnlyStyle({ ...base, position: 'absolute', clip: 'rect(0px, 20px, 20px, 0px)' }), false);
  // the chart's table is what carries it, and every reader asks the one predicate
  assert.match(readFileSync(new URL('../src/ui/charts/Chart.tsx', import.meta.url), 'utf8'), /<table className="sr-only" data-chart-data="">/);
  for (const f of ['audit/scan.ts', 'audit/app.ts', 'screen/raw.ts']) assert.match(readFileSync(new URL(`../src/ui/debug/${f}`, import.meta.url), 'utf8'), /srOnly(Style|Memo)\(/, f);
});

test('the copied JSON leaves out what the run could not judge, and counts it (the 21 Nov x20 run carried 1676 slow fades, 718 slow loads and 482 stalls that its own report called invalid); one size alone is not a parallel run', async () => {
  const { readFileSync } = await import('node:fs');
  const { renderJson } = await import('../src/ui/debug/audit/report.ts');
  const row = (flags: { kind: string; sev: string; what: string; where: string }[]) => ({ group: 'g', id: 'x', label: 'x', busyMs: 1000, settled: true, cardsMs: null, fadeIn: null, fadeOut: null, frames: {}, flags, anims: [], animN: 0 });
  const flags = [{ kind: 'fade-slow', sev: 'warn', what: 'a', where: '' }, { kind: 'clipped', sev: 'fail', what: 'b', where: '' }, { kind: 'stall', sev: 'fail', what: 'c', where: '' }];
  const b = { build: 'b', device: 'd', at: 'now', depth: 'quick', framed: true, speed: 20, parallel: true, parts: [{ size: { id: 'iphone', w: 390, h: 844, dpr: 2 }, rows: [row(flags)] }], failed: [] } as never as Bundle;
  const out = JSON.parse(renderJson(b)) as Bundle;
  assert.deepEqual(out.parts[0]!.rows[0]!.flags.map((f) => f.kind), ['clipped']);
  assert.deepEqual(out.dropped, { 'fade-slow': 1, stall: 1 });
  const kept = JSON.parse(renderJson({ ...b, speed: 1, parallel: false } as Bundle)) as Bundle;
  assert.equal(kept.parts[0]!.rows[0]!.flags.length, 3);
  assert.match(readFileSync(new URL('../src/ui/debug/audit/outer.ts', import.meta.url), 'utf8'), /together = par\.checked && ids\.length > 1/);
});

test('a transition cancelled and run again in the same breath (turned round or retargeted: the browser gives it the share of its length it has left) is not "a snap"; a declared short one still is (the credit\'s .24 s fade read 60 ms)', async () => {
  (globalThis as { MutationObserver?: unknown }).MutationObserver = class { observe() {} disconnect() {} takeRecords() { return []; } };
  const { startLedger } = await import('../src/ui/debug/audit/ledger.ts');
  const heard = new Map<string, (e: unknown) => void>();
  const doc = { addEventListener: (t: string, f: (e: unknown) => void) => heard.set(t, f), removeEventListener() {}, documentElement: {}, body: {}, querySelector: () => null } as never;
  const mk = (ms: number) => ({ tagName: 'DIV', id: '', className: 'credit', classList: { contains: () => false }, closest: () => null, parentElement: null, getAttribute: () => null, getAnimations: () => [{ transitionProperty: 'opacity', effect: { getTiming: () => ({ duration: ms, delay: 0, easing: 'ease' }) } }] });
  const run = (el: unknown) => ({ target: el, propertyName: 'opacity' });
  const led = startLedger(doc, {} as never);
  const turned = mk(60);   // .24 s, a quarter of the way: cancelled, then run again at 60 ms
  heard.get('transitionrun')!(run(mk(240)));
  heard.get('transitioncancel')!(run(turned)); heard.get('transitionrun')!(run(turned));
  assert.equal(led.read().findings.filter((f) => f.kind === 'anim-too-fast').length, 0);
  heard.get('transitionrun')!(run(mk(60)));   // asked for at 60 ms, no cancel before it
  assert.equal(led.read().findings.filter((f) => f.kind === 'anim-too-fast').length, 1);
  led.stop();
});

test('srOnlyMemo asks each element once and a hidden ancestor hides what is inside it (the chart table\'s cells)', async () => {
  const { srOnlyMemo } = await import('../src/ui/debug/sr-only.ts');
  const hidden = { position: 'absolute', clip: 'auto', clipPath: 'inset(50%)', overflow: 'hidden', width: '420px', height: '90px' }, shown = { position: 'static', clip: 'auto', clipPath: 'none', overflow: 'visible', width: '10px', height: '10px' };
  interface N { parentElement: N | null; st: typeof shown }
  const table: N = { parentElement: null, st: hidden }, cell: N = { parentElement: table, st: shown }, card: N = { parentElement: null, st: shown }, other: N = { parentElement: card, st: shown };
  let reads = 0;
  const f0 = srOnlyMemo((el) => { reads++; return (el as never as N).st; }), f = (n: N) => f0(n as never);
  assert.equal(f(cell), true); assert.equal(f(table), true); assert.equal(f(other), false);
  assert.equal(reads, 3);   // (the cell under the hidden table is not even read)
});

test('the © a words card carries in its foot row is a bar: the choices of Carvedilol 5 stood on it (iPad, capture 49141fb9) and the audit had no word for that', async () => {
  const { unionBox, CARD_CREDIT } = await import('../src/ui/debug/audit/app.ts');
  assert.equal(CARD_CREDIT, '.dk-card .pz-cred');
  assert.equal(unionBox([]), null);
  assert.deepEqual(unionBox([[40, 700, 200, 717], [60, 690, 220, 705]]), [40, 690, 220, 717]);
  // the line is as wide as its words, not as wide as the card: a button beside it is not under it
  type B = [number, number, number, number];
  const kids = [{ what: 'Usual responder', box: [150, 790, 240, 814] as B }, { what: 'Non-responder', box: [20, 790, 100, 814] as B }];
  const card = { id: 'teach', box: [16, 500, 374, 820] as B, kids };
  const under = layoutFindings({ vw: 390, vh: 844, cards: [card], bars: [{ id: 'card credit', box: [120, 800, 270, 817] }], labels: [] });
  assert.deepEqual(under.filter((x) => x.kind === 'covered').map((x) => x.where), ['card teach, Usual responder, card credit']);
});

// ── turned words: the 45 degree column heads of a phone's table (layout-check, iPhone, 27 Nov: 49 text-overlap and a covered-by on the second-last stop of 15 talks) ──
import { turnedQuad, convexOverlap, textOverlap, quadPoints } from '../src/ui/debug/audit/scan-judge.ts';

const boxOf = (q: [number, number][]): [number, number, number, number] => [Math.min(...q.map((p) => p[0])), Math.min(...q.map((p) => p[1])), Math.max(...q.map((p) => p[0])), Math.max(...q.map((p) => p[1]))];
/** A slanted head as the scan reads it: 80 px long, a 12 px line (trimmed to the letters), turned -45 degrees, centred at x. */
const slanted = (what: string, x: number): ScanItem => { const quad = turnedQuad(x, 300, 80, 12 * 0.76, -45); return item({ what, box: boxOf(quad), quad, turn: -45 }); };

test('slanted heads one slant pitch apart (the line height over sin 45: 17 px at 12 px type) are NOT overlapping words, though their bounding boxes overlap by more than half', () => {
  const heads = [slanted('Esophageal varix', 100), slanted('HVPG', 117), slanted('Ascites', 134), slanted('Platelets', 151)];
  assert.ok(textOverlap({ ...heads[0]!, quad: undefined }, { ...heads[1]!, quad: undefined }) > 0.5, 'as plain boxes they share most of their area: the false positive');
  assert.deepEqual(judgeScan(scan({ items: heads })).map((f) => f.kind), [], 'as turned boxes they do not touch');
});

test('slanted heads closer than the pitch still fail: the turned rule is a correction of the box, not a pass', () => {
  const kinds = judgeScan(scan({ items: [slanted('HVPG', 100), slanted('Ascites', 106)] })).map((f) => f.kind);
  assert.deepEqual(kinds, ['text-overlap']);
});

test('a slanted head over flat words is judged by where its letters are: across them fails, in the empty corner of its bounding box passes', () => {
  const head = slanted('Ascites', 200);
  const across = item({ what: 'Name', box: [160, 296, 240, 310] });
  assert.ok(textOverlap(head, across) > 0.2);
  const corner = item({ what: 'Corner', box: [head.box[0], head.box[1], head.box[0] + 8, head.box[1] + 8] });
  assert.ok(textOverlap(head, corner) < 0.05, 'the top-left of a head rising to the left is empty');
});

test('the polygon overlap is exact for squares and the five probe points of a turned box lie inside it', () => {
  const sq = (x: number, y: number, s: number): [number, number][] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
  assert.equal(convexOverlap(sq(0, 0, 10), sq(5, 5, 10)), 25);
  assert.equal(convexOverlap(sq(0, 0, 10), sq(20, 0, 10)), 0);
  const q = turnedQuad(100, 100, 80, 12, -45);
  for (const [x, y] of quadPoints(q)) assert.ok(convexOverlap(q, sq(x - 0.01, y - 0.01, 0.02)) > 0.0003, 'every probe stands inside the turned box');
});

test('words under a running fade are not "clipped" while they travel in (a rolled reading\'s period inside its own window), and are judged again once they stand still', () => {
  const kinds = (o: Partial<ScanItem>) => judgeScan(scan({ items: [item({ what: '.', box: [20, 90, 26, 130], clip: [16, 100, 374, 600], ...o })] })).map((f) => f.kind);
  assert.deepEqual(kinds({ opacity: 0.5, fading: true }), []);
  assert.deepEqual(kinds({}), ['clipped'], 'the same words at rest, cut by the container, still fail');
});

import { pictureUnder } from '../src/ui/debug/audit/scan-judge.ts';
test('contrast is not judged against the CSS background where a picture stands under the words (a Doppler\'s white read-outs over its black spectrum: 1.1:1 on the card behind it)', () => {
  type N = { tagName: string; parent: N | null; contains(n: N): boolean };
  const node = (tagName: string, parent: N | null = null): N => { const n: N = { tagName, parent, contains: (o) => { for (let p: N | null = o; p; p = p.parent) if (p === n) return true; return false; } }; return n; };
  const card = node('DIV'), words = node('B', card), spectrum = node('CANVAS', node('DIV', card));
  assert.equal(pictureUnder([spectrum, card], words), true, 'a canvas beside the words in the stack is under them');
  assert.equal(pictureUnder([card], words), false, 'only their own card: the CSS background is what they stand on');
  const around = node('SVG'), inside = node('DIV', around), text = node('SPAN', inside);
  assert.equal(pictureUnder([around, inside], text), false, 'words inside an svg are part of it, not on it');
});
