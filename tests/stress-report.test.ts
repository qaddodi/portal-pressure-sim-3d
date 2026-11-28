// The stress capture's written report (src/ui/debug/stress/report.ts): the checks it makes of a card record and of a transition, and the files it writes. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardChecks, driftCheck, shotsOf, PAST_LIMIT, SIZE_DRIFT, isProblem, type Entry, type LayoutRun } from '../src/ui/debug/stress/report.ts';
import { resultOfShots, checkOf } from '../src/ui/debug/request/shots.ts';
import { bundleFiles } from '../src/ui/debug/request/bundle.ts';
import { pictureScope, unifiedFiles } from '../src/ui/debug/request/gpu.ts';
import { appWorld } from '../src/ui/debug/request/world.ts';
import { zipBytes } from '../src/ui/debug/request/bundle.ts';
import { zipText } from '../src/ui/debug/request/read-zip.ts';

const card = (past: number) => ({ card: 'tips-12-table', box: 300, content: 300 + past, past });
const entry = (o: Partial<Entry>): Entry => ({ section: 'slides', layout: 'iPhone', file: 'slides/a.jpg', title: 'A', state: 'talk a, slide 1', checks: cardChecks([card(0)]), issues: [], ...o });

test('a card whose content reaches past its foot fails, and the words say which and by how much', () => {
  assert.equal(cardChecks([card(0)])[0]!.ok, true);
  assert.equal(cardChecks([card(PAST_LIMIT)])[0]!.ok, true);
  const c = cardChecks([card(PAST_LIMIT + 11)])[0]!;
  assert.equal(c.ok, false);
  assert.match(c.detail!, /tips-12-table/); assert.match(c.detail!, /13 px past/);
  assert.equal(cardChecks([])[0]!.ok, true, 'a screen with no card has nothing to overflow');
  assert.equal(cardChecks(undefined)[0]!.ok, true);
});

test('a card that changes size after it lands fails; one that holds its size passes', () => {
  const fine = new Map([['a', [{ w: 300, h: 200 }]], ['b', [{ w: 300, h: 200 }, { w: 300, h: 200 + SIZE_DRIFT }]]]);
  assert.equal(driftCheck(fine).ok, true);
  const grew = new Map([['a', [{ w: 300, h: 200 }, { w: 300, h: 260 }]]]);
  const c = driftCheck(grew);
  assert.equal(c.ok, false); assert.match(c.detail!, /a: .*height 200 to 260/);
});

test('the capture\'s own notes that mean a picture is not to be trusted are problems', () => {
  assert.ok(isProblem('Ascites 6: CAPTURE FAILED, the picture does not show the slide\'s own state'));
  assert.ok(isProblem('Shunts 11: still not still after 5 s (the camera is moving); captured as it was'));
  assert.ok(!isProblem('Ascites 6: the words text will take two presses'));
});

const world = appWorld();
const run = (entries: Entry[], o: Partial<LayoutRun> = {}): LayoutRun => ({ layout: 'iphone', label: 'iPhone', entries, notes: [], secs: 61.4, ...o });
const info = { build: { commit: 'abcdef0123456789', branch: '', engine: '', dirty: false }, runner: 'gpu', startedAt: '2026-11-28T04:00:00.000Z', seconds: 61, device: 'a phone' };
const make = (runs: LayoutRun[], line = '?req=feature:junctions') => {
  const scope = pictureScope(line, world, { checks: ['layout', 'motion', 'pictures'], sizes: runs.map((r) => r.layout) })!;
  const { shots, ends } = shotsOf(runs);
  return { scope, shots, ends, result: resultOfShots({ scope, info, shots, ends, checks: scope.checks, validity: ['A real GPU run.'], notJudged: ['numbers: not judged.'], isProblem }) };
};

test('a run\'s pictures are the audit\'s shots: at pictures/<layout>/, their checks sorted into the audit\'s checks', () => {
  assert.equal(checkOf('cards fit their boxes'), 'layout');
  assert.equal(checkOf('cards keep their size after they land'), 'motion');
  const move = entry({ section: 'moves', file: 'moves/m-end.jpg', title: 'm, end', checks: [driftCheck(new Map([['x', [{ w: 1, h: 1 }, { w: 1, h: 30 }]]]))] });
  const { shots, ends } = shotsOf([run([entry({ deck: 'shunts' }), move], { ended: 'stopped', notes: ['n'] })]);
  assert.deepEqual(shots.map((x) => x.picture), ['pictures/iphone/slides/a.jpg', 'pictures/iphone/moves/m-end.jpg']);
  assert.equal(shots[0]!.deck, 'shunts');
  assert.equal(shots[1]!.checks[0]!.check, 'motion');
  assert.deepEqual(ends, [{ layout: 'iPhone', notes: ['n'], ended: 'stopped' }]);
});

