// Capture 36b7deac (Sites and causes): the five chips of slide 10 gave the same chart, and the Normal-heart toggle of slide 9 was never pressed. Two roots, both in how the capture meets a control:
// (1) a press finishes after its click (the engine works the patient out, the charts read it, the figure eases), and the capture's "is the page still?" check did not know it was unfinished;
// (2) a stop's first picture is not always the one that holds the controls (a case card comes first), and choices were looked for on a stop's first picture only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pressBegin, pressWaiting, pressWhat, pressHeld } from '../src/ui/talk/press-pending.ts';

test('a press is waiting from its click until its result is on the way to the screen, however it ends', async () => {
  assert.equal(pressWaiting(), false);
  const done = pressBegin('chip');
  assert.equal(pressWaiting(), true);
  assert.match(pressWhat(), /chip/);
  done(); done();   // (twice is safe)
  assert.equal(pressWaiting(), false);
  await assert.rejects(pressHeld('bad', async () => { assert.equal(pressWaiting(), true); throw new Error('x'); }));
  assert.equal(pressWaiting(), false, 'a failed press is not waiting for ever');
  const a = pressBegin('a'), b = pressBegin('b');
  a(); assert.equal(pressWaiting(), true, 'two presses: one done is not both done');
  b(); assert.equal(pressWaiting(), false);
});

test('every control that finishes after its click holds a press token: the chips, the morph they start and the slider', () => {
  const run = readFileSync('src/ui/talk/controls-run.ts', 'utf8');
  assert.match(run, /export const pickCompare = .*pressHeld\(/, 'a compare button holds its token until its state is worked out');
  assert.match(run, /function morph\(snap: unknown\): void \{[\s\S]*?pressBegin\(/, 'the morph holds it until the engine has answered with frames');
  assert.match(run, /export function dragWhatIf[\s\S]*?pressBegin\('the slider'\)/, 'the slider holds it until the last move\'s state is in');
  assert.equal((run.match(/type: 'morph'/g) ?? []).length, 1, 'one place sends a morph, and it holds the token');
});

test('the capture waits on every pending press before any picture (a slide\'s or a choice\'s), and calls a picture taken without it FAILED', () => {
  const all = readFileSync('src/ui/debug/audit/capture-all.ts', 'utf8');
  assert.match(all, /if \(pressWaiting\(\)\) return `a control's press has not reached the slide yet/);
  assert.match(all, /const STATE_WAIT = \/[^\n]*press has not reached the slide/);
  // a pressed choice waits the same way as a slide does
  assert.match(all, /const after = await stillAndState\(false\)/);
  assert.match(all, /CAPTURE FAILED, the picture after pressing/);
  assert.doesNotMatch(all, /await stillPage\(real, false, !!ui\.skip\); await showLanded\(\);/, 'no choice press settles with the bare still check');
});

test('choices are looked for on every step of a stop, and each group is pressed once (a slide with a case card shows its chips and toggles on the step after the case)', () => {
  const all = readFileSync('src/ui/debug/audit/capture-all.ts', 'utf8');
  assert.match(all, /const choicesDone = new Set<string>\(\)/);
  assert.match(all, /if \(!list0\.length \|\| choicesDone\.has\(sig\)\) return;/);
  assert.match(all, /if \(ok\) await choiceShots\(views\[0\]\)/);
  assert.match(all, /if \(ok2\) await choiceShots\(views\[1\]!\)/);
  assert.doesNotMatch(all, /if \(ok && fresh\) await choiceShots/, 'not only on the first picture of a stop');
});
