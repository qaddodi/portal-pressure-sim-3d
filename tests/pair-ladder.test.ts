import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pairSteps, stepVars, dataFitOf, DK } from '../src/ui/cards/pair-ladder.ts';
import { WIDE, titleFloorK, dkFloorOf } from '../src/ui/layout/rules2d.ts';

// A stacked pair too tall for the screen takes 2D's steps (presenter-ladders.js): the title first, then the data card's blocks, the title ladder run again under each (shunts 3, 4 and 6,
// carvedilol 2 at 1024 x 768 stood 24 to 65 px off the foot of the screen: 3D had only more pages of words and stopped after one per sentence).
test('the steps run in 2D\'s order: the title at the full blocks, then at each smaller block step', () => {
  const base = { titlePx: 35.5, bodyPx: 17.75, labelPx: 14 };
  const f = titleFloorK(35.5, 17.75), a = Math.max(WIDE.title, f), dkMin = dkFloorOf(14);
  const s = pairSteps(base);
  assert.deepEqual(s[0], { tk: 1, dk: 1 }, 'the first is no step');
  assert.deepEqual(s[1], { tk: a, dk: 1 }, 'the title steps down first (WIDE.title = 0.8, not under its floor)');
  const dks = [...new Set(s.map((x) => x.dk))];
  assert.deepEqual(dks, [1, ...DK.filter((d) => d >= dkMin - 1e-6)]);
  // dk is the outer loop: the title steps come back, in the same order, under each block step
  const tks = s.filter((x) => x.dk === 1).map((x) => x.tk);
  for (const d of dks) assert.deepEqual(s.filter((x) => x.dk === d).map((x) => x.tk), tks);
  assert.ok(Math.min(...s.map((x) => x.tk)) >= WIDE.tight - 1e-9, 'the title never goes under WIDE.tight');
  assert.ok(Math.min(...s.map((x) => x.tk)) >= Math.min(1, 1.4 * 17.75 / 35.5) - 1e-9 || Math.min(...s.map((x) => x.tk)) === WIDE.tight, 'a title stays clearly a title');
});

test('a card whose tile names are already 12 px has no block steps (the blocks never go under 12 px)', () => {
  const s = pairSteps({ titlePx: 35.5, bodyPx: 17.75, labelPx: 12 });
  assert.ok(s.every((x) => x.dk === 1));
  assert.deepEqual(pairSteps({ titlePx: 0, bodyPx: 0, labelPx: 0 }).every((x) => x.dk === 1), true);
});

test('a title already close to the words is not made smaller; step 0 writes no properties', () => {
  assert.deepEqual(pairSteps({ titlePx: 20, bodyPx: 17.75, labelPx: 0 }), [{ tk: 1, dk: 1 }]);
  assert.equal(stepVars({ tk: 1, dk: 1 }), undefined);
  assert.deepEqual(stepVars({ tk: 0.8, dk: 0.9 }), { '--pz-tk': 0.8, '--pz-dk': 0.9 });
});

test('the card layer takes the steps before the words page, and writes them on both cards', () => {
  const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
  const layer = src('ui/cards/CardLayer.tsx'), frame = src('ui/cards/CardFrame.tsx');
  assert.match(layer, /pairSteps\(ladBase\[pagesKey\]\)/);
  assert.match(layer, /const tooTall = [^\n]*&& !ladBusy/, 'the words page only when the ladder is spent');
  assert.match(layer, /vars=\{\(slot === 'data' \? dataVars : ladVars\) as never\} remeasure=\{sig\}/, 'both cards get the step, and measure again for it');
  assert.match(layer, /const growing = ladBusy \|\|/, 'the cards wait for the ladder, as for a page');
  assert.match(layer, /ladOn = pair && !sideways && !stacked0/, 'a laptop or tablet on its side only: the phone has its own steps');
  assert.match(frame, /style=\{\{ \.\.\.vars, width: rect\.w/);
  assert.match(frame, /\}, \[entry\.key, Math\.round\(rect\.w\), remeasure\]\);/, 'a step that changes no height is still judged afresh');
  assert.match(layer, /ladBusy, fitBusy, lad, cands\.length,/, 'the effect runs again when the ladder\'s sizes arrive, or it never takes its first step (the first pass only reads them)');
});

test('the data card\'s own fit is the last step: to its room, never under 12 px', () => {
  assert.equal(dataFitOf(400, 500, 14), 1, 'it fits: no fit');
  assert.equal(dataFitOf(0, 500, 14), 1);
  assert.equal(dataFitOf(462, 383, 16), Math.max(12 / 16, (383 / 462) * 0.985), 'zoomed to its room');
  assert.equal(dataFitOf(900, 383, 16), 0.75, 'the 12 px floor holds');
  assert.equal(dataFitOf(900, 383, 12), 0.5, 'lettering already at 12 px: 2D\'s last resort, half (dataFloor)');
  assert.equal(dataFitOf(462, 437, 12), (437 / 462) * 0.985, 'Shunts 4 at 1024 x 768: the pair\'s 25 px come off the data card');
  assert.equal(dataFitOf(900, 383, 8), 0.5);
  assert.equal(dataFitOf(900, 383, Infinity), 1);
  const layer = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
  assert.match(layer, /dataFitOf\(dataHit\?\.h \?\? 0, plan\.maxH\.data, minPx\)/);
  assert.match(layer, /vars=\{\(slot === 'data' \? dataVars : ladVars\) as never\}/, 'the fit is the data card\'s alone: the words never zoom');
  assert.match(layer, /!ladBusy && !fitBusy;/, 'the words page only when the fit is spent too');
});
