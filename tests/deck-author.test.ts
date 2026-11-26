// A deck you write yourself is played by the same path as a built-in one (decks/author.ts, then hp/deck.ts toDeck). The general rule, held for every built-in deck at once: authoring the very
// slides of a built-in deck as your own deck gives the same Slides the built-in deck has, so nothing a built-in slide can do is closed to your own. What cannot be played is named in plain words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_IDS, loadSource } from '../src/decks/source.ts';
import { authorDeck } from '../src/decks/author.ts';
import { toDeck, copiedOf } from '../src/decks/hp/deck.ts';
import { userDeck } from '../src/ui/deck/user-deck.ts';

const norm = (v: unknown, from: string, to: string): unknown => JSON.parse(JSON.stringify(v).split(from).join(to));

test('every built-in deck, written out as your own, plays as the same slides with nothing left out', async () => {
  for (const id of SOURCE_IDS) {
    const src = await loadSource(id);
    const mine = authorDeck(`mine-${id}`, src.title, src as never);
    assert.deepEqual(mine.notices, [], `${id}: nothing of a built-in deck is left out when it is your own`);
    const a = toDeck(mine.deck), b = toDeck(src);
    assert.deepEqual(norm(a.slides, `mine-${id}`, id), b.slides, `${id}: the same slides`);
    assert.equal(a.slides.length, src.slides.length);
    assert.ok(copiedOf(`mine-${id}`), `${id}: its numbers come from its own states like any deck's`);
  }
});

test('a deck never takes a built-in deck\'s id (the figure\'s numbers are kept by deck id)', () => {
  assert.equal(authorDeck('hvpg', 'Mine', { slides: [{ title: 'a' }] }).deck.id, 'my-hvpg');
  assert.equal(authorDeck('day', 'Mine', { slides: [{ title: 'a' }] }).deck.id, 'my-day');
  assert.equal(authorDeck('my-1', 'Mine', { slides: [{ title: 'a' }] }).deck.id, 'my-1');
});

test('what cannot be played is named in plain words, and the rest of the slide plays', () => {
  const { deck, notices } = authorDeck('my-2', 'Mine', {
    slides: [{ title: 'One', line: 'Pressure is {pv}.', cam: 'nowhere', lens: 'rainbow', preset: 'nobody', tool: { kind: 'telepathy' }, visual: 'hologram', cath: 'lost', procedure: 'magic', wibble: 1, tiles: ['pv'], data: 'tiles', site: 'pre' }],
  });
  const s = deck.slides[0]!;
  for (const gone of ['cam', 'lens', 'preset', 'tool', 'visual', 'cath', 'procedure', 'wibble']) assert.ok(!(gone in s), `${gone} is left out`);
  assert.deepEqual([s.data, s.site], ['tiles', 'pre'], 'the rest of the slide stays');
  for (const word of ['nowhere', 'rainbow', 'nobody', 'telepathy', 'hologram', 'lost', 'magic', 'wibble']) assert.ok(notices.some((n) => n.includes(word)), `a notice names ${word}`);
  assert.doesNotThrow(() => toDeck(deck));
});

test('an unsafe key, a bad equation and a broken line cannot reach the page', () => {
  const { deck, notices } = authorDeck('my-3', 'Mine', { slides: [{ title: 'x', line: 'a {nonsense', eq: ['<script>x</script>'], tool: { kind: 'curve', param: '__proto__.x' } }] });
  assert.ok(!('eq' in deck.slides[0]!) && !('tool' in deck.slides[0]!));
  assert.ok(notices.some((n) => /equation/.test(n)) && notices.some((n) => /“tool”/.test(n)));
  assert.doesNotThrow(() => toDeck(deck));
});

test('a script of steps plays as a deck with the same fields: its patient is the slide\'s own step, its notes and words stay', () => {
  const d = userDeck({ id: 'my-4', title: 'Mine', summary: 's', steps: [{ title: 'One', preset: 'csph', notes: 'n', lens: 'flow' }, { title: 'Two', preset: 'healthy', notes: 'm', cam: 'liver' }] });
  assert.equal(d.slides.length, 2);
  assert.deepEqual(d.notices, []);
  assert.equal(d.slides[1]!.scene?.lens, 'pressure');
  assert.equal(d.slides[0]!.scene?.lens, 'flow');
  assert.equal(copiedOf('my-4')!.slides[1]!.preset, 'healthy');
});
