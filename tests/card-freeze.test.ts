// Plan 43 Part D: a card's layout is frozen while it leaves and settled before it shows. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { frameProps, wordsClasses, type FrameLive } from '../src/ui/cards/frame-props.ts';

const rd = (p: string) => readFileSync(p, 'utf8');
const a: FrameLive = { vars: { '--pz-tk': 0.8 } as never, visual: 'table', sig: 'old|1' };
const b: FrameLive = { vars: undefined, visual: 'ladders', sig: 'new|2' };

test('a card leaving draws with the values it was current with, whatever the view does after', () => {
  assert.equal(frameProps(true, a, undefined), a, 'the current card takes the live values');
  assert.equal(frameProps(false, b, a), a, 'a leaving card keeps its own');
  assert.equal(frameProps(false, b, undefined), b, 'a card with no snapshot yet takes the live ones');
  for (let i = 0; i < 20; i++) assert.equal(frameProps(false, { ...b, sig: `s${i}` }, a).sig, 'old|1');
});

test('the six ladders\' fill and the name tab come from the visual the card was let in with', () => {
  assert.equal(wordsClasses('visual', 'ladders', false), 'fill');
  assert.equal(wordsClasses('visual', 'table', true), 'tabbed');
  assert.equal(wordsClasses('check', 'ladders', true), 'tabbed', 'a quick check has the tab and never the fill');
  assert.equal(wordsClasses('teach', 'ladders', true), undefined);
});

test('CardLayer hands every entry its own snapshot and no raw live values', () => {
  const cl = rd('src/ui/cards/CardLayer.tsx');
  assert.match(cl, /frameProps\(isCurrent, live, frameSnap\.current\[e\.key\]\)/);
  assert.match(cl, /vars=\{fp\.vars as never\} remeasure=\{fp\.sig\}/);
  assert.match(cl, /visual=\{fp\.visual\}/);
  assert.doesNotMatch(cl, /remeasure=\{sig\}/, 'a leaving card is never told to measure for the new slide');
  assert.doesNotMatch(cl, /visual=\{view\.slide\?\.visual\}/);
});

test('CardFrame: a leaving card never measures; a card already let in is never re-fitted in place by an observer', () => {
  const cf = rd('src/ui/cards/CardFrame.tsx');
  assert.match(cf, /const report = \(full = true, fresh = false\) => \{\s*if \(now\.current\.out\) return;/);
  assert.match(cf, /observeThenFit\(\[el\], \(\) => report\(!now\.current\.live\)\)/);
  assert.match(cf, /if \(full\) markLong\(/, 'the title\'s class is judged on a full pass only');
  assert.match(cf, /if \(full\) card\.style\.removeProperty\('--pz-fit'\)/, 'a pass that is not full continues from the fit it has, it never resets it');
  assert.match(cf, /pz-chart-built/, 'a chart that has drawn tells the card');
});

test('go waits for every chart to have drawn once (the 320 ms give-up stays the net)', () => {
  const cl = rd('src/ui/cards/CardLayer.tsx');
  assert.match(cl, /\.open \?\? 0\) === 0/);
  assert.match(cl, /late === pagesKey/);
  assert.match(rd('src/ui/charts/Chart.tsx'), /setAttribute\('data-built'/);
  assert.match(rd('src/ui/cards/card-want.ts'), /\[data-chart\]:not\(\[data-built\]\)/);
});

test('a chart takes no room until the words are measured (the data card\'s cap is the plan\'s only once it knows the words)', () => {
  assert.match(rd('src/ui/cards/CardLayer.tsx'), /!\(wordsHit && wordsHit\.h > 0\) \? 0 : plan\.maxH\.data/);
});

test('the six ladders have one gap between boxes', () => {
  const css = rd('src/ui/css3d-over-2d.css');
  assert.match(css, /\.pz-panel\.fill \{ --pz-grid-gap: clamp\(8px, calc\(1\.2 \* var\(--pzh\)\), 16px\); gap: var\(--pz-grid-gap\); \}/);
  assert.match(css, /\.pz-panel\.fill \.pz-grid \{ gap: var\(--pz-grid-gap\); \}/);
});
