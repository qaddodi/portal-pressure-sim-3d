// ?audit's case pass (src/ui/debug/audit/capture-cases.ts): every model patient's case played with Play the case and every stop photographed, in the same zip format as the slide audit.
// Node only: the parts that need no page (which cases an address asks for, the names, the checks on a stop's screen, the manifest) run for real; the page part is pinned by what it must reuse
// (one settle, one picture, one door for both passes) so it cannot grow a parallel pipeline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HISTORIES } from '../src/ui/histories/index.generated.ts';
import { parseCases, whatOf, caseFolder, stopBase, pulledBase, lookBase, stopIssues, totalsOf, picturesOf, casesReadme, manifestJson, joinManifests, type CaseRec, type Manifest } from '../src/ui/debug/audit/capture-cases-plan.ts';
import { captureSrc } from '../src/ui/debug/audit/capture-outer.ts';
import { FLAGS } from '../src/ui/debug/flags.ts';

const src = (p: string): string => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const IDS = HISTORIES.map((h) => h.id);

test('the address names the cases: all, a list, or none; names that are not model patients never become "every case"', () => {
  assert.equal(parseCases(null, IDS), null);
  assert.equal(parseCases('', IDS), null);
  assert.deepEqual(parseCases('all', IDS), IDS);
  assert.deepEqual(parseCases('1', IDS), IDS);
  const two = [IDS[3]!, IDS[1]!];
  assert.deepEqual(parseCases(two.join(','), IDS), [IDS[1], IDS[3]], 'a list comes back in the menu\'s order');
  assert.deepEqual(parseCases(`nope,${IDS[0]}`, IDS), [IDS[0]], 'an unknown name is dropped');
  assert.equal(parseCases('nope,also-nope', IDS), null);
});

test('cases alone unless the address adds the slides; no cases is the slide audit as it always was', () => {
  const no = { slides: null, pick: false, decks: false };
  assert.equal(whatOf({ cases: false, ...no }), 'slides');
  assert.equal(whatOf({ cases: false, slides: '1', pick: false, decks: false }), 'slides', 'slides=1 with no cases is just the slides');
  assert.equal(whatOf({ cases: true, ...no }), 'cases');
  assert.equal(whatOf({ cases: true, slides: '1', pick: false, decks: false }), 'both');
  assert.equal(whatOf({ cases: true, slides: null, pick: true, decks: false }), 'both', 'naming slides asks for them');
  assert.equal(whatOf({ cases: true, slides: null, pick: false, decks: true }), 'both');
});

test('every model patient gets its own folder, numbered as the menu numbers them, whichever cases a run takes', () => {
  assert.ok(IDS.length >= 12, 'the twelve model patients');
  const folders = IDS.map((id) => caseFolder(IDS, id));
  assert.equal(new Set(folders).size, IDS.length);
  folders.forEach((f, i) => assert.equal(f, `${String(i + 1).padStart(2, '0')}-${IDS[i]}`));
  assert.equal(caseFolder(IDS, IDS[5]!), folders[5], 'the same folder when only some are taken');
});

test('picture names read in order and stay apart: the stop, the pulled-up sheet and each look', () => {
  const base = stopBase(3, 70, 'Banding session!');
  assert.equal(base, '03-day070-banding-session');
  assert.equal(pulledBase(base), '03-day070-banding-session-pulled-up');
  assert.equal(lookBase(base, 1, 'Liver stiffness'), '03-day070-banding-session-look02-liver-stiffness');
  assert.equal(stopBase(12, 1234, 'x'), '12-day1234-x');
  assert.equal(stopBase(1, 0, '???'), '01-day000-slide', 'a title with no letters still names a file');
  const names = new Set([stopBase(1, 5, 'Same'), stopBase(2, 5, 'Same')]);
  assert.equal(names.size, 2, 'two stops with one title are two pictures');
});

