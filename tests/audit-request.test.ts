// The one audit request (src/ui/debug/request): the line every runner reads the same way, the feature table, and which node tests a request runs. Pure and fast: nothing here runs a test or a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { parseRequest, formatRequest, CHECKS, RUNNER_CHECKS } from '../src/ui/debug/request/grammar.ts';
import { resolveRequest, randomSpread, type World, type Scope } from '../src/ui/debug/request/resolve.ts';
import { FEATURES, featureOf, testsOfFeature } from '../src/ui/debug/request/features.ts';
import { nodeTestPlan, BASE_FEATURES } from '../src/ui/debug/request/plan.ts';
import { randomPick } from '../src/ui/debug/audit/capture-pick.ts';
import { readWorld } from '../scripts/audit/world.mjs';

const world = (await readWorld()) as World;
const all = readdirSync(new URL('./', import.meta.url)).filter((f) => f.endsWith('.test.ts')).sort();
const req = (line: string) => { const p = parseRequest(line); assert.ok(p.ok, line); return (p as { request: Parameters<typeof resolveRequest>[0] }).request; };
const scope = (line: string): Scope => { const r = resolveRequest(req(line), world); assert.ok(r.ok, line); return (r as { scope: Scope }).scope; };
const FAMILIES = { hp: ['variceal-bleed', 'shunts'], rw: ['tips-complete'] };
const deckSlides = (id: string) => world.decks.find((d) => d.id === id)!.slides;
const pd = () => world.decks.map((d) => ({ id: d.id, title: d.id, slides: Array.from({ length: d.slides }, () => ({ title: '' })) }));

test('a request line reads the way the review wrote it, and writes back as the same canonical line', () => {
  for (const line of ['feature:junctions+layout:iphone', 'deck:tips-complete+look:dark', 'random:12@4471', 'random:12@4471/deck', 'app', 'slide:tips-complete:17', 'case:hist-bleed+lens:pressure', 'app checks=numbers,perf', 'feature:junctions runner=gpu']) {
    assert.equal(formatRequest(req(line)), line);
  }
  assert.deepEqual(req('').what, [{ kind: 'app' }], 'an empty line is app');
  assert.equal(formatRequest(req('runner=layout checks=perf,layout deck:x')), 'deck:x checks=layout,perf runner=layout', 'the order the line was typed in does not change what it is');
  assert.deepEqual(req('random:3@7/deck').what, [{ kind: 'random', n: 3, seed: 7, spread: true }]);
});

test('a request that cannot be read says what is wrong and what it could have been; nothing is guessed', () => {
  const bad = (line: string) => { const p = parseRequest(line); assert.ok(!p.ok, line); return (p as { error: string }).error; };
  assert.match(bad('bogus:thing'), /not a kind of part/);
  assert.match(bad('random:12'), /random:<n>@<seed>/);
  assert.match(bad('random:0@1'), /1 to 999/);
  assert.match(bad('slide:tips-complete'), /slide:<deck>:<n>/);
  assert.match(bad('deck:A_B'), /lower-case/);
  assert.match(bad('app checks=layout,smell'), /"smell" is not a check/);
  assert.match(bad('app runner=cloud'), /the runners are node, layout, gpu/);
  assert.match(bad('app deck:x'), /one what/, 'a space is not a +');
  assert.match(bad('app seed=4'), /not part of a request/);
});

test('the runners: node takes no pictures and no browser; every check a runner lists is a check', () => {
  for (const r of Object.values(RUNNER_CHECKS)) for (const c of r) assert.ok(CHECKS.includes(c), c);
  assert.ok(!RUNNER_CHECKS.node.includes('pictures'));
  assert.ok(RUNNER_CHECKS.gpu.includes('pictures'));
  const only = resolveRequest(req('app checks=pictures'), world);
  assert.ok(!only.ok && /pictures/.test(only.error), 'a request with nothing the node runner can do is refused, not passed');
  const some = scope('app checks=pictures,types');
  assert.deepEqual(some.checks, ['types']);
  assert.deepEqual(some.skipped.map((s) => s.check), ['pictures'], 'an asked-for check the runner cannot do is named as skipped');
  assert.equal(scope('app').skipped.length, 0, 'the default asks only for what the runner can do');
});

test('every deck, lens, source folder and test glob a feature names exists, and every feature has tests', () => {
  const decks = new Set(world.decks.map((d) => d.id));
  for (const f of FEATURES) {
    assert.ok(/^[a-z0-9-]+$/.test(f.id));
    for (const s of f.slides) {
      const [d, n] = s.split(':');
      assert.ok(decks.has(d!), `${f.id}: no talk ${d}`);
      if (n) assert.ok(Number(n) >= 1 && Number(n) <= deckSlides(d!), `${f.id}: ${s}`);
    }
    for (const l of f.lenses) assert.ok(world.lenses.includes(l), `${f.id}: no lens ${l}`);
    for (const s of f.sources) assert.ok(existsSync(new URL(`../${s}`, import.meta.url)), `${f.id}: ${s} does not exist`);
    for (const g of f.tests) assert.ok(testsOfFeature({ ...f, tests: [g] }, all).length, `${f.id}: the glob ${g} matches no test file`);
    assert.ok(f.checks.length && testsOfFeature(f, all).length, `${f.id} has tests`);
    assert.ok(f.slides.length <= 40, `${f.id}: the stress capture takes at most 40 slides`);
  }
  for (const [c, ids] of Object.entries(BASE_FEATURES)) for (const id of ids!) assert.ok(featureOf(id), `${c}: base feature ${id}`);
  assert.equal(new Set(FEATURES.map((f) => f.id)).size, FEATURES.length);
});

