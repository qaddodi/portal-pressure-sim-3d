// The sinusoid's captions are 2D's own (sinusoid-view.js caption/pageRun, label-captions.js leadMarks): the classes the 2D stylesheet sets small capitals and sentence case by, the number/unit split
// of a reading, and the ringed dot where a leader lands. Pure: no DOM, no GPU. Mohammad's Mac play-test (3D against 2D, Light and Dark): the cells' names were in sentence case, every reading was
// one bold size ("100% open", "1,320 mL/day · Protein 87%"), and the dots were bare.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { readings } from '../src/scene/sinusoid/captions.ts';
import { SENTENCE_KEYS, dotCss, regionClass, regionTree, treeKey } from '../src/scene/sinusoid/region.ts';
import { LEAD_LOOK } from '../src/scene/sinusoid/lead-look.copied.ts';
import type { NameKey } from '../src/scene/sinusoid/names.ts';
import { pinned2D } from './two-d-pin.ts';

const KEYS: NameKey[] = ['in', 'out', 'sin', 'fen', 'hsc', 'disse', 'lymph', 'hep', 'kup', 'bc'];
const css = readFileSync(new URL('../src/ui/styles/app-03-layouts.css', import.meta.url), 'utf8');

test('each caption wears 2D\'s class: the ends as the Sinusoid\'s own with sv-end, every other sv-region-<key>', () => {
  assert.equal(regionClass('in'), 'sv-region sv-region-sin sv-end');
  assert.equal(regionClass('out'), 'sv-region sv-region-sin sv-end');
  for (const k of KEYS.filter((k) => k !== 'in' && k !== 'out')) assert.equal(regionClass(k), `sv-region sv-region-${k}`);
});

test('the stylesheet sets the case: the cells\' and bands\' names are capitals, the readings\' names sentence case (the classes it lists)', () => {
  // the base rule is uppercase, spaced, bold; the readings' names are the one :is(...) rule that turns that off
  assert.match(css, /\.sv-region \{[^}]*text-transform: uppercase/);
  const m = /\.sv-region:is\(([^)]*)\) \{ text-transform: none;/.exec(css);
  assert.ok(m, 'the sentence-case rule is there');
  const listed = m![1]!.split(',').map((x) => x.trim().replace('.sv-region-', ''));
  const sentence = (k: NameKey) => regionClass(k).split(' ').some((c) => listed.includes(c.replace('sv-region-', '')));
  for (const k of ['in', 'out', 'sin', 'fen', 'lymph'] as NameKey[]) assert.ok(sentence(k), `${k} is sentence case`);
  for (const k of ['hsc', 'kup', 'hep', 'disse', 'bc'] as NameKey[]) assert.ok(!sentence(k), `${k} is small capitals`);
  assert.deepEqual([...SENTENCE_KEYS].sort(), KEYS.filter(sentence).sort());
});

test('a reading is a bold figure and a small unit: "100%" + " open", "1,320" + " mL/day · Protein 87%", the pressures the figure alone', () => {
  const t = readings({ P1: 7.6, P2: 8.0, P3: 5.0, lymph: 1320 / 86400 * 1000 / 1000, lyProt: 0.87 }, 1);
  const fen = regionTree('Fenestrae', t.fen);
  assert.deepEqual(fen, [{ tag: 'span', kids: ['Fenestrae'] }, { tag: 'span', cls: 'v', kids: [{ tag: 'b', kids: ['100%'] }, ' open'] }]);
  const lym = regionTree('Lymph', '1,320~mL/day · Protein 87%');
  assert.deepEqual(lym[1], { tag: 'span', cls: 'v', kids: [{ tag: 'b', kids: ['1,320'] }, ' mL/day · Protein 87%'] }, 'one line on a wide screen: the figure bold, the rest the unit');
  assert.equal(lym.length, 2);
  // a tall screen splits at the dot: the protein is the second reading (2D: `.sv-region-lymph .v + .v b` sets it quiet)
  const tall = regionTree('Lymph', '1,320~mL/day · Protein 87%');
  assert.equal(tall.length, 3);
  assert.deepEqual(tall[2], { tag: 'span', cls: 'v', kids: [{ tag: 'b', kids: ['Protein 87%'] }] });
  for (const [name, v, want] of [['Portal venule', t.inValue, '7.6'], ['Sinusoid', t.sin, '8.0'], ['Central vein', t.outValue, '5.0']] as const) {
    assert.deepEqual(regionTree(name, v)[1], { tag: 'span', cls: 'v', kids: [{ tag: 'b', kids: [want] }] }, `${name}: the figure alone`);
  }
  assert.equal(treeKey(fen), treeKey(regionTree('Fenestrae', t.fen)));
  assert.notEqual(treeKey(fen), treeKey(regionTree('Fenestrae', '99%~open')));
  // a tapped name takes one more line, in the unit's type
  assert.deepEqual(regionTree('Kupffer cell', '', 'resident macrophage')[1], { tag: 'span', cls: 'sv-note', kids: ['resident macrophage'] });
  assert.equal(regionTree('Kupffer cell', '').length, 1, 'a name with no reading is its name alone');
});

test('the 2D stylesheet gives the figure large and bold and the unit small, per caption (the rules the split relies on)', () => {
  assert.match(css, /\.sv-region\.sv-region-sin \.v b \{ font-size: calc\(var\(--t-read\)[^}]*font-weight: 700/);
  assert.match(css, /\.sv-region:is\(\.sv-region-fen, \.sv-region-lymph\) \.v b \{ font-size: calc\(16px[^}]*font-weight: 700/);
  assert.match(css, /\.sv-region:is\(\.sv-region-fen, \.sv-region-lymph\) \.v \{ font-size: calc\(var\(--t-cap\)[^}]*font-weight: 500/);
});

test('the leader\'s dot is 2D\'s: radius 2.4 with a 1.3 ring on a halo of radius 5, in the stage\'s paper and the text-2 ring', () => {
  assert.deepEqual({ ...LEAD_LOOK }, { lineWidth: 1, dotR: 2.4, ringWidth: 1.3, haloR: 5 });
  const d = dotCss();
  assert.ok(Math.abs(d.size - 6.1) < 1e-9, 'the box is the dot and its centred ring: 2 x 2.4 + 1.3');
  assert.equal(d.ring, 1.3);
  assert.ok(Math.abs(d.size / 2 + d.halo - 5) < 1e-9, 'the halo reaches out to radius 5');
  const names = readFileSync(new URL('../src/scene/sinusoid/names.css', import.meta.url), 'utf8');
  assert.match(names, /border: var\(--sv-dot-w\) solid var\(--text-2\)/);
  assert.match(names, /box-shadow: 0 0 0 var\(--sv-dot-halo\) var\(--lb-ring-fill\)/);
  const chrome = pinned2D('styles/app-01-chrome.css');
  if (!chrome.skip) {
    const c2d = readFileSync(`${chrome.repo}/styles/app-01-chrome.css`, 'utf8');
    assert.match(c2d, /\.leader-dot \{ fill: var\(--stage-bg\); stroke: var\(--text-2\); stroke-width: 1\.3; \}/);
    assert.match(c2d, /\.leader-dot-halo \{ fill: var\(--stage-bg\); \}/);
  }
});
