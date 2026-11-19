// Production review, bug 2: a cold link to a talk (?script=<id>&slide=<n>) said the talk was not there for every talk but the first, because the link asked "is it read?" (deckOf)
// where it meant "is there such a talk?": 41 of the 42 talks are read when they are opened (registry.ts registerLazyDeck). One path now opens a talk by id, read or not
// (deck-of.ts openById), for the link, the menu, the search, Print notes and the presenter's window.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { builtinDeck, builtinDecks, lazyDecks, isBuiltin } from '../src/decks/registry.ts';
import { deckOf, knownTalk, loadDeck, landOn, openById, cancelOpen, talkId, DECK_ALIAS } from '../src/ui/deck/deck-of.ts';
import { parseDeepLink } from '../src/ui/shell/deep-link.ts';
import { stopsOf } from '../src/ui/deck/presenter-machine.ts';
import { UI } from '../src/ui/strings.generated.ts';
import type { Deck } from '../src/decks/schema.ts';

const src = (f: string) => readFileSync(f, 'utf8');
const IDS = [...new Set([...builtinDecks().map((d) => d.id), ...lazyDecks().map((d) => d.id)])];
const tick = () => new Promise((r) => setTimeout(r, 0));
/** openById with its effects recorded; resolves when it opened or failed. */
const open = (id: string, at: number) => new Promise<{ ok: boolean; deck?: Deck; at?: number; failed?: true }>((done) => {
  const ok = openById(id, at, { open: (deck, a) => done({ ok: true, deck, at: a }), fail: () => done({ ok: true, failed: true }) });
  if (!ok) done({ ok: false });
});

test('the registry has the 42 talks of the 2D menu, and all but the first are read when opened', () => {
  assert.equal(IDS.length, 42);
  assert.deepEqual([...IDS].sort(), UI.decks.map((d) => d.id).sort());
  assert.ok(lazyDecks().length >= 41);
});

test('a talk still being read does not open over a newer ask, nor after the person left (2D startGen)', async () => {
  const cold = lazyDecks().map((d) => d.id).filter((id) => !builtinDeck(id));
  assert.ok(cold.length >= 2, 'run before the talks are read');
  const seen: string[] = [];
  const fx = { open: (d: Deck) => { seen.push(d.id); }, fail: () => { seen.push('fail'); } };
  // asked, then left before it was read: nothing opens
  assert.equal(openById(cold[0]!, 2, fx), true, 'a cold talk is taken at once');
  assert.deepEqual(seen, [], 'and opens only when it is read');
  cancelOpen();
  await loadDeck(cold[0]!); await tick();
  assert.deepEqual(seen, []);
  // asked, then another talk asked while it was read: only the newer opens
  openById(cold[1]!, 0, fx); openById('hvpg', 0, fx);
  await loadDeck(cold[1]!); await tick();
  assert.deepEqual(seen, ['hvpg']);
  assert.match(src('src/ui/shell/talk.ts'), /export function leaveTalk\(\): void \{\n\s*cancelOpen\(\);/);
});

test('a cold link opens every talk on the slide it names: known at once, read, then shown at that stop', async () => {
  for (const id of IDS) {
    const cold = !builtinDeck(id);
    assert.equal(knownTalk(id), true, `${id} is a talk before it is read`);
    const l = parseDeepLink(`?script=${id}&slide=3`);
    assert.deepEqual(l.script, { id, slide: 2 }, id);
    const r = await open(l.script!.id, l.script!.slide);
    assert.ok(r.ok && r.deck && !r.failed, `${id} opens${cold ? ' from cold' : ''}`);
    assert.equal(r.deck!.id, id);
    const stops = stopsOf(r.deck!).length;
    assert.equal(stops, r.deck!.slides.length + 2, 'the outline, the slides, the quick check');
    assert.equal(landOn(id, r.at, stops), 2, `${id} slide 3 is stop 2 (0 is the outline)`);
    assert.equal(deckOf(id)?.id, id, 'and it is read from now on');
    // the last slide, a slide past the end, no slide, a slide that is no number
    assert.equal(landOn(id, parseDeepLink(`?script=${id}&slide=${stops}`).script!.slide, stops), stops - 1);
    assert.equal(landOn(id, parseDeepLink(`?script=${id}&slide=9999`).script!.slide, stops), stops - 1, 'past the end: the last stop, as 2D clamps');
    for (const q of [`?script=${id}`, `?script=${id}&slide=abc`, `?script=${id}&slide=0`, `?script=${id}&slide=-4`, `?script=${id}&slide=`]) assert.equal(landOn(id, parseDeepLink(q).script!.slide, stops), 0, q);
  }
});

test('a link that names no talk opens nothing and says so; it never throws', async () => {
  for (const id of ['nope', 'hvpg2', '__proto__', 'constructor', 'toString', ' ', 'HVPG']) {
    assert.equal(knownTalk(id), false, id);
    assert.deepEqual(await open(id, 3), { ok: false }, id);
    assert.equal(await loadDeck(id), null, id);
  }
  assert.deepEqual(parseDeepLink('?script='), {}, 'an empty id is no link');
  assert.equal(landOn('hvpg', NaN, 12), 0); assert.equal(landOn('hvpg', 4.9, 12), 4); assert.equal(landOn('hvpg', '7', 12), 7); assert.equal(landOn('hvpg', 5, 0), 0);
  // the link, when the talk is not there, uses 2D's words and leaves the app in free play
  const link = src('src/ui/shell/open-link.ts');
  assert.match(link, /if \(!startTalk\(l\.script\.id, l\.script\.slide\)\)/); assert.match(link, /W\.notFound/);
  assert.ok(!/deckOf\(/.test(link), 'the link no longer asks whether the talk is already read');
});

test('an old id opens the talk that took its slides, at the start, whatever slide the link named (2D DECK_ALIAS)', async () => {
  for (const [old, now] of Object.entries(DECK_ALIAS)) {
    assert.ok(isBuiltin(now), `${old} -> ${now}`);
    assert.equal(talkId(old), now); assert.equal(knownTalk(old), true);
    const r = await open(old, 5);
    assert.equal(r.deck?.id, now); assert.equal(r.at, 0);
    assert.equal(landOn(old, 5, 20), 0);
  }
});

test('everything that opens a talk by id goes through the one path: no caller asks deckOf whether a built-in talk exists', () => {
  assert.match(src('src/ui/shell/talk.ts'), /return openById\(deckId, at, /);
  const lib = src('src/ui/talk/library.ts');
  assert.ok(!/deckOf\(/.test(lib), 'Present, Print notes and the presenter view ask knownTalk / loadDeck');
  assert.match(lib, /openHandout\(loadDeck\(id\)\)/, 'Print notes reads a talk that is read on opening');
  assert.match(lib, /presenterView = .*openPresenterView\(\).*present\(id, at\)/, 'the presenter\'s window opens inside the tap, then the talk');
  assert.match(src('src/ui/DeckUi.tsx'), /landOn\(deck\.id, useUi\.getState\(\)\.startAt, stops\.length\)/);
});