test('a feature means the same set of things every time: its slides, lenses and tests', () => {
  const s = scope('feature:junctions');
  assert.deepEqual(s.features, ['junctions']);
  for (const d of ['shunts', 'tips-complete', 'tips-doppler', 'same-gradient', 'variceal-bleed', 'circuit']) assert.ok(s.decks.includes(d), d);
  assert.ok(s.slides.includes('tips-complete:17') && s.slides.includes('shunts:8') && !s.slides.includes('shunts:3'), 'the slides that show it, from the review\'s list of slides whose numbers moved, not whole talks');
  assert.deepEqual(s.lenses, ['pressure', 'flow']);
  assert.equal(JSON.stringify(scope('feature:junctions')), JSON.stringify(s));
  assert.deepEqual(scope('feature:junctions+layout:iphone+layout:mac').sizes, ['mac', 'iphone'], 'the device table\'s order, whatever order they were typed in');
  assert.deepEqual(s.sizes, ['iphone', 'ipad-portrait', 'mac'], 'no layout part: the three the stress capture uses');
});

test('parts add up: decks, slides, looks and cases, and a name that does not exist is refused with the names that do', () => {
  const s = scope('deck:shunts+slide:lobule:4+look:dark+case:hist-bleed');
  assert.ok(s.slides.includes('lobule:4') && !s.slides.includes('lobule:3'));
  assert.equal(s.slides.filter((k) => k.startsWith('shunts:')).length, deckSlides('shunts'));
  assert.deepEqual(s.looks, ['dark']);
  assert.deepEqual(s.cases, ['hist-bleed']);
  assert.equal(scope('look:dark').slides.length, world.decks.reduce((a, d) => a + d.slides, 0), 'a look alone is every slide in it');
  const refused: [string, RegExp][] = [['deck:nope', /no talk "nope"/], ['slide:shunts:999', /slides 1 to/], ['lens:x', /the lenses are/], ['look:x', /the looks are/], ['layout:tv', /the sizes are/], ['feature:x', /the features are/], ['case:x', /the cases are/]];
  for (const [line, re] of refused) {
    const r = resolveRequest(req(line), world);
    assert.ok(!r.ok && re.test(r.error), line);
  }
});

test('a seed gives the same slides every time, in every runner: random is the capture\'s own seeded draw', () => {
  const a = scope('random:12@4471'), b = scope('random:12@4471');
  assert.deepEqual(a.random?.picked, b.random?.picked);
  assert.equal(a.slides.length, 12);
  assert.deepEqual(a.slides, a.random!.picked);
  assert.notDeepEqual(scope('random:12@4472').slides, a.slides);
  assert.deepEqual(a.random!.picked, randomPick(pd(), 12, 4471), 'the capture\'s own generator, not a second one');
  const r = resolveRequest(req('random:999@1'), { ...world, decks: [{ id: 'hvpg', slides: 13 }] });
  assert.ok(!r.ok && /more slides/.test(r.error), 'more than there are is refused');
});

test('/deck spreads the draw over as many talks as it can', () => {
  const s = scope('random:12@4471/deck');
  assert.equal(new Set(s.slides.map((k) => k.split(':')[0])).size, 12, 'twelve slides, twelve talks');
  assert.deepEqual(scope('random:12@4471/deck').slides, s.slides);
  const n = world.decks.length;
  assert.equal(new Set(scope(`random:${n}@9/deck`).slides.map((k) => k.split(':')[0])).size, n, 'as many as there are talks: one from each');
  assert.equal(randomSpread(pd(), n + 5, 3).length, n + 5, 'then a second round');
  assert.equal(new Set(randomSpread(pd(), 5, 1)).size, 5, 'no slide twice');
});

test('which test files run: a feature runs its own, a talk request runs the numbers replay, app runs the features, nothing runs the whole suite', () => {
  const feat = nodeTestPlan(scope('feature:junctions'), all, FAMILIES);
  assert.ok(feat.files.length > 20 && feat.files.length < 120, `${feat.files.length}`);
  const own = testsOfFeature(featureOf('junctions')!, all);
  assert.ok(feat.files.every((f) => own.includes(f.file)), 'only the feature\'s files');
  assert.deepEqual(feat.env, {}, 'no numbers file, no full replay');
  assert.ok(feat.files.every((f) => f.check === 'junctions'), 'a feature that serves two checks gives its files to the first of its own list');
  const deck = nodeTestPlan(scope('deck:variceal-bleed'), all, FAMILIES);
  assert.ok(deck.files.length && deck.files.every((f) => f.check === 'numbers'), 'a talk request runs the one node check that reads slides');
  assert.equal(deck.env.DECKS_HP_FULL, '1');
  assert.equal(deck.env.RW_FULL, undefined, 'the family of the talk, not every family');
  const explicit = nodeTestPlan(scope('feature:junctions checks=numbers'), all, FAMILIES);
  assert.ok(explicit.files.length && explicit.files.every((f) => f.check === 'numbers'), 'asking for a check by name runs its base tests');
  const app = nodeTestPlan(scope('app'), all, FAMILIES);
  assert.ok(app.files.length > feat.files.length && app.files.length < all.length / 2, `${app.files.length} of ${all.length}`);
  assert.deepEqual(nodeTestPlan(scope('app checks=types,lint'), all, FAMILIES).files, []);
  assert.equal(new Set(app.files.map((f) => f.file)).size, app.files.length, 'a file runs once');
});
