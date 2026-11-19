// Batch B12: the presenter's features. The outline, the name tab, the quick check, the library (your scripts, import, share), the handout, the presenter's window and the clicker's keys.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { builtinDecks, builtinDeck } from '../src/decks/registry.ts';
import { outlineOf, outlineProblems, tabName, OUTLINE_TITLE } from '../src/decks/outline.ts';
import { validateDeck, type Deck } from '../src/decks/schema.ts';
import { deckOf, isAlias, DECK_ALIAS } from '../src/ui/deck/deck-of.ts';
import { enc, dec, exportName } from '../src/ui/deck/script-library.ts';
import { userDeck } from '../src/ui/deck/user-deck.ts';
import { parseDeckSource, checkDeck } from '../src/ui/deck/from2d/deck-source.js';
import { clickerKey, addDigit, type ClickCtx } from '../src/ui/deck/clicker.ts';
import { lineText, handoutHTML } from '../src/ui/deck/handout.ts';
import { viewsOf } from '../src/ui/deck/presenter-link.ts';
import { stopsOf, catheterAt, viewAt } from '../src/ui/deck/presenter-machine.ts';
import { commandOf, validSession, newSession, fromTalk, PROTOCOL } from '../src/ui/deck/from2d/presenter-view.js';
import { copyAll } from '../scripts/copy-presenter.mjs';

test('every deck the app has opens with an outline of 3 to 5 lines and 2 to 3 objectives of 100 characters or fewer, and is valid', () => {
  assert.ok(builtinDecks().length >= 1);
  for (const d of builtinDecks()) { assert.deepEqual(outlineProblems(d), [], d.id); assert.deepEqual(validateDeck(d), [], d.id); }
});

test('the outline is the deck\'s sections (the 2D deck\'s own), else its kicker groups, else its slide titles; the tab is its short name', () => {
  const h = builtinDeck('hvpg')!;
  assert.equal(outlineOf(h).length, h.sections!.length);
  assert.equal(OUTLINE_TITLE, 'Outline and objectives');
  const d = { slides: ['A', 'B', 'C', 'Summary'].map((k) => ({ kicker: k, title: `t${k}` })) } as unknown as Deck;
  assert.deepEqual(outlineOf(d), ['A', 'B', 'C'], 'the Summary stays aside');
  assert.deepEqual(outlineOf({ slides: [{ kicker: 'A', title: 'x' }, { kicker: 'A', title: 'y' }] } as unknown as Deck), ['x', 'y'], 'fewer than three groups: the titles');
  assert.equal(tabName({ title: 'Short talk' }), 'Short talk');
  assert.equal(tabName({ title: 'A title of more than twenty-four characters' }), '');
  assert.equal(tabName({ title: 'x', head: 'Circuit' }), 'Circuit');
  assert.deepEqual(outlineProblems({ id: 'x', slides: [], objectives: ['a'] } as unknown as Deck).length, 2, 'no outline and one objective are both named');
});

test('a talk is found by id: a built-in one, an old id the 2D app renamed (a renamed one that is not here yet opens nothing), none other', () => {
  assert.equal(deckOf('hvpg')?.id, 'hvpg');
  assert.ok(isAlias('bleed') && DECK_ALIAS.bleed === 'treatment');
  assert.equal(deckOf('nonsense'), null);
  assert.ok(!isAlias('toString') && !isAlias('__proto__'), 'an inherited name is no alias');
});

test('a script travels as a link and comes back the same, with any letters (the 2D encoding)', () => {
  const s = { id: 'my-1', title: 'Ascítes: “a talk” — 肝', summary: 'x', steps: [{ title: 'Step', preset: 'csph', params: { a: 1.5 }, notes: '' }] };
  assert.deepEqual(dec(enc(s)), s);
  assert.match(enc(s), /^[\w-]+$/, 'url-safe');
  assert.equal(exportName('My script!'), 'my-script-.pps-script.json');
});

