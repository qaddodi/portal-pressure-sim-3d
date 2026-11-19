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

// ── the summary table ──
import { tableModel, DEFAULT_COLS, bpText, valueText } from '../src/ui/talk/table-model.ts';
import type { ResolvedRow } from '../src/ui/talk/table-model.ts';
import { CUT, dirAbs, COLS } from '../src/ui/deck/from2d/table-marks.js';

const healthy = { pv: 6, whvp: 6, fhvp: 3, ivc: 3, ra: 3, hvpg: 3, ppg: 3, asc: 0, saag: 0, tp: 0 };
const cirrhosis = { pv: 21, whvp: 19, fhvp: 3, ivc: 3, ra: 3, hvpg: 16, ppg: 18, asc: 3000, saag: 1.6, tp: 1.2 };
const row = (id: string, f: Record<string, number> | null, o: object = {}): ResolvedRow => ({ spec: { id, ...o }, i: 1, f, title: id, kicker: 'Levels' });

test('a summary table against normal: an arrow past the red cut-off is double and red, a normal reading is the dot, ascites is the SAAG and protein pair or "None"', () => {
  const m = tableModel({ of: ['a', 'b'] }, [row('a', healthy), row('b', cirrhosis)]);
  assert.equal(m.rel, false); assert.equal(m.cols.length, DEFAULT_COLS.length + 2, 'the default columns and the ascites pair');
  const hv = (r: number) => m.rows[r].cells[DEFAULT_COLS.indexOf('hvpg')];
  assert.equal(hv(0).arrow, 0); assert.equal(hv(0).rate, null);
  assert.equal(hv(1).arrow, 2); assert.equal(hv(1).rate, 'hi'); assert.equal(hv(1).text, '16.0', 'a gradient to one decimal');
  assert.equal(m.rows[1].cells[DEFAULT_COLS.indexOf('pv')].text, '21', 'a pressure in whole mmHg');
  assert.match(hv(1).sr, /^well above normal, 16\.0 mmHg$/);
  assert.equal(m.rows[0].cells.at(-1)!.text, 'None', 'no ascites: None, one cell');
  assert.equal(m.rows[1].cells.at(-2)!.k, 'saag'); assert.equal(m.rows[1].cells.at(-2)!.arrow, 1, 'SAAG ≥ the portal cut: up');
  assert.match(m.legend, /↑ above normal, ↓ below; ↑↑ ↓↓ past the red cut-off/);
  assert.ok(m.cols.every((c) => c.label === (COLS as Record<string, string>)[c.k] || ['saag', 'tp'].includes(c.k)));
  assert.equal(dirAbs('hvpg', cirrhosis), 2);
  assert.ok(CUT.hvpg, 'a column names its cut-offs (tap a heading)');
});

test('a table that compares with the first row: arrows read higher and lower with better and worse; a row not worked out yet waits; a blank column is a ring; a name can be of its own', () => {
  const after = { ...cirrhosis, hvpg: 8, ppg: 9, pv: 14, whvp: 11 };
  const m = tableModel({ vs: 'first', cols: ['hvpg', 'ppg', 'asc'], of: ['a', 'b', 'c'] }, [row('a', cirrhosis, { ref: true }), row('b', after, { blank: ['asc'] }), row('c', null)]);
  assert.equal(m.rel, true); assert.equal(m.ascCols, false, 'cols given: no ascites pair');
  assert.equal(m.rows[0].cells[0].kind, 'ref');
  const c = m.rows[1].cells[0];
  assert.equal(c.kind, 'dir'); assert.ok(c.arrow < 0, 'lower'); assert.equal(c.eff, 'good', 'a lower HVPG is better'); assert.match(c.sr, /^(much )?lower, 8\.0 mmHg$/);
  assert.equal(m.rows[1].cells[2].kind, 'blank');
  assert.equal(m.rows[2].cells[0].kind, 'pend'); assert.equal(m.rows[2].cells[0].sr, 'calculating');
  assert.match(m.legend, /Green better, red worse/);
  assert.match(m.legend, /^↑ higher, ↓ lower than /);
});

