// Slide templates (src/decks/templates.ts) are only a way of writing ordinary slide fields once. The general rules: every template's example plays with nothing left out, expands to fields the one
// field table knows (so nothing downstream needs to know templates exist), and a mistake in an argument is said in plain words while the rest of the slide still plays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, expandTemplate } from '../src/decks/templates.ts';
import { authorDeck } from '../src/decks/author.ts';
import { toDeck } from '../src/decks/hp/deck.ts';
import { FIELD_HOME } from '../src/decks/hp/fields.ts';

test('every template has an example, and the example plays with nothing left out', () => {
  assert.ok(Object.keys(TEMPLATES).length >= 3);
  for (const t of Object.values(TEMPLATES)) {
    assert.ok(t.what.length > 20, `${t.name} says what it is for`);
    const { deck, notices } = authorDeck('my-t', 'Templates', { slides: [t.example] });
    assert.deepEqual(notices, [], `${t.name}: the example needs nothing left out`);
    assert.doesNotThrow(() => toDeck(deck), t.name);
    for (const r of t.required) assert.ok(r in t.example, `${t.name}: the example gives “${r}”`);
  }
});

test('a template expands to ordinary slide fields only, with its arguments gone', () => {
  for (const t of Object.values(TEMPLATES)) {
    const { slide, problems } = expandTemplate(t.example);
    assert.deepEqual(problems, [], t.name);
    assert.ok(!('template' in slide), `${t.name}: the template name is gone`);
    for (const k of [...t.required, ...t.optional]) if (!(k in FIELD_HOME)) assert.ok(!(k in slide), `${t.name}: the argument “${k}” is not left on the slide`);
    for (const k of Object.keys(slide)) assert.ok(k in FIELD_HOME || ['id', 'kicker', 'title', 'line', 'notes', 'ask'].includes(k), `${t.name}: “${k}” is not a field the app knows`);
  }
});

test('the compare template gives a patient, its readings and exactly one own button', () => {
  const { slide } = expandTemplate(TEMPLATES.compare!.example);
  assert.equal(slide.preset, 'csph');
  assert.deepEqual([slide.data, slide.tiles, slide.key], ['tiles', ['pv', 'hvpg'], ['pv']]);
  const own = (slide.compare as { own?: boolean }[]).filter((o) => o.own);
  assert.equal(own.length, 1);
});

test('before-after puts the change in the readings and presses the "after" button', () => {
  const { slide } = expandTemplate(TEMPLATES['before-after']!.example);
  assert.equal(slide.delta, true);
  const c = slide.compare as { label: string; own?: boolean }[];
  assert.deepEqual(c.map((o) => [o.label, !!o.own]), [['Untreated', false], ['Treated', true]]);
  assert.deepEqual(slide.params, { nsbbGain: 1 }, 'the slide itself stands on the "after" state');
});

test('case-question is the case card, its short question and the answer as the slide\'s line', () => {
  const { slide } = expandTemplate(TEMPLATES['case-question']!.example);
  assert.match(String(slide.vignette), /portal pressure gradient/);
  assert.match(String(slide.caseQ), /^Does he/);
  assert.match(String(slide.line), /^Yes/);
});

test('a mistake in a template is said in plain words, and the rest of the slide still plays', () => {
  const bad = authorDeck('my-t2', 'Templates', { slides: [{ template: 'compare', title: 'x', line: 'y', patient: { preset: 'csph' }, options: [{ label: 'only one' }] }, { template: 'nonsense', title: 'z', line: 'w' }, { template: 'case-question', title: 'q', case: 'c' }] });
  assert.ok(bad.notices.some((n) => /needs “tiles”/.test(n)));
  assert.ok(bad.notices.some((n) => /at least two buttons/.test(n)));
  assert.ok(bad.notices.some((n) => /no template “nonsense”/.test(n)));
  assert.ok(bad.notices.some((n) => /“question” is empty|needs “question”/.test(n)));
  assert.doesNotThrow(() => toDeck(bad.deck));
  assert.equal(bad.deck.slides.length, 3);
});
