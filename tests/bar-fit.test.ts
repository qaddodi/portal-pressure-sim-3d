import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickFit, pickForm, barNeed, NAME_FORMS, NAME_FORMS_NARROW } from '../src/ui/shell/bar-fit.ts';
import { shortName, COMPACT, linesOf } from '../src/ui/shell/scenario-names.ts';
import { UI } from '../src/ui/strings.generated.ts';

const widths = [1000, 900, 820, 760];   // the bar's need at fit 0..3
test('the bar takes the first step that fits, and goes to two rows only when even step 3 does not', () => {
  assert.deepEqual(pickFit((f) => widths[f], 1100, 3, 0), { fit: 0, twoRows: false });
  assert.deepEqual(pickFit((f) => widths[f], 850, 3, 0), { fit: 2, twoRows: false });
  assert.deepEqual(pickFit((f) => widths[f], 700, 3, 0), { fit: 3, twoRows: true });
});
test('stepping back to a roomier step needs 24 px to spare (no flicker at the edge)', () => {
  assert.equal(pickFit((f) => widths[f], 905, 3, 2).fit, 2);   // would fit step 1 (900) but 905 < 900 + 24
  assert.equal(pickFit((f) => widths[f], 930, 3, 2).fit, 1);
});
test('a phone upright has no steps: it is one row or two', () => {
  assert.deepEqual(pickFit(() => 500, 400, 0, 0), { fit: 0, twoRows: true });
});
test('the need is the four pieces plus six gaps of 8 and 16', () => {
  assert.equal(barNeed({ id: 100, seg: 0, right: 200, actions: 300 }), 600 + 48 + 16);
});
test('the name takes the first form that fits; a narrow phone starts at two lines', () => {
  assert.equal(pickForm(NAME_FORMS, (f) => f === 's'), 's');
  assert.equal(pickForm(NAME_FORMS, () => false), 'c2');
  assert.equal(pickForm(NAME_FORMS_NARROW, () => true), 's2');
});
test('every patient has a short and a compact form, as in 2D', () => {
  for (const p of UI.presets) { const s = shortName(p.label); assert.ok(s.length > 0 && s.length <= p.label.length, p.label); assert.ok((COMPACT[s] ?? s).length > 0); }
  assert.equal(shortName('Decompensated cirrhosis + TIPS'), 'Cirrhosis + TIPS');
});
test('the compact form of every patient fits the pill in two lines: a name of three lines was cut at the foot on an iPhone (PSVD, reversed portal flow; iPhone audit 21 Nov)', () => {
  for (const p of UI.presets) { const c = COMPACT[shortName(p.label)] ?? shortName(p.label); assert.ok(linesOf(c) <= 2, `${p.label}: "${c}" takes ${linesOf(c)} lines`); }
});
