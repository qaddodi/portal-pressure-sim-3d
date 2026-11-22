import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { railOf } from '../src/ui/cards/proc-rail.ts';

// Mohammad, 22 Nov: a procedure's steps (a wrapped paragraph of numbered words) and its Play button (a row of its own) were "wasting so much space" on the teaching card.
// He picked mock A, the one-row step rail, "for all": ONE row for every procedure of every deck, from the one component, ui/cards/ProcRow.tsx.
const steps = ['Catheter in', 'Needle across', 'Tract dilated', 'Stent in'].map((t, i) => [`s${i}`, t, `caption ${i}`]);
const base = { steps, at: -1, ring: -1, phase: 'wait' as const, why: '', name: 'TIPS' };

test('before Play: the procedure and its step count, no ring, the play button', () => {
  const r = railOf(base);
  assert.deepEqual([r.count, r.name, r.sub, r.action, r.icon, r.disabled, r.ringOn, r.fill], ['', 'TIPS', '4 steps', 'Play TIPS', 'play', false, false, 0]);
  assert.deepEqual(r.dots, ['todo', 'todo', 'todo', 'todo']);
});

test('playing: "2/4" and the step\'s name, the fill on the step the figure is on, the ring on the one Next reached', () => {
  const r = railOf({ ...base, phase: 'play', at: 1, ring: 2 });
  assert.equal(r.count, '3/4'); assert.equal(r.name, 'Tract dilated'); assert.equal(r.sub, '');
  assert.equal(r.fill, 1 / 3); assert.equal(r.ring, 2 / 3); assert.equal(r.ringOn, true);
  assert.deepEqual(r.dots, ['done', 'on', 'todo', 'todo']);
  assert.equal(r.action, 'Next step');
});

test('the catheter on its way in (at -1, ring 0) already shows step 1', () => {
  const r = railOf({ ...base, phase: 'play', at: -1, ring: 0 });
  assert.equal(r.count, '1/4'); assert.equal(r.name, 'Catheter in'); assert.equal(r.fill, 0); assert.equal(r.ring, 0);
});

test('on the last step Next moves on, so the button rests; a ring past the end holds the last dot', () => {
  assert.equal(railOf({ ...base, phase: 'play', at: 3, ring: 3 }).disabled, true);
  const past = railOf({ ...base, phase: 'wait', at: 3, ring: 4 });
  assert.equal(past.ring, 1); assert.equal(past.count, '4/4');
});

test('done: every dot played, Replay', () => {
  const r = railOf({ ...base, phase: 'done', at: 3, ring: 3 });
  assert.deepEqual(r.dots, ['done', 'done', 'done', 'done']); assert.equal(r.action, 'Replay TIPS'); assert.equal(r.icon, 'replay'); assert.equal(r.fill, 1);
});

test('a procedure this patient cannot have: dimmed with why, the button off', () => {
  const r = railOf({ ...base, phase: 'idle', why: 'No TIPS with a bilirubin this high' });
  assert.equal(r.disabled, true); assert.equal(r.ringOn, false); assert.equal(r.name, 'TIPS');
});

test('one step: no division by zero, a single dot', () => {
  const r = railOf({ ...base, steps: [steps[0]!], phase: 'play', at: 0, ring: 0 });
  assert.equal(r.fill, 0); assert.equal(r.ring, 0); assert.equal(r.sub, ''); assert.equal(r.count, '1/1');
});

test('the card has one row and no paragraph or button row left (the old .pz-procs / .pz-abb in ProcRow), and it moves by transform only', () => {
  const src = readFileSync('src/ui/cards/ProcRow.tsx', 'utf8');
  assert.doesNotMatch(src, /pz-procs|pz-abb|pz-ab"/);
  assert.match(src, /railOf\(st\)/);
  assert.match(src, /transform: `scaleX/); assert.match(src, /transform: `translateX/);
  const css = readFileSync('src/ui/css2d/app-04-presenter.css', 'utf8');
  assert.doesNotMatch(css, /\.pz-procs/);
  for (const sel of ['.pz-prail-fill {', '.pz-prail-at {']) {
    const at = css.indexOf(`\n${sel}`), rule = css.slice(at, css.indexOf('}', at));
    assert.match(rule, /transition: transform var\(--d-surface\)/, `${sel} glides`);
  }
  assert.match(css, /\.pz-prail-tx \{ animation: pz-prail-in/, 'the name fades in, never pops');
  // every deck's procedure comes through this one row
  assert.match(readFileSync('src/ui/cards/TeachingCard.tsx', 'utf8'), /<ProcRow slide=\{slide\} deck=\{deck\} \/>/);
});