test('a script of live states plays as a deck (a slide per step, its patient the slide\'s model); an imported deck keeps its words; neither has a catheter', () => {
  const d = userDeck({ id: 'my-1', title: 'Mine', summary: 's', steps: [{ title: 'One', preset: 'csph', notes: 'n' }, { title: 'Two', preset: 'cirr-decomp', params: { p: 1 }, notes: '' }] });
  assert.equal(d.slides.length, 2); assert.equal(d.mine, true);
  assert.deepEqual(d.slides[1].model, { preset: 'cirr-decomp', params: { p: 1 } });
  assert.ok(d.slides.every((s) => s.cath === undefined));
  const stops = stopsOf(d);
  assert.deepEqual(catheterAt(stops, { stop: 1, beat: 0 }), { advance: 0, balloon: 0 });
  assert.deepEqual(catheterAt(stops, { stop: stops.length - 1, beat: 0 }), { advance: 0, balloon: 0 }, 'the quick check of a talk with no catheter shows none');
  assert.equal(viewAt(stops, { stop: 1, beat: 0 }).cath, null);
});

test('an imported deck file is read as data: a deck object is accepted, code in it is refused, never run', () => {
  const ok = "export const D = { title: 'My talk', summary: 's', slides: [ { title: 'A', line: 'a line', notes: 'n' } ] };";
  const deck = checkDeck(parseDeckSource(ok));
  assert.equal(deck.title, 'My talk');
  for (const bad of ["export const D = { title: 'x', slides: [ { title: fetch('/x') } ] };", "export const D = { title: 'x', get slides() { return []; } };", "import x from 'y'; export const D = {};", 'not a deck at all'])
    assert.throws(() => checkDeck(parseDeckSource(bad)), Error, bad);
});

test('the clicker: a number then Enter jumps (three digits at most), arrows and Space move, B . W black, G the list, Esc one thing at a time, a control keeps its Enter', () => {
  const c: ClickCtx = { digits: '', jumpOpen: false, wallet: false, controlOwnsEnter: false, controlOwnsArrows: false, inField: false, stops: 10 };
  const key = (k: string, o: Partial<ClickCtx> = {}, e: Record<string, unknown> = {}) => clickerKey({ key: k, ...e }, { ...c, ...o });
  assert.deepEqual(key('7'), { type: 'digit', digit: '7' });
  assert.equal(addDigit(addDigit(addDigit(addDigit('', '1'), '2'), '3'), '4'), '234');
  assert.deepEqual(key('Enter', { digits: '12' }), { type: 'go', stop: 11 });
  assert.deepEqual(key('Enter', { digits: '12', controlOwnsEnter: true }), { type: 'go', stop: 11 }, 'a typed number is confirmed even over a focused control');
  assert.deepEqual(key('Enter'), { type: 'move', to: 'next' });
  for (const k of ['ArrowRight', 'PageDown', ' ']) assert.deepEqual(key(k), { type: 'move', to: 'next' }, k);
  for (const k of ['ArrowLeft', 'PageUp', 'Backspace']) assert.deepEqual(key(k), { type: 'move', to: 'back' }, k);
  assert.deepEqual(key('Home'), { type: 'move', to: 'first' }); assert.deepEqual(key('End'), { type: 'move', to: 'last' });
  assert.equal(key('ArrowRight', {}, { repeat: true })?.type, 'swallow', 'a held key is one press');
  assert.equal(key(' ', { controlOwnsEnter: true }), null, 'a focused button keeps Space');
  assert.equal(key('ArrowDown'), null, 'Up and Down move no slide...');
  assert.deepEqual(key('ArrowDown', { wallet: true }), { type: 'swap' }, '...but swap the wallet');
  assert.equal(key('ArrowDown', { wallet: true, controlOwnsArrows: true }), null);
  for (const k of ['b', 'B', '.', 'w']) assert.deepEqual(key(k), { type: 'black' }, k);
  assert.deepEqual(key('g'), { type: 'jump' }); assert.deepEqual(key('f'), { type: 'full' }); assert.deepEqual(key('p'), { type: 'presenter' }); assert.deepEqual(key('l'), { type: 'laser' });
  for (const k of ['n', 's', 'F5']) assert.equal(key(k)?.type, 'swallow', k);
  assert.deepEqual(key('Escape'), { type: 'escape' });
  assert.deepEqual(key('Escape', { jumpOpen: true }), { type: 'jump' }, 'Esc shuts the list first');
  assert.equal(key('ArrowRight', { jumpOpen: true }), null, 'the open list has its own keys');
  assert.equal(key('x'), null);
  assert.equal(key('a', { inField: true }), null);
  assert.equal(key('b', {}, { ctrlKey: true }), null, 'Ctrl or Cmd with a key stays the browser\'s');
});