test('a failed check, an issue, a note that means a picture is not to be trusted and a frame that did not end each give a finding; a passing run gives none', () => {
  const bad = entry({ deck: 'shunts', title: 'Shunts 8: x', checks: cardChecks([card(40)]) });
  const issue = entry({ section: 'moves', file: 'moves/m-start.jpg', title: 'm, start', issues: ['the end frame was taken with the page still moving'], link: 'https://x/#m' });
  const { result } = make([run([entry({ deck: 'shunts' }), bad, issue], { notes: ['Shunts 11: still not still after 5 s', 'a harmless note'], ended: 'silent for 5 minutes' })]);
  assert.deepEqual(result.findings.map((f) => f.rule).sort(), ['picture:capture-note', 'picture:cards-fit-their-boxes', 'picture:frame-ended', 'picture:issue']);
  assert.ok(result.findings.every((f) => /^F-[0-9a-f]{6}$/.test(f.id)));
  assert.equal(result.findings.find((f) => f.rule === 'picture:cards-fit-their-boxes')!.severity, 'high');
  assert.equal(result.findings.find((f) => f.rule === 'picture:issue')!.repro, 'open https://x/#m');
  const clean = make([run([entry({ deck: 'shunts' })])]).result;
  assert.equal(clean.findings.length, 0);
  assert.equal(clean.items[0]!.checks.layout, 'pass');
});

test('the same fault found again has the same id, whatever the numbers in it', () => {
  const at = (past: number) => make([run([entry({ deck: 'shunts', title: 'S', checks: cardChecks([card(past)]) })])]).result.findings[0]!.id;
  assert.equal(at(40), at(61));
  assert.notEqual(make([run([entry({ deck: 'ascites', title: 'T', checks: cardChecks([card(40)]) })])]).result.findings[0]!.id, at(40));
});

test('the zip has the audit\'s files; a talk\'s slides are its section, the transitions and the menus their own; the report names the request, the runner and what it could not judge', () => {
  const mv = entry({ section: 'moves', file: 'moves/m-end.jpg', title: 'm, end' }), mn = entry({ section: 'menus', file: 'menus/sheet-help.jpg', title: 'Help sheet' });
  const { result } = make([run([entry({ deck: 'shunts' }), entry({ deck: 'tips-complete', file: 'slides/t.jpg', title: 'T' }), mv, mn])]);
  const files = bundleFiles(result), names = files.map((f) => f.name);
  assert.deepEqual(names.slice(0, 2), ['README-FIRST.md', 'REPORT.md']);
  assert.deepEqual(names.filter((n) => n.startsWith('sections/')), ['sections/01-deck-shunts.md', 'sections/02-deck-tips-complete.md', 'sections/03-pictures-moves.md', 'sections/04-pictures-menus.md']);
  const rep = files.find((f) => f.name === 'REPORT.md')!.text, sec = files.find((f) => f.name === 'sections/03-pictures-moves.md')!.text;
  assert.match(rep, /Request: `feature:junctions`/);
  assert.match(rep, /Runner: .*GPU/);
  assert.match(sec, /^# Frames inside the transitions/);
  assert.match(sec, /picture: `pictures\/iphone\/moves\/m-end\.jpg`/);
  assert.match(files.find((f) => f.name === 'README-FIRST.md')!.text, /numbers: not judged\./);
  assert.match(files.find((f) => f.name === 'README-FIRST.md')!.text, /&req=feature:junctions/);
  const m = JSON.parse(files.find((f) => f.name === 'manifest.json')!.text);
  assert.equal(m.runner, 'gpu');
  assert.deepEqual(m.pictures, result.pictures);
  assert.ok(result.pictures.every((p: string) => p.startsWith('pictures/iphone/')));
});

test('a seed is in the report and the manifest, and the page\'s files are the same text the zip carries', () => {
  const scope = pictureScope('?req=random:6@4471/deck', world, { checks: ['layout', 'pictures'] })!;
  assert.equal(scope.runner, 'gpu');
  const files = unifiedFiles({ scope, build: { commit: 'abc', branch: '' }, startedAt: 't', seconds: 1, device: 'd', shots: [], ends: [], checks: scope.checks, validity: [], isProblem });
  const zip = zipBytes(files.map((f) => ({ name: f.name, text: new TextDecoder().decode(f.data) })), new Date(2026, 10, 28));
  const rep = zipText(zip, 'REPORT.md')!;
  assert.match(rep, /seed 4471, 6 slides|6 slides, seed 4471/);
  assert.match(rep, /random:6@4471\/deck/);
  assert.equal(JSON.parse(zipText(zip, 'manifest.json')!).random.seed, 4471);
  assert.match(zipText(zip, 'README-FIRST.md')!, /Never run a headless browser/);
  const dflt = pictureScope('?stress', world, { checks: ['layout'], slides: ['shunts:2', 'lobule:4'], sizes: ['mac'] })!;
  assert.deepEqual(dflt.slides, ['shunts:2', 'lobule:4']);
  assert.deepEqual(dflt.decks, ['shunts', 'lobule']);
  assert.deepEqual(dflt.sizes, ['mac']);
  assert.equal(pictureScope('?req=deck:nope', world, { checks: ['layout'] }), null);
});