test('a stop\'s screen is held to three things: the card is up, whole on the screen, and clear of the case bar', () => {
  const vp = { w: 1440, h: 900 };
  const bar = { left: 300, top: 808, right: 1400, bottom: 900 };
  assert.deepEqual(stopIssues({ left: 12, top: 80, right: 412, bottom: 700 }, bar, vp), []);
  assert.deepEqual(stopIssues(null, bar, vp), ['no stop card is up']);
  assert.deepEqual(stopIssues(null, null, vp), ['the case bar is not up', 'no stop card is up']);
  assert.match(stopIssues({ left: 12, top: 80, right: 412, bottom: 960 }, bar, vp).join('|'), /not whole on the screen \(it runs 60 px past an edge\)/);
  assert.match(stopIssues({ left: 12, top: 80, right: 412, bottom: 840 }, bar, vp).join('|'), /stands 32 px over the case bar/);
  assert.deepEqual(stopIssues({ left: 12, top: 80, right: 290, bottom: 880 }, bar, vp), [], 'beside the bar, not over it');
});

function caseRec(over: Partial<CaseRec> = {}): CaseRec {
  const shot = { view: 'anatomic' as const, cam: 'fit' };
  return {
    id: 'hist-a', name: 'A', folder: '01-hist-a', preset: 'p', group: 'g', sheet: 'cases/01-hist-a/00-contact-sheet.png', notes: [],
    stops: [
      { n: 1, day: 0, title: 'Start', kind: 'Start', type: 'start', key: 'k0', shot, arrived: 'first', picture: 'cases/01-hist-a/01-day000-start.jpg', pulled: null, looks: [], issues: [] },
      {
        n: 2, day: 18, title: 'Bleed', kind: 'Emergency', type: 'key', key: 'k1', shot, arrived: 'played', picture: 'cases/01-hist-a/02-day018-bleed.jpg', pulled: 'cases/01-hist-a/02-day018-bleed-pulled-up.jpg',
        looks: [{ tool: 'circuit', label: 'Circuit', file: 'cases/01-hist-a/02-day018-bleed-look01-circuit.jpg', opened: true }, { tool: 'hvpg', label: 'HVPG', file: null, opened: false }], issues: ['no stop card is up'],
      },
    ],
    ...over,
  };
}
function manifest(cases: CaseRec[], over: Partial<Manifest> = {}): Manifest {
  return { kind: 'portal-pressure-cases', version: 1, build: 'abc123', made: '2026-11-26 12:00:00', screen: '1440x900', ratio: 2, speed: 60, walk: 'play', looks: true, stopped: false, cases, totals: totalsOf(cases), notes: [], ...over };
}

test('the manifest counts what was taken and what was found', () => {
  const c = caseRec();
  assert.equal(picturesOf(c).length, 4);
  assert.deepEqual(totalsOf([c]), { cases: 1, stops: 2, pictures: 4, looks: 1, issues: 2 }, 'a look that did not open counts as a finding, with the stop\'s own');
  assert.deepEqual(totalsOf([]), { cases: 0, stops: 0, pictures: 0, looks: 0, issues: 0 });
  const m = manifest([c]);
  assert.deepEqual(JSON.parse(manifestJson(m)), JSON.parse(JSON.stringify(m)), 'the JSON is the manifest');
});

test('the README says what is in the folder and lists every finding with its case and stop', () => {
  const text = casesReadme(manifest([caseRec()], { notes: ['A: something to know'] }));
  assert.match(text, /1 case, 2 stops, 4 pictures, 1 of them look-closer shots/);
  assert.match(text, /FOUND \(2\):/);
  assert.match(text, /A, stop 2 \(Day 18\): no stop card is up/);
  assert.match(text, /A, stop 2 \(Day 18\): "HVPG" did not open hvpg/);
  assert.match(text, /NOTES:\n {2}A: something to know/);
  assert.match(casesReadme(manifest([caseRec({ stops: [] })])), /Found: nothing/);
  assert.match(casesReadme(manifest([], { stopped: true })), /\(stopped early\)/);
});

test('every size\'s manifest is joined under its own id, with the totals of all', () => {
  const one = manifest([caseRec()]), two = manifest([caseRec({ id: 'hist-b', folder: '02-hist-b' })]);
  const j = joinManifests({ iphone: one, mac: two });
  assert.deepEqual(Object.keys(j.sizes), ['iphone', 'mac']);
  assert.equal(j.totals.cases, 2);
  assert.equal(j.totals.pictures, 8);
});

