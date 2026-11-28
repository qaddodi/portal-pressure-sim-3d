// The audit request in an address (step b of docs/audit.md): `?stress&req=...` and the capture's `&req=...` read the same request line the node runner reads, and print the seed. Pure and fast.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lineFromSearch, requestFlag, requestFromSearch, scopeFromSearch } from '../src/ui/debug/request/address.ts';
import { appWorld } from '../src/ui/debug/request/world.ts';
import { parseRequest } from '../src/ui/debug/request/grammar.ts';
import { pickFromSearch } from '../src/ui/debug/audit/capture-request.ts';
import { DEFAULT_PLAN, MAX_REQUEST_SLIDES, PICTURE_CAP, STRESS_LAYOUTS, STRESS_MOVES, STRESS_SLIDES, layoutPictures, layoutSteps, planFromSearch, stressPictures, stressSteps, type StressPlan } from '../src/ui/debug/stress/plan.ts';
import { reportMd, manifestJson, requestLines, type LayoutRun } from '../src/ui/debug/stress/report.ts';
import { FLAGS } from '../src/ui/debug/flags.ts';
import { FLAG_MEANINGS } from '../src/ui/debug/flag-meanings.ts';

const world = appWorld();
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('the request line in an address reads the same whichever way the + was written, and writes back so it survives an address', () => {
  assert.equal(lineFromSearch('?stress&req=feature:junctions%2Blayout:iphone'), 'feature:junctions+layout:iphone');
  assert.equal(lineFromSearch('?stress&req=feature:junctions+layout:iphone'), 'feature:junctions+layout:iphone', 'a raw + is read as a space by a query string: it is put back');
  assert.equal(lineFromSearch('?req=app%20checks%3Dnumbers%2Cperf'), 'app checks=numbers,perf');
  assert.equal(lineFromSearch('?req=random:12@4471/deck'), 'random:12@4471/deck');
  assert.equal(lineFromSearch('?stress'), null);
  for (const line of ['feature:junctions+layout:iphone', 'random:12@4471/deck', 'app checks=numbers,perf', 'deck:tips-complete+look:dark']) {
    const flag = requestFlag(line);
    assert.ok(!/[+ ]/.test(flag), flag);
    assert.equal(lineFromSearch(`?stress&${flag}`), line, 'what is written is what is read');
  }
});

test('an address with a bad request says why, and one without a request has none', () => {
  assert.equal(requestFromSearch('?stress'), null);
  assert.equal(scopeFromSearch('?stress', world), null);
  const bad = requestFromSearch('?req=bogus:x');
  assert.ok(bad && !bad.ok && /not a kind of part/.test(bad.error));
  const none = scopeFromSearch('?req=deck:nope', world);
  assert.ok(none && !none.ok && /no talk "nope"/.test(none.error));
  const ok = requestFromSearch('?req=feature:junctions');
  assert.ok(ok && ok.ok);
  assert.deepEqual((ok as { request: unknown }).request, (parseRequest('feature:junctions') as { request: unknown }).request, 'the address and the node runner read one request');
});

test('?stress with no request is the plan it always was', () => {
  assert.equal(planFromSearch('?stress', world), null);
  assert.deepEqual(DEFAULT_PLAN.slides, STRESS_SLIDES.map((s) => s.key));
  assert.equal(DEFAULT_PLAN.moves, STRESS_MOVES);
  assert.ok(DEFAULT_PLAN.menus && !DEFAULT_PLAN.request && !DEFAULT_PLAN.random);
  assert.equal(stressSteps(), STRESS_LAYOUTS.reduce((n, l) => n + layoutSteps(l), 0));
  assert.ok(stressPictures() <= PICTURE_CAP);
  const app = planFromSearch('?req=app', world);
  assert.ok(app && app.ok);
  assert.deepEqual((app as { plan: { slides: readonly string[] } }).plan.slides, DEFAULT_PLAN.slides, 'a request that names no slides keeps the tool\'s own key slides');
});

test('?stress&req=feature:junctions takes the feature\'s slides and the transitions of its talks, and leaves the menus out', () => {
  const r = planFromSearch(`?stress&${requestFlag('feature:junctions')}`, world);
  assert.ok(r && r.ok, JSON.stringify(r));
  const { plan, layouts } = r as { plan: typeof DEFAULT_PLAN; layouts: typeof STRESS_LAYOUTS };
  assert.equal(plan.request, 'feature:junctions');
  assert.ok(plan.slides.includes('tips-complete:17') && plan.slides.length <= MAX_REQUEST_SLIDES);
  assert.ok(plan.menus === false);
  assert.ok(plan.moves.every((m) => ['shunts', 'tips-complete', 'tips-doppler', 'same-gradient', 'variceal-bleed', 'circuit'].includes(m.deck)));
  assert.equal(layouts.length, 3);
});

test('a request that names slides narrows the plan; the progress units and the picture count follow the plan', () => {
  const r = planFromSearch(`?stress&${requestFlag('deck:tips-complete+layout:iphone')}`, world);
  assert.ok(r && r.ok, JSON.stringify(r));
  const { plan, layouts } = r as { plan: typeof DEFAULT_PLAN; layouts: typeof STRESS_LAYOUTS };
  assert.deepEqual(layouts.map((l) => l.id), ['iphone']);
  assert.equal(plan.slides.length, world.decks.find((d) => d.id === 'tips-complete')!.slides);
  assert.deepEqual(plan.moves.map((m) => m.id), ['tips-complete-11-12']);
  const l = layouts[0]!;
  assert.equal(layoutSteps(l, plan), plan.slides.length + 1 * 3, 'the slides and one transition of three pictures');
  assert.equal(layoutPictures(l, plan), plan.slides.length * 2 + 3, 'an upright iPhone takes each slide twice');
  assert.equal(stressSteps(layouts, plan), layoutSteps(l, plan));
});

