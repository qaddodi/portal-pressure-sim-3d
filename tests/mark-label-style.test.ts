// A mark on a vessel or an organ ("Clot", "Covered stent", "Caudate lobe") is a coloured label with a leader, the look of the station names ("Portal vein 19.0 mmHg"), never a speech-bubble card (Mohammad, 22 Nov:
// the IVC and Clot bubbles on "The PPG detects resistance the HVPG misses" pointed at the wrong places). The lobule's pointer keeps its ring; a site on a station is that station's label (deck-figure-link.test.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isLabelMark, isWordsOnly, boxLeader, cardSize, type FigCard } from '../src/scene/labels/figure-cards.ts';
import { cathType } from '../src/scene/labels/cath.ts';

const mark = (anchor: FigCard['anchor']): FigCard => ({ id: 'm', kind: 'mark', text: 'Clot', tone: 'block', anchor });
const measure = (text: string, px: number) => text.length * px * 0.55;

test('a mark on a vessel, an organ, a node is a label; the lobule pointer and the other cards are not', () => {
  for (const a of [{ edge: 'PV_TRUNK' }, { edges: ['C1a', 'C1b'] }, { at2d: [10, 20] as const }, { node: 'CONF' }, { station: 'RA' }] as FigCard['anchor'][]) assert.ok(isLabelMark(mark(a)));
  assert.ok(!isLabelMark(mark({ lobule: 'tract' })));
  assert.ok(!isLabelMark({ ...mark({ edge: 'PV_TRUNK' }), kind: 'site' }));
  assert.ok(!isLabelMark({ ...mark({ edge: 'PV_TRUNK' }), kind: 'step' }));
});

test('a mark is just its words, the lobule\'s ring callout too (never a padded card)', () => {
  const t = cathType({ w: 390, h: 844 });
  const label = cardSize(mark({ edge: 'PV_TRUNK' }), t, measure as never), pill = cardSize(mark({ lobule: 'tract' }), t, measure as never);
  assert.deepEqual(label, pill, 'the same words-only box');
  assert.ok(isWordsOnly(mark({ lobule: 'tract' })) && isWordsOnly(mark({ edge: 'PV_TRUNK' })));
  assert.ok(!isWordsOnly({ ...mark({ edge: 'PV_TRUNK' }), kind: 'site' }));
});

test('the leader runs from the nearest point of the label to the place, and none when it stands against it', () => {
  const box = { x: 100, y: 100, w: 60, h: 16 };
  assert.deepEqual(boxLeader(box, { x: 130, y: 140 }), [130, 116, 130, 140]);   // below: from the bottom edge, straight
  assert.deepEqual(boxLeader(box, { x: 200, y: 108 }), [160, 108, 200, 108]);   // beside
  assert.equal(boxLeader(box, { x: 130, y: 118 }), null);
  assert.equal(boxLeader(box, { x: 130, y: 108 }), null);
});

test('the marks are drawn as labels in the CSS and carry a coloured leader', () => {
  const css = readFileSync('src/scene/labels/labels.css', 'utf8'), fc = readFileSync('src/scene/labels/figure-cards.ts', 'utf8');
  assert.match(css, /\.cl\[data-fig="mark"\] \.cl-k \{ color: var\(--c-ink\)[^}]*-webkit-text-stroke/, 'words in the label ink with the labels\' halo');
  assert.match(css, /\.cl-lead\[data-tone\] \.cl-lead-line/, 'the leader wears the words\' colour');
  assert.match(fc, /spec\.kind === 'step' \|\| isLabelMark\(spec\)/, 'a label mark gets its leader');
  assert.match(fc, /else if \(isLabelMark\(c\)\) this\.paintLead/);
});
