import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pillShort, fitTwoLines } from '../src/ui/shell/pill-name.ts';
import { shortName, COMPACT, linesOf } from '../src/ui/shell/scenario-names.ts';
import { HISTORIES } from '../src/ui/histories/index.generated.ts';
import { COURSES } from '../src/ui/histories/courses.ts';
import { UI } from '../src/ui/strings.generated.ts';

// The rule: the name on a phone's top pill is two lines of 15 characters at most and says which patient it is. The presets' short forms are cut at the first comma
// (scenario-names.ts, from 2D), which is wrong for the model patients' names ("Cirrhosis, first bleed" became "Cirrhosis"; iPhone audit 26 Nov, capture 0bc14020).
test('every model patient shows a name of two lines or fewer in the pill, and a long one has its own short form in its data', () => {
  for (const h of HISTORIES) {
    const shown = pillShort(h.name, h.id);
    assert.ok(shown.length > 0, h.id);
    assert.ok(linesOf(shown) <= 2, `${h.id}: "${shown}" takes ${linesOf(shown)} lines`);
    assert.equal(shown, h.short ?? h.name, h.id);
    if (!h.short) assert.ok(linesOf(h.name) <= 2, `${h.id}: "${h.name}" needs a short form`);
    else assert.ok(h.short.length < h.name.length, `${h.id}: the short form is no shorter than the name`);
  }
});
test('no model patient is shown under a name cut at its first comma, and no two share a pill name', () => {
  for (const h of HISTORIES) if (h.name.includes(',')) assert.notEqual(pillShort(h.name, h.id), shortName(h.name), `${h.id}: "${h.name}" is cut at its comma`);
  const names = HISTORIES.map((h) => pillShort(h.name, h.id));
  assert.equal(new Set(names).size, names.length, names.join(' | '));
});
test('the menu rows keep the whole name, and the baked rows carry the course\'s short form', () => {
  for (const c of COURSES) { const h = HISTORIES.find((x) => x.id === c.id); assert.ok(h, c.id); assert.equal(h.name, c.name); assert.equal(h.short, c.short, c.id); }
});
test('a model patient renamed "Custom" by a disease put on it and the presets keep their rules', () => {
  assert.equal(pillShort('Custom', 'hist-bleed'), 'Custom');
  for (const p of UI.presets) { assert.equal(pillShort(p.label, p.id), shortName(p.label), p.id); assert.ok(linesOf(COMPACT[shortName(p.label)] ?? shortName(p.label)) <= 2, p.id); }
});
test('a patient of your own is never cut at its first comma when its whole name fits two lines; a longer one keeps its head, else as many words as fit', () => {
  assert.equal(pillShort('Mr Smith, 54', 'yours-1'), 'Mr Smith, 54');
  assert.equal(pillShort('Mr Smith, 54, TIPS and a long follow-up', 'yours-1'), 'Mr Smith');
  assert.equal(pillShort('Cirrhosis with a long name nobody planned for', 'yours-2'), 'Cirrhosis with a long name…');
  assert.equal(pillShort('', 'yours-3'), 'Custom');
  for (const n of ['A', 'Mr Smith, 54', 'Alcohol cirrhosis recompensated', 'Jones family, second cousin, Baveno VIII review patient', 'Extraordinarily-long-single-word-name here']) {
    const s = fitTwoLines(n);
    assert.ok(s.length > 0 && linesOf(s) <= 2, `${n}: "${s}"`);
  }
});