test('too many slides are refused with what to do, and a size stress does not take is said, not guessed', () => {
  const big = planFromSearch(`?stress&${requestFlag('deck:ten-years+deck:ascites+deck:tips-complete')}`, world);
  assert.ok(big && !big.ok && new RegExp(`at most ${MAX_REQUEST_SLIDES}`).test(big.error) && /random:40@<seed>\/deck/.test(big.error));
  const some = planFromSearch(`?stress&${requestFlag('slide:shunts:2+layout:iphone+layout:iphone-landscape')}`, world);
  assert.ok(some && some.ok);
  assert.deepEqual((some as { dropped: string[] }).dropped, ['iphone-landscape']);
  assert.deepEqual((some as { layouts: { id: string }[] }).layouts.map((x) => x.id), ['iphone']);
  const none = planFromSearch(`?stress&${requestFlag('slide:shunts:2+layout:mac-short')}`, world);
  assert.ok(none && !none.ok && /none of its sizes/.test(none.error));
});

test('a seed is the same slides in the page and in the frame, because both read the same address', () => {
  const a = `?stress&${requestFlag('random:12@4471/deck')}`;
  const page = planFromSearch(a, world), frame = planFromSearch(a, world);
  assert.ok(page && page.ok && frame && frame.ok);
  const [p, f] = [page, frame].map((x) => (x as { ok: true; plan: StressPlan }).plan);
  assert.deepEqual(p!.slides, f!.slides);
  assert.equal(p!.random?.seed, 4471);
  assert.equal(p!.slides.length, 12);
});

test('the stress report and manifest print the request, the seed and how to ask for the same slides again', () => {
  const meta = { build: 'abc', at: '2026-11-28', stopped: false, request: 'random:12@4471/deck', random: { n: 12, seed: 4471, spread: true, picked: ['a:1', 'b:2'] } };
  const lines = requestLines(meta).join('\n');
  assert.match(lines, /Request: random:12@4471\/deck/);
  assert.match(lines, /seed 4471, spread over the talks; ask for the same slides again with random:12@4471\/deck/);
  assert.match(lines, /Slides: a:1, b:2/);
  assert.deepEqual(requestLines({ build: 'abc', at: 'x', stopped: false }), [], 'the default plan prints nothing new');
  const run: LayoutRun = { layout: 'mac', label: 'Mac', entries: [], notes: [], secs: 1 };
  assert.match(reportMd([run], meta), /Request: random:12@4471\/deck/);
  const m = JSON.parse(manifestJson([run], meta));
  assert.equal(m.request, 'random:12@4471/deck');
  assert.equal(m.random.seed, 4471);
  assert.equal(m.runner, 'gpu');
});

test('the capture takes its slides from the request: the same draw as the node runner, the seed in the README words', () => {
  assert.equal(pickFromSearch('?audit=frames&capture=1', world), null);
  const r = pickFromSearch(`?audit=frames&capture=1&${requestFlag('random:10@4471')}`, world);
  assert.ok(r && r.ok);
  const sel = (r as { sel: { pick: string[]; words: string; seed: number; sizes: null } }).sel;
  assert.equal(sel.pick.length, 10);
  assert.equal(sel.seed, 4471);
  assert.match(sel.words, /seed 4471; the same slides again: random:10@4471/);
  assert.equal(sel.sizes, null, 'no layout part: the bar\'s ticks stand');
  const scope = scopeFromSearch(`?req=random:10@4471`, world);
  assert.deepEqual(sel.pick, (scope as { scope: { slides: string[] } }).scope.slides, 'one draw in every runner');
  const sized = pickFromSearch(`?req=${encodeURIComponent('slide:shunts:2+layout:mac+layout:iphone')}`, world);
  assert.deepEqual((sized as { sel: { sizes: string[] } }).sel.sizes, ['mac', 'iphone']);
  const all = pickFromSearch('?req=app', world);
  assert.equal((all as { sel: { pick: null } }).sel.pick, null, 'a request that names no slides is every slide');
  const bad = pickFromSearch('?req=deck:nope', world);
  assert.ok(bad && !bad.ok);
});

test('the wiring: the page, the here-page and the stress frame all read the request, the random picker prints its seed, and the flag is documented', () => {
  assert.ok(FLAGS.some((f) => f.id === 'req') && FLAG_MEANINGS.req);
  assert.match(src('src/ui/debug/audit/capture-outer.ts'), /pickFromSearch\(searchNow\(\), appWorld\(\)\)/);
  assert.match(src('src/ui/debug/audit/page.ts'), /pickFromSearch\(searchNow\(\), appWorld\(\)\)/);
  assert.match(src('src/ui/debug/audit/capture-child.ts'), /planFromSearch\(searchNow\(\)/);
  assert.match(src('src/ui/debug/stress/outer.ts'), /planFromSearch\(searchNow\(\), appWorld\(\)\)/);
  const pick = src('src/ui/debug/audit/capture-pick.ts');
  assert.match(pick, /random \$\{keys\.length\} \(seed \$\{seed\}/);
  assert.match(src('src/ui/debug/audit/capture-all.ts'), /ui\.about/);
  // (the capture's frame is given its slides by `pick`, not by the request: it is dropped from that address so the two cannot disagree)
  assert.match(src('src/ui/debug/audit/capture-outer.ts'), /'slides', 'req'\]/);
});