test('a row\'s arrow can be compared with a named row, and a heading shared with the row above is printed once', () => {
  const a = row('a', healthy, { key: 'base' }), b = row('b', cirrhosis, { vs: 'base' }), c = row('c', cirrhosis, { vs: 'base' });
  b.kicker = c.kicker = 'Intrahepatic · Sinusoidal';
  const m = tableModel({ of: ['a', 'b', 'c'] }, [a, b, c]);
  assert.equal(m.rel, true, 'a row with its own comparison reads relative to it');
  assert.match(m.rows[1].vs, /^vs a$/);
  assert.equal(m.rows[1].head, 'Sinusoidal'); assert.equal(m.rows[1].cont, false); assert.equal(m.rows[2].cont, true);
  assert.match(m.legend, /the row named under each/);
});

test('numbers in a table read as the vitals and the tiles print them', () => {
  assert.equal(bpText(117, 69, 85), '117/69 (85)'); assert.equal(bpText(undefined, undefined, 85), 'MAP 85'); assert.equal(bpText(1, 1, NaN), '—');
  assert.equal(valueText('hvpg', { hvpg: -0.04 }), '0.0'); assert.equal(valueText('hvpg', {}), '—');
  assert.equal(valueText('asc', { asc: 3000 }), '3.0', 'ascites in litres');
});

// ── the trials pane ──
import { TRIAL_IDS, sortTrials, closestOf, chipsOf, ratesOf, pipsOf, sourceLine, patientFacts, historyOf, CLOSEST_MAX } from '../src/ui/trials/trials-model.ts';
import { TRIALS } from '../src/ui/charts/trial/trials.generated.ts';

const compensated = { hvpg: 12, varix: { d: 3, grade: { label: 'Small' }, present: true }, ascites: { volume: 0, grade: 0 }, bleeding: false };
test('the trials against a patient: every trial is in one place, the closest are at most two, a trial that fails names the rule, a row reads its rates and its source', () => {
  const facts = patientFacts(compensated, { cirrhosis: 1 });
  assert.equal(facts.hvpg, 12); assert.equal(facts.varix, 'Small varices'); assert.equal(facts.ascites, 'No ascites');
  const s = closestOf(sortTrials(TRIAL_IDS, compensated, { cirrhosis: 1 }, facts, historyOf({ decompensated: false })));
  const all = [...s.closest, ...s.also, ...s.no, ...s.unknown].map((p) => p.t.id).sort();
  assert.deepEqual(all, [...TRIAL_IDS].sort(), 'each trial once');
  assert.ok(s.closest.length <= CLOSEST_MAX);
  assert.ok(s.no.length > 0 && s.no.every((p) => p.fit.verdict === 'no'));
  const chips = chipsOf(s.no);
  assert.ok(chips.length > 0 && chips.every((c, i) => i === 0 || chips[i - 1].ids.length >= c.ids.length), 'the most common rule first');
  assert.equal(chips.reduce((n, c) => n + c.ids.length, 0) <= s.no.length, true);
  const pre = TRIALS.predesci!;
  assert.match(ratesOf(pre)[0], /^\d+%$/); assert.match(sourceLine(pre), /^Lancet 2019 · Villanueva · 201 randomized · PMID 30910320$/);
  assert.match(pipsOf(sortTrials(['predesci'], compensated, { cirrhosis: 1 }, facts).fits.concat(sortTrials(['predesci'], compensated, { cirrhosis: 1 }, facts).possible, sortTrials(['predesci'], compensated, { cirrhosis: 1 }, facts).no, sortTrials(['predesci'], compensated, { cirrhosis: 1 }, facts).unknown)[0].fit), /^[yxo]*$/);
});
test('a patient who is bleeding or has ascites fails the compensated trials; a blocked hepatic vein has no HVPG; history says what the model cannot', () => {
  const sick = { ...compensated, bleeding: true, ascites: { volume: 3000, grade: 2 } };
  const s = sortTrials(['predesci'], sick, { cirrhosis: 1 }, patientFacts(sick, { cirrhosis: 1 }));
  assert.equal(s.no.length, 1, 'PREDESCI wants compensated cirrhosis');
  assert.equal(historyOf({ decompensated: true })?.decompensated, true);
  assert.equal(historyOf({ decompensated: false }, true)?.source, 'session', 'a session that saw a decompensation says so');
  assert.equal(historyOf(null), null);
});
