// The stress capture's written report (src/ui/debug/stress/report.ts): the checks it makes of a card record and of a transition, and the files it writes. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardChecks, driftCheck, sectionMd, reportMd, manifestJson, PAST_LIMIT, SIZE_DRIFT, failed, isProblem, type Entry, type LayoutRun } from '../src/ui/debug/stress/report.ts';
import { SECTIONS } from '../src/ui/debug/stress/plan.ts';

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

test('REPORT.md leads with the counts and the issues, worst first, and says what it cannot see', () => {
  const good = entry({}), bad = entry({ file: 'slides/b.jpg', title: 'B', checks: cardChecks([card(40)]) }), worse = entry({ file: 'moves/c-end.jpg', section: 'moves', title: 'C', checks: [...cardChecks([card(40)]), driftCheck(new Map([['x', [{ w: 1, h: 1 }, { w: 1, h: 30 }]]]))], issues: ['the end frame was taken with the page still moving'] });
  const run: LayoutRun = { layout: 'iphone', label: 'iPhone', entries: [good, bad, worse], notes: ['Shunts 11: still not still after 5 s'], secs: 61.4 };
  const md = reportMd([run], { build: 'abc1234', at: '2026-11-27T20:00:00Z', stopped: false });
  assert.match(md, /^# Stress capture report/);
  assert.match(md, /3 pictures: 1 clean, 2 with a failed check or an issue/);
  assert.ok(md.indexOf('iPhone / C') < md.indexOf('iPhone / B'), 'the picture with more failures comes first');
  assert.match(md, /What this cannot see/);
  assert.match(md, /Build: abc1234/);
  assert.equal(failed(good).length, 0);
  for (const s of SECTIONS) assert.match(md, new RegExp(s.file));
});

test('each section file lists every picture of that section with its state, its checks and its issues', () => {
  const run: LayoutRun = { layout: 'mac', label: 'Mac', entries: [entry({ section: 'slides', link: 'https://x/#s' }), entry({ section: 'moves', file: 'moves/m-start.jpg', title: 'm, start', issues: ['an issue'] })], notes: [], secs: 1 };
  const slides = sectionMd('slides', [run]), moves = sectionMd('moves', [run]);
  assert.match(slides, /1 pictures, 0 with a failed check/); assert.match(slides, /state: talk a, slide 1/); assert.match(slides, /reopen: https:\/\/x\/#s/); assert.match(slides, /pass: cards fit their boxes/);
  assert.match(moves, /ISSUE: an issue/); assert.match(moves, /\[FAIL\]/);
  const m = JSON.parse(manifestJson([run], { build: 'b', at: 't', stopped: true })) as { stopped: boolean; layouts: { entries: unknown[] }[] };
  assert.equal(m.stopped, true); assert.equal(m.layouts[0]!.entries.length, 2);
});
