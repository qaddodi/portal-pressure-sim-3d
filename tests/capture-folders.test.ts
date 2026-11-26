// Capture 2274649a: the same talk had a different folder number on the Mac and the iPhone (Mac 35-shunts and 36-two-lesions, iPhone 35-two-lesions and 36-shunts).
// Root cause: the registry listed a lazy talk when its data FINISHED LOADING (a Map filled by the loads' race), and the capture numbered by the place in that list.
// The registry now lists talks in the order they were registered, and a folder's number is the talk's place among all the talks, not among the ones taken. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { builtinDecks, deckOrder, lazyDecks, loadBuiltin } from '../src/decks/registry.ts';
import { deckFolder } from '../src/ui/debug/audit/capture-pick.ts';

test('a folder is the talk\'s number among all the talks, then its id', () => {
  const all = ['hvpg', 'outflow', 'shunts', 'two-lesions'];
  assert.equal(deckFolder(all, 'shunts'), '03-shunts');
  assert.equal(deckFolder(all, 'two-lesions'), '04-two-lesions');
  assert.equal(deckFolder(all, 'hvpg'), '01-hvpg');
});
test('the number does not depend on which talks a run takes', () => {
  const all = ['a', 'b', 'c', 'd'];
  const taken = all.filter((x) => x === 'c' || x === 'd');
  assert.equal(deckFolder(all, 'c'), '03-c');
  assert.notEqual(deckFolder(taken, 'c'), deckFolder(all, 'c'));   // (numbering from the taken ones would have said 01-c)
});
test('every registered talk gets its own number, two digits, in the registered order', () => {
  const ids = deckOrder();
  const folders = ids.map((id) => deckFolder(ids, id));
  assert.equal(new Set(folders).size, ids.length);
  folders.forEach((f, i) => assert.equal(f.slice(0, 2), String(i + 1).padStart(2, '0')));
});
test('the loaded talks list in the registered order, whichever finishes loading first', async () => {
  const lazy = lazyDecks().map((l) => l.id);
  assert.ok(lazy.length > 4);
  // load a few of them in the reverse of their registered order, as a slow network might finish them
  const some = lazy.slice(0, 5).reverse();
  for (const id of some) await loadBuiltin(id);
  const loaded = builtinDecks().map((d) => d.id), order = deckOrder();
  assert.deepEqual(loaded, order.filter((id) => loaded.includes(id)));
  for (const id of some) assert.ok(loaded.includes(id));
});