test('the handout fills a slide\'s line with the model\'s numbers, prints a dash for one not known, carries the outline, objectives, notes, questions and the quick check', () => {
  assert.equal(lineText('The HVPG is {hvpg} and the {>=10 mmHg} cut-off, [portal vein](pv).', { hvpg: 11.64 }), 'The HVPG is 11.6 mmHg and the ≥10\u00a0mmHg cut-off, portal vein.');
  assert.equal(lineText('PV {pv:0}', {}), 'PV —');
  const h = builtinDeck('hvpg')!;
  const html = handoutHTML(h, [{ hvpg: 11.6, whvp: 16.4, fhvp: 4.8 }]);
  assert.match(html, /<h1>/); assert.ok(html.includes('Speaker notes'));
  for (const o of h.objectives) assert.ok(html.includes(o.replace(/"/g, '&quot;')), o);
  for (const o of outlineOf(h)) assert.ok(html.includes(o.replace(/&/g, '&amp;')), o);
  for (const [q] of h.checks) assert.ok(html.includes(q.replace(/&/g, '&amp;').replace(/"/g, '&quot;')));
  assert.ok(!/<script>(?!.*print)/i.test(html.replace(/onclick="print\(\)"/g, '')), 'no script in it');
  const evil = handoutHTML({ ...h, title: '<img src=x onerror=alert(1)>' }, []);
  assert.ok(!evil.includes('<img src=x'), 'a title is escaped');
  assert.ok(!/Baveno VII(?!I)/.test(html));
});

test('the presenter\'s window: a talk is one session; a command from another session or of another shape is dropped; its slides are the stops the talk plays', () => {
  const sid = newSession();
  assert.ok(validSession(sid) && !validSession('short') && !validSession('../x'));
  assert.deepEqual(commandOf({ v: PROTOCOL, sid, t: 'cmd', c: 'next' }, sid), { c: 'next' });
  assert.deepEqual(commandOf({ v: PROTOCOL, sid, t: 'cmd', c: 'go', i: 3 }, sid), { c: 'go', i: 3 });
  assert.equal(commandOf({ v: PROTOCOL, sid: 'x'.repeat(20), t: 'cmd', c: 'next' }, sid), null, 'another talk\'s');
  assert.equal(commandOf({ v: 0, sid, t: 'cmd', c: 'next' }, sid), null, 'another version');
  assert.equal(commandOf({ v: PROTOCOL, sid, t: 'cmd', c: 'eval' }, sid), null, 'not one of the three');
  assert.equal(commandOf({ v: PROTOCOL, sid, t: 'cmd', c: 'go', i: -1 }, sid), null);
  assert.ok(fromTalk({ v: PROTOCOL, sid, t: 'state' }, sid) && !fromTalk({ v: PROTOCOL, sid, t: 'cmd' }, sid));
  const h = builtinDeck('hvpg')!;
  assert.equal(viewsOf(h).length, stopsOf(h).length, 'one view per stop');
});

test('the files copied from the 2D app are the 2D app\'s, character for character (set P2D_CHECKOUT to a 2D checkout to compare; each copy names the commit it came from)', () => {
  for (const f of ['import-safety.js', 'deck-source.js', 'share-link.js', 'presenter-view.js']) assert.match(readFileSync(join('src/ui/deck/from2d', f), 'utf8').split('\n')[0], /at [0-9a-f]{10}\./, f);
  const two = process.env.P2D_CHECKOUT;
  if (!two || !existsSync(join(two, 'src/ui/deck-source.js'))) return;
  assert.deepEqual(copyAll(two, true), [], 'run node scripts/copy-presenter.mjs --from <2D checkout>');
});
