import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideKey, stepSpeed, letterOf, type KeyCtx } from '../src/ui/keys/keymap.ts';

const ctx = (o: Partial<KeyCtx> = {}): KeyCtx => ({ target: 'page', searchOpen: false, sheetOpen: false, talk: false, keysOn: true, ...o });
const k = (key: string, o: object = {}) => ({ key, ...o });

test('Ctrl or Cmd K toggles search, even from a field; a field keeps every other key', () => {
  assert.deepEqual(decideKey(k('k', { ctrlKey: true }), ctx({ target: 'text' })), { type: 'search-toggle' });
  assert.deepEqual(decideKey(k('K', { metaKey: true }), ctx()), { type: 'search-toggle' });
  assert.equal(decideKey(k('a'), ctx({ target: 'text' })), null);
  assert.equal(decideKey(k(' '), ctx({ target: 'text' })), null);
});

test('Esc closes one thing; with the search open it is the only key the page takes', () => {
  assert.deepEqual(decideKey(k('Escape'), ctx()), { type: 'close' });
  assert.deepEqual(decideKey(k('Escape'), ctx({ searchOpen: true })), { type: 'close' });
  assert.equal(decideKey(k('a'), ctx({ searchOpen: true })), null);
});

test('the letters of the guide', () => {
  const a = (key: string, o: object = {}, c: Partial<KeyCtx> = {}) => decideKey(k(key, o), ctx(c));
  assert.deepEqual(a(' '), { type: 'play-pause', prevent: true });
  assert.deepEqual(a('a'), { type: 'view-toggle' });
  assert.deepEqual(a('l'), { type: 'lens', dir: 1 });
  assert.deepEqual(a('L', { shiftKey: true }), { type: 'lens', dir: -1 });
  assert.deepEqual(a('i'), { type: 'tests' });
  assert.deepEqual(a('t'), { type: 'treat' });
  assert.deepEqual(a('p'), { type: 'compare' });
  assert.deepEqual(a('z'), { type: 'settle' });
  assert.deepEqual(a('j'), { type: 'dye' });
  assert.deepEqual(a('.'), { type: 'step' });
  assert.deepEqual(a('?'), { type: 'help' });
  assert.deepEqual(a('/'), { type: 'search-open' });
  assert.deepEqual(a('+'), { type: 'zoom', dir: 'in' });
  assert.deepEqual(a('-'), { type: 'zoom', dir: 'out' });
  assert.deepEqual(a('0'), { type: 'zoom', dir: 'fit' });
  assert.deepEqual(a(']'), { type: 'speed', dir: 1 });
  assert.deepEqual(a('['), { type: 'speed', dir: -1 });
  assert.deepEqual(a('z', { ctrlKey: true }), { type: 'undo' });
  assert.deepEqual(a('z', { metaKey: true, shiftKey: true }), { type: 'redo' });
});

test('Ctrl or Cmd with + − 0 stays the browser\'s page zoom', () => {
  for (const key of ['+', '-', '0', '=']) assert.equal(decideKey(k(key, { ctrlKey: true }), ctx()), null, key);
});

test('a held key is one press; J has its own rule', () => {
  assert.deepEqual(decideKey(k(' ', { repeat: true }), ctx()), { type: 'ignore', prevent: true });
  assert.equal(decideKey(k('t', { repeat: true }), ctx()), null);
  assert.equal(decideKey(k('j', { repeat: true }), ctx()), null);
});

test('a talk owns its keys except / and ?', () => {
  assert.equal(decideKey(k('a'), ctx({ talk: true })), null);
  assert.equal(decideKey(k(' '), ctx({ talk: true })), null);
  assert.deepEqual(decideKey(k('/'), ctx({ talk: true })), { type: 'search-open' });
  assert.deepEqual(decideKey(k('?'), ctx({ talk: true })), { type: 'help' });
});

test('Settings › Keyboard shortcuts off leaves Esc and Ctrl or Cmd with a key', () => {
  const off = ctx({ keysOn: false });
  for (const key of [' ', 'a', 'l', 't', '/', '?', '1']) assert.equal(decideKey(k(key), off), null, key);
  assert.deepEqual(decideKey(k('Escape'), off), { type: 'close' });
  assert.deepEqual(decideKey(k('k', { ctrlKey: true }), off), { type: 'search-toggle' });
  assert.deepEqual(decideKey(k('z', { ctrlKey: true }), off), { type: 'undo' });
});

test('a button keeps Space, a slider keeps its arrows, a switch keeps Space and Enter', () => {
  assert.equal(decideKey(k(' '), ctx({ target: 'button' })), null);
  assert.equal(decideKey(k(' '), ctx({ target: 'figure' })), null);
  assert.equal(decideKey(k('ArrowLeft'), ctx({ target: 'range' })), null);
  assert.equal(decideKey(k(' '), ctx({ target: 'switch' })), null);
  assert.equal(decideKey(k('Enter'), ctx({ target: 'switch' })), null);
});

test('the number keys run the open card\'s verbs; with no card they do nothing', () => {
  assert.deepEqual(decideKey(k('3'), ctx({ cardOpen: true })), { type: 'card-verb', n: 3 });
  assert.equal(decideKey(k('3'), ctx()), null);
});

test('a sheet open: letters are not the page\'s', () => {
  assert.equal(decideKey(k('a'), ctx({ sheetOpen: true })), null);
  assert.deepEqual(decideKey(k('Escape'), ctx({ sheetOpen: true })), { type: 'close' });
});

test('the sinusoid view: A and Zoom in do not apply', () => {
  assert.equal(decideKey(k('a'), ctx({ inSinusoid: true })), null);
  assert.equal(decideKey(k('+'), ctx({ inSinusoid: true })), null);
});

test('another layout: the key in the place of A is A', () => {
  assert.equal(letterOf({ key: 'ф', code: 'KeyA' }), 'a');
  assert.deepEqual(decideKey({ key: 'ф', code: 'KeyA' }, ctx()), { type: 'view-toggle' });
  assert.equal(letterOf({ key: ';', code: 'KeyZ' }), ';');
});

test('[ and ] step one ladder: the real-time speeds, then the time-lapse rates', () => {
  const sp = [0.25, 0.5, 1, 2, 4, 8], lp = [1 / 24, 0.5, 1, 7];
  assert.deepEqual(stepSpeed(sp, lp, { speed: 1, lapse: 0 }, 1), { value: 2, lapse: false });
  assert.deepEqual(stepSpeed(sp, lp, { speed: 8, lapse: 0 }, 1), { value: 1 / 24, lapse: true });
  assert.deepEqual(stepSpeed(sp, lp, { speed: 1, lapse: 7 }, 1), { value: 7, lapse: true });
  assert.deepEqual(stepSpeed(sp, lp, { speed: 0.25, lapse: 0 }, -1), { value: 0.25, lapse: false });
});

test('Delete and Backspace on an open card take its shunt or device down; nothing happens with no card, in a field or on a held key', () => {
  for (const key of ['Delete', 'Backspace']) {
    assert.deepEqual(decideKey(k(key), ctx({ cardOpen: true })), { type: 'card-remove' });
    assert.equal(decideKey(k(key), ctx()), null);
    assert.equal(decideKey(k(key), ctx({ cardOpen: true, target: 'text' })), null);
    assert.equal(decideKey(k(key, { repeat: true }), ctx({ cardOpen: true })), null);
  }
});