test('the capture frame\'s address carries what to take, and cases alone carry no slide pick', () => {
  const o = { speed: 20, pick: ['a:1'], decks: ['a'] };
  assert.equal(captureSrc('/x/', '?audit=frames&sizes=mac', o), '/x/?audit=capture&speed=20&pick=a:1&decks=a', 'the slide capture\'s address is unchanged');
  assert.equal(captureSrc('/x/', '?audit=frames&sizes=mac', { ...o, what: 'cases' }), '/x/?audit=capture&speed=20&cases=all');
  assert.equal(captureSrc('/x/', '?audit=frames&cases=hist-a,hist-b&slides=1', { ...o, what: 'cases', cases: 'hist-a,hist-b' }), '/x/?audit=capture&speed=20&cases=hist-a,hist-b');
  assert.equal(captureSrc('/x/', '?audit=frames', { ...o, what: 'both' }), '/x/?audit=capture&speed=20&pick=a:1&decks=a&cases=all&slides=1');
  assert.equal(captureSrc('/x/', '?audit=frames', { ...o, what: 'cases', cases: 'x;y' }), '/x/?audit=capture&speed=20&cases=all', 'a value that is not a list of names is not passed on');
  assert.equal(captureSrc('/x/', '?audit=frames&looks=0&look=dark', { ...o, what: 'cases' }), '/x/?audit=capture&speed=20&cases=all&looks=0&look=dark', 'the rest of the address (looks, the look) is kept');
});

test('the case pass reuses the slide pass\'s pipeline: one settle, one picture, one clock, one door, one zip', () => {
  const cases = src('src/ui/debug/audit/capture-cases.ts'), all = src('src/ui/debug/audit/capture-all.ts'), settle = src('src/ui/debug/audit/capture-settle.ts');
  assert.match(cases, /from '\.\/capture-settle\.ts'/);
  assert.match(cases, /from '\.\/capture-shot\.ts'/);
  assert.match(cases, /stillPage\(/); assert.match(cases, /drawShot\(/); assert.match(cases, /startCaptureClock\(/); assert.match(cases, /zipBlob\(/); assert.match(cases, /sheet\(/);
  // the pass does not carry its own copies of what the slide pass waits on or draws with
  assert.doesNotMatch(cases, /function stillPage|function arriving|drawScreen\(|document\.getAnimations/);
  assert.doesNotMatch(all, /function stillPage|function arriving/);
  assert.match(all, /from '\.\/capture-settle\.ts'/); assert.match(all, /drawShot\(/); assert.match(all, /startCaptureClock\(/);
  assert.match(settle, /export async function stillPage/); assert.match(settle, /kit\.cardUp\(\)/, 'what "a card is up" means is the pass\'s own, the rest of "still" is shared');
  // the case is played with the case's own Continue, and every stop waits for its own card
  assert.match(cases, /continueCase\(\)/); assert.match(cases, /goStop\(/, 'a Continue that does not land is gone to, and said');
  assert.match(cases, /stop\.look/, 'Look closer here is pressed');
  // both doors start the same run
  for (const f of ['src/ui/debug/audit/capture-child.ts', 'src/ui/debug/audit/page.ts']) assert.match(src(f), /runCapture\(/, f);
  assert.match(src('src/ui/debug/audit/capture-run.ts'), /captureCases\(/);
});

test('a case that is playing is in what a settled page is read from, so a stop is never taken while its card or bar still eases', () => {
  const still = src('src/ui/debug/audit/capture-still.ts');
  assert.match(still, /READING_ROOTS = .*\.case-layer/);
});

test('the flags are documented: cases, slides and looks', () => {
  for (const id of ['cases', 'slides', 'looks']) assert.ok(FLAGS.some((f) => f.id === id), id);
  assert.match(src('docs/debug.md'), /\| `\?cases` \|/);
});

test('an address with a capture asks for the capture, not the self-test: the frames start one or the other, never both', () => {
  const outer = src('src/ui/debug/audit/outer.ts');
  assert.match(outer, /flagValue\('sizes'\) !== null && flagValue\('capture'\) !== '1'/);
});
