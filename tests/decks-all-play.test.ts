// Every built-in talk plays by its id through the one path (copied 2D deck -> hp/deck.ts toDeck): all 42 decks of the 2D menu are registered, open, validate,
// and every slide carries its scene, its words parse, and the 2D fields the cards print (case question, caveat, source, summary table) arrive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin, isBuiltin, lazyDecks } from '../src/decks/registry.ts';
import { validateDeck } from '../src/decks/schema.ts';
import { parseLine } from '../src/ui/text/line.ts';
import { copiedOf } from '../src/decks/hp/deck.ts';
import { namedBy } from '../src/scene/labels/deck-link.ts';
import { maxPages, pageOf } from '../src/ui/cards/pages.ts';
import { PLAYABLE } from '../src/ui/menu/library.ts';

const ids: string[] = UI.decks.map((d) => d.id);
const decks = new Map(await Promise.all(ids.map(async (id) => [id, (await loadBuiltin(id))!] as const)));

test('every talk of the 2D menu is registered, with the slide count the menu shows, and is in PLAYABLE', () => {
  assert.equal(ids.length, 42);
  for (const id of ids) { assert.ok(isBuiltin(id), id); assert.ok(id in PLAYABLE, `${id} is offered by the menu`); }
  for (const l of lazyDecks()) assert.equal(decks.get(l.id)!.slides.length, l.slides, `${l.id} slide count`);
});

test('every talk opens and is a valid deck whose slides all have a scene and whose words parse', () => {
  for (const [id, d] of decks) {
    assert.ok(d, id);
    assert.deepEqual(validateDeck(d), [], id);
    assert.ok(copiedOf(id) || id === 'hvpg', `${id} has its copied deck for the numbers`);
    for (const s of d.slides) {
      assert.ok(s.scene || s.shot, `${id}/${s.id} has a camera`);
      for (const t of [s.line, s.vignette ?? '', s.caseQ ?? '']) assert.doesNotThrow(() => parseLine(t), `${id}/${s.id}`);
      if (s.scene) assert.doesNotThrow(() => namedBy(s), `${id}/${s.id}`);
    }
    for (const [q, a] of d.checks) assert.doesNotThrow(() => { parseLine(q); parseLine(a); }, id);
  }
});

test('the 2D slide fields the cards print come over: case question, caveat, source, summary table', () => {
  const all = [...decks.values()].flatMap((d) => d.slides.map((s) => ({ d: d.id, s })));
  assert.ok(all.filter((x) => x.s.caseQ).length >= 30, 'case questions');
  assert.ok(all.filter((x) => x.s.cite).length >= 30, 'sources');
  assert.ok(all.filter((x) => x.s.caveat).length >= 3, 'caveats');
  const tables = all.filter((x) => x.s.table);
  assert.ok(tables.length >= 35, `summary tables (${tables.length})`);
  for (const { d, s } of tables) assert.ok(s.table!.of.length > 0, `${d}/${s.id} table rows`);
  for (const { s } of all.filter((x) => x.s.caseQ)) assert.ok(s.vignette, `${s.id}: a case question belongs to a case`);
});

test('the quick check pages by whole questions, none dropped', () => {
  assert.equal(maxPages('check', undefined, 4), 4);
  assert.equal(maxPages('check', undefined, 0), 1);
  const q = ['a', 'b', 'c', 'd'];
  assert.deepEqual([0, 1].flatMap((p) => pageOf(q, 2, p)), q);
  assert.deepEqual(pageOf(q, 2, 0), ['a', 'b']);
  assert.equal(decks.get('hvpg')!.checks.length, 4, 'the HVPG talk keeps all four of the 2D questions');
});

import { stopsOf, viewAt, goto } from '../src/ui/deck/presenter-machine.ts';
import { caseOf } from '../src/decks/schema.ts';
import { hasVisualChart } from '../src/decks/charts.ts';

test('a question slide is asked on a card of its own first (two beats), and a slide with a case keeps its case', () => {
  let questions = 0;
  for (const [id, d] of decks) {
    const stops = stopsOf(d);
    d.slides.forEach((s, i) => {
      const stop = stops[i + 1]!;
      if (stop.kind !== 'slide') return;
      assert.equal(stop.beats, (caseOf(s) ? 2 : 1) + (s.beats?.length ?? 0), `${id}/${s.id}`);   // (a slide's camera beats are views after its own)
      if (s.question) { questions++; assert.ok(!s.vignette, `${id}/${s.id}: only a slide with no case and no patient of its own is asked`); assert.equal(viewAt(stops, { stop: i + 1, beat: 0 }).words, 'case'); assert.equal(viewAt(stops, { stop: i + 1, beat: 1 }).words, s.table || hasVisualChart(s) ? 'visual' : 'teach', `${id}/${s.id}: after its question the slide shows as itself (a summary table or chart is 2D's one centred panel)`); assert.deepEqual(goto(stops, i + 1), { stop: i + 1, beat: 1 }, `${id}/${s.id}: a jump lands on the slide, not on its question`); }
      else if (s.vignette) assert.deepEqual(goto(stops, i + 1), { stop: i + 1, beat: 0 }, `${id}/${s.id}: a jump to a case still shows the case`);
    });
  }
  assert.ok(questions >= 8, `question slides (${questions})`);
});
